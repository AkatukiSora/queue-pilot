# Third-party notices

The public application credits page at `/credits` presents the generated licenses for Web production dependencies and print-agent dependencies. Its source data, including full license texts and available notices, is [`apps/web/src/generated/credits.json`](apps/web/src/generated/credits.json).

Regenerate the inventory with `pnpm credits:generate`. See [the credits generation guide](docs/credits.md) for the dependency scope and license policy. This file intentionally contains no hand-maintained dependency list.
