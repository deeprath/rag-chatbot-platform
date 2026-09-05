"""Streaming (SSE) chat endpoint + session/history browsing."""

import json
import uuid
from collections.abc import AsyncIterator

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.responses import StreamingResponse

from app.core.logging import get_logger
from app.core.security import get_current_owner_id
from app.db.session import get_db, get_session_maker
from app.repositories import chat_repository
from app.schemas.chat import ChatMessageRead, ChatRequest, ChatSessionRead
from app.services.chat_service import get_or_create_session, run_chat_turn

router = APIRouter(prefix="/chat", tags=["chat"])
logger = get_logger(__name__)


def _sse_event(event: str, data: str) -> bytes:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n".encode()


@router.post("")
async def chat(
    request: ChatRequest,
    owner_id: str = Depends(get_current_owner_id),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> StreamingResponse:
    async def event_stream() -> AsyncIterator[bytes]:
        # Opened here (not via Depends(get_db)) because FastAPI closes `yield`
        # dependencies as soon as this endpoint *returns* the Response object,
        # which happens before Starlette actually iterates this generator body.
        async with session_maker() as db:
            session = await get_or_create_session(db, owner_id, request.session_id)
            yield _sse_event("session", str(session.id))
            try:
                async for token in run_chat_turn(db, owner_id, session, request.message):
                    yield _sse_event("token", token)
            except Exception as exc:  # noqa: BLE001 - surface failure as an SSE event too
                logger.error("chat_stream_failed", error=str(exc))
                yield _sse_event("error", "The assistant failed to generate a response.")
            finally:
                yield _sse_event("done", "")

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.get("/sessions", response_model=list[ChatSessionRead])
async def list_sessions(
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> list[ChatSessionRead]:
    sessions = await chat_repository.list_sessions(db, owner_id)
    return [ChatSessionRead.model_validate(s) for s in sessions]


@router.get("/sessions/{session_id}/messages", response_model=list[ChatMessageRead])
async def get_session_messages(
    session_id: uuid.UUID,
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> list[ChatMessageRead]:
    session = await chat_repository.get_session(db, session_id, owner_id)
    if session is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Session not found")
    messages = await chat_repository.get_recent_messages(db, session_id, limit=500)
    return [ChatMessageRead.model_validate(m) for m in messages]
