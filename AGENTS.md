# Repository guidance

## Architecture and dependency direction

- Keep the runtime dependency flow `presentation → application → domain` and `infrastructure → application` (to implement application ports). The composition root is the only place that wires implementations together.
- Keep `domain` framework-free and composed of types and pure functions. `application` may use domain types and ports, but must not import Hono, Drizzle, PostgreSQL, or infrastructure modules.
- Keep HTTP concerns in `presentation`; it calls application use cases only. Keep ORM models and their mapping inside `infrastructure`.
- Validate environment variables once at the process boundary with the Zod schema in `apps/api/src/config.ts`; pass the resulting typed configuration inward.
- Treat the OpenAPI route definitions as the API contract. Regenerate the checked-in web API artifacts with `pnpm openapi:generate`; do not hand-edit generated files.
- Keep dependency versions exact as declared in the repository. Do not add unrelated frameworks, layers, packages, or infrastructure.

## Database and migration safety

- Define schema changes in the Drizzle schema, generate reviewed Atlas versioned migrations with `pnpm db:diff <migration_name>`, then validate them with `pnpm db:validate`.
- Never run `drizzle-kit push`, `drizzle-kit generate`, or `drizzle-kit migrate`.
- Never run migrations automatically when the API starts.
- Never use `atlas schema apply` against production. Production migrations run only through the migration Job in the application Argo CD Application's PreSync phase, after the database Application is healthy.
- `pnpm db:migrate` and `pnpm db:status` use `DATABASE_URL`; point them only at a disposable development database. Never point local commands at production.

## Validation

Run the relevant checks from the repository root before handing off changes:

```sh
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm build
mise exec -- node scripts/check-env-example.ts --self-test
```

For print-agent changes, run `mise exec -- go vet ./...` and `mise exec -- go test ./...` from `apps/print-agent`. For Kubernetes changes, validate both Kustomize roots with the commands in `docs/argocd-application-example.md`.

Do not claim verification that was not run. In particular, local checks do not prove GitHub Actions execution, Kubernetes reconciliation, production behavior, or physical printer output.
