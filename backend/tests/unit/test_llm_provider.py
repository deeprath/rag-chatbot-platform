import pytest

from app.core.config import Settings
from app.services.llm_provider import LLMConfigurationError, _build_chat_model


def _settings(**overrides: object) -> Settings:
    return Settings(_env_file=None, **overrides)  # type: ignore[call-arg]


def test_anthropic_without_api_key_raises() -> None:
    settings = _settings(llm_provider="anthropic", anthropic_api_key=None)
    with pytest.raises(LLMConfigurationError, match="ANTHROPIC_API_KEY"):
        _build_chat_model(settings)


def test_openai_without_api_key_raises() -> None:
    settings = _settings(llm_provider="openai", openai_api_key=None)
    with pytest.raises(LLMConfigurationError, match="OPENAI_API_KEY"):
        _build_chat_model(settings)


def test_anthropic_with_api_key_builds_chat_anthropic() -> None:
    settings = _settings(llm_provider="anthropic", anthropic_api_key="sk-ant-test-key")
    model = _build_chat_model(settings)
    assert type(model).__name__ == "ChatAnthropic"


def test_openai_with_api_key_builds_chat_openai() -> None:
    settings = _settings(llm_provider="openai", openai_api_key="sk-test-key")
    model = _build_chat_model(settings)
    assert type(model).__name__ == "ChatOpenAI"
