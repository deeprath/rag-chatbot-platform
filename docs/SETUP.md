# Local setup

## Fastest path: the whole stack

```bash
cd infra
cp .env.example .env      # fill in ANTHROPIC_API_KEY or OPENAI_API_KEY to actually chat
docker compose up -d
docker compose ps          # wait until every service shows "healthy"
```

Open http://localhost:5173 and log in as `testuser` / `testuser123` (seeded by
the Keycloak realm import). See [`infra/README.md`](../infra/README.md) for
every service's URL/port and default credentials, and the non-obvious things
that were fixed to make this all actually work together (issuer/JWKS address
split, container healthcheck gotchas, the npm/Rollup lockfile bug, the CPU-only
torch pin).

## Prerequisites

- Docker Desktop (or another Docker Engine + Compose v2)
- For per-service dev (below, optional): `uv` (Python), Node 20

## Working on one piece at a time

Running the whole stack via compose is the realistic way to try the product,
but rebuilding a container on every code change is slow. For active
development on a single piece, run it directly and point it at the rest of
the stack still running in compose (or standalone containers — see each
README for the plain `docker run` commands used during development):

**Backend** — [`backend/README.md`](../backend/README.md)
```bash
cd backend
cp .env.example .env
uv sync
uv run alembic upgrade head   # needs a running TimescaleDB — see infra/README.md
uv run fastapi dev app/main.py
```
API docs: http://localhost:8000/docs

**Frontend** — [`frontend/README.md`](../frontend/README.md)
```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

## Running the tests

```bash
# Backend: unit + integration (integration spins up real TimescaleDB/MinIO
# containers via testcontainers — needs Docker running, nothing else)
cd backend && uv run pytest

# Frontend
cd frontend && npm run test
```

## Database migrations

Alembic manages the schema — see
[`backend/alembic/versions/`](../backend/alembic/versions/). New migration:

```bash
cd backend
uv run alembic revision --autogenerate -m "describe the change"
uv run alembic upgrade head
```

The migrations directory includes two hand-written ones worth reading before
writing a new one that touches `chat_messages`: enabling the `timescaledb`/
`vector` extensions, and converting `chat_messages` into a hypertable
(`create_hypertable`, partitioned on `created_at`) — a plain `alembic
autogenerate` will misread its Timescale-managed index as drift unless
`alembic/env.py`'s `include_object` filter (already there) stays in place.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| Every authenticated request fails with "issuer mismatch" | `KEYCLOAK_SERVER_URL`/`KEYCLOAK_ISSUER_URL` (backend) or `KC_HOSTNAME` (Keycloak) don't match how the browser reaches Keycloak — see `infra/README.md` |
| `POST /api/v1/chat` hangs or 500s | No `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` set for the active `LLM_PROVIDER` — check `backend/.env` or `infra/.env`, or switch to `LLM_PROVIDER=ollama` (no key needed, see `infra/README.md`) |
| Document stuck in `processing` | Check backend logs — the embedding model downloads on first use and needs outbound network access the first time |
| `docker compose build frontend` fails on `npm ci` | Known npm/Rollup bug (npm/cli#4828) if you edited the Dockerfile back to `npm ci` with the checked-in lockfile — see `frontend/Dockerfile`'s comment |
