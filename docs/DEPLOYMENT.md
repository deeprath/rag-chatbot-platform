# Deployment

Two paths: docker-compose (single host, demo/small-scale) and Kubernetes via
Helm (this is where it actually scales). Both share the same application
images and the same Keycloak realm — see
[`docs/ARCHITECTURE.md`](ARCHITECTURE.md) for why the backend needs slightly
different Keycloak settings between them.

## docker-compose

Covered fully in [`docs/SETUP.md`](SETUP.md) and
[`infra/README.md`](../infra/README.md) — `docker compose up -d` in `infra/`.
Fine for a demo or single-host deployment; not what you'd point real traffic
at (Keycloak runs in `start-dev` mode, TimescaleDB/MinIO are single containers
with no backup story, all on one Docker network).

## Kubernetes (Helm)

Full guide, including the local `kind`-cluster quickstart and the three real
bugs only caught by actually deploying (a missing migration step, Kong
defaulting to way more nginx workers than it needs, Keycloak needing its own
Ingress host): [`infra/helm/README.md`](../infra/helm/README.md).

Short version:

```bash
# Build & load images (local kind cluster — see infra/helm/README.md for a
# real registry instead)
docker build -t rag-chatbot-backend:latest backend/
docker build -t rag-chatbot-backend-migrate:latest backend/
docker build \
  --build-arg VITE_API_BASE_URL=http://rag-chatbot.local/api/v1 \
  --build-arg VITE_KEYCLOAK_URL=http://keycloak.rag-chatbot.local \
  --build-arg VITE_KEYCLOAK_REALM=rag-chatbot \
  --build-arg VITE_KEYCLOAK_CLIENT_ID=rag-chatbot-frontend \
  -t rag-chatbot-frontend:latest frontend/
kind load docker-image rag-chatbot-backend:latest rag-chatbot-backend-migrate:latest rag-chatbot-frontend:latest --name rag-chatbot

# Install
cd infra/helm
helm install rag-chatbot . -f values.yaml -f values-dev.yaml
```

### What's in the chart

One self-contained chart — the app (backend/frontend, full Deployment +
Service + HPA) plus every dependent service (TimescaleDB, MinIO, Keycloak,
Kong) templated directly rather than pulled in as third-party subcharts. See
[`infra/helm/Chart.yaml`](../infra/helm/Chart.yaml) for why, and read this
before treating it as a real production deployment as-is:

> A real production deployment should replace the TimescaleDB/MinIO/Keycloak
> templates with managed equivalents (Timescale Cloud/RDS, S3, a managed
> Keycloak) rather than just scaling up what's here.

### Values files

| File | Purpose |
|---|---|
| `values.yaml` | Defaults, already shaped for a local single-node cluster |
| `values-dev.yaml` | The little that's still kind/minikube-specific (`pullPolicy: Never`) |
| `values-prod.yaml` | Illustrative cloud overrides — read its header comment; it's a sketch of what changes about the *app tier*, not a drop-in production config |

### Security posture

Every workload has a `securityContext` — full hardening (`runAsNonRoot`,
`readOnlyRootFilesystem`, dropped capabilities) for the backend/frontend
images this project owns, a safer subset for the third-party images whose
entrypoints need root to start before dropping privileges internally
(TimescaleDB, MinIO, Keycloak, Kong). Verified with real `docker run
--read-only --tmpfs ... --user <uid>` runs, not just written and assumed —
see [`docs/SECURITY.md`](SECURITY.md) for the full account, including a real
Kubernetes `emptyDir` ownership bug this caught (the HuggingFace embedding
model cache write failing under a read-only root filesystem until `fsGroup`
was added).

### Rolling out a new image

```bash
# after pushing a new tag to your registry
helm upgrade rag-chatbot . -f values.yaml -f values-prod.yaml \
  --set backend.image.tag=$(git rev-parse --short HEAD) \
  --set frontend.image.tag=$(git rev-parse --short HEAD)
```

The backend's migration `initContainer` (see
[`infra/helm/templates/backend/deployment.yaml`](../infra/helm/templates/backend/deployment.yaml))
runs `alembic upgrade head` before every new pod starts serving — safe across
rollouts since Alembic migrations are idempotent once applied.

### CI/CD

Not built out in this repo (no registry to push to, no cluster to deploy to
from CI) — [`.github/workflows/ci.yml`](../.github/workflows/ci.yml) builds
and tests everything and lints the chart (`helm lint --strict`,
`helm template` against both dev and prod values) on every PR, which is the
piece that's actually verifiable without real deployment targets.
