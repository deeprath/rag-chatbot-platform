"""Persistence for Document + DocumentChunk."""

import uuid

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.document import Document, DocumentChunk, DocumentStatus


async def create_document(
    db: AsyncSession,
    *,
    owner_id: str,
    filename: str,
    mime_type: str,
    minio_object_key: str,
) -> Document:
    document = Document(
        owner_id=owner_id,
        filename=filename,
        mime_type=mime_type,
        minio_object_key=minio_object_key,
        status=DocumentStatus.PENDING,
    )
    db.add(document)
    await db.commit()
    await db.refresh(document)
    return document


async def get_document(db: AsyncSession, document_id: uuid.UUID, owner_id: str) -> Document | None:
    result = await db.execute(
        select(Document).where(Document.id == document_id, Document.owner_id == owner_id)
    )
    return result.scalar_one_or_none()


async def list_documents(db: AsyncSession, owner_id: str) -> list[Document]:
    result = await db.execute(
        select(Document).where(Document.owner_id == owner_id).order_by(Document.created_at.desc())
    )
    return list(result.scalars().all())


async def set_document_status(
    db: AsyncSession,
    document_id: uuid.UUID,
    status: DocumentStatus,
    error_message: str | None = None,
) -> None:
    document = await db.get(Document, document_id)
    if document is None:
        return
    document.status = status
    document.error_message = error_message
    await db.commit()


async def add_chunks(
    db: AsyncSession,
    document_id: uuid.UUID,
    chunks: list[str],
    embeddings: list[list[float]],
) -> None:
    db.add_all(
        DocumentChunk(
            document_id=document_id,
            chunk_index=index,
            chunk_text=text,
            embedding=embedding,
            chunk_metadata={},
        )
        for index, (text, embedding) in enumerate(zip(chunks, embeddings, strict=True))
    )
    await db.commit()


async def search_similar_chunks(
    db: AsyncSession, owner_id: str, query_embedding: list[float], top_k: int
) -> list[DocumentChunk]:
    """Cosine-similarity nearest-neighbor search, scoped to the owner's own documents."""
    result = await db.execute(
        select(DocumentChunk)
        .join(Document, Document.id == DocumentChunk.document_id)
        .where(Document.owner_id == owner_id, Document.status == DocumentStatus.READY)
        .order_by(DocumentChunk.embedding.cosine_distance(query_embedding))
        .limit(top_k)
    )
    return list(result.scalars().all())
