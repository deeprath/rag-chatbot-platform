# Helm chart

Self-contained chart: the app (backend/frontend) plus every dependent service
(TimescaleDB, MinIO, Keycloak, Kong) as directly-templated resources — no
third-party subchart dependencies to manage. See `Chart.yaml` for why, and
`values-prod.yaml`'s header for what that tradeoff means for a real cloud
deployment (swap the dependent-service templates for managed equivalents
rather than just scaling them up).

## Try it on a local `kind` cluster

```bash
# 1. Cluster + ingress controller
kind create cluster --name rag-chatbot --config infra/helm/kind-config.yaml
kubectl apply -f https://raw.githubusercontent.com/kubernetes/ingress-nginx/main/deploy/static/provider/kind/deploy.yaml
kubectl wait --namespace ingress-nginx --for=condition=ready pod \
  --selector=app.kubernetes.io/component=controller --timeout=180s

# 2. Build images and load them into the cluster (no registry needed for local
#    dev) — tagged 0.1.0 to match values.yaml's default backend/frontend
#    image.tag (Chart.yaml's appVersion; a floating "latest" tag is what
#    SonarQube's kubernetes:S6596 rule flags on the *Deployment* spec, so the
#    default there is a real, deliberately-bumped version instead). Retag
#    both if you bump the app's own version.
docker build -t rag-chatbot-backend:0.1.0 backend/
docker build -t rag-chatbot-backend-migrate:0.1.0 backend/   # same image; the Job overrides the command
docker build \
  --build-arg VITE_API_BASE_URL=http://rag-chatbot.local/api/v1 \
  --build-arg VITE_KEYCLOAK_URL=http://keycloak.rag-chatbot.local \
  --build-arg VITE_KEYCLOAK_REALM=rag-chatbot \
  --build-arg VITE_KEYCLOAK_CLIENT_ID=rag-chatbot-frontend \
  -t rag-chatbot-frontend:0.1.0 frontend/
kind load docker-image rag-chatbot-backend:0.1.0 rag-chatbot-backend-migrate:0.1.0 rag-chatbot-frontend:0.1.0 --name rag-chatbot

# 3. Install
cd infra/helm
helm install rag-chatbot . -f values.yaml -f values-dev.yaml

# 4. Point rag-chatbot.local / keycloak.rag-chatbot.local at 127.0.0.1 in
#    /etc/hosts, then open http://rag-chatbot.local:8090 (kind-config.yaml
#    maps ingress traffic to host port 8090, not 80, so it doesn't need
#    root/admin privileges). Or skip /etc/hosts entirely and test with
#    `curl -H "Host: rag-chatbot.local" http://localhost:8090/...` instead.
```

**Note on the frontend build args**: Vite inlines `VITE_*` variables into the
JS bundle at *build* time (see `frontend/Dockerfile`), so the image built for
docker-compose (pointed at `localhost`) is not the same image that works
behind this chart's Ingress (pointed at `rag-chatbot.local`) — rebuild with
the args shown above before `kind load`-ing it.

## Verified

Deployed to a real local `kind` cluster + ingress-nginx and exercised
end-to-end: real Keycloak login (token `iss` correctly matching
`keycloak.rag-chatbot.local`), authenticated API calls through
Ingress → Kong → backend, and a full document upload → background ingestion →
`ready` round-trip, all through the cluster.

## Bugs this surfaced that `helm lint`/`helm template` couldn't have caught

Only came up by actually installing the chart and watching pods:

1. **No migration step at all.** docker-compose had a `backend-migrate`
   service gating the backend's startup; nothing in this chart replaced it —
   the backend came up "Ready" against a database with no tables. A Helm
   `pre-install` hook Job is the wrong fix here: it would run *before*
   TimescaleDB's StatefulSet even exists. Fixed with an **initContainer** on
   the backend Deployment instead (`templates/backend/deployment.yaml`) —
   Kubernetes' own guarantee that initContainers complete before the main
   container starts gives exactly the ordering needed, without fighting
   Helm's hook lifecycle. `alembic upgrade head` is idempotent, so redundant
   runs across replicas/rollouts are harmless.
2. **Kong OOMKilled at its default memory limit.** Kong/OpenResty spawns one
   nginx worker per host CPU core by default; on an 8-core box that alone
   blew through a 256Mi limit. Fixed by capping
   `KONG_NGINX_WORKER_PROCESSES` and raising the limit modestly
   (`values.yaml`'s `kong.nginxWorkerProcesses`) — plenty for a low-traffic
   gateway, and a real lesson for sizing Kong pods in general, not just here.
3. **Keycloak needs its own Ingress host**, not a path prefix under the app's
   host — it has too many top-level paths (`/realms`, `/admin`, `/resources`,
   `/js`, ...) to enumerate as ingress rules. See `values.yaml`'s
   `ingress`/`keycloak.host` comments for the full reasoning (same
   issuer-vs-internal-address subtlety as the docker-compose setup, see
   `infra/README.md`).

## Values files

- `values.yaml` — defaults, already shaped for a local single-node cluster.
- `values-dev.yaml` — the little that's still kind/minikube-specific
  (`pullPolicy: Never`, since images are loaded locally, not pulled).
- `values-prod.yaml` — illustrative cloud overrides; read its header comment
  before treating it as a real production values file.

## Cleanup

```bash
helm uninstall rag-chatbot
kind delete cluster --name rag-chatbot
```
