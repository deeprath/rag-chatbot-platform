"""Chat-LLM provider factory.

Keeps the rest of the codebase (the RAG chain in Phase 4) talking to LangChain's
provider-agnostic `BaseChatModel` interface, so switching between Anthropic,
OpenAI, Groq, and Ollama is a one-line env var change (`LLM_PROVIDER`) rather
than a code change. Ollama needs no API key, which makes it a convenient
default while a real provider key isn't set up yet — see infra/README.md.

`resolve_chat_model()` layers a *per-user* choice (Settings page, see
app/api/v1/routers/llm_settings.py) on top of that env-var default: a user who
hasn't configured anything gets the deployment-wide default below unchanged; a
user who picked their own provider + API key gets a model built from their own
(decrypted-in-memory-only) key instead. Nothing here caches a decrypted key —
each call builds a fresh client, which is cheap (no network I/O at
construction) and keeps a plaintext key's lifetime as short as possible.
"""

from functools import lru_cache

import httpx
from langchain_core.language_models import BaseChatModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.crypto import decrypt_secret
from app.repositories import llm_settings_repository


class LLMConfigurationError(RuntimeError):
    """Raised when the configured LLM provider is missing required credentials."""


def _build_chat_model(settings: Settings) -> BaseChatModel:
    if settings.llm_provider == "anthropic":
        if not settings.anthropic_api_key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=anthropic but ANTHROPIC_API_KEY is not set. "
                "Set it in backend/.env or switch LLM_PROVIDER to 'openai'."
            )
        from langchain_anthropic import ChatAnthropic

        return ChatAnthropic(
            model_name=settings.anthropic_model,
            api_key=settings.anthropic_api_key,
            temperature=settings.llm_temperature,
            timeout=60,
            stop=None,
        )

    if settings.llm_provider == "openai":
        if not settings.openai_api_key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=openai but OPENAI_API_KEY is not set. "
                "Set it in backend/.env or switch LLM_PROVIDER to 'anthropic'."
            )
        from langchain_openai import ChatOpenAI

        return ChatOpenAI(
            model=settings.openai_model,
            api_key=settings.openai_api_key,
            temperature=settings.llm_temperature,
            timeout=60,
        )

    if settings.llm_provider == "groq":
        if not settings.groq_api_key:
            raise LLMConfigurationError(
                "LLM_PROVIDER=groq but GROQ_API_KEY is not set. "
                "Set it in backend/.env or switch LLM_PROVIDER to another provider."
            )
        from langchain_groq import ChatGroq

        return ChatGroq(
            model=settings.groq_model,
            api_key=settings.groq_api_key,
            temperature=settings.llm_temperature,
            timeout=60,
        )

    if settings.llm_provider == "ollama":
        from langchain_ollama import ChatOllama

        # No API key required — Ollama serves locally-pulled open models. If the
        # server isn't reachable or the model hasn't been pulled yet, that
        # surfaces as a connection/404 error on the first actual chat call
        # rather than here, since (unlike a missing API key) it can't be
        # checked without a network round trip.
        return ChatOllama(
            model=settings.ollama_model,
            base_url=settings.ollama_base_url,
            temperature=settings.llm_temperature,
        )

    raise LLMConfigurationError(f"Unknown LLM_PROVIDER: {settings.llm_provider!r}")


@lru_cache
def get_chat_model() -> BaseChatModel:
    """Cached chat-model instance for the currently configured provider.

    Raises LLMConfigurationError immediately (not lazily, mid-chain) if the
    active provider's API key is missing, so misconfiguration surfaces at the
    call site (e.g. app startup or the first chat request) rather than deep
    inside a LangChain chain.
    """
    return _build_chat_model(get_settings())


async def resolve_chat_model(db: AsyncSession, owner_id: str) -> BaseChatModel:
    """Builds the chat model for one chat turn, honoring the user's own Settings
    choice (if any) over the deployment-wide `LLM_PROVIDER` env default.
    """
    base_settings = get_settings()
    user_row = await llm_settings_repository.get_settings(db, owner_id)
    if user_row is None:
        return _build_chat_model(base_settings)

    overrides: dict[str, object] = {"llm_provider": user_row.provider}
    if user_row.provider == "anthropic":
        if not user_row.encrypted_anthropic_key:
            raise LLMConfigurationError(
                "No Anthropic API key saved. Add one in Settings, or switch provider."
            )
        overrides["anthropic_api_key"] = decrypt_secret(
            user_row.encrypted_anthropic_key, base_settings
        )
    elif user_row.provider == "openai":
        if not user_row.encrypted_openai_key:
            raise LLMConfigurationError(
                "No OpenAI API key saved. Add one in Settings, or switch provider."
            )
        overrides["openai_api_key"] = decrypt_secret(user_row.encrypted_openai_key, base_settings)
    elif user_row.provider == "groq":
        if not user_row.encrypted_groq_key:
            raise LLMConfigurationError(
                "No Groq API key saved. Add one in Settings, or switch provider."
            )
        overrides["groq_api_key"] = decrypt_secret(user_row.encrypted_groq_key, base_settings)
    # "ollama" needs no key — the deployment-wide OLLAMA_BASE_URL/OLLAMA_MODEL
    # apply for every user (it's a shared local server, not a personal secret).

    return _build_chat_model(base_settings.model_copy(update=overrides))


async def resolve_groq_api_key(db: AsyncSession, owner_id: str) -> str | None:
    """The Groq API key to use for a Groq-only capability (currently: AI voice —
    see app/services/tts_service.py) that's independent of whichever provider
    the user has chosen for *chat*. Someone chatting via Anthropic can still
    have their own Groq key saved and use it for voice — this intentionally
    doesn't look at `user_row.provider` at all, only whether a Groq key exists.
    """
    base_settings = get_settings()
    user_row = await llm_settings_repository.get_settings(db, owner_id)
    if user_row and user_row.encrypted_groq_key:
        return decrypt_secret(user_row.encrypted_groq_key, base_settings)
    return base_settings.groq_api_key


async def check_ollama_available(settings: Settings | None = None) -> bool:
    """Live reachability check for the (optional, resource-heavy — see
    infra/Makefile) local Ollama server, so the Settings UI can grey out that
    option rather than let someone pick a provider that will just fail on the
    first chat message. Short timeout: this runs on every Settings page load,
    so a genuinely-down Ollama shouldn't make that page feel slow.
    """
    settings = settings or get_settings()
    try:
        async with httpx.AsyncClient(timeout=1.5) as client:
            response = await client.get(f"{settings.ollama_base_url}/api/tags")
            return response.status_code == 200
    except httpx.HTTPError:
        return False
