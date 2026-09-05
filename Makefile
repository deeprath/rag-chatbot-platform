# Convenience wrapper around infra/docker-compose.yml — see infra/README.md
# for the full picture. Every target can be run from the repo root.
#
# Ollama is deliberately NOT part of `make up`: it's a real local LLM server
# (~1GB+ model download, and slow/CPU-heavy on a laptop with no GPU
# passthrough) — something you opt into for a specific reason (no API key
# yet, working offline), not something that should start by default and
# compete for your machine's resources every time you just want to run the
# app against Claude/OpenAI/Groq. `make ollama-up` / `make ollama-down` turn
# it on and off on purpose, whenever you actually want it.

COMPOSE := cd infra && docker compose

.PHONY: help up down down-v ps logs restart-backend \
        ollama-up ollama-down ollama-pull ollama-logs

help:
	@echo "Core stack (Keycloak, Kong, TimescaleDB, MinIO, backend, frontend):"
	@echo "  make up               Build + start everything (LLM_PROVIDER from infra/.env)"
	@echo "  make down             Stop containers, keep data"
	@echo "  make down-v           Stop containers AND wipe TimescaleDB/MinIO data"
	@echo "  make ps               Show service status"
	@echo "  make logs             Tail backend logs"
	@echo "  make restart-backend  Recreate the backend container (picks up infra/.env changes)"
	@echo ""
	@echo "Ollama (local LLM, no API key — optional, resource-heavy, off by default):"
	@echo "  make ollama-up        Start Ollama too, then pull the model (first time only)"
	@echo "  make ollama-pull      (Re-)pull the model configured as OLLAMA_MODEL"
	@echo "  make ollama-down      Stop just the Ollama containers, keep the rest running"
	@echo "  make ollama-logs      Tail Ollama's logs"
	@echo ""
	@echo "First time: cp infra/.env.example infra/.env, then fill in an API key"
	@echo "(or set LLM_PROVIDER=ollama and use the targets above instead)."

up:
	$(COMPOSE) up -d --build
	$(COMPOSE) ps

down:
	$(COMPOSE) down

down-v:
	$(COMPOSE) down -v

ps:
	$(COMPOSE) ps

logs:
	$(COMPOSE) logs -f backend

restart-backend:
	$(COMPOSE) up -d --force-recreate backend

# --- Ollama (opt-in profile — see infra/docker-compose.yml) ---

ollama-up:
	$(COMPOSE) --profile ollama up -d --build
	$(MAKE) ollama-pull
	@echo ""
	@echo "Ollama is up. Set LLM_PROVIDER=ollama in infra/.env (or pick it in the"
	@echo "Settings page in the app) and restart the backend: make restart-backend"

ollama-pull:
	$(COMPOSE) --profile ollama run --rm ollama-pull

ollama-down:
	$(COMPOSE) --profile ollama stop ollama ollama-pull

ollama-logs:
	$(COMPOSE) logs -f ollama
