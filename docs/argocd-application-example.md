# Argo CD Application examples

These are templates for the two Applications that consume the Kustomize roots. They are examples only; no `Application` or `AppProject` resource is part of this repository. Replace the repository revision with a reviewed ref before use, and keep automated sync disabled.

## Deployment order

1. Apply the database Application (`path: deploy/db`) and manually sync it.
2. Wait until the `bunkasai-ticket-postgres` Cluster is healthy and the `bunkasai-ticket-postgres-app` Secret exists.
3. Before syncing the application Application, replace both zero digests in `deploy/app/overlays/prod/kustomization.yaml` with the immutable digests published by the release workflow, and replace the OnePasswordItem `itemPath` with the real item path.
4. Manually sync the application Application. Its Argo CD PreSync Job applies Atlas migrations before the Deployment is updated.

Do not sync `deploy/app/overlays/prod` while either image digest is all zeroes or the OnePasswordItem path contains `<vault-id>` / `<item-id>`. The release workflow must update both image entries with real digests; mutable tags are not accepted. The OnePassword item must provide `ADMIN_TOKEN` and `AGENT_TOKEN` as separate fields. Secret values belong in 1Password and must not be committed.

`EVENT_END_AT` in the Deployment currently matches the example value in `.env.example`; set it to the actual event end time before deployment. Confirm `TICKET_NUMBER_SCOPE` for the event as well.

## Database Application

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: bunkasai-ticket-db
  namespace: argocd
spec:
  destination:
    namespace: bunkasai-ticket
    server: https://kubernetes.default.svc
  project: default
  source:
    repoURL: https://github.com/AkatukiSora/queue-pilot.git
    targetRevision: <reviewed-ref>
    path: deploy/db
  syncPolicy:
    syncOptions:
      - CreateNamespace=true
      - ServerSideApply=true
```

## Application Application

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

## Public ingress

No Ingress resource is included. Until a routing decision is made, `<PUBLIC_HOSTNAME>` and `<INGRESS_CLASS>` are placeholders only; the eventual Ingress must follow the cluster's selected routing method. Do not substitute a guessed hostname or ingress class. Record the approved values in a separate change before exposing the Service.

## Validation and unverified runtime

The Kustomize and schema-validation tools are pinned in `mise.toml` (Kustomize 5.8.3 and kubeconform 0.8.0). The CNPG Cluster schema URL is pinned to the CRDs-catalog commit that updated CNPG schemas to operator version 1.30.1. Both roots pass strict schema validation without missing-schema suppression.

```sh
mise exec -- kustomize build deploy/db | mise exec -- kubeconform -strict -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/61bcda00d70c1f40e6f4a5e51b5c159aac932860/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' -summary -
mise exec -- kustomize build deploy/app/overlays/prod | mise exec -- kubeconform -strict -schema-location default -schema-location 'https://raw.githubusercontent.com/datreeio/CRDs-catalog/61bcda00d70c1f40e6f4a5e51b5c159aac932860/{{.Group}}/{{.ResourceKind}}_{{.ResourceAPIVersion}}.json' -summary -
if grep -RInE 'sha256:0{64}' deploy/app/overlays/prod; then
  echo 'unresolved all-zero image digest' >&2
  exit 1
fi
```

A successful schema check does not prove cluster behavior. KIND added default kindnet NetworkPolicy support in v0.24.0; older versions lack it. Verify the exact kind version and exercise a policy in the target environment instead of treating schema validation as proof; if enforcement is unavailable or not deterministic, use a policy-enforcing CNI such as Cilium. A future optional CI job can create an ephemeral kind cluster, install the CNPG operator corresponding to chart `cloudnative-pg-v0.29.1` (appVersion 1.30.1), apply `deploy/db`, and wait for the single-instance Cluster to become healthy. That job is not implemented here. kind/CNPG reconciliation, NetworkPolicy enforcement, Argo CD PreSync execution, and image runtime remain unverified; no production cluster has been changed.
