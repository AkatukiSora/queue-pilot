# Getting started

This guide starts an isolated local instance. Do not point the commands at a production database. The Compose mock identity provider and JSON-file printer write only to local development resources; neither provides production authentication or physical printing.

## Prerequisites

Install the versions pinned by `mise.toml` and the Docker Compose v2 plugin:

```sh
mise install
mise exec -- pnpm install --frozen-lockfile
```

## Configure local Compose

1. Copy the Compose-only environment template and restrict access:

   ```sh
   cp .env.compose.example .env.compose
   chmod 600 .env.compose
   ```

2. Generate four distinct values with `openssl rand -hex 32` and use them for `COMPOSE_POSTGRES_OWNER_PASSWORD`, `COMPOSE_RUNTIME_DB_PASSWORD`, `COMPOSE_AUTH_SECRET`, and `COMPOSE_OIDC_CLIENT_SECRET`. Keep the owner and runtime database passwords separate. Leave the GitHub client placeholders unchanged unless you use the GitHub profile.

3. Start PostgreSQL, apply migrations and the local manifest, then start the mock OIDC provider, API, and JSON preview agent:

   ```sh
   docker compose --env-file .env.compose --profile local-oidc --profile json-file up --build --wait
   ```

4. Open `http://127.0.0.1:8787` and use the local mock identity. The one-time sample ticket is sent to the JSON-file driver; its output is stored in the `print-agent-previews` volume. The mock identity and ticket data are development fixtures, not real accounts or visitor data.

5. Check API readiness:

   ```sh
   curl -fsS http://127.0.0.1:8787/api/readyz
   ```

The local OIDC profile shares the `oidc-mock` network namespace with the API so the API can use the configuration validator's `localhost`-only HTTP development exception. The mock issuer publishes both ports on loopback; do not bind them to `0.0.0.0`. The mock issuer automatically returns the fictional `demo-admin` identity. Do not expose its port outside the development machine. The API uses the separate non-owner `queue_pilot_runtime_login` role. Migration and manifest-apply services use the owner connection and exit after their work completes. The manifest configure service receives the same profile-specific shared-auth settings as its API service, so configuration validation does not depend on legacy `ADMIN_TOKEN` or `AGENT_TOKEN` values.

To use GitHub OAuth instead, configure a GitHub OAuth application and put its client ID and secret in `.env.compose`. Start the `github` profile instead of `local-oidc`; GitHub credentials are not needed for the mock OIDC profile:

```sh
docker compose --env-file .env.compose --profile github up --build --wait
```

GitHub OAuth is OAuth 2.0, not OpenID Connect. Do not set GitHub credentials together with OIDC settings. A different OIDC provider requires a fixed issuer, discovery URL, client ID, and client secret. The automated mock-provider test does not verify a real identity provider or its account lifecycle.

Stop the local stack and delete its database, generated agent credential, and preview files with:

```sh
docker compose --env-file .env.compose --profile local-oidc --profile json-file down --volumes --remove-orphans
```

Use `down --volumes` only when the sample data can be discarded.

## Generic Kubernetes example

The example at `deploy/examples/kubernetes` contains a runtime Deployment and a separate migration Job. It references three pre-created Secrets by name and does not define Secret values. The database administrator must create a migration owner login and a distinct runtime login that is a member of the `queue_pilot_runtime` role. The runtime login must not own tables, have DDL privileges, or bypass row-level security.

The example intentionally uses an invalid registry and all-zero digest placeholders; it is not deployable as checked in. Replace both with immutable digests for images built from the same reviewed source revision. Create the referenced Secret objects through your approved secret manager. Then render the manifests:

```sh
mise exec -- kustomize build deploy/examples/kubernetes
```

Rendering checks YAML/Kustomize structure only. It does not create a database, provision role membership, validate external Secret objects, or prove that the images start.

## Run the application without Compose

For application development, set either the complete `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, and `DB_PASSWORD` set or `DATABASE_URL` alone for a disposable PostgreSQL database. `DB_SSLMODE=disable` is only for an isolated loopback database; use `verify-full` and a trusted CA for remote databases. Use `AUTH_MODE=legacy-single` only for isolated developer testing. Do not carry legacy bearer-token settings into `AUTH_MODE=oidc/shared`. Apply migrations explicitly with a separate URI-only `DATABASE_URL` environment, then start the API and web development servers:

```sh
mise exec -- pnpm db:migrate
mise exec -- pnpm dev
```

See [Development](development.md) for checks and isolated database rehearsals.
