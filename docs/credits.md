# Third-party dependency credits

The public `/credits` page lists Web production dependencies and packages used by the print agent on Linux amd64 and arm64. Each entry includes its version, SPDX license identifier, source links, and full license text. Available `NOTICE` and `COPYRIGHT` files are included as additional disclosures.

## Regenerate the inventory

Run these commands from the repository root:

```sh
mise exec -- pnpm install --frozen-lockfile
mise exec -- pnpm credits:generate
```

The generator reads the installed Web production dependency graph from pnpm and scans the print-agent package graph with the pinned `go-licenses` version in `scripts/generate-credits.mjs`. The result is `apps/web/src/generated/credits.json`, which the Web credits page imports directly. Commit the generated file with dependency changes; CI regenerates it and fails if it is stale.

The generator stops when a dependency has a missing or non-allowlisted license, a missing full license text, or no source link. The explicit permissive-license allowlist is `ALLOWED_LICENSES` in `scripts/generate-credits.mjs`. Review any allowlist change as a licensing decision; copyleft and unknown licenses remain denied unless the project policy is deliberately revised.
