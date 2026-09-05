import pytest
from cryptography.fernet import Fernet

from app.core.config import Settings
from app.core.crypto import encrypt_secret
from app.models.llm_settings import UserLLMSettings
from app.repositories import llm_settings_repository
from app.services import llm_provider
from app.services.llm_provider import LLMConfigurationError, _build_chat_model, resolve_chat_model

# No module-level `pytestmark` here (unlike test_jwks_fetch.py) — this file mixes
# sync and async tests, and `asyncio_mode = "auto"` (pyproject.toml) already runs
# the `async def` ones correctly without it.


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


def test_ollama_needs_no_api_key_and_builds_chat_ollama() -> None:
    settings = _settings(llm_provider="ollama")
    model = _build_chat_model(settings)
    assert type(model).__name__ == "ChatOllama"


# --- resolve_chat_model: per-user Settings override (see app/api/v1/routers/llm_settings.py) ---


class _FakeRow:
    def __init__(self, **kwargs: object) -> None:
        self.provider = kwargs.get("provider")
        self.encrypted_anthropic_key = kwargs.get("encrypted_anthropic_key")
        self.encrypted_openai_key = kwargs.get("encrypted_openai_key")


async def test_resolve_chat_model_falls_back_to_env_default_when_user_has_no_row(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_settings(_db: object, _owner_id: str) -> UserLLMSettings | None:
        return None

    monkeypatch.setattr(llm_settings_repository, "get_settings", fake_get_settings)
    monkeypatch.setattr(llm_provider, "get_settings", lambda: _settings(llm_provider="ollama"))

    model = await resolve_chat_model(db=None, owner_id="user-1")  # type: ignore[arg-type]
    assert type(model).__name__ == "ChatOllama"


async def test_resolve_chat_model_uses_users_decrypted_anthropic_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    settings_with_key = _settings(secret_encryption_key=Fernet.generate_key().decode())
    ciphertext = encrypt_secret("sk-ant-users-own-key", settings_with_key)

    async def fake_get_settings(_db: object, _owner_id: str) -> UserLLMSettings | None:
        return _FakeRow(provider="anthropic", encrypted_anthropic_key=ciphertext)  # type: ignore[return-value]

    monkeypatch.setattr(llm_settings_repository, "get_settings", fake_get_settings)
    monkeypatch.setattr(llm_provider, "get_settings", lambda: settings_with_key)

    model = await resolve_chat_model(db=None, owner_id="user-1")  # type: ignore[arg-type]
    assert type(model).__name__ == "ChatAnthropic"
    # The client actually got the *user's* key, not any deployment-wide one.
    assert model.anthropic_api_key.get_secret_value() == "sk-ant-users-own-key"


async def test_resolve_chat_model_raises_clear_error_when_provider_chosen_but_no_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_settings(_db: object, _owner_id: str) -> UserLLMSettings | None:
        return _FakeRow(provider="openai", encrypted_openai_key=None)  # type: ignore[return-value]

    monkeypatch.setattr(llm_settings_repository, "get_settings", fake_get_settings)
    monkeypatch.setattr(llm_provider, "get_settings", lambda: _settings())

    with pytest.raises(LLMConfigurationError, match="No OpenAI API key saved"):
        await resolve_chat_model(db=None, owner_id="user-1")  # type: ignore[arg-type]


async def test_resolve_chat_model_user_ollama_choice_needs_no_key(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def fake_get_settings(_db: object, _owner_id: str) -> UserLLMSettings | None:
        return _FakeRow(provider="ollama")  # type: ignore[return-value]

    monkeypatch.setattr(llm_settings_repository, "get_settings", fake_get_settings)
    monkeypatch.setattr(llm_provider, "get_settings", lambda: _settings())

    model = await resolve_chat_model(db=None, owner_id="user-1")  # type: ignore[arg-type]
    assert type(model).__name__ == "ChatOllama"
