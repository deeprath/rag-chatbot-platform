"""Document ingestion pipeline: extract -> chunk -> embed -> persist.

Runs as a FastAPI BackgroundTask after the upload endpoint has already stored the
original file in MinIO and created a `pending` Document row, so the HTTP request
returns immediately rather than blocking on embedding.
"""

import uuid

from langchain_text_splitters import RecursiveCharacterTextSplitter
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker
from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings
from app.core.logging import get_logger
from app.models.document import DocumentStatus
from app.repositories import document_repository
from app.services.embedding_service import embed_texts
from app.services.text_extraction import UnsupportedDocumentTypeError, extract_text

logger = get_logger(__name__)


async def ingest_document(
    document_id: uuid.UUID,
    raw_bytes: bytes,
    mime_type: str,
    session_maker: async_sessionmaker[AsyncSession],
) -> None:
    """Runs in its own DB session since it executes outside the request's lifecycle.

    `session_maker` is passed in (from app.db.session.get_session_maker, itself a
    FastAPI dependency) rather than imported and used directly here — same reason
    as the streaming chat endpoint (see app/api/v1/routers/chat.py): a
    BackgroundTask, like a StreamingResponse body, runs outside the request's own
    dependency-injected scope, so hardcoding the app's default session factory
    would silently ignore any dependency override (e.g. in tests, which is
    exactly how this got caught — see tests/integration/test_documents_endpoint.py).
    """
    settings = get_settings()

    async with session_maker() as db:
        try:
            await document_repository.set_document_status(
                db, document_id, DocumentStatus.PROCESSING
            )

            text = extract_text(raw_bytes, mime_type)
            if not text.strip():
                raise ValueError("No extractable text found in document")

            splitter = RecursiveCharacterTextSplitter(
                chunk_size=settings.rag_chunk_size,
                chunk_overlap=settings.rag_chunk_overlap,
            )
            chunks = splitter.split_text(text)
            if not chunks:
                raise ValueError("Document produced zero chunks after splitting")

            # sentence-transformers is CPU-bound and synchronous; keep it off the event loop.
            embeddings = await run_in_threadpool(embed_texts, chunks)

            await document_repository.add_chunks(db, document_id, chunks, embeddings)
            await document_repository.set_document_status(db, document_id, DocumentStatus.READY)
            logger.info("document_ingested", document_id=str(document_id), chunk_count=len(chunks))

        except UnsupportedDocumentTypeError as exc:
            await document_repository.set_document_status(
                db, document_id, DocumentStatus.FAILED, error_message=str(exc)
            )
            logger.warning("document_ingestion_unsupported_type", document_id=str(document_id))
        except Exception as exc:  # noqa: BLE001 - genuinely want to persist any failure reason
            await document_repository.set_document_status(
                db, document_id, DocumentStatus.FAILED, error_message=str(exc)
            )
            logger.error("document_ingestion_failed", document_id=str(document_id), error=str(exc))
