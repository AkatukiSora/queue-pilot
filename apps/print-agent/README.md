# Print Agent

The print agent runs on the Linux computer connected to the TM-T88V. It uses the API's agent-only Bearer token and the `tm-t88v` file transport; it is not deployed in Kubernetes.

## Configuration

Set these variables in the service environment file:

- `API_BASE_URL`: the publicly reachable HTTP(S) origin serving both the API and visitor web app, for example `https://tickets.example.test`. The agent calls `/api/agent/...` and prints QR URLs at `/ticket/<token>` on the same origin. Visitor smartphones must be able to reach it; `localhost` and LAN-only addresses are not suitable.
- `AGENT_TOKEN`: the agent credential, at least 32 characters and distinct from the admin token.
- `DEVICE_PATH`: absolute path to the printer device; normally `/dev/usb/lp0`.

Configuration is validated once at startup. The service keeps running when the device cannot be opened, does not claim a job until it opens, and retries after two seconds. It logs one warning when the device becomes unavailable and one recovery message when it returns, rather than logging every poll.

## Build and test

Run from this directory with Go 1.27.3 selected by mise:

```sh
mise exec -- go vet ./...
mise exec -- go test ./...
CGO_ENABLED=0 GOOS=linux GOARCH=amd64 mise exec -- go build -o /tmp/print-agent-amd64 ./cmd/print-agent
CGO_ENABLED=0 GOOS=linux GOARCH=arm64 mise exec -- go build -o /tmp/print-agent-arm64 ./cmd/print-agent
```

Install the resulting binary as `/usr/local/bin/print-agent` and adapt `systemd/bunkasai-print-agent.service.example` to the host's service account and printer-device group. Keep the environment file readable only by the service administrator.

A `printed` result means the file transport write and flush succeeded; it cannot prove that paper physically emerged. A printer write is limited to 30 seconds. If it times out, the agent reports `unknown` once, does not close the potentially blocked device, and exits with status 1 so systemd restarts it after two seconds. Partial writes and timeouts are `unknown` to avoid automatic duplicate printing. A failed result-report request is not retried; the lease expiry makes the job `unknown`, so inspect the paper before manually reprinting. Hardware printing and host-specific systemd permissions must be rehearsed on the target device.

If `DEVICE_PATH` differs from `/dev/usb/lp0`, update the unit's `DeviceAllow` path to match it. Exit status 2 indicates invalid startup configuration and is not restarted by the example unit.

Receipt timestamps are always printed in Japan Standard Time (JST), independent of the agent host's timezone.
