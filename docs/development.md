# Development

## Prerequisites

The repository pins Node.js, pnpm, Go, Atlas, Kustomize, kubeconform, and actionlint in `mise.toml`. Use the repository-pinned versions rather than installing system-wide tools.

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
```

The API requires a reachable PostgreSQL database for local development. Copy `.env.example` to `.env`, set `DATABASE_URL` to a disposable local database, and set distinct random values for `ADMIN_TOKEN` and `AGENT_TOKEN` (at least 32 characters each, with no whitespace). Configure `SLOT_SCHEDULE_JSON` as JSON containing the approved JST dates and start windows, and set `EVENT_END_AT` to the event end with an explicit timezone. The API reads process environment variables; load the file in the current shell before invoking the development server:

```sh
cp .env.example .env
set -a
. ./.env
set +a
```

Do not commit `.env`. The environment example contains placeholders, not usable credentials.

## Run the application

From the repository root, apply the checked-in migrations only to the disposable development database, then start the API and web development servers:

```sh
mise exec -- pnpm db:migrate
mise exec -- pnpm dev
```

The web application is available at `http://127.0.0.1:5173`; API requests are proxied to the API development server. Verify the API through the web proxy:

```sh
curl -fsS http://127.0.0.1:5173/api/healthz
curl -fsS http://127.0.0.1:5173/api/readyz
```

`healthz` checks that the process responds; `readyz` also checks database connectivity.

## Checks

Run the root checks from the repository root:

```sh
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm build
mise exec -- node scripts/check-env-example.ts --self-test
```

The environment checker uses the TypeScript AST to read the direct keys in `environmentSchema` without executing `config.ts`. `.env.example` must include every schema key whose property's outermost schema call is not `.optional()`; optional keys may be omitted or included. Unknown keys, duplicate keys, malformed entries, and unsupported schema property shapes are rejected. The checker recognizes direct property assignments and this explicit outer `.optional()` form; it does not interpret arbitrary Zod expressions. This static check validates key names, not values or runtime configuration: for example, `loadConfig` still requires `EVENT_END_AT` and `SLOT_SCHEDULE_JSON` in legacy mode when `APP_MANIFEST_PATH` is absent. The `--self-test` exercises required and optional keys, missing and unknown keys, duplicates, malformed entries, comments, blank lines, CRLF, multiline declarations, and optional-like text inside required expressions. API tests use `embedded-postgres` unless `TEST_DATABASE_URL` points at a test database.

For print-agent changes, run these from `apps/print-agent`:

```sh
mise exec -- go vet ./...
mise exec -- go test ./...
```

`pnpm test:e2e` runs the Playwright reservation, ticket-QR, reschedule, cancellation, and print workflow in `apps/web/e2e`. Its fixed rehearsal timetable is 2026-11-03 through 2026-11-04; install Chromium once with `mise exec -- pnpm exec playwright install chromium` before running the suite locally.

`mise exec -- node scripts/slot-migration-rehearsal.ts` starts from the pre-reservation SQL fixture, applies the reservation migration, verifies legacy API reads and old-format writes, issues a new slot ticket, then restores a custom-format dump to a separate database and compares retained rows. It reports isolated database timings; it does not measure production downtime.

`pnpm test` also runs `pnpm test:oss-compose-migrate`: it renders both Compose authentication profiles, executes their resolved migration commands against disposable embedded PostgreSQL databases, and asserts all eight revisions, the current version, and expected tables. The regression check covers the former scalar-command failure mode, invalid arguments, and connection failures; the Docker daemon is not required. If Docker Compose, Atlas, or `embedded-postgres` is unavailable, it prints `SKIP` and does not claim migration behavior was verified.

## Database changes

To create a versioned migration, run `pnpm db:diff <migration_name>` from the repository root. Review the generated SQL and `atlas.sum`, then run `pnpm db:validate`. `pnpm db:status` and `pnpm db:migrate` use `DATABASE_URL`; use only a disposable development database with these commands. Never point them at production. Production migrations run through the Argo CD Sync hook migration Job in wave 1, before the API Deployment in wave 2.

## API contract and deployment manifests

The Hono route definitions are the API contract. Regenerate `apps/web/src/api/openapi.json` and its TypeScript definitions with:

```sh
mise exec -- pnpm openapi:generate
```

For Kustomize and strict schema-validation commands, see [Argo CD Application examples](argocd-application-example.md). Passing static validation does not establish Argo CD, cluster, network-policy, image, or printer runtime behavior.
