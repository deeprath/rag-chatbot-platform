"""LCEL RAG chain: prompt (system + retrieved context + history + question) -> chat LLM.

Retrieval itself (embedding the query, similarity search against pgvector, scoped to
the requesting user's own documents) happens in app/services/chat_service.py *before*
this chain runs, since it needs an async DB session that doesn't belong inside a
LangChain Runnable here. This module only owns prompt construction and the LLM call.
"""

from collections.abc import AsyncIterator
from typing import TypedDict

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import BaseMessage
from langchain_core.output_parsers import StrOutputParser
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.runnables import Runnable

SYSTEM_PROMPT = """You are a helpful assistant answering questions using the user's own \
uploaded documents. Use the provided context to answer accurately and concisely. If the \
context doesn't contain the answer, say so plainly rather than guessing.

Context:
{context}"""

_PROMPT = ChatPromptTemplate.from_messages(
    [
        ("system", SYSTEM_PROMPT),
        MessagesPlaceholder("history"),
        ("human", "{question}"),
    ]
)


class RagChainInput(TypedDict):
    context: str
    history: list[BaseMessage]
    question: str


def format_context(chunk_texts: list[str]) -> str:
    if not chunk_texts:
        return "(no relevant documents found for this user)"
    return "\n\n---\n\n".join(chunk_texts)


def build_rag_chain(chat_model: BaseChatModel) -> Runnable[RagChainInput, str]:
    """A chain from {context, history, question} to the assistant's reply text."""
    return _PROMPT | chat_model | StrOutputParser()


async def stream_answer(
    chat_model: BaseChatModel, chain_input: RagChainInput
) -> AsyncIterator[str]:
    """Yields response text incrementally as the LLM generates it."""
    chain = build_rag_chain(chat_model)
    async for token in chain.astream(chain_input):
        yield token
