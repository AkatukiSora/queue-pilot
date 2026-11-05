# Print Agent

The print agent runs on the Linux host that writes receipt output. It uses an agent-only Bearer token and supports the built-in TM-T88V USB, ESC/POS TCP, JSON preview, and fixed-argv command drivers. The agent is not deployed in Kubernetes.

## Configuration

Always set these variables in the service environment file:

- `API_BASE_URL`: the publicly reachable HTTP(S) origin for API requests, for example `https://tickets.example.test`. It must not include credentials, a path, query, or fragment. In legacy v1 mode this origin also forms the QR ticket URL, so visitor phones must be able to reach it; v2 uses the supplied `publicURL` snapshot.
- `AGENT_TOKEN`: the agent credential (at least 32 non-whitespace characters). Keep it separate from the admin token and do not put it in the JSON configuration file.

When `PRINT_AGENT_CONFIG_PATH` is unset, the agent keeps the legacy environment mode and requires `DEVICE_PATH` to be an absolute path. It uses the legacy claim route and accepts legacy v1 receipt payloads.

For the version 2 wire protocol and selectable driver, set `PRINT_AGENT_CONFIG_PATH` to an absolute path of a JSON file with `schemaVersion: 1`, the server's registered `printerId` UUID for operator identification, and exactly one driver object. The identifier is logged but is not a substitute for server-side authorization: tenant, event, and printer scope are bound to `AGENT_TOKEN`. The agent then claims only payload version 2 at `/api/v3/agent/print-jobs/claim`; it does not fall back to the legacy route if the server rejects the claim.

The driver objects are:

```json
{
  "schemaVersion": 1,
  "printerId": "11111111-1111-4111-8111-111111111111",
  "driver": { "type": "tm-t88v-usb", "devicePath": "/dev/usb/lp0" }
}
```

```json
{
  "schemaVersion": 1,
  "printerId": "11111111-1111-4111-8111-111111111111",
  "driver": { "type": "escpos-tcp", "address": "127.0.0.1:9100" }
}
```

```json
{
  "schemaVersion": 1,
  "printerId": "11111111-1111-4111-8111-111111111111",
  "driver": {
    "type": "json-file",
    "outputDir": "/var/lib/print-agent/previews"
  }
}
```

```json
{
  "schemaVersion": 1,
  "printerId": "11111111-1111-4111-8111-111111111111",
  "driver": {
    "type": "command",
    "argv": ["/usr/local/libexec/receipt-output", "--mode", "ticket"]
  }
}
```

The version 2 claim returns an immutable receipt snapshot. A slot job has `reservation.kind: "slot"` and an RFC 3339 `startsAt`; a legacy ticket has `reservation.kind: "legacy"` and no start time. Both include `issuedAt`, `timeZone`, `publicURL`, and the two strings in `copy`:

```json
{
  "schemaVersion": 2,
  "ticketNumber": 17,
  "reservation": { "kind": "slot", "startsAt": "2026-11-03T14:30:00Z" },
  "issuedAt": "2026-11-03T13:45:06Z",
  "timeZone": "Asia/Tokyo",
  "publicURL": "https://tickets.example.test/ticket/<public-token>",
  "copy": {
    "receiptTitle": "Workshop pass",
    "arrivalGuidance": "Arrive at the west entrance."
  }
}
```

Unknown fields and fields belonging to another driver are rejected. The command executable path must be absolute. The JSON file contains no credentials; protect it and the service environment file with host permissions appropriate to the service account.

## Driver behavior

- `tm-t88v-usb` opens the configured device before claiming a job. A missing device does not claim work. It preserves the existing Shift_JIS receipt encoding, including `FS &`, `FS C 1`, ticket number, reservation date/start, QR code, and cut sequence.
- `escpos-tcp` uses the same encoder and writes raw ESC/POS over TCP. Raw port 9100 has no TLS; use only on loopback or a trusted network. A successful socket write does not guarantee a printer accepted or emitted paper. Other printer models are not implied to be compatible.
- `json-file` writes `<job-id>.json` as an atomic preview containing `"preview": true`. Repeating the same job ID with identical content succeeds without replacing the file; different content for an existing job ID fails and leaves the existing file unchanged. The agent log includes `preview=true`. No paper is printed. The API's `printed` result in this mode means only that preview output completed, not that paper was produced.
- `command` starts the configured argv directly without a shell. It receives one `ReceiptDocumentV1` JSON object on stdin (maximum 64 KiB) and must write exactly one JSON object such as `{"outcome":"printed"}` to stdout. Only `PATH` is passed to the child environment; the agent token and other service variables are not inherited. Stdout is reserved for the one JSON result object and stderr is discarded. The command has up to 30 seconds. A process that cannot start reports `failed`; timeout, abnormal exit, malformed or extra stdout reports `unknown`. A timeout terminates the child and stops the agent. The command runs as the service account under the unit's systemd restrictions; it is trusted code, not isolated in its own sandbox. If the configured command needs access to a device, allow only that device in the unit rather than broadening `DevicePolicy`.

The version 2 payload carries the public ticket URL, IANA timezone, reservation snapshot, and receipt copy. Those values are used as supplied; the agent does not reconstruct them from current settings. Legacy v1 payloads retain their existing behavior and do not invent reservation details.

The command driver's stdin is the rendered `ReceiptDocumentV1` (version 1), not the version 2 wire payload. A slot receipt looks like this; legacy tickets omit `reservationDate` and `reservationStart`. The document does not include a job ID.

```json
{
  "version": 1,
  "title": "Workshop pass",
  "numberText": "17",
  "reservationDate": "2026-11-03",
  "reservationStart": "06:30",
  "issuedAtText": "発券日時: 2026-11-03 07:45:06",
  "qrURL": "https://tickets.example.test/ticket/<public-token>",
  "guidance": ["Arrive at the west entrance."]
}
```

## Build and test

Run from this directory with Go 1.27.3 selected by mise:

```sh
mise exec -- go vet ./...
mise exec -- go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 mise exec -- go build -o /tmp/print-agent-amd64 ./cmd/print-agent
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 mise exec -- go build -o /tmp/print-agent-arm64 ./cmd/print-agent
```

Install the resulting binary as `/usr/local/bin/print-agent` and adapt `systemd/bunkasai-print-agent.service.example` to the host's service account and device group. Keep the environment file readable only by the service administrator. The example unit creates a writable `/var/lib/print-agent` state directory; set the preview driver's `outputDir` to `/var/lib/print-agent/previews` or another path explicitly writable by the service account. For USB use, keep the unit's `DeviceAllow` path aligned with the configured `devicePath` (or legacy `DEVICE_PATH`).

A `printed` result means the selected driver completed its output operation; it cannot prove that paper physically emerged. USB partial writes, TCP partial writes, and output timeouts are `unknown` to avoid automatic duplicate output. A timed-out agent attempts to report `unknown` and exits with status 1; systemd restarts it after two seconds. If the result report fails, it is not retried and the job's server-side state may remain uncertain. Check the output before manually reprinting an unknown job. Physical printer output and host-specific permissions require rehearsal on the target hardware; they are not verified by the automated tests.

## Receipt content

A slot receipt shows the ticket number, issue timestamp, reservation date and start time, the QR code, and the configured arrival guidance. Version 2 uses the timezone and copy snapshot included in the claimed payload. Legacy output continues to use JST. Equipment, attendee count, and experience/end times are intentionally omitted; the visitor page is the source of truth for current equipment and staff changes. A legacy ticket has no assigned slot, so staff must not infer a reservation from its receipt.
