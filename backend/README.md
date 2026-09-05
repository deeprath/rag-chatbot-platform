# RAG Chatbot Backend

FastAPI + LangChain backend for the RAG chatbot platform. See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full system design.

## Local development

```bash
cd backend
cp .env.example .env      # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY
uv sync                   # install dependencies into .venv
uv run fastapi dev app/main.py
```

API docs: http://localhost:8000/docs

Requires a running TimescaleDB (+ pgvector, migrated via `uv run alembic upgrade head`) and
MinIO — see `docker run` commands in [docs/SETUP.md](../docs/SETUP.md) until Phase 7's
docker-compose stack lands. A real `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is only needed to
actually call `POST /api/v1/chat`; everything else works without one.

## Endpoints (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/health/ready` | Liveness/readiness |
| POST | `/documents` | Upload a PDF/DOCX/TXT file; ingested (chunk+embed) in the background |
| GET | `/documents`, `/documents/{id}` | List / check ingestion status |
| POST | `/chat` | Ask a question; streams the answer back as Server-Sent Events |
| GET | `/chat/sessions`, `/chat/sessions/{id}/messages` | Browse chat history |

All routes are scoped by owner via a temporary `X-Owner-Id` header (Phase 5 replaces this
with the `sub` claim from a verified Keycloak JWT).

## Tests

```bash
uv run pytest              # unit + integration (integration spins up real containers via testcontainers)
uv run pytest tests/unit   # fast, no Docker required
```

## Lint / format

```bash
uv run ruff check .
uv run ruff format .
```
