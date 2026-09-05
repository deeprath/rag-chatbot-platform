"""Application configuration, loaded from environment variables / .env."""

from functools import lru_cache
from typing import Literal

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Central application settings.

    All values are overridable via environment variables (see backend/.env.example).
    """

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    # --- App ---
    app_name: str = "RAG Chatbot API"
    environment: Literal["local", "dev", "staging", "prod"] = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # --- Database (TimescaleDB / Postgres + pgvector) ---
    database_url: str = Field(
        default="postgresql+asyncpg://rag:rag@localhost:5432/rag_chatbot",
        description="Async SQLAlchemy connection string for the Timescale/Postgres instance.",
    )
    db_echo: bool = False

    # --- MinIO (object storage) ---
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_secure: bool = False
    minio_bucket_documents: str = "documents"

    # --- Keycloak (auth) ---
    keycloak_server_url: str = "http://localhost:8080"
    keycloak_realm: str = "rag-chatbot"
    keycloak_client_id: str = "rag-chatbot-backend"
    keycloak_audience: str | None = None
    keycloak_jwks_cache_seconds: int = 3600
    # The URL the backend actually connects to for JWKS (e.g. the docker-compose
    # service name "http://keycloak:8080") can differ from the public-facing URL
    # that ends up as the token's `iss` claim (e.g. "http://localhost:8080", set
    # via Keycloak's KC_HOSTNAME) — a container reaches Keycloak over one address,
    # a browser over another. Defaults to keycloak_server_url when unset, which is
    # correct for local (non-compose) dev where both are the same address.
    keycloak_issuer_url: str | None = None

    # --- LLM provider ---
    llm_provider: Literal["anthropic", "openai", "ollama"] = "anthropic"
    anthropic_api_key: str | None = None
    anthropic_model: str = "claude-sonnet-5"
    openai_api_key: str | None = None
    openai_model: str = "gpt-4o-mini"
    # Ollama needs no API key — a local/self-hosted model server, useful as a
    # free stand-in while ANTHROPIC_API_KEY/OPENAI_API_KEY aren't set up yet.
    ollama_base_url: str = "http://localhost:11434"
    ollama_model: str = "llama3.2:1b"
    llm_temperature: float = 0.2
    # Fernet key (32 url-safe base64 bytes) encrypting per-user API keys at rest —
    # see app/core/crypto.py. Required only once a user saves an API key via the
    # Settings UI; generate with:
    #   python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
    secret_encryption_key: str | None = None

    # --- Embeddings (local, provider-agnostic) ---
    embedding_model_name: str = "BAAI/bge-small-en-v1.5"
    embedding_dimension: int = 384

    # --- RAG ---
    rag_chunk_size: int = 1000
    rag_chunk_overlap: int = 150
    rag_top_k: int = 4

    # --- CORS ---
    cors_allow_origins: list[str] = ["http://localhost:5173"]


@lru_cache
def get_settings() -> Settings:
    """Cached settings singleton."""
    return Settings()
