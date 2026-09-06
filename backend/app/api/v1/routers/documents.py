"""Document upload + ingestion status endpoints."""

import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker

from app.core.security import get_current_owner_id
from app.db.session import get_db, get_session_maker
from app.repositories import document_repository
from app.schemas.document import DocumentRead
from app.services.ingestion_service import ingest_document
from app.services.storage_service import upload_bytes
from app.services.text_extraction import SUPPORTED_MIME_TYPES

router = APIRouter(prefix="/documents", tags=["documents"])

MAX_UPLOAD_BYTES = 25 * 1024 * 1024  # 25 MB


@router.post("", status_code=status.HTTP_201_CREATED)
async def upload_document(
    background_tasks: BackgroundTasks,
    file: UploadFile,
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
    session_maker: async_sessionmaker[AsyncSession] = Depends(get_session_maker),
) -> DocumentRead:
    if file.content_type not in SUPPORTED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail=f"Unsupported content type {file.content_type!r}. "
            f"Supported: {sorted(SUPPORTED_MIME_TYPES)}",
        )

    raw_bytes = await file.read()
    if len(raw_bytes) > MAX_UPLOAD_BYTES:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail=f"File exceeds the {MAX_UPLOAD_BYTES // (1024 * 1024)} MB limit",
        )

    object_key = f"{owner_id}/{uuid.uuid4()}/{file.filename}"
    upload_bytes(object_key, raw_bytes, file.content_type)

    document = await document_repository.create_document(
        db,
        owner_id=owner_id,
        filename=file.filename or "untitled",
        mime_type=file.content_type,
        minio_object_key=object_key,
    )

    background_tasks.add_task(
        ingest_document, document.id, raw_bytes, file.content_type, session_maker
    )

    return DocumentRead.model_validate(document)


@router.get("")
async def list_documents(
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> list[DocumentRead]:
    documents = await document_repository.list_documents(db, owner_id)
    return [DocumentRead.model_validate(doc) for doc in documents]


@router.get("/{document_id}")
async def get_document(
    document_id: uuid.UUID,
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> DocumentRead:
    document = await document_repository.get_document(db, document_id, owner_id)
    if document is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Document not found")
    return DocumentRead.model_validate(document)
