"""Integration test: real (migrated) TimescaleDB for the per-user Groq-key
lookup — the actual Groq TTS call itself is mocked out (no real API key/
accepted model terms in CI, and we don't want to make real paid calls from
tests anyway; app/services/tts_service.py's own unit tests cover that part
against a fake HTTP transport).
"""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import get_db
from app.main import app
from app.services import tts_service

pytestmark = pytest.mark.asyncio


async def fake_resolve_groq_api_key(*args: object, **kwargs: object) -> str:
    return "gsk-test"


@pytest.fixture
async def client(migrated_database_url: str) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_database_url)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db() -> AsyncIterator:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_no_key_configured_returns_422(
    client: AsyncClient, auth_headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Explicitly forced rather than relying on the ambient environment having
    # no GROQ_API_KEY — a real local backend/.env (for manual dev/testing)
    # does have one, which made this test silently exercise the real Groq API
    # instead of the "not configured" path it's meant to check.
    async def fake_resolve_no_key(*args: object, **kwargs: object) -> None:
        return None

    monkeypatch.setattr("app.api.v1.routers.speech.resolve_groq_api_key", fake_resolve_no_key)

    resp = await client.post(
        "/api/v1/speech/tts",
        json={"text": "Hello there"},
        headers=auth_headers("speech-user-1"),
    )
    assert resp.status_code == 422
    assert "No Groq API key" in resp.json()["detail"]


async def test_success_returns_audio_with_content_type(
    client: AsyncClient, auth_headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_synthesize(text: str, **kwargs: object) -> tuple[bytes, str]:
        assert text == "Hello there"
        return b"fake-mp3-bytes", "audio/mpeg"

    # Patched at the router's import site, not resolve_groq_api_key — this
    # test is about the endpoint's plumbing, not the key-resolution logic
    # already covered by test_llm_provider.py's resolve_groq_api_key tests.
    monkeypatch.setattr("app.api.v1.routers.speech.resolve_groq_api_key", fake_resolve_groq_api_key)
    monkeypatch.setattr("app.api.v1.routers.speech.synthesize_speech", fake_synthesize)

    resp = await client.post(
        "/api/v1/speech/tts",
        json={"text": "Hello there"},
        headers=auth_headers("speech-user-2"),
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "audio/mpeg"
    assert resp.content == b"fake-mp3-bytes"


async def test_upstream_failure_returns_503(
    client: AsyncClient, auth_headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    async def fake_synthesize(*args: object, **kwargs: object) -> tuple[bytes, str]:
        raise tts_service.TTSError("AI voice needs a one-time setup step: accept the model's terms")

    monkeypatch.setattr("app.api.v1.routers.speech.resolve_groq_api_key", fake_resolve_groq_api_key)
    monkeypatch.setattr("app.api.v1.routers.speech.synthesize_speech", fake_synthesize)

    resp = await client.post(
        "/api/v1/speech/tts",
        json={"text": "Hello there"},
        headers=auth_headers("speech-user-3"),
    )
    assert resp.status_code == 503
    assert "one-time setup step" in resp.json()["detail"]
