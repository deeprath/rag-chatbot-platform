"""Chat-LLM provider factory.

Keeps the rest of the codebase (the RAG chain in Phase 4) talking to LangChain's
provider-agnostic `BaseChatModel` interface, so switching between Anthropic and
OpenAI is a one-line env var change (`LLM_PROVIDER`) rather than a code change.
"""

from functools import lru_cache

from langchain_core.language_models import BaseChatModel

from app.core.config import Settings, get_settings


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
