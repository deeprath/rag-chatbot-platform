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

## Using Ollama (no API key needed)

Don't have an `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` yet? `LLM_PROVIDER=ollama` runs
a local open model instead — no key, no cost, works offline. The `ollama` service
is behind a compose **profile** so it doesn't force a ~1GB+ model download on
everyone who just wants to use a real API key:

```bash
cd infra
# in .env: LLM_PROVIDER=ollama   (OLLAMA_MODEL defaults to llama3.2:1b)
docker compose --profile ollama up -d --build
docker compose --profile ollama run --rm ollama-pull   # first time only — pulls the model
```

Responses are slower and lower-quality than Claude/GPT (small model, CPU-only —
Docker Desktop doesn't pass through Apple Silicon/GPU acceleration), but it's a
real, working LLM with no signup. Swap `OLLAMA_MODEL` for a bigger model
(`llama3.2:3b`, `qwen2.5:7b`, ...) if your machine can take it — just re-run the
`ollama-pull` command above after changing it. Switch back to a real provider
any time by setting `LLM_PROVIDER=anthropic` (or `openai`) and restarting the
`backend` service; the `ollama` containers can keep running idle or be stopped
with `docker compose --profile ollama down`.

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
