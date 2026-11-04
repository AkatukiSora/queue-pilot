# Event-day runbook

This checklist assumes the database and application Applications have been deployed manually and are healthy. Do not sync the production application while either image digest is an all-zero placeholder. Follow [Argo CD Application examples](argocd-application-example.md) for the initial deployment order and application details. The slot-reservation procedure below is documentation for a separately approved window; this change does not authorize or perform a production sync, backup, scale operation, or ticket issuance.

## Tenant manifest plan and apply

Review the database changes before applying a tenant manifest:

```sh
mise exec -- node scripts/tenant-config.ts plan --file path/to/manifest.json --database-url-env DATABASE_URL
mise exec -- node scripts/tenant-config.ts apply --file path/to/manifest.json --database-url-env DATABASE_URL
```

`plan` is read-only and reports creates, updates, retirements, no-op rows, and event revision changes. It prints the JSON plan to stdout and the operational precondition to stderr. Before `apply`, stop every API instance that uses the legacy AppConfig (or block all ticket writes through it: issue, move, restore, reprint). This requirement ends when ticket writes use database-scoped event configuration.

## Planned slot-reservation cutover

This sequence is conditional on a separate written approval of the maintenance window, backup/RPO, release digests, and venue staff's handling of every legacy ticket. The 5–10 minute duration is a planning hypothesis, not a measured production outage. `mise exec -- node scripts/slot-migration-rehearsal.ts` records isolated PostgreSQL expand, API-first-issue, and dump+restore timings; it does not include production Argo CD, image pull, CNPG, agent startup, network, or printer delays. Measure those in a separate staging rehearsal before promising an outage duration.

1. Before the window, confirm exact reviewed release heads and immutable image digests, successful migration/restore rehearsals, protected off-cluster backup capacity, and a staff-approved disposition for legacy tickets. Do not auto-assign old tickets.
2. Announce a pause in ticket issue and reservation changes. Wait for in-flight requests to finish. Stop the print agent after queued/printing jobs drain; inspect every `unknown` job and resolve the paper state before proceeding.
3. Merge a reviewed GitOps maintenance revision setting the API Deployment to zero replicas, then manually sync that exact revision in Argo CD. Read back zero API pods and no ready Service endpoints. Do not use `kubectl scale` or run a Sync operation from this runbook change.
4. Take the final protected PostgreSQL dump using the backup procedure below, verify it is non-empty, record aggregate ticket/counter/print-job counts without exposing rows or tokens, and confirm a separate-database restore succeeds.
5. Merge the reviewed release revision containing the expanded migration, new API image, approved `SLOT_SCHEDULE_JSON`, and normal API replica count. Manually sync that exact GitOps revision. Wait for the wave-1 migration Job to succeed and wave-2 API Deployment to become Ready; check `/api/healthz`, `/api/readyz`, the configured reservation dates/equipment, and that legacy tickets remain visibly unassigned.
6. Start the slot-compatible print-agent release, confirm the service remains active and there are no agent/API authentication errors, then reopen issuance only after staff confirm the legacy-ticket plan. Do not issue or cancel a production slot ticket as a test.

Rollback boundary: before any slot ticket is issued or legacy ticket individually assigned, stop the agent and use a reviewed Git revert to the prior API/agent images; leave the additive nullable migration in place and do not run an unverified down migration. After a slot ticket or individual legacy assignment exists, do not roll back only the application image because the old app cannot represent reservations; stop new issuance and use a forward fix. Restore is allowed only after explicit approval of the resulting data loss, recovery point, and visitor communication.

## Before the event

- [ ] Confirm the reviewed digest-manifest PR is merged and both production images are pinned to the verified immutable digests for the same release source.
- [ ] Confirm the PostgreSQL Cluster and API Deployment are healthy, and that the `bunkasai-ticket-postgres-app` Secret exists.
- [ ] Confirm the 1Password item path is real and the item has distinct `ADMIN_TOKEN` and `AGENT_TOKEN` values, each at least 32 non-whitespace characters.
- [ ] Set `SLOT_SCHEDULE_JSON` to the approved JST dates/start windows, `EVENT_END_AT` to the final slot's handover time or later, and `TICKET_NUMBER_SCOPE` through a reviewed GitOps change. The current example schedule is 2026-11-03 10:00–14:30 and 2026-11-04 10:00–13:30 JST; do not deploy it unless those dates are approved for the event.
- [ ] Confirm old tickets appear in `これから利用・対応待ち` with the unassigned-ticket badge. Staff must resolve each legacy ticket with the venue; do not auto-assign it to a slot.
- [ ] Run `mise exec -- node scripts/slot-migration-rehearsal.ts` and `mise exec -- pnpm backup:rehearsal` against disposable embedded PostgreSQL only. The reported timings cover an isolated migration/API probe and database dump+restore, not production downtime.
- [ ] Confirm printer paper, printer power, USB connection, printer-host network access, and secure staff access to the admin token.

## Before opening

- [ ] Confirm `SLOT_SCHEDULE_JSON`, `EVENT_END_AT`, and `TICKET_NUMBER_SCOPE` match the approved cutover revision.
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

CloudNativePG runs PostgreSQL in the `postgres` container. This is a manual logical dump, not a scheduled backup or point-in-time recovery, and it is not a complete business-continuity plan. The command streams a custom-format dump of the `app` database to the machine running `kubectl`; it does not store the dump in the pod. Set a restrictive file mode and select the current primary pod before running `pg_dump`:

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

Keep the admin and agent tokens separate and never put their values in a command, ticket, or repository file. For a planned rotation:

1. Stop the print agent before rotating `AGENT_TOKEN`, so it cannot repeatedly authenticate with the old value.
2. Generate a replacement value of at least 32 non-whitespace characters and update the corresponding 1Password item field. For initial token generation, `openssl rand -base64 32` produces a random value; store it directly in the password manager.
3. Wait for the OnePasswordItem-managed `bunkasai-ticket-secrets` Secret to reflect the new field, then restart and verify the API Deployment so it reads the replacement value.
4. Update `/etc/bunkasai-ticket/print-agent.env` on the printer host with the new `AGENT_TOKEN`, preserve its restricted permissions, and restart the print agent.
5. Verify API readiness and confirm the agent can claim and report a test print job. Remove any temporary copies of the old value.

For an admin-token-only rotation, update the 1Password field and restart the API Deployment; staff must use the replacement token. The old token becomes invalid when the API starts with the new Secret. Coordinate the restart and staff notification to avoid avoidable interruption.
