# Argo CD Application example

This is the template for the single Application that consumes the production Kustomize root. It is an example only; no `Application` or `AppProject` resource is part of this repository. Replace the repository revision with a reviewed ref before use, and keep automated sync disabled.

## What one sync does

`deploy/app/overlays/prod` contains the PostgreSQL Cluster (CloudNativePG), its Barman ObjectStore and daily ScheduledBackup, the database NetworkPolicy, both 1Password-managed Secrets, the migration Job, the API Deployment, the Service, and the Ingress. Argo CD applies them in sync-wave order:

1. Wave 0: Barman ObjectStore, PostgreSQL Cluster, NetworkPolicy, OnePasswordItems, ScheduledBackup, Service, Ingress.
2. Wave 1: the Atlas migration Job (a Sync hook). Its init container waits until PostgreSQL accepts connections, then applies migrations.
3. Wave 2: the API Deployment.

The first sync takes several minutes because the PostgreSQL Cluster is created from scratch. If the migration Job fails, fix the cause and sync again; the hook is recreated on each sync.

## Before the first sync

- Both image digests in `deploy/app/overlays/prod/kustomization.yaml` must be real. Mutable tags are not accepted, and an all-zero digest is a placeholder that must never be synced.
- The `bunkasai-ticket-secrets` 1Password item must provide `ADMIN_TOKEN` and `AGENT_TOKEN` as separate fields, each at least 32 non-whitespace characters. The `bunkasai-ticket-postgres-barman-s3` item must provide `ACCESS_KEY_ID` and `ACCESS_SECRET_KEY`. Keep all values in 1Password.
- The platform cluster must have a compatible CloudNativePG Barman Cloud plugin installed before this application is synced.
- Set `SLOT_SCHEDULE_JSON` to the approved JST dates and start windows, `EVENT_END_AT` (ISO 8601 with time zone), and `TICKET_NUMBER_SCOPE` (`daily` or `event`) in `deploy/app/base/deployment.yaml`. The example timetable is 2026-11-03 10:00–14:30 and 2026-11-04 10:00–13:30 JST; replace it with the approved event timetable before deployment.

## Application

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
    targetRevision: <reviewed-ref>
    path: deploy/app/overlays/prod
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

## Validation and unverified runtime

The Kustomize and schema-validation tools are pinned in `mise.toml` (Kustomize 5.8.3 and kubeconform 0.8.0). The CNPG Cluster schema URL is pinned to the CRDs-catalog commit that updated CNPG schemas to operator version 1.30.1.

```sh
mise exec -- kustomize build deploy/app/overlays/prod | mise exec -- kubeconform -strict -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/61bcda00d70c1f40e6f4a5e51b5c159aac932860/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' -summary -
if grep -RInE 'sha256:0{64}' deploy/app/overlays/prod; then
  echo 'unresolved all-zero image digest' >&2
  exit 1
fi
```

A successful schema check does not prove cluster behavior. KIND added default kindnet NetworkPolicy support in v0.24.0; older versions lack it. Verify the exact kind version and exercise a policy in the target environment instead of treating schema validation as proof; if enforcement is unavailable or not deterministic, use a policy-enforcing CNI such as Cilium. kind/CNPG reconciliation, NetworkPolicy enforcement, the Argo CD sync-wave ordering, and image runtime are verified only by the first real sync.
