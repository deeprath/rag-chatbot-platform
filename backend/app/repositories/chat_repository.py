"""Persistence for ChatSession + ChatMessage."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.chat import ChatMessage, ChatSession, MessageRole


async def create_session(db: AsyncSession, owner_id: str, title: str | None = None) -> ChatSession:
    session_row = ChatSession(owner_id=owner_id, title=title)
    db.add(session_row)
    await db.commit()
    await db.refresh(session_row)
    return session_row


async def get_session(db: AsyncSession, session_id: uuid.UUID, owner_id: str) -> ChatSession | None:
    result = await db.execute(
        select(ChatSession).where(ChatSession.id == session_id, ChatSession.owner_id == owner_id)
    )
    return result.scalar_one_or_none()


async def list_sessions(db: AsyncSession, owner_id: str) -> list[ChatSession]:
    result = await db.execute(
        select(ChatSession)
        .where(ChatSession.owner_id == owner_id)
        .order_by(ChatSession.created_at.desc())
    )
    return list(result.scalars().all())


async def get_recent_messages(
    db: AsyncSession, session_id: uuid.UUID, limit: int
) -> list[ChatMessage]:
    """Most recent `limit` messages for a session, returned oldest-first (ready to
    feed straight into the chat history)."""
    result = await db.execute(
        select(ChatMessage)
        .where(ChatMessage.session_id == session_id)
        .order_by(ChatMessage.created_at.desc())
        .limit(limit)
    )
    return list(reversed(result.scalars().all()))


async def add_message(
    db: AsyncSession,
    session_id: uuid.UUID,
    role: MessageRole,
    content: str,
    token_count: int | None = None,
) -> ChatMessage:
    message = ChatMessage(
        session_id=session_id, role=role, content=content, token_count=token_count
    )
    db.add(message)
    await db.commit()
    await db.refresh(message)
    return message
