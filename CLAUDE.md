# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A RAG chatbot platform: FastAPI + LangChain backend, React frontend, TimescaleDB+pgvector for chat history and embeddings, MinIO for document storage, Keycloak for auth, Kong as the API gateway. Containerized with Docker, deployable via Helm/Kubernetes. See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for request-flow diagrams and the reasoning behind each infra choice, and [`docs/SECURITY.md`](docs/SECURITY.md) for what the security tooling (SonarQube, Trivy, ZAP, Gitleaks) actually found and fixed.

## Commands

### Whole stack (docker-compose)

```bash
make up               # build + start everything (from infra/.env)
make down              # stop, keep data
make down-v             # stop and wipe TimescaleDB/MinIO data
make restart-backend     # recreate just the backend container (picks up infra/.env changes)
make logs                # tail backend logs
```

Ollama is an opt-in profile, not part of `make up` (real local LLM server — slow/CPU-heavy on a laptop): `make ollama-up` / `make ollama-down` / `make ollama-pull`. Run `make help` for the full list. First-time setup: `cp infra/.env.example infra/.env`, fill in an API key (or set `LLM_PROVIDER=ollama`).

### Backend (`cd backend`)

```bash
uv sync                            # install deps
uv run fastapi dev app/main.py      # dev server, http://localhost:8000/docs
uv run alembic upgrade head          # migrate (needs a running TimescaleDB)
uv run alembic revision --autogenerate -m "..."   # new migration

uv run pytest                        # unit + integration (integration spins up real TimescaleDB/MinIO via testcontainers — needs Docker, nothing else)
uv run pytest tests/unit              # fast, no Docker
uv run pytest tests/unit/test_llm_provider.py::test_name   # single test
uv run pytest -k "some_expression"    # by expression

uv run ruff check .
uv run ruff format .
```

### Frontend (`cd frontend`)

```bash
npm install
npm run dev        # http://localhost:5173 — needs Kong (:8000) and Keycloak (:8080) reachable

npm run test                          # vitest run
npm run test:watch                     # watch mode
npm run test -- --run tests/useAiVoice.test.ts   # single file
npm run test:coverage                   # + lcov, used by SonarQube

npm run lint
npm run build       # tsc -b && vite build -> dist/
```

`VITE_*` env vars (API base URL, Keycloak URL/realm/client) are inlined at **build** time, not read at runtime — rebuilding is required to point the app at a different backend/Keycloak (see `frontend/Dockerfile`'s `--build-arg`s).

### Login for local dev

`testuser` / `testuser123` (seeded by the Keycloak realm import).

## Architecture

### Request flow: chat (the core, non-obvious part)

`POST /api/v1/chat` is SSE-streaming and deliberately does **not** use the normal `Depends(get_db)` pattern: FastAPI closes `yield`-dependencies as soon as the endpoint function *returns* the `StreamingResponse` object, which happens *before* the body generator actually runs. Both the SSE chat endpoint and the document-ingestion `BackgroundTask` instead take a `session_maker` (a factory, not a session) and open their own session for their own lifetime — see `app/api/v1/routers/chat.py` and `app/services/ingestion_service.py`. This was caught by integration tests exercising the real DI path, not code review — a fake-session mock would have hidden it.

Flow: verify JWT (JWKS) → persist user message → pgvector similarity search (owner-scoped) → load recent history → LCEL chain (`app/langchain_pipeline/rag_chain.py`) → stream tokens back as SSE (`session`, `token*`, `done`) → persist assistant reply after the stream completes.

### LLM provider abstraction

`app/services/llm_provider.py` builds a provider-agnostic `BaseChatModel` for **Anthropic, OpenAI, Groq, or local Ollama** — selected via `LLM_PROVIDER` env (deployment-wide default) or per-user (`user_llm_settings` table, one row per user who configured their own in Settings). Two entry points:
- `resolve_chat_model(db, owner_id)` — layers per-user settings over the deployment default, decrypts the stored key (Fernet, `app/core/crypto.py`) transiently right before handing it to the provider SDK.
- `resolve_groq_api_key(db, owner_id)` — **independent** of the chat provider; backs the AI-voice TTS feature, so a user chatting via Anthropic can still save a Groq key just for voice.
- `check_ollama_available()` — live 1.5s-timeout probe; `PUT /settings/llm` rejects selecting Ollama if it isn't actually reachable rather than saving a choice that'll fail on the next message.

Per-user API keys (Anthropic/OpenAI/Groq) are Fernet-encrypted at rest (`SECRET_ENCRYPTION_KEY`), stored in separate columns per provider so switching providers doesn't discard a previously-saved key, and only ever decrypted transiently in `resolve_chat_model`/TTS — never logged, cached, or returned to the frontend (`GET` returns a masked preview computed at write time). See `docs/SECURITY.md` for the full threat-model writeup.

### Data model notes

- `chat_messages` is a **TimescaleDB hypertable** partitioned on `created_at`, with a composite `(id, created_at)` primary key (Timescale requires the partitioning column in every unique constraint). A plain `alembic revision --autogenerate` will misread its Timescale-managed index as drift unless `alembic/env.py`'s `include_object` filter stays in place — read the two hand-written migrations under `backend/alembic/versions/` before writing one that touches this table.
- Embeddings are a **local HuggingFace model** (`BAAI/bge-small-en-v1.5`), not an API call — decouples ingestion from whichever chat LLM provider is configured.
- Everything is owner-scoped (`owner_id` = Keycloak `sub` claim) at the repository layer (`document_repository.py`/`chat_repository.py`), enforced via the `get_current_owner_id` dependency (`app/core/security.py`) on every protected route.

### Auth / gateway split

Kong does **not** verify JWTs — it only does routing/CORS/rate-limiting; the backend verifies every request itself against Keycloak's JWKS (`app/core/security.py`). Keycloak has two separate URL settings because a container reaches it differently than a browser does: `KEYCLOAK_SERVER_URL` (internal JWKS fetch) vs `KEYCLOAK_ISSUER_URL` (must match what's stamped in the token's `iss` claim, i.e. the browser-facing address) — get these out of sync and every request fails with "issuer mismatch" (see `docs/SETUP.md`'s troubleshooting table).

### Frontend voice chat

Three independent layers, each with its own fallback, wired together in `frontend/src/hooks/`:
- **Speech-to-text**: browser-native `SpeechRecognition` only (Chrome/Edge; Firefox unsupported, feature-detected) — no audio ever reaches the backend.
- **Text-to-speech**: `useVoiceOutput` picks between the browser's `speechSynthesis` (always available, any language) and Groq's Orpheus AI voice (English only, `POST /api/v1/speech/tts` → `app/services/tts_service.py`), falling back to the browser voice on any AI-voice failure rather than going silent.
- **`useVoiceConversation`**: the hands-free "real-time conversation" loop (listen → pause → send → speak reply → listen again), a small state machine (`idle`/`listening`/`thinking`/`speaking`) built entirely from the two hooks above. The mic stays live during `speaking` too (not just `listening`) so the user can barge in and interrupt the reply — this requires phase-transition checks to use a ref written *synchronously* at the moment a transition is decided (`setPhaseNow` in `useVoiceConversation.ts`), not one merely synced at render time, since a ref that only updates on render can lose a race against an already-settled promise (e.g. an instant AI-voice failure).

Security headers (`frontend/security-headers.conf.template`) need `media-src 'self' blob:` for AI-voice playback (an `<audio>` element playing a `blob:` object URL) and `Permissions-Policy: microphone=(self)` for the mic button — both are easy to silently regress since `default-src`/`microphone=()` fail closed with no visible error until you actually click the feature in a real browser against the real nginx headers.

### Security tooling posture

Trivy runs three separate scans with different CI policies: filesystem + image `--pkg-types library` (our own deps) **block the build**; full image (+ base OS packages) and config/IaC are informational-only (upstream OS CVEs move on their own patch cadence). One documented `.trivyignore` exception (`CVE-2024-23342`, unreachable — every `jwt.decode()` hardcodes `algorithms=["RS256"]`). ZAP runs against the live docker-compose stack (`infra/security/zap-scan.sh`), weekly/manual only in CI (needs the whole stack up). See `docs/SECURITY.md` for current findings and what's a deliberate accepted tradeoff vs. an open item.

## Repository layout

```
backend/    FastAPI + LangChain RAG API — backend/README.md
frontend/   React + Vite + TypeScript chat UI — frontend/README.md
infra/      docker-compose, Kong config, Keycloak realm, Helm chart — infra/README.md
docs/       ARCHITECTURE.md, SETUP.md, DEPLOYMENT.md, SECURITY.md
postman/    API collection, verified via newman — postman/README.md
.github/    ci.yml (lint/test/build), security.yml (SonarQube/Trivy/ZAP/Gitleaks)
```
