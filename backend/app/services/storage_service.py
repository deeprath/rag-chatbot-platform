"""MinIO (S3-compatible) object storage for uploaded source documents."""

import io
from datetime import timedelta
from functools import lru_cache

from minio import Minio

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


@lru_cache
def get_minio_client() -> Minio:
    settings = get_settings()
    return Minio(
        settings.minio_endpoint,
        access_key=settings.minio_access_key,
        secret_key=settings.minio_secret_key,
        secure=settings.minio_secure,
    )


def ensure_bucket_exists() -> None:
    """Idempotently create the documents bucket. Safe to call on every startup."""
    client = get_minio_client()
    bucket = get_settings().minio_bucket_documents
    if not client.bucket_exists(bucket):
        client.make_bucket(bucket)
        logger.info("minio_bucket_created", bucket=bucket)


def upload_bytes(object_key: str, data: bytes, content_type: str) -> None:
    client = get_minio_client()
    bucket = get_settings().minio_bucket_documents
    client.put_object(
        bucket,
        object_key,
        data=io.BytesIO(data),
        length=len(data),
        content_type=content_type,
    )


def download_bytes(object_key: str) -> bytes:
    client = get_minio_client()
    bucket = get_settings().minio_bucket_documents
    response = client.get_object(bucket, object_key)
    try:
        return response.read()
    finally:
        response.close()
        response.release_conn()


def delete_object(object_key: str) -> None:
    client = get_minio_client()
    bucket = get_settings().minio_bucket_documents
    client.remove_object(bucket, object_key)


def presigned_download_url(object_key: str, expires_seconds: int = 3600) -> str:
    client = get_minio_client()
    bucket = get_settings().minio_bucket_documents
    return client.presigned_get_object(
        bucket, object_key, expires=timedelta(seconds=expires_seconds)
    )
