# RAG Chatbot Backend

FastAPI + LangChain backend for the RAG chatbot platform. See [../docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md) for the full system design.

## Local development

```bash
cd backend
cp .env.example .env      # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY, or use LLM_PROVIDER=ollama
uv sync                   # install dependencies into .venv
uv run fastapi dev app/main.py
```

API docs: http://localhost:8000/docs

Requires a running TimescaleDB (+ pgvector, migrated via `uv run alembic upgrade head`),
MinIO, and Keycloak — see [`../infra/docker-compose.yml`](../infra/docker-compose.yml) /
[`../docs/SETUP.md`](../docs/SETUP.md). A real `ANTHROPIC_API_KEY`/`OPENAI_API_KEY` (env, or
per-user via `PUT /settings/llm`) is only needed to actually call `POST /api/v1/chat`;
everything else — including `LLM_PROVIDER=ollama`, no key at all — works without one.

## Endpoints (v1)

| Method | Path | Purpose |
|---|---|---|
| GET | `/health`, `/health/ready` | Liveness/readiness |
| POST | `/documents` | Upload a PDF/DOCX/TXT file; ingested (chunk+embed) in the background |
| GET | `/documents`, `/documents/{id}` | List / check ingestion status |
| POST | `/chat` | Ask a question; streams the answer back as Server-Sent Events |
| GET | `/chat/sessions`, `/chat/sessions/{id}/messages` | Browse chat history |
| GET | `/settings/llm` | Current LLM provider + whether a key is saved (masked preview only) |
| PUT | `/settings/llm` | Choose a provider (`anthropic`/`openai`/`groq`/`ollama`) and, if needed, save an API key — encrypted at rest, never returned; see [`../docs/SECURITY.md`](../docs/SECURITY.md) |
| POST | `/speech/tts` | AI voice (English only) — Groq's Orpheus model, real human-sounding audio; see [`app/services/tts_service.py`](app/services/tts_service.py) |

All routes are scoped by owner via the `sub` claim of a verified Keycloak JWT
(`Authorization: Bearer ...`) — see [`app/core/security.py`](app/core/security.py).

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
