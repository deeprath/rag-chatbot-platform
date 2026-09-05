"""Orchestrates a single chat turn: persist the user's message, retrieve relevant
document chunks, run the LCEL RAG chain, stream the answer back, then persist it.
"""

import uuid
from collections.abc import AsyncIterator

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage
from sqlalchemy.ext.asyncio import AsyncSession
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.langchain_pipeline.rag_chain import format_context, stream_answer
from app.models.chat import ChatSession, MessageRole
from app.repositories import chat_repository, document_repository
from app.services.embedding_service import embed_query
from app.services.llm_provider import get_chat_model

# How many prior turns (user+assistant messages) to feed back in as history.
HISTORY_MESSAGE_LIMIT = 20


def _to_langchain_messages(rows: list) -> list[BaseMessage]:
    messages: list[BaseMessage] = []
    for row in rows:
        if row.role == MessageRole.USER:
            messages.append(HumanMessage(content=row.content))
        elif row.role == MessageRole.ASSISTANT:
            messages.append(AIMessage(content=row.content))
        # system-role rows, if any, are intentionally excluded from replayed history
    return messages


async def get_or_create_session(
    db: AsyncSession, owner_id: str, session_id: uuid.UUID | None
) -> ChatSession:
    if session_id is not None:
        session_row = await chat_repository.get_session(db, session_id, owner_id)
        if session_row is not None:
            return session_row
    return await chat_repository.create_session(db, owner_id)


async def run_chat_turn(
    db: AsyncSession, owner_id: str, session: ChatSession, question: str
) -> AsyncIterator[str]:
    """Persists the user's message, streams the assistant's reply, then persists it."""
    settings = get_settings()

    await chat_repository.add_message(db, session.id, MessageRole.USER, question)

    history_rows = await chat_repository.get_recent_messages(db, session.id, HISTORY_MESSAGE_LIMIT)
    history = _to_langchain_messages(history_rows[:-1])  # exclude the message just added

    query_embedding = await run_in_threadpool(embed_query, question)
    chunks = await document_repository.search_similar_chunks(
        db, owner_id, query_embedding, settings.rag_top_k
    )
    context = format_context([chunk.chunk_text for chunk in chunks])

    chat_model = get_chat_model()
    full_response = ""
    async for token in stream_answer(
        chat_model, {"context": context, "history": history, "question": question}
    ):
        full_response += token
        yield token

    await chat_repository.add_message(db, session.id, MessageRole.ASSISTANT, full_response)
