# Argo CD Application example

This repository supplies the application manifests; the owning `Application` and `AppProject` are maintained in `k8s-deploys`. The production `bunkasai-ticket` Application uses automated sync with `selfHeal: true` and `prune: false`. A merge that changes `deploy/app/` is therefore a production reconciliation trigger. Do not merge a reviewed PR until the production gates below are cleared and the administrator has approved the change window.

## Sync order

`deploy/app/overlays/prod` includes the PostgreSQL Cluster, Barman ObjectStore and ScheduledBackup, database NetworkPolicy, 1Password items, migration and bootstrap Jobs, Deployment, Service, and Ingress. Explicit waves are:

| Wave | Resources and purpose                                                                                                                                                         |
| ---- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `-3` | Auth, Barman, and runtime `OnePasswordItem` resources. The operator creates their Kubernetes Secrets asynchronously.                                                          |
| `-2` | ObjectStore and database NetworkPolicy, including bootstrap-to-PostgreSQL TCP/5432.                                                                                           |
| `0`  | Three-instance CNPG Cluster, including `postInitApplicationSQL`, managed runtime login, and the server DNS name used for verified TLS.                                        |
| `1`  | Atlas migration Sync hook using the CNPG-generated `bunkasai-ticket-postgres-app` owner URI.                                                                                  |
| `2`  | Tenant bootstrap Sync hook. Its init container uses the runtime Secret and CA to pass `assertSharedRuntimeRole`; its main container applies the manifest using the owner URI. |
| `3`  | API Deployment using runtime DB components, the shared-auth Secret fields, the tenant manifest, and the CNPG CA certificate.                                                  |

The runtime 1Password item contains only `username` and `password` and is referenced by the CNPG managed role, API, and bootstrap wait init. `username` must be `queue_pilot_runtime_login`. The API and wait init do not receive the owner URI. Migration and bootstrap main are the only owner-credential consumers. The API and bootstrap main mount only `TENANT_MANIFEST_JSON` from the auth Secret; the API receives no fixed event configuration or legacy token environment.

The bootstrap wait retries connection/role readiness at five-second intervals for at most 60 attempts and closes its DB pool on each attempt. The Job has a 600-second deadline. Secret or schema failures do not select fallback credentials. Argo wave ordering does not mean the 1Password operator has already produced every Secret; missing required keys fail closed.

## Production merge gates

Before merging a PR that changes the production path:

1. Verify that both pinned digests are immutable and match the same successful Release source SHA and registry readback.
2. Confirm key presence in 1Password without retrieving values: auth `AUTH_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`, and `TENANT_MANIFEST_JSON`; runtime `username` and `password`; Barman `ACCESS_KEY_ID` and `ACCESS_SECRET_KEY`.
3. Confirm the GitHub OAuth origin/callback and privately verify the single admin identity in the tenant manifest. Do not put OAuth values or identity data in Git or chat.
4. Read back the live Application and Cluster. Confirm no Argo operation is in progress, the intended empty-database `initdb` path is valid, and the old API cannot write while bootstrap applies the manifest. `postInitApplicationSQL` is an initdb hook; adding it does not create roles in an already initialized database. Keep the current Barman destination path and do not disable the WAL-archive check.
5. Obtain explicit approval for the maintenance window and accepted data-loss scope. Complete the rehearsals and exact-head CI. A Draft PR or green static validation does not authorize merge or prove runtime readiness.

## Application example

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: bunkasai-ticket
  namespace: argocd
spec:
  destination:
    namespace: bunkasai-ticket
    server: https://kubernetes.default.svc
  project: default
  source:
    repoURL: https://github.com/AkatukiSora/queue-pilot.git
    targetRevision: main
    path: deploy/app/overlays/prod
  syncPolicy:
    automated:
      prune: false
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

This example documents the production sync behavior; the `Application` remains in `k8s-deploys` and is not rendered by this repository.

## Validation

The Kustomize and schema-validation tools are pinned in `mise.toml` (Kustomize 5.8.3 and kubeconform 0.8.0). The CRD catalog URL is pinned to the commit containing the CNPG 1.30.1 schema.

```sh
kubectl kustomize deploy/app/base
kubectl kustomize deploy/app/overlays/prod
set -o pipefail
mise exec -- kustomize build deploy/app/base | mise exec -- kubeconform -strict -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/61bcda00d70c1f40e6f4a5e51b5c159aac932860/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' -summary -
mise exec -- kustomize build deploy/app/overlays/prod | mise exec -- kubeconform -strict -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/61bcda00d70c1f40e6f4a5e51b5c159aac932860/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' -summary -
```

Static rendering does not prove that 1Password generated the required Secrets, CNPG reconciled the role and certificates, NetworkPolicy is enforced, backups are succeeding, or Argo completed the waves. After an independently approved merge, verify Cluster health and three instances, migration and bootstrap Job completion, API availability and `/api/readyz`, and the expected image IDs using read-only checks. Never read Kubernetes Secret contents. Production sync, OAuth login, backup, and runtime checks are not performed by these commands.
