# Local stack (docker-compose)

Brings up the entire platform — TimescaleDB+pgvector, MinIO, Keycloak, Kong,
the FastAPI backend, and the React frontend — with one command.

```bash
cd infra
cp .env.example .env      # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY to actually chat
docker compose up -d
docker compose ps          # wait until everything shows "healthy"
```

| Service | URL | Notes |
|---|---|---|
| Frontend | http://localhost:5173 | React SPA (nginx) |
| API (via Kong) | http://localhost:8000/api/v1 | what the frontend actually calls |
| API (direct) | http://localhost:8001/api/v1 | bypasses Kong, useful for debugging |
| Swagger / OpenAPI | http://localhost:8000/docs | |
| Keycloak | http://localhost:8080 | admin/admin; realm `rag-chatbot`, seeded user `testuser`/`testuser123` |
| MinIO console | http://localhost:9001 | minioadmin/minioadmin |
| TimescaleDB | localhost:5432 | rag/rag, db `rag_chatbot` |

Migrations run automatically: `backend-migrate` is a one-shot service (`alembic
upgrade head`) that the `backend` service waits on (`service_completed_successfully`)
before starting.

## Things worth knowing if you touch this

- **Keycloak issuer vs. internal address**: the backend reaches Keycloak internally
  at `http://keycloak:8080` (JWKS fetch), but tokens are issued with
  `iss=http://localhost:8080` (`KC_HOSTNAME=localhost` on the Keycloak service) —
  the address a *browser* actually uses. That's why the backend has two separate
  settings, `KEYCLOAK_SERVER_URL` (fetch) and `KEYCLOAK_ISSUER_URL` (verify) — see
  `app/core/security.py`'s docstring. Getting this wrong looks like every request
  failing with "Invalid token: issuer mismatch".
- **Container healthchecks: use `127.0.0.1`, not `localhost`**. Both the backend's
  and frontend's Dockerfiles hit this: `wget http://localhost/health` failed inside
  the frontend container (IPv6 `::1` resolution) while `127.0.0.1` worked fine.
  Learned the hard way — keep healthchecks on `127.0.0.1`.
- **`npm ci` fails in the frontend build** (`Cannot find module
  @rollup/rollup-linux-*`) — this is npm/cli#4828: a lockfile committed from one
  platform (ours: macOS) can't be trusted for a different build platform's optional
  native deps. The Dockerfile deliberately doesn't copy `package-lock.json` into
  the build stage and runs a lockfile-free `npm install` instead.
- **`torch` is pinned to the CPU-only wheel** (`backend/pyproject.toml`'s
  `[tool.uv.sources]`) — PyPI's default Linux wheel drags in a full CUDA toolkit
  (~1GB+ of NVIDIA packages) that's useless here and was enough to OOM a
  resource-constrained Docker Desktop VM mid-build.

## Tear down

```bash
docker compose down          # stop + remove containers, keep volumes (data persists)
docker compose down -v       # also wipe TimescaleDB/MinIO data
```
