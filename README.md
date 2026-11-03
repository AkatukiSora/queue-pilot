# Bunkasai Ticket

A short-lived ticketing system for one venue, a configured reservation timetable, and one receipt printer. Staff issue and manage tickets from the admin page; visitors use the QR code on a printed ticket to view its current reservation and status.

## 1. Overview and architecture

The API serves both the web application and the JSON API on the same public origin. The print agent runs on a separate Linux computer connected to the USB printer; it is not deployed in Kubernetes.

```text
Staff browser ─┐
Visitor phone ─┴──> Public origin (web app + API) ───> PostgreSQL (CloudNativePG)
                         ▲
                         │ API calls
                    Print Agent ── USB ──> TM-T88V
```

The admin API and print-agent API use separate Bearer tokens. Visitor access is limited to the ticket identified by its unguessable QR token. The OpenAPI document at `/api/openapi.json` is the API reference.

## 2. Setup and first deployment

### Local development

Install the pinned tools and dependencies, copy the example environment file, set `DATABASE_URL` to a local PostgreSQL database, and provide distinct random admin and agent tokens. The application reads variables from the process environment; load a local `.env` file in your shell before starting it:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
cp .env.example .env
set -a
. ./.env
set +a
mise exec -- pnpm db:migrate
mise exec -- pnpm dev
```

Open `http://127.0.0.1:5173`. The Vite development server proxies API requests to the API process. The development server requires a reachable PostgreSQL database; tests use a temporary PostgreSQL instance when `TEST_DATABASE_URL` is not set. See [Development](docs/development.md) for validation and database guidance.

### First deployment

1. Create an item in the configured 1Password vault with separate `ADMIN_TOKEN` and `AGENT_TOKEN` fields. Each value must contain at least 32 non-whitespace characters. Keep the values in the password manager; never commit them.
2. Replace the placeholder `itemPath` in `deploy/app/base/onepassworditem.yaml` with the approved item path through the repository's review process.
3. The release workflow publishes immutable images and uploads the digest-pinned production manifest as a short-lived artifact; it does not open a pull request or change Git. An authorized maintainer must retrieve the artifact for the exact release commit and submit a separate reviewed manifest PR. Do not merge without the repository's required checks.
4. Publish the first images from the default branch, verify both digests in the artifact against the release, and update `deploy/app/overlays/prod/kustomization.yaml` in the reviewed PR. Both image digests start as all-zero placeholders and are not deployable. Do not sync the Application until the PR is merged and both immutable digests are real.
5. Follow the Application template in [Argo CD Application example](docs/argocd-application-example.md): a single Application deploys the PostgreSQL Cluster, the migration Job, and the API, and is synced manually.
6. Before syncing the Application, set `SLOT_SCHEDULE_JSON` to the approved JST dates and start windows, `EVENT_END_AT` to the event's actual end, and `TICKET_NUMBER_SCOPE` to the approved numbering scope. Confirm the 1Password item path is no longer a placeholder. Automated Argo CD sync is intentionally not enabled.

The Application runs the Atlas migration Job as a Sync hook in wave 1, after the PostgreSQL Cluster (wave 0) and before the API Deployment (wave 2). Do not apply migrations manually to production.

## 3. Event-day operation

- Open the admin page's reservation board and issue a ticket in the visitor's agreed start-time/equipment cell. The schedule is configured in JST, and ticket numbers remain issuance-day/event sequence numbers rather than slot numbers.
- Check the print status shown for each ticket. A `failed` or `unknown` job requires staff attention; printing does not determine whether a ticket was issued.
- Visitors can use the QR code to confirm the current reservation time, equipment, status, and any latest staff change. If a time is moved, explicitly reprint the ticket; equipment-only changes do not require a reprint. Old tickets remain unassigned until staff confirms each visitor's slot individually.
- Configure the printer host's `API_BASE_URL` as the publicly reachable origin for the API and visitor web app. QR codes use that origin at `/ticket/<token>`; `localhost` and LAN-only addresses are not suitable for visitor phones.
- Receipt timestamps are printed in Japan Standard Time (JST). Each printer write is limited to 30 seconds; a timeout is reported as `unknown`, then the agent exits with status 1 and systemd restarts it after two seconds. The agent does not retry a failed result report, so inspect the paper before reprinting.
- Keep the printer connected and the print-agent service running. See [Print Agent](apps/print-agent/README.md) for host setup and its status meanings.

## 4. Restart the API

Ticket, reservation, and numbering state is stored in PostgreSQL, so restarting the API does not reset tickets or reservations.

```sh
kubectl rollout restart deployment/bunkasai-ticket -n bunkasai-ticket
kubectl rollout status deployment/bunkasai-ticket -n bunkasai-ticket
```

After rollout, verify the public readiness endpoint:

```sh
curl -fsS https://tickets.example.test/api/readyz
```

Replace the example hostname with the configured public origin.

## 5. Restart the print agent

The print agent runs under systemd on the Linux printer host:

```sh
sudo systemctl restart bunkasai-print-agent
sudo systemctl status bunkasai-print-agent
```

A job left in `printing` becomes `unknown` after its lease expires. Queued jobs remain available for the agent.

## 6. Reconnect the printer

Check that the device exists after reconnecting the USB cable:

```sh
ls -l /dev/usb/lp0
sudo systemctl restart bunkasai-print-agent
sudo systemctl status bunkasai-print-agent
```

The agent does not claim a job while it cannot open the configured device; queued jobs remain queued. If `DEVICE_PATH` is not `/dev/usb/lp0`, update the systemd unit's `DeviceAllow` path to match it.

## 7. Reprint a ticket

Use the admin page's reprint action. Reprinting creates a new job and preserves the original job's history. If the latest job is `unknown`, inspect the paper before reprinting because the printer may already have printed it. A ticket whose latest job is still `queued` or `printing` cannot be reprinted yet.

## 8. Database backup and recovery

Take a logical `pg_dump` before the event and after it ends. Keep the dump in a protected location outside the cluster and verify that it is non-empty. The commands and a cautious restore procedure are in the [Runbook](docs/runbook.md). This manual export is not continuous backup, point-in-time recovery, or a complete business-continuity plan. A restore has not been rehearsed against the target cluster; rehearse it on a separate, empty database before relying on it for recovery.

## 9. Internet outage

The API is hosted outside the venue. During an internet outage, staff cannot issue or manage tickets through the application, and visitors cannot load ticket status. There is no offline issuance mode. Use a separately agreed paper-ticket procedure, keep a record of manual tickets, and reconcile the queue with staff before resuming digital issuance.

## 10. Rotate credentials

Rotate `ADMIN_TOKEN` and `AGENT_TOKEN` independently in the 1Password item. The API reads credentials at startup, so restart its Deployment after the Secret has updated. Update the print host's protected environment file and restart the agent when rotating `AGENT_TOKEN`. Coordinate the change: the old token stops working as soon as the API starts with the replacement. See [Runbook](docs/runbook.md) for the ordered steps.

The application, cluster reconciliation, release workflow, and physical printer have not been validated together on the production environment. Confirm those behaviors during a controlled rehearsal before opening the venue.
