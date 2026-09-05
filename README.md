# RAG Chatbot Platform

A production-style Retrieval-Augmented-Generation chatbot: **FastAPI** + **LangChain** backend, **React** frontend, **TimescaleDB + pgvector** for chat history and embeddings, **MinIO** for document storage, **Keycloak** for auth, and **Kong** as the API gateway — containerized with **Docker**, deployable via **Helm/Kubernetes**, and scanned with **SonarQube**, **OWASP ZAP**, **Trivy**, and **Gitleaks**.

Every piece below — the auth flow, the Helm deployment, the security
scanning — was actually run and verified against real infrastructure while
building this, not just written and assumed to work; see
[`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) and
[`docs/SECURITY.md`](docs/SECURITY.md) for the real bugs that surfaced (and
were fixed) along the way.

## Documentation

| Doc | Covers |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | System design, request flows, data model, why each tech choice |
| [`docs/SETUP.md`](docs/SETUP.md) | Local dev, running tests, migrations, troubleshooting |
| [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) | docker-compose and Kubernetes/Helm deployment |
| [`docs/SECURITY.md`](docs/SECURITY.md) | SonarQube, Trivy, ZAP, Gitleaks — what's wired up and what it found |
| [`postman/README.md`](postman/README.md) | API collection (verified end-to-end via `newman`) |
| API docs | http://localhost:8000/docs (Swagger) once the backend is running |

## Repository layout

```
backend/    FastAPI + LangChain RAG API — see backend/README.md
frontend/   React + Vite + TypeScript chat UI — see frontend/README.md
infra/      docker-compose, Kong config, Keycloak realm, Helm chart — see infra/README.md
docs/       Architecture, setup, deployment, security docs (table above)
postman/    Postman collection for the API — see postman/README.md
.github/    CI workflows: ci.yml (lint/test/build), security.yml (SonarQube/Trivy/ZAP/Gitleaks)
```

## Quickstart

The whole stack in one command (see [infra/README.md](infra/README.md) for details, ports, and default credentials):

```bash
cd infra
cp .env.example .env      # fill in ANTHROPIC_API_KEY / OPENAI_API_KEY to actually chat
docker compose up -d
```

Then open http://localhost:5173 and log in as `testuser` / `testuser123`.

For iterating on just one piece without rebuilding containers:

Backend:

```bash
cd backend
cp .env.example .env
uv sync
uv run fastapi dev app/main.py   # http://localhost:8000/docs
```

Frontend:

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev                      # http://localhost:5173
```

## Tech stack

| Layer | Choice |
|---|---|
| Backend | FastAPI, Python 3.12, LangChain (LCEL), `uv` |
| LLM | Anthropic Claude, OpenAI, Groq, or local Ollama — no API key needed (configurable per-deployment via `LLM_PROVIDER`, or per-user in-app) |
| Embeddings | Local HuggingFace model (`BAAI/bge-small-en-v1.5`), no external API needed |
| Database | TimescaleDB (Postgres + Timescale) with `pgvector` for embeddings |
| Object storage | MinIO |
| Auth | Keycloak (OIDC) |
| Gateway | Kong |
| Frontend | React 18 + Vite + TypeScript + Tailwind CSS |
| Containers/Orchestration | Docker, docker-compose, Helm, Kubernetes |
| Security scanning | SonarQube, OWASP ZAP, Trivy, Gitleaks |
| Testing | pytest (backend), Vitest (frontend) |

## License

[MIT](LICENSE)
