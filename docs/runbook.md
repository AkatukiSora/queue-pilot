# Event-day runbook

This checklist assumes the database and application Applications have been deployed manually and are healthy. Do not sync the production application while either image digest is an all-zero placeholder. Follow [Argo CD Application examples](argocd-application-example.md) for the initial deployment order and application details.

## Before the event

- [ ] Confirm the digest-update PR is merged and both production images are pinned to real immutable digests.
- [ ] Confirm the PostgreSQL Cluster and API Deployment are healthy, and that the `bunkasai-ticket-postgres-app` Secret exists.
- [ ] Confirm the 1Password item path is real and the item has distinct `ADMIN_TOKEN` and `AGENT_TOKEN` values, each at least 32 non-whitespace characters.
- [ ] Set `EVENT_END_AT` and `TICKET_NUMBER_SCOPE` to the actual event values through a reviewed deployment change.
- [ ] Check the API readiness endpoint: `curl -fsS https://tickets.example.test/api/readyz` (replace the example host with the public origin).
- [ ] Issue a test ticket, verify the receipt and QR code, then cancel the test ticket. Cancelled numbers are retained and are not reused.
- [ ] Take a database dump using the procedure below. Verify the file is non-empty and copy it to protected storage outside the cluster.
- [ ] Confirm printer paper, printer power, USB connection, printer-host network access, and secure staff access to the admin token.

## Before opening

- [ ] Confirm `EVENT_END_AT` and `TICKET_NUMBER_SCOPE` still match the deployment plan.
- [ ] Verify `/api/readyz` returns successfully from the public origin.
- [ ] Print one final test receipt and cancel its ticket.
- [ ] Confirm the print-agent service is active: `sudo systemctl status bunkasai-print-agent`.
- [ ] Confirm the printer device is present: `ls -l /dev/usb/lp0` (or the configured `DEVICE_PATH`).

## During operation

- [ ] Monitor the admin queue and act on `failed` and `unknown` print jobs.
- [ ] For an `unknown` job, inspect the paper before using the reprint action; a write may have completed even when the result was not received.
- [ ] Monitor paper supply, printer connectivity, and the API's readiness endpoint.
- [ ] If the printer disconnects, reconnect it and restart the print-agent service. Queued jobs remain queued until the agent can open the device.

## After closing

- [ ] Stop issuing digital tickets and confirm staff have finished processing the waiting queue.
- [ ] Take another database dump and copy it to protected storage outside the cluster.
- [ ] Retain event records and backups according to the venue's data-retention policy; remove local copies when they are no longer needed.

## API restart

Ticket and queue state is stored in PostgreSQL and survives an API restart:

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
