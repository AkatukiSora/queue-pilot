# Operator handbook

This handbook describes routine operation of a self-hosted Queue Pilot deployment. Keep repository configuration, database ownership, identity-provider administration, and secret storage under organization-owned accounts. Maintain at least two trained operators who can access each system without the original developer.

## Authentication and access

GitHub OAuth is the initial provider. Register an OAuth application with an exact callback URL and trusted origin for the deployment. Store its client secret and `AUTH_SECRET` in the deployment secret manager. Never place credential values in a manifest, image, ticket, terminal transcript, or log.

To replace GitHub OAuth with OIDC, set `AUTH_PROVIDER=oidc` and configure one fixed `OIDC_ISSUER`, `OIDC_DISCOVERY_URL`, `OIDC_CLIENT_ID`, and `OIDC_CLIENT_SECRET`. Use HTTPS outside local development. Confirm that discovery metadata reports the configured issuer. Keep issuer and client configuration at the process boundary; the application does not accept an issuer from a login request. Exercise the same `AuthenticationPort` contract against at least two provider configurations before deployment. Mock-provider tests do not verify a real IdP, its account lifecycle, or its availability.

Login alone does not grant tenant membership. Optional self-service registration can create a tenant and make the signed-in GitHub account its first admin; it is disabled by default. `admin` can manage tickets and agent credentials; `staff` can operate tickets but cannot administer agents. Disabling or removing membership revokes matching sessions in the same transaction. A provider account deletion does not automatically remove local membership.

### Session lifetimes and lost devices

Shared authentication stores sessions in PostgreSQL. The session refreshes while the management page is open: the browser requests `GET /api/auth/get-session` every five minutes and when a background tab becomes visible. Other API requests check the session but do not extend it. When refresh stops, the session expires after its idle window. The absolute lifetime limits how long a session can survive repeated refreshes.

All three settings are integer seconds and apply only when `AUTH_MODE=oidc/shared`:

| Variable                          |            Default | Accepted range                    |
| --------------------------------- | -----------------: | --------------------------------- |
| `AUTH_SESSION_IDLE_SECONDS`       | `43200` (12 hours) | 900–604800                        |
| `AUTH_SESSION_UPDATE_AGE_SECONDS` |  `300` (5 minutes) | 60–half the idle window           |
| `AUTH_SESSION_ABSOLUTE_SECONDS`   |  `604800` (7 days) | the idle window–2592000 (30 days) |

The API validates these values at startup. It refuses empty, fractional, exponent-form, out-of-range, or inconsistent values. The update age must not exceed half the idle window, and the absolute lifetime must be at least the idle window.

If an operator device is lost, revoke its access promptly:

1. With manifest authority, remove or disable the affected membership and apply the manifest. The same transaction removes that member's sessions.
2. With database authority, use another trusted device and session to send `POST /api/auth/revoke-sessions` from the configured trusted origin. This revokes all sessions for the signed-in account.

### Self-service tenant registration

Self-service registration is available only with GitHub shared authentication and database configuration authority. Complete the owner handoff described in [Initial database authority or manifest adoption](#initial-database-authority-or-manifest-adoption), set `TENANT_CONFIG_SOURCE=database`, and apply the checked-in migrations before enabling the feature.

Set `TENANT_SIGNUP_ENABLED=true` to allow creation. The default is `false`. `TENANT_SIGNUP_POLICY` accepts `closed`, `allowlist`, or `public`; its default is `allowlist`. An enabled allowlist policy requires at least one configured numeric GitHub account ID or organization ID:

```dotenv
TENANT_SIGNUP_POLICY=allowlist
TENANT_SIGNUP_GITHUB_IDS='["1234567890"]'
TENANT_SIGNUP_GITHUB_ORG_IDS='["9876543210"]'
TENANT_SIGNUP_MAX_PER_USER=100
# TENANT_SIGNUP_MAX_TOTAL is unset by default (unlimited).
```

Set `TENANT_SIGNUP_POLICY=public` to allow any authenticated GitHub account to register. The public policy does not require an allowlist. An organization allowlist causes GitHub OAuth to request `read:org`; users must grant that scope before the API can verify their active organization memberships. GitHub membership responses are paginated. A missing/revoked grant or an unavailable membership API denies registration.

The per-user cap defaults to 100 self-service-created tenants. Disabled tenants continue to count toward that cap. The optional system-wide cap counts all tenant rows, including imported tenants; leave `TENANT_SIGNUP_MAX_TOTAL` unset for no system-wide cap. Registration attempts are rate-limited across API instances to 5 per GitHub identity per hour, 20 per trusted client-IP bucket per hour, and 100 per service per 24 hours. When no trusted proxy is configured, all requests use the shared unknown-IP bucket. The rate limits remain enabled for every signup policy. `X-Forwarded-For` is ignored unless `AUTH_TRUSTED_PROXIES` contains explicit proxy IP addresses or CIDR ranges.

`closed` denies new tenant registrations and prevents new sessions for identities without an active tenant membership. Existing active memberships remain usable. `TENANT_SIGNUP_ENABLED=false` prevents new registration but does not delete existing tenants, memberships, or sessions; choose `closed` separately when login must also be limited.

The web UI at `/signup` is the signup form (see [Web management screens](#web-management-screens)). Any other authenticated client uses `GET /api/auth/queue-pilot/registration-policy` to read eligibility and `POST /api/auth/queue-pilot/tenants/create` with `{ "slug": "example-tenant", "displayName": "Example Tenant" }` to create a tenant. The request accepts no actor or user ID; the API derives the creator from the verified GitHub account in the Better Auth session. The tenant, creator's `admin` membership, creation record, and audit entry are committed atomically. Send the session cookie and the configured trusted `Origin`; Better Auth rejects untrusted origins.

### Tenant management API

With database authority, a tenant admin manages the tenant, its members, and its events through the API under `/api/auth/queue-pilot`; no manifest is involved, and a tenant with no events is valid and listed. Every request needs the Better Auth session cookie (and, for `POST`, the trusted `Origin`). Bodies are JSON, at most 16 KiB, and never name the actor, the tenant, or any UUID. Responses carry `Cache-Control: no-store`. The API contract is the generated OpenAPI document (`pnpm openapi:generate`).

| Method and path                                                                            | Purpose                                                                                                                      |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `GET /tenants`                                                                             | Tenants the signed-in identity belongs to, with their events.                                                                |
| `GET /t/:tenantSlug`, `POST …/update`, `POST …/disable`                                    | Read, rename (`{expectedRevision, displayName}`), or disable (`{expectedRevision, confirmSlug}`) a tenant.                   |
| `GET …/members`, `POST …/members/resolve`, `…/upsert`, `…/disable`                         | List members, resolve a GitHub login to its numeric account ID, add or change a member (`admin` or `staff`), or disable one. |
| `GET …/events`, `GET …/events/:eventSlug`, `POST …/events/create`, `…/update`, `…/disable` | Read and change event configuration; the server issues event UUIDs.                                                          |
| `GET …/audit`, `GET …/export`                                                              | Audit log (at most 50 entries per page, opaque cursor) and the version 1 configuration export.                               |

Authorization is enforced by the database on every call: an unauthenticated request is `401`; a member who is not an `admin` of the tenant is `403` (`staff` can only operate tickets); another tenant's resource or a missing resource is `404`. Tenant changes use the tenant `revision`; event changes use the event's configuration revision. A stale revision is `409 revision_conflict`; reload and retry instead of overwriting. Disabling a member or changing a member's role deletes that user's sessions in the same transaction, and the last active `admin` can never be demoted or disabled, even by concurrent requests (`409 last_admin`).

Once any ticket exists for an event (including served and cancelled tickets), the time zone, numbering scope, start and end instants, the whole schedule, and the set of equipment IDs are frozen (`409 change_constraint`); the same rule applies to the owner `tenant-config` and `adopt-web` commands. Titles, labels, receipt copy, and the default printer can still change and apply only to tickets and print jobs created afterwards; stored print snapshots are never rewritten. A printer with queued or printing jobs cannot be removed from an event until it has drained. Disabling an event or tenant needs an explicit slug confirmation and no waiting or called tickets and no queued or printing jobs; nothing is physically deleted, the slug stays reserved, and disabled data is no longer readable by visitors. Ticket issuance and configuration changes take the same tenant and event row locks, so a change cannot interleave with a ticket being written.

Every successful management change writes an audit row in the same database transaction. The log stores the actor's internal ID, the action, the resource, the before and after revision, and the permitted configuration difference (member changes include the GitHub account ID, visible to admins only). It never stores cookies, tokens, agent secrets, or request headers. Refused requests write no audit row. The log is never pruned automatically, so monitor the size of `configuration_audit`. `GET …/export` returns the same document as the owner `export` command for an admin of the tenant and excludes credentials, sessions, tickets, and print jobs; restore it with the owner `import-export` command described below.

### Web management screens

The web UI (Japanese) wraps the management API above; the server's `401`/`403`/`404`/`409` answers stay authoritative and the UI never decides authorization. All screens need a GitHub login.

| URL                             | Purpose                                                                                                                                                                                                                                                                                                                                                                                   |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/signup`                       | Reads the registration policy. Registration off, `closed`, a denied identity, or a reached limit shows the reason and **no form**. An eligible user enters a slug and display name; the form never rewrites an invalid slug. A missing organization grant offers a GitHub reconnect. Login refusals returned by Better Auth (`?error=…` on the return URL) are shown on the login prompt. |
| `/manage`                       | The tenants you belong to, with their events. A tenant with no events is listed with a link to the first-event wizard (admins).                                                                                                                                                                                                                                                           |
| `/t/<tenant>/manage`            | Display name, events, configuration export (JSON download), audit log (times shown in the browser's time zone), and disabling the tenant with slug confirmation.                                                                                                                                                                                                                          |
| `/t/<tenant>/manage/members`    | Resolve a GitHub login to its numeric ID, confirm the account, then add it as `admin` or `staff`; change roles; disable members. The server rejects removing the last active admin and the reason is shown.                                                                                                                                                                               |
| `/t/<tenant>/manage/events/new` | Wizard for a new event: slug and basics, equipment, printers, schedule, receipt copy, review. It requires at least one equipment item, one printer, and one schedule day.                                                                                                                                                                                                                 |
| `/t/<tenant>/e/<event>/manage`  | One event configuration across tabs (basics, equipment, schedule, printers, receipt copy), issuing/rotating/revoking print agents (the token is shown once), audit, and disabling the event.                                                                                                                                                                                              |

Event times are entered in the event's own IANA time zone and stored as UTC instants; the form shows the UTC value and refuses wall-clock times that do not exist or occur twice at a daylight-saving transition. Once a ticket exists, the frozen fields are disabled with the reason, and a server `change_constraint` is explained. A stale save (`revision_conflict`) keeps your edits, shows the reason, and replaces them only after you choose to reload.

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

After a ticket has been issued, event identity, timezone, date bounds, the whole schedule, equipment IDs, and numbering scope are immutable. Create a new event for a new identity or incompatible schedule. Existing tickets and print snapshots are not rewritten when operator copy changes. Do not infer a reservation for a legacy ticket.

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
