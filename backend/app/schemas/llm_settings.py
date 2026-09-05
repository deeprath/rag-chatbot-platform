from typing import Literal

from pydantic import BaseModel, Field

LLMProviderName = Literal["anthropic", "openai", "groq", "ollama"]


class LLMSettingsRead(BaseModel):
    """Never carries a real API key — only whether one is stored and a masked preview."""

    provider: LLMProviderName
    has_anthropic_key: bool
    has_openai_key: bool
    has_groq_key: bool
    anthropic_key_preview: str | None = None
    openai_key_preview: str | None = None
    groq_key_preview: str | None = None
    # Live-checked (see app/services/llm_provider.check_ollama_available) —
    # Ollama is optional/resource-heavy (infra/Makefile's `ollama-up`), so the
    # frontend greys the option out rather than let you pick a dead provider.
    ollama_available: bool


class LLMSettingsUpdate(BaseModel):
    provider: LLMProviderName
    # Only present when the user is setting/replacing a key for `provider`.
    # Omitted (not blank-submitted) keeps any previously saved key for that
    # provider — so switching providers and back doesn't demand re-entry.
    api_key: str | None = Field(default=None, min_length=1, max_length=4096)
    # Explicit opt-in to remove a stored key for `provider`, distinct from
    # just omitting `api_key` (which leaves it untouched).
    clear_api_key: bool = False
