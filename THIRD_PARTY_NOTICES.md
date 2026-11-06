# Third-party notices

Queue Pilot's own code is licensed under the Apache License 2.0 (see `LICENSE`). This file summarizes the licenses of its dependencies. Each dependency remains under its own license; the authoritative text is in the package or module you install.

## Summary

The JavaScript dependency tree resolved from `pnpm-lock.yaml` and the Go modules in `apps/print-agent/go.mod` use permissive licenses, with the exceptions below. No dependency under GPL, LGPL, or AGPL was found among the packages installed for linux-x64.

| License                                     | Typical packages                                        | Notes                                                                                                                                                            |
| ------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| MIT, ISC, BSD-2-Clause, BSD-3-Clause, MIT-0 | Most packages                                           | Keep the copyright and permission notices when redistributing.                                                                                                   |
| Apache-2.0, MIT OR Apache-2.0               | For example `@biomejs/biome`, `github.com/google/gousb` | Keep the license and any `NOTICE` text.                                                                                                                          |
| Unlicense, CC0-1.0, BlueOak-1.0.0           | `isbot`, `mdn-data`, `lru-cache`                        | Public-domain-style or permissive.                                                                                                                               |
| Python-2.0                                  | `argparse`                                              | Build-time dependency.                                                                                                                                           |
| MPL-2.0                                     | `lightningcss` and its platform binaries                | Build-time CSS transformer. It is not modified or redistributed with Queue Pilot's runtime. Source for MPL-covered files is available from the upstream project. |
| CC-BY-4.0                                   | `caniuse-lite`                                          | Browser-support data used at build time. Attribution: Alexis Deveria and contributors.                                                                           |
| MIT                                         | `github.com/AkatukiSora/tm-t88v`                        | Printer driver library, same owner.                                                                                                                              |

Go: `golang.org/x/*` modules are BSD-3-Clause; `github.com/google/gousb` is Apache-2.0.

## Limits of this inventory

- It covers packages installed for linux-x64. Optional platform binaries for other operating systems (for example native bindings for esbuild, rolldown, Tailwind CSS oxide, lightningcss, and Biome) are not installed there and were not individually inspected; they are published under the same license as their parent package.
- Fonts and images bundled with the web application, and container base images, are not covered. Check them before distributing a container image.
- A container image or release artifact you build contains additional packages. Generate a software bill of materials for what you ship.
