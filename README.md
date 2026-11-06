# Queue Pilot

Queue Pilot is a self-hosted ticket and reservation service. It provides a web interface, a PostgreSQL-backed API, tenant and event scoping, human sign-in, and a separate print agent. The print agent supports a JSON preview driver for development and hardware-specific drivers for operators.

## Start here

- [Getting started](docs/getting-started.md) explains local setup, authentication, and the deployment samples.
- [Operator handbook](docs/operator-handbook.md) covers tenant/event changes, driver and credential rotation, handover, monitoring, backup, restore, upgrades, and rollback.
- [Development guide](docs/development.md) lists pinned tools and validation commands.
- [Print Agent](apps/print-agent/README.md) documents agent setup and driver behavior.
- [Security policy](SECURITY.md) describes vulnerability reporting.
- [Contributing](CONTRIBUTING.md) describes changes and tests.

## Authentication and deployment

GitHub OAuth is the initial sign-in provider. Generic OpenID Connect can replace it by changing the provider configuration while preserving the application's authentication port and local tenant membership model. Provider configuration is fixed at process startup; a login request cannot choose an issuer. The local mock issuer is for development and automated tests only. It is not an identity provider for real users.

The `compose.yaml` and `deploy/examples/kubernetes` samples are generic starting points. They keep migration/owner database credentials separate from the non-owner runtime role, contain no Secret values, and do not modify the production overlay. Replace sample image references with immutable digests built and reviewed for your environment before deployment. A successful manifest build does not validate a cluster, identity provider, network policy, storage, or physical printer.

## License status

No license has been granted by this repository. `LICENSE.proposed` and `THIRD_PARTY_NOTICES.proposed` are drafts only. Do not treat this repository or its release artifacts as licensed for redistribution until the rights holder approves a license and publishes the corresponding license file.
