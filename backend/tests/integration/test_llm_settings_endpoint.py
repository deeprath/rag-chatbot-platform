"""Integration test: real (migrated) TimescaleDB — the settings endpoints'
actual persistence, encryption-at-rest, and never-return-the-real-key
behavior, exercised through the HTTP API rather than mocked out.
"""

from collections.abc import AsyncIterator

import pytest
from cryptography.fernet import Fernet
from httpx import ASGITransport, AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.api.v1.routers import llm_settings as llm_settings_router
from app.core.config import Settings
from app.db.session import get_db
from app.main import app
from app.models.llm_settings import UserLLMSettings

pytestmark = pytest.mark.asyncio


@pytest.fixture
async def client(
    migrated_database_url: str, monkeypatch: pytest.MonkeyPatch
) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_database_url)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db() -> AsyncIterator:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    # A real Fernet key for this test run, independent of whatever (if
    # anything) SECRET_ENCRYPTION_KEY happens to be in the environment.
    test_settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        secret_encryption_key=Fernet.generate_key().decode(),
    )
    monkeypatch.setattr(llm_settings_router, "get_settings", lambda: test_settings)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_get_with_no_saved_settings_reports_the_deployment_default(
    client: AsyncClient, auth_headers
) -> None:
    resp = await client.get("/api/v1/settings/llm", headers=auth_headers("settings-user-1"))
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] in ("anthropic", "openai", "ollama")
    assert body["has_anthropic_key"] is False
    assert body["has_openai_key"] is False
    assert body["anthropic_key_preview"] is None


async def test_selecting_a_key_provider_without_a_key_is_rejected(
    client: AsyncClient, auth_headers
) -> None:
    resp = await client.put(
        "/api/v1/settings/llm",
        json={"provider": "anthropic"},
        headers=auth_headers("settings-user-2"),
    )
    assert resp.status_code == 422
    assert "Anthropic API key is required" in resp.json()["detail"]


async def test_selecting_ollama_needs_no_key(client: AsyncClient, auth_headers) -> None:
    resp = await client.put(
        "/api/v1/settings/llm",
        json={"provider": "ollama"},
        headers=auth_headers("settings-user-3"),
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["provider"] == "ollama"
    assert body["has_anthropic_key"] is False


async def test_saving_a_key_never_returns_it_but_persists_it_encrypted(
    client: AsyncClient, auth_headers, db_session
) -> None:
    owner_id = "settings-user-4"
    plaintext_key = "sk-ant-api03-totally-real-secret-value"

    put_resp = await client.put(
        "/api/v1/settings/llm",
        json={"provider": "anthropic", "api_key": plaintext_key},
        headers=auth_headers(owner_id),
    )
    assert put_resp.status_code == 200
    body = put_resp.json()

    # The response proves a key is saved and gives a preview, but never the key itself.
    assert body["has_anthropic_key"] is True
    assert body["anthropic_key_preview"] is not None
    assert plaintext_key not in put_resp.text
    assert body["anthropic_key_preview"] != plaintext_key

    # GET afterwards shows the same masked state, still no real key anywhere in the body.
    get_resp = await client.get("/api/v1/settings/llm", headers=auth_headers(owner_id))
    assert get_resp.status_code == 200
    assert plaintext_key not in get_resp.text
    assert get_resp.json()["anthropic_key_preview"] == body["anthropic_key_preview"]

    # And at rest in Postgres, only ciphertext exists — never the plaintext.
    row = (
        await db_session.execute(
            select(UserLLMSettings).where(UserLLMSettings.owner_id == owner_id)
        )
    ).scalar_one()
    assert row.encrypted_anthropic_key is not None
    assert row.encrypted_anthropic_key != plaintext_key
    assert plaintext_key not in row.encrypted_anthropic_key


async def test_switching_provider_and_back_reuses_the_previously_saved_key(
    client: AsyncClient, auth_headers
) -> None:
    owner_id = "settings-user-5"
    headers = auth_headers(owner_id)

    await client.put(
        "/api/v1/settings/llm",
        json={"provider": "anthropic", "api_key": "sk-ant-first-key-value"},
        headers=headers,
    )

    # Switch to Ollama (no key needed) ...
    switch_resp = await client.put(
        "/api/v1/settings/llm", json={"provider": "ollama"}, headers=headers
    )
    assert switch_resp.status_code == 200
    assert switch_resp.json()["has_anthropic_key"] is True  # untouched, not wiped

    # ... then switch back to Anthropic *without* resupplying the key.
    switch_back_resp = await client.put(
        "/api/v1/settings/llm", json={"provider": "anthropic"}, headers=headers
    )
    assert switch_back_resp.status_code == 200
    body = switch_back_resp.json()
    assert body["provider"] == "anthropic"
    assert body["has_anthropic_key"] is True


async def test_clearing_a_key_removes_it_and_then_requires_a_new_one(
    client: AsyncClient, auth_headers
) -> None:
    owner_id = "settings-user-6"
    headers = auth_headers(owner_id)

    await client.put(
        "/api/v1/settings/llm",
        json={"provider": "openai", "api_key": "sk-openai-value"},
        headers=headers,
    )

    clear_resp = await client.put(
        "/api/v1/settings/llm",
        json={"provider": "openai", "clear_api_key": True},
        headers=headers,
    )
    assert clear_resp.status_code == 200
    body = clear_resp.json()
    assert body["has_openai_key"] is False
    assert body["openai_key_preview"] is None

    # Selecting it again now needs a fresh key.
    reselect_resp = await client.put(
        "/api/v1/settings/llm", json={"provider": "openai"}, headers=headers
    )
    assert reselect_resp.status_code == 422


async def test_settings_are_scoped_to_owner(client: AsyncClient, auth_headers) -> None:
    await client.put(
        "/api/v1/settings/llm",
        json={"provider": "anthropic", "api_key": "sk-ant-owner-a-key"},
        headers=auth_headers("settings-owner-a"),
    )

    other_resp = await client.get("/api/v1/settings/llm", headers=auth_headers("settings-owner-b"))
    assert other_resp.status_code == 200
    assert other_resp.json()["has_anthropic_key"] is False
