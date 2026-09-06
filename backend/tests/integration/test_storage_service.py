"""Integration tests for storage_service against a real MinIO container.

upload_bytes is already exercised indirectly via test_documents_endpoint.py;
this covers the rest of the module's public surface (download, delete,
presigned URLs, and the "bucket already exists" branch of ensure_bucket_exists)
which nothing else calls yet.
"""

from collections.abc import Iterator

import httpx
import pytest
from minio import Minio
from minio.error import S3Error
from testcontainers.community.minio import MinioContainer

from app.services import storage_service

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module")
def minio_container() -> Iterator[MinioContainer]:
    with MinioContainer() as container:
        yield container


@pytest.fixture(autouse=True)
def _use_test_minio(minio_container: MinioContainer, monkeypatch: pytest.MonkeyPatch) -> None:
    config = minio_container.get_config()
    test_client = Minio(
        config["endpoint"],
        access_key=config["access_key"],
        secret_key=config["secret_key"],
        secure=False,
    )
    monkeypatch.setattr(storage_service, "get_minio_client", lambda: test_client)


async def test_ensure_bucket_exists_is_idempotent() -> None:
    storage_service.ensure_bucket_exists()
    storage_service.ensure_bucket_exists()  # second call: bucket already exists, no-op

    client = storage_service.get_minio_client()
    assert client.bucket_exists(storage_service.get_settings().minio_bucket_documents)


async def test_upload_download_round_trip() -> None:
    storage_service.ensure_bucket_exists()
    key = "test-owner/round-trip.txt"

    storage_service.upload_bytes(key, b"hello from a test", "text/plain")
    downloaded = storage_service.download_bytes(key)

    assert downloaded == b"hello from a test"


async def test_delete_object_removes_it() -> None:
    storage_service.ensure_bucket_exists()
    key = "test-owner/to-delete.txt"
    storage_service.upload_bytes(key, b"temporary", "text/plain")

    storage_service.delete_object(key)

    with pytest.raises(S3Error, match="NoSuchKey"):
        storage_service.download_bytes(key)


async def test_presigned_download_url_is_usable() -> None:
    storage_service.ensure_bucket_exists()
    key = "test-owner/presigned.txt"
    storage_service.upload_bytes(key, b"presigned content", "text/plain")

    url = storage_service.presigned_download_url(key, expires_seconds=60)
    response = httpx.get(url)

    assert response.status_code == 200
    assert response.content == b"presigned content"
