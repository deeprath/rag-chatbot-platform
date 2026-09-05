"""Integration test: real (migrated) TimescaleDB + real embeddings/pgvector retrieval,
LLM call mocked out with a FakeListChatModel so the test needs no API key.
"""

from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.language_models.fake_chat_models import FakeListChatModel
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine

from app.db.session import get_db, get_session_maker
from app.main import app


class _RaisingChatModel(BaseChatModel):
    """Simulates an LLM call failing mid-request (bad API key, provider outage,
    ...) so we can verify the chat endpoint reports it instead of hanging or
    silently dropping the turn — see app/api/v1/routers/chat.py's SSE `error`
    event."""

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("simulated LLM failure")

    @property
    def _llm_type(self) -> str:
        return "raising-fake"


pytestmark = pytest.mark.asyncio

FAKE_REPLY = "This is a test answer about the RAG chatbot platform."


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
    app.dependency_overrides[get_session_maker] = lambda: session_maker

    async def fake_resolve_chat_model(_db: object, _owner_id: str) -> BaseChatModel:
        return FakeListChatModel(responses=[FAKE_REPLY])

    monkeypatch.setattr("app.services.chat_service.resolve_chat_model", fake_resolve_chat_model)

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


async def test_chat_streams_response_and_persists_history(
    client: AsyncClient, auth_headers
) -> None:
    headers = auth_headers("chat-test-user")

    response = await client.post(
        "/api/v1/chat", json={"message": "Hello, what can you tell me?"}, headers=headers
    )

    assert response.status_code == 200
    body = response.text
    assert "event: session" in body
    assert "event: token" in body
    assert "event: done" in body
    # FakeListChatModel streams its canned response one character at a time, so each
    # character is its own SSE frame; the persisted-message assertions below confirm
    # those tokens reassembled correctly rather than checking the raw SSE framing here.

    sessions_resp = await client.get("/api/v1/chat/sessions", headers=headers)
    assert sessions_resp.status_code == 200
    sessions = sessions_resp.json()
    assert len(sessions) == 1

    messages_resp = await client.get(
        f"/api/v1/chat/sessions/{sessions[0]['id']}/messages", headers=headers
    )
    assert messages_resp.status_code == 200
    messages = messages_resp.json()
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[1]["content"] == FAKE_REPLY


async def test_second_turn_reuses_session_and_sees_history(
    client: AsyncClient, auth_headers
) -> None:
    headers = auth_headers("chat-test-user-2")

    await client.post("/api/v1/chat", json={"message": "First message"}, headers=headers)

    sessions = (await client.get("/api/v1/chat/sessions", headers=headers)).json()
    assert len(sessions) == 1
    session_id = sessions[0]["id"]

    await client.post(
        "/api/v1/chat",
        json={"session_id": session_id, "message": "Second message"},
        headers=headers,
    )

    sessions_after = (await client.get("/api/v1/chat/sessions", headers=headers)).json()
    assert len(sessions_after) == 1  # reused the same session, didn't create a new one

    messages = (
        await client.get(f"/api/v1/chat/sessions/{session_id}/messages", headers=headers)
    ).json()
    assert len(messages) == 4  # 2 user + 2 assistant messages across both turns


async def test_llm_failure_surfaces_as_sse_error_not_a_hang(
    client: AsyncClient, auth_headers, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Overrides the client fixture's own resolve_chat_model patch, for this test only.
    async def fake_resolve_chat_model(_db: object, _owner_id: str) -> BaseChatModel:
        return _RaisingChatModel()

    monkeypatch.setattr("app.services.chat_service.resolve_chat_model", fake_resolve_chat_model)
    headers = auth_headers("chat-test-user-3")

    response = await client.post(
        "/api/v1/chat", json={"message": "This will fail"}, headers=headers
    )

    assert response.status_code == 200
    body = response.text
    assert "event: error" in body
    assert "event: done" in body

    # The user's message is still persisted even though the LLM call failed —
    # only the assistant's reply is missing.
    sessions = (await client.get("/api/v1/chat/sessions", headers=headers)).json()
    messages = (
        await client.get(f"/api/v1/chat/sessions/{sessions[0]['id']}/messages", headers=headers)
    ).json()
    assert [m["role"] for m in messages] == ["user"]
