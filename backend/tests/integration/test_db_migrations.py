"""Integration test: real TimescaleDB container, migrated schema, round-trip ORM writes."""

import uuid

import pytest
from sqlalchemy import select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import ChatMessage, ChatSession, Document, DocumentChunk
from app.models.document import DocumentStatus

pytestmark = pytest.mark.asyncio


async def test_document_and_chunk_round_trip(db_session: AsyncSession) -> None:
    document = Document(
        owner_id="user-123",
        filename="handbook.pdf",
        mime_type="application/pdf",
        minio_object_key=f"user-123/{uuid.uuid4()}/handbook.pdf",
        status=DocumentStatus.READY.value,
    )
    chunk = DocumentChunk(
        document=document,
        chunk_index=0,
        chunk_text="Once upon a time in a RAG pipeline...",
        embedding=[0.01] * 384,
        chunk_metadata={"page": 1},
    )
    db_session.add_all([document, chunk])
    await db_session.commit()

    fetched = (
        await db_session.execute(select(Document).where(Document.id == document.id))
    ).scalar_one()
    assert fetched.filename == "handbook.pdf"

    fetched_chunk = (
        await db_session.execute(
            select(DocumentChunk).where(DocumentChunk.document_id == document.id)
        )
    ).scalar_one()
    assert fetched_chunk.chunk_text.startswith("Once upon a time")
    assert len(fetched_chunk.embedding) == 384


async def test_chat_session_and_message_round_trip(db_session: AsyncSession) -> None:
    session_row = ChatSession(owner_id="user-123", title="First chat")
    db_session.add(session_row)
    await db_session.flush()

    message = ChatMessage(session_id=session_row.id, role="user", content="Hello!")
    db_session.add(message)
    await db_session.commit()

    messages = (
        (
            await db_session.execute(
                select(ChatMessage).where(ChatMessage.session_id == session_row.id)
            )
        )
        .scalars()
        .all()
    )
    assert len(messages) == 1
    assert messages[0].content == "Hello!"


async def test_chat_messages_is_a_hypertable(db_session: AsyncSession) -> None:
    result = await db_session.execute(
        text(
            "SELECT count(*) FROM timescaledb_information.hypertables "
            "WHERE hypertable_name = 'chat_messages'"
        )
    )
    assert result.scalar_one() == 1
