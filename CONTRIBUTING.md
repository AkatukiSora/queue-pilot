# Contributing

## Before opening a change

Read the [Getting started](docs/getting-started.md) and [Development](docs/development.md) guides. Keep changes scoped, include tests for behavior changes, and update the operator documentation when commands or operational behavior change.

Do not include real credentials, personal identity data, production exports, customer records, or printer output containing real tickets. Use fictional fixtures. Never paste a suspected secret into an issue or pull request; report only its file path and credential type through the private reporting path in [Security](SECURITY.md).

## Validate

Run the relevant checks from the repository root:

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm lint
mise exec -- pnpm typecheck
mise exec -- pnpm test
mise exec -- pnpm build
mise exec -- pnpm db:validate
mise exec -- node scripts/slot-migration-rehearsal.ts
mise exec -- node scripts/oss-migration-rehearsal.ts
mise exec -- pnpm test:e2e
mise exec -- pnpm backup:rehearsal
mise exec -- node scripts/check-env-example.ts --self-test
mise exec -- node scripts/oss-license-inventory.ts
mise exec -- node scripts/oss-sample-smoke.ts
mise exec -- kustomize build deploy/examples/kubernetes
mise exec -- actionlint .github/workflows/ci.yml
```

For Go changes, also run `mise exec -- go vet ./...` and `mise exec -- go test ./...` from `apps/print-agent`. Database rehearsals create disposable local PostgreSQL instances; never supply a production connection string.

## Pull requests

Describe the user-visible change, operational impact, tests actually run, and remaining limitations. Do not claim production, identity-provider, cluster, backup, or physical printer behavior from a local test. Keep sample image references immutable and keep Secret values out of manifests.

The license and third-party notices are proposals pending rights-holder approval. Contributions do not imply that the repository has granted a license. Confirm rights to contributed code and assets before submission.
