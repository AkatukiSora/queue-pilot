# Operator handbook

This handbook describes routine operation of a self-hosted Queue Pilot deployment. Keep repository configuration, database ownership, identity-provider administration, and secret storage under organization-owned accounts. Maintain at least two trained operators who can access each system without the original developer.

## Authentication and access

GitHub OAuth is the initial provider. Register an OAuth application with an exact callback URL and trusted origin for the deployment. Store its client secret and `AUTH_SECRET` in the deployment secret manager. Never place credential values in a manifest, image, ticket, terminal transcript, or log.

To replace GitHub OAuth with OIDC, set `AUTH_PROVIDER=oidc` and configure one fixed `OIDC_ISSUER`, `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET`. Use HTTPS outside local development. Confirm that discovery metadata reports the configured issuer. Keep issuer and client configuration at the process boundary; the application does not accept an issuer from a login request. Exercise the same `AuthenticationPort` contract against at least two provider configurations before deployment. Mock-provider tests do not verify a real IdP, its account lifecycle, or its availability.

Login does not create tenant membership. The deployment's configuration authority is `manifest` by default; after an explicit owner handoff it can be `database`. `admin` can manage tickets and agent credentials; `staff` can operate tickets but cannot administer agents. A membership disable or removal revokes matching sessions in the same transaction. A provider account deletion does not automatically remove local membership.

## Tenant and event configuration

The default `TENANT_CONFIG_SOURCE=manifest` preserves the existing workflow. Keep the manifest in a private configuration repository; never publish member subjects. Validate it without database writes, then review and apply it with an owner/migration connection after stopping all API and agent writers:

```sh
node scripts/tenant-config.ts validate --file path/to/manifest.json
node scripts/tenant-config.ts plan --file path/to/manifest.json --database-url-env OWNER_DATABASE_URL
node scripts/tenant-config.ts apply --file path/to/manifest.json --database-url-env OWNER_DATABASE_URL
```

`queue_pilot_runtime_login` is never the owner connection. `tenant-config apply` refuses to run after the database authority handoff.

### Initial database authority or manifest adoption

For a genuinely empty deployment, after migrations succeed and before starting the manifest bootstrap job or API, set `BOOTSTRAP_GITHUB_SUBJECT`, `BOOTSTRAP_TENANT_SLUG`, and `BOOTSTRAP_TENANT_NAME` in the operator's protected environment and run:

```sh
node scripts/configuration-admin.ts initialize-web --database-url-env OWNER_DATABASE_URL
```

This creates the designated tenant and admin and changes `configuration_authority` to `database` in one transaction. If configuration already exists under manifest authority, stop every API and agent writer, take a backup, and review the non-mutating adoption preview before committing the handoff:

```sh
node scripts/configuration-admin.ts adopt-web --file path/to/manifest.json --dry-run --database-url-env OWNER_DATABASE_URL
node scripts/configuration-admin.ts adopt-web --file path/to/manifest.json --database-url-env OWNER_DATABASE_URL
```

The preview reports the rows that will be created or adopted and the omitted existing tenant/event rows that remain untouched. Adoption never retires or deletes omitted rows. Once authority is `database`, configure API instances with `TENANT_CONFIG_SOURCE=database`; `APP_MANIFEST_PATH` and the manifest mount are not required. Startup and readiness reject an environment/database authority mismatch. The deployment bootstrap job is a no-op in database mode.

### Export and import

Export a tenant to a new private file. The command creates it with owner-only permissions; the file contains identity subjects and must not be committed or shared publicly:

```sh
node scripts/configuration-admin.ts export --tenant-slug example-tenant --file /secure/path/tenant-export.json --database-url-env OWNER_DATABASE_URL
```

Before import, use a numeric GitHub account ID for the one operator who will become the destination admin. The dry run reports the source member states and does not change the database. Import is atomic, accepts only an unused tenant scope, and imports all source memberships disabled; only the explicitly designated admin becomes active. It does not copy tickets, print jobs, sessions, or agent credentials.

```sh
CONFIGURATION_IMPORT_ADMIN_SUBJECT=12345678 node scripts/configuration-admin.ts import-export --file /secure/path/tenant-export.json --dry-run --database-url-env OWNER_DATABASE_URL
CONFIGURATION_IMPORT_ADMIN_SUBJECT=12345678 node scripts/configuration-admin.ts import-export --file /secure/path/tenant-export.json --database-url-env OWNER_DATABASE_URL
```

Verify the command receipt and tenant, event, membership, and audit counts using the owner connection; do not print identity subjects or credentials.

After a ticket has been issued, event identity, timezone, date bounds, equipment IDs, and numbering scope are immutable. Create a new event for a new identity or incompatible schedule. Existing tickets and print snapshots are not rewritten when operator copy or schedule data changes. Do not infer a reservation for a legacy ticket.

## Print-agent operation and rotation

Register one agent for one event/printer. A credential is returned once; the database stores only its SHA-256 hash. Keep it out of the agent JSON configuration and pass it through a protected environment file or secret manager. Keep agents outside the Kubernetes API workload unless the operator has separately designed device access.

For planned rotation:

1. Issue a replacement credential and update the designated agent.
2. Confirm the agent is using the replacement credential and can claim and report a preview job.
3. Revoke the old credential immediately after the switch, and verify it no longer authenticates.

The overlap must not exceed 24 hours. The default credential lifetime is 90 days. Revoke credentials promptly when an agent host is lost or the responsible operator leaves. Do not automatically replay jobs in `unknown`; inspect the physical or preview output first. The `json-file` driver proves only that a preview file was written, not that paper was printed.

## Handover and monitoring

Before changing the primary operator, verify that the organization controls the source repository, image registry, secret manager, identity provider, database backup destination, and DNS/account recovery methods. Assign a second operator and test their access. Remove the departing operator's identity-provider account and local membership, revoke their sessions, and rotate any shared credentials they could have accessed.

Collect structured logs with request IDs, event IDs, driver kinds, and error codes. Never log bearer tokens, session IDs, identity subjects, receipt payloads, public ticket URLs, or authorization headers. Avoid tenant and ticket identifiers as metric labels.

During an active event, alert on these initial thresholds and tune them from measured operation:

- any `unknown` print job;
- the oldest queued job exceeding 120 seconds;
- an agent without communication for 60 seconds;
- database readiness failure or sustained authentication failures.

Apply agent and queue thresholds only while the event is active. Route alerts to an operator-owned channel and verify that a human acknowledges them.

## Backup and restore

Back up the entire PostgreSQL database, including tenant configuration, sessions, tickets, counters, print jobs, agent records, and public-ticket locators. Store encrypted backups outside the database cluster. Use a consistent base-backup/WAL strategy where supported; for a standalone installation, schedule encrypted `pg_dump` and test restoration into a separate empty database.

The proposed RPO of 15 minutes and RTO of 60 minutes are planning targets, not guarantees. `node scripts/oss-migration-rehearsal.ts` reports the disposable logical dump duration, restore duration, and restore-to-API-readiness duration after invalidating restored sessions and agent credentials. It copies `db/migrations` to an isolated temporary directory, sets `ATLAS_DEV_URL` to the temporary development database, and runs `atlas migrate diff verify --env local --dir file://<temporary-directory>/atlas-verify`; the rehearsal fails if Atlas generates a migration file. It does not measure RPO: record the actual age of the scheduled backup and its recovery point separately. These local timings do not measure cluster replacement, network, image pulls, identity-provider availability, or operator response.

Restore only to an isolated target. Keep API and agents stopped; block external printing and notifications. After the restore, before starting any workload:

1. With the restored database isolated and workload still stopped, connect as its owner/migration role and run the invalidation transaction:

   ```sql
   BEGIN;
   DELETE FROM public."session";
   UPDATE public.agent_credentials
   SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
   WHERE revoked_at IS NULL;
   COMMIT;
   ```

2. Check counts only; do not select credential hashes or session tokens:

   ```sql
   SELECT
     (SELECT count(*) FROM public."session") AS sessions,
     (SELECT count(*) FROM public.agent_credentials WHERE revoked_at IS NULL) AS active_agent_credentials;
   ```

3. Compare table counts, constraints, tenant/event scoping, and a public-ticket response status using fictional data. Do not print ticket tokens or response bodies.
4. Start the API with the non-owner runtime URL and verify readiness. Register replacement agents with newly issued credentials before enabling print output.

The integrated rehearsal starts with the legacy fixture, applies expand/scoped/RLS migrations, verifies repeatability and a no-diff Atlas schema check, and restores a dump to a separate database. It exercises the pre-restore human-session and agent-token paths, requires both copied credentials to fail over HTTP after invalidation, verifies the restored public QR status, and repeats the tenant/event cross-scope runtime RLS check against the restored database. It uses disposable PostgreSQL only.

## Upgrade and rollback

1. Review the exact source revision, dependency inventory, image digests, migration SQL, and backup/restore evidence.
2. Build and publish immutable API and migration images from the same reviewed revision through the deployment's approved pipeline.
3. Back up the database and rehearse the upgrade and restore path against a disposable copy.
4. Apply versioned migrations with the owner connection. Start the API with the non-owner runtime connection only after migrations succeed.
5. Verify readiness, sign-in, tenant/event access, print-agent claim/result, and a JSON preview. Test physical printing separately on the target device.

Prefer forward fixes after new tenant-scoped data or credentials exist. Do not downgrade the application image across a schema change unless the exact compatibility boundary was rehearsed. Restoring a backup can lose every change after its snapshot; coordinate affected users and use only an isolated restore target until reconciliation is approved.

## Security incidents and release gates

If a secret is suspected in a file, history, release, or image layer, do not print the value. Record only the affected path and credential type, disable or rotate the credential at its issuer, and assess every copy made with it. Do not rewrite Git history without separate approval. Keep public distribution disabled until ownership and third-party rights are confirmed, the license is formally approved, vulnerability reporting is configured, and full-history/release/container scans and software inventory are complete.
