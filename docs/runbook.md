# Production deployment and event-day runbook

The `bunkasai-ticket` Application is managed from `k8s-deploys` and has automated sync enabled. Merging a change to `deploy/app/` therefore starts production reconciliation; a Draft PR does not. Do not merge until the pre-merge gates below are confirmed and the administrator has approved that application window. This runbook does not authorize or perform a merge, sync, backup, scale operation, or ticket issuance. See [Argo CD Application examples](argocd-application-example.md) for the resource order and validation commands.

## Tenant manifest plan and apply

Review the database changes before applying a tenant manifest:

In production, the wave-2 Sync-hook bootstrap Job waits for the runtime login and role guard, then applies the tenant manifest using the CNPG-generated `bunkasai-ticket-postgres-app` owner Secret. The wait init container and API use only `bunkasai-ticket-runtime-db` (`username` and `password`) with verified TLS; the API never receives the owner URI. The manifest file is mounted from `TENANT_MANIFEST_JSON`. Missing Secret keys stop the consumer; there is no fallback.

```sh
mise exec -- node scripts/tenant-config.ts plan --file path/to/manifest.json
mise exec -- node scripts/tenant-config.ts apply --file path/to/manifest.json
```

These commands use the normal `loadConfig` environment. Set that environment to an owner/migration connection; never use the API runtime login for `apply`. `DATABASE_URL` mode and the complete `DB_*` component mode are both supported, but they cannot be combined. To select a separately named legacy URI, use `--database-url-env MIGRATION_DATABASE_URL` with all `DB_*` variables unset:

```sh
mise exec -- node scripts/tenant-config.ts plan --file path/to/manifest.json --database-url-env MIGRATION_DATABASE_URL
mise exec -- node scripts/tenant-config.ts apply --file path/to/manifest.json --database-url-env MIGRATION_DATABASE_URL
```

`plan` is read-only and reports creates, updates, retirements, no-op rows, and event revision changes. It prints the JSON plan to stdout and the operational precondition to stderr. Before `apply`, stop every API instance that uses the legacy AppConfig (or block all ticket writes through it: issue, move, restore, reprint). This requirement ends when ticket writes use database-scoped event configuration.

## Planned slot-reservation cutover

This sequence is conditional on a separate written approval of the maintenance window, backup/RPO, release digests, and venue staff's handling of every legacy ticket. The 5–10 minute duration is a planning hypothesis, not a measured production outage. `mise exec -- node scripts/slot-migration-rehearsal.ts` records isolated PostgreSQL expand, API-first-issue, and dump+restore timings; it does not include production Argo CD, image pull, CNPG, agent startup, network, or printer delays. Measure those in a separate staging rehearsal before promising an outage duration.

1. Before the window, confirm exact reviewed release heads and immutable image digests, successful migration/restore rehearsals, protected off-cluster backup capacity, and a staff-approved disposition for legacy tickets. Do not auto-assign old tickets.
2. After closing, announce a pause in ticket issue and reservation changes and stop every database writer. Wait for in-flight requests to finish. Stop the print agent after queued/printing jobs drain; inspect every `unknown` job and resolve the paper state before proceeding.
3. **Production STOP unless writer isolation is established first.** The Deployment scale-down belongs to Argo CD wave 3, while the migration Job (wave 1) and tenant bootstrap Job (wave 2) are Sync hooks that run before it, so merging a zero-replica revision alone does not guarantee that the old API has stopped before the first hook runs. Old pods are not stopped by wave order. Proceed only when the administrator has separately approved, and staging has verified, a method that isolates every old writer before the first maintenance Sync or hook, and read back that no old API pod is writing. If that method is not yet approved and verified, stop here. Do not substitute `kubectl scale`, a manual or selective Sync, disabling self-heal, skipping hooks, or adding a PreSync hook on your own.
4. Take the final protected PostgreSQL dump using the backup procedure below, verify it is non-empty, record aggregate ticket/counter/print-job counts without exposing rows or tokens, and confirm a separate-database restore succeeds.
5. After a separate administrator approval of the release, deploy through the normal full Sync in wave order 1 → 2 → 3, using the immutable app and migrate digests built from the same Release source SHA: the wave-1 migration Job, then the wave-2 tenant bootstrap Job (runtime role guard, then manifest apply), then the wave-3 API Deployment. The S.2 release adds one non-destructive migration (the `slot_released_at` column and a partial unique index); it needs no `initdb`, Cluster recreation, or data erasure. If any step fails, keep maintenance in place and do not assume later steps succeeded.
6. Read back, without printing secrets, personal rows, or tokens: the Application's source, revision, sync policy, and current operation; Cluster health; the app/migrate and bootstrap init/main image references and the running pods' image IDs, all from the same Release source SHA; each Job's UID, start time, and Complete status for this operation, and the applied migration version; the API Deployment's observed generation, Available and Ready state, absence of old pods, `/api/healthz`, and `/api/readyz`; and that the tenant, event, and existing tickets, slots, and released states are preserved. A Complete Job alone does not prove the expected database state or working behavior.
7. Start the slot-compatible print-agent release, confirm the service remains active and there are no agent/API authentication errors, then reopen issuance only after the read-back above and staff confirm the legacy-ticket plan. Do not issue or cancel a production slot ticket as a test.

Rollback boundary: after the slot-release migration has been applied, do not roll back only the application image. The previous application reads released tickets as slot occupants, and duplicate rows created after a release cannot return to the old unique constraint. Keep maintenance in place, stop new issuance, preserve evidence, and use a verified forward fix. The earlier limited revert before any slot ticket existed does not authorize rollback after this migration. Restoring the database, or returning to an old version whose compatibility has not been verified, requires a separate design, independent review, and the administrator's approval of the recovery point, recovery point objective, accepted data loss, and visitor communication. Do not run a down migration, delete the volume, or rewrite history.

## Before the event

- [ ] Confirm both image digests are immutable, match the same successful Release source SHA, and are present in the reviewed production overlay.
- [ ] Confirm key presence only in 1Password: `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, `TENANT_MANIFEST_JSON`; runtime DB `username` and `password`; and Barman `ACCESS_KEY_ID` and `ACCESS_SECRET_KEY`. Do not retrieve or print values. The runtime username must be `queue_pilot_runtime_login`.
- [ ] Confirm the GitHub OAuth origin and callback `/api/auth/callback/github`, and have the administrator verify the manifest's single admin identity privately. Do not put identity data in Git or chat.
- [ ] Before a production merge, read back the Application's automated-sync state and current operation. Confirm the Cluster can be initialized from an empty database: `postInitApplicationSQL` runs only during `initdb`, not as a repair to an existing database. Confirm the existing Barman destination remains unchanged and the WAL-archive check succeeds. Pause or block writes through the old API before bootstrap applies the manifest.
- [ ] Obtain explicit approval for the maintenance window and any accepted data loss. Run the documented disposable-PostgreSQL rehearsals; static rendering does not prove 1Password, CNPG, OAuth, NetworkPolicy, or backup behavior.

## Before opening

- [ ] Confirm the approved event and tenant data are in the mounted manifest and the production overlay points to the reviewed same-source image digests.
- [ ] Verify `/api/readyz` returns successfully from the public origin.
- [ ] Confirm the admin reservation board shows all approved dates and all four equipment columns. Old tickets remain in `これから利用・対応待ち` with an unassigned-ticket badge until individually resolved.
- [ ] Do not create a production slot ticket as a test. Exercise issue, QR, print, cancellation, and restore behavior in the isolated rehearsal; use a separate fixed test sheet for printer checks.
- [ ] Confirm the print-agent service is active and the configured printer device is present.

## During operation

- [ ] Monitor the admin reservation board and act on `failed` and `unknown` print jobs.
- [ ] For an `unknown` job, inspect the paper before using the reprint action; a write may have completed even when the result was not received.
- [ ] Monitor paper supply, printer connectivity, and the API's readiness endpoint.
- [ ] If the printer disconnects, reconnect it and restart the print-agent service. Queued jobs remain queued until the agent can open the device.

## After closing

- [ ] Stop issuing digital tickets and confirm staff have finished processing active reservations.
- [ ] Take another database dump and copy it to protected storage outside the cluster.
- [ ] Retain event records and backups according to the venue's data-retention policy; remove local copies when they are no longer needed.

## API restart

Ticket and reservation state is stored in PostgreSQL and survives an API restart:

```sh
kubectl rollout restart deployment/bunkasai-ticket -n bunkasai-ticket
kubectl rollout status deployment/bunkasai-ticket -n bunkasai-ticket
curl -fsS https://tickets.example.test/api/readyz
```

Replace the example host with the configured public origin. Do not restart the API as a substitute for fixing an unhealthy database.

## Print-agent restart and printer reconnect

```sh
sudo systemctl restart bunkasai-print-agent
sudo systemctl status bunkasai-print-agent
ls -l /dev/usb/lp0
```

The systemd unit restarts the agent after a write timeout or other failure. A printer write is limited to 30 seconds; a timeout is reported as `unknown`, the agent exits with status 1, and systemd restarts it after two seconds. Exit status 2 indicates invalid startup configuration and is not restarted by the example unit. If `DEVICE_PATH` differs from `/dev/usb/lp0`, keep the unit's `DeviceAllow` path aligned.

## Ticket state corrections

- A normal `取消` changes ticket status but retains its slot. Use `予約枠を解放` only when staff intend to make that slot available again; the confirmation identifies the ticket, slot, equipment, and whether a waiting ticket will also be cancelled. Reuse is guaranteed only while a released ticket remains for that same slot; after that ticket is restored to another slot, reuse of the original slot is not guaranteed.
- Restore a cancelled ticket only after confirming it should return to `waiting`. Restoration first tries the original slot. If a released slot is occupied or unavailable, the request leaves the ticket unchanged; select another available slot instead. In-progress slots require explicit confirmation and keep their original end time.
- Use `案内・入店を取り消す` only to correct a completed guidance action. It asks for confirmation before returning the ticket to `waiting`; a legacy ticket remains unassigned.
- A released ticket keeps its prior slot in the audit-facing display but has no current reservation. Reprint stays disabled until the ticket is restored. A time-changing restoration requires an explicit reprint; inspect `unknown` print jobs before retrying.

## Ticket reprint

Use the admin page's reprint action. Reprinting creates a new print job and leaves the old job unchanged. Do not reprint an `unknown` job until staff inspect the paper. A ticket with a latest job still `queued` or `printing` cannot be reprinted.

## Database backup

The production CloudNativePG Cluster is configured to archive WAL continuously to the Barman ObjectStore and to create one physical base backup each day. This configuration does not prove that credentials, plugin execution, object-store connectivity, or backups are working; verify a successful backup and archived WAL after an approved sync before relying on them. No retention policy is configured here, so retention and storage growth must be reviewed separately.

The manual logical dump below is supplemental and is not a substitute for the Barman base-backup/WAL recovery path. CloudNativePG runs PostgreSQL in the `postgres` container. The command streams a custom-format dump of the `app` database to the machine running `kubectl`; it does not store the dump in the pod. Set a restrictive file mode and select the current primary pod before running `pg_dump`:

```sh
umask 077
mkdir -p "$HOME/backups/bunkasai-ticket"
BACKUP="$HOME/backups/bunkasai-ticket/$(date -u +%Y%m%dT%H%M%SZ).dump"
kubectl get pods -n bunkasai-ticket -l cnpg.io/cluster=bunkasai-ticket-postgres -L role
```

Set `PRIMARY_POD` to the primary pod shown above, then run:

```sh
kubectl exec -n bunkasai-ticket "$PRIMARY_POD" -c postgres -- pg_dump -Fc -d app > "$BACKUP"
test -s "$BACKUP"
```

A successful dump command and a non-empty file do not prove that recovery will work. Keep the dump encrypted or in otherwise protected storage, outside the cluster, and ensure there is enough free space on the machine running `kubectl`.

## CNPG point-in-time recovery (disaster recovery)

The production Cluster normally keeps `bootstrap.initdb`. Its `externalClusters` entry named `backup` points to `bunkasai-ticket-postgres-barman-store` and the original Barman server name `bunkasai-ticket-postgres`; these settings make the archive available for a separately planned recovery, but do not start one.

1. Obtain incident approval for the recovery point and accepted data-loss window. Confirm the required base backup and continuous WAL archive are available in the object store.
2. Use a separate reviewed GitOps change to create a replacement Cluster with a distinct name and fresh storage. Set `bootstrap.recovery.source: backup`; for point-in-time recovery, set `bootstrap.recovery.recoveryTarget.targetTime` to the incident-approved RFC3339 timestamp (omit it only when recovering to the latest available archived state). Keep the original `serverName` only in the matching `externalClusters` recovery source. If the replacement will archive new WAL to the same ObjectStore, use a different unique `serverName` for its own archive (normally its distinct cluster name) to avoid overwriting the source archive. Do not change the existing Cluster from `initdb` to `recovery` in place, delete its PVCs, or reuse its storage.
3. Wait for the replacement Cluster to become healthy, verify the recovered data and recovery point while application traffic remains isolated, and record the result.
4. Only after explicit approval, prepare a separate reviewed application cutover to the replacement Cluster's generated connection Secret. Do not combine recovery, cutover, and this backup configuration change into one sync.

The steps above are an operational boundary, not a recovery rehearsal. No production restore or object-store connectivity check is performed by this repository's static validation.

## Restore to a separate, empty cluster

Do not restore over the live event database. Recovery requires an operator-managed, newly initialized CNPG cluster with an empty `app` database and the `app` role. Select that replacement cluster's primary pod and namespace, then restore the dump:

```sh
kubectl exec -i -n "$RESTORE_NAMESPACE" "$RESTORE_PRIMARY_POD" -c postgres -- pg_restore --no-owner --role=app -d app --verbose < "$BACKUP"
```

After restore, verify application readiness and compare expected ticket and print-job counts before directing any application workload to the replacement database. This repository does not automate replacement-cluster creation or cutover.

Run the local rehearsal with `mise exec -- pnpm backup:rehearsal`. It uses a disposable embedded PostgreSQL instance to exercise the custom-format `pg_dump` and `pg_restore --no-owner --role=app` procedure, then compares ticket, counter, and print-job row counts. This does not validate CNPG replacement-cluster creation or cutover; rehearse those operator steps on a disposable, separate cluster before relying on them for recovery.

## Internet outage

The API and visitor page are hosted outside the venue. An internet outage prevents digital ticket issuance, queue operations, print-job reporting, and visitor status checks. There is no offline issuance or automatic reconciliation. Use a pre-agreed paper-ticket process and record all manual tickets; coordinate reconciliation with staff before resuming digital issuance.

## Credential rotation

Keep OAuth and database credentials in their existing 1Password items. Never copy values into commands, tickets, manifests, or repository files.

For an OAuth credential change, update the relevant 1Password fields and verify that the operator refreshed the Secret and the API became ready before testing a GitHub sign-in. For a runtime DB password change, keep the username contract unchanged and allow CNPG and the consuming Pods to reconcile; rotation is asynchronous and zero-downtime behavior is not guaranteed. Coordinate either change with an approved window and verify the resulting application state without reading Secret contents.
