"""Integration test: real (migrated) TimescaleDB + a real MinIO container +
real embeddings/pgvector — the actual upload -> extract -> chunk -> embed ->
store pipeline, exercised through the HTTP API rather than mocked out.
"""

import asyncio
from collections.abc import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient
from minio import Minio
from sqlalchemy.ext.asyncio import async_sessionmaker, create_async_engine
from testcontainers.community.minio import MinioContainer

from app.db.session import get_db, get_session_maker
from app.main import app
from app.services import storage_service

pytestmark = pytest.mark.asyncio


@pytest.fixture(scope="module")
def minio_container() -> AsyncIterator[MinioContainer]:
    with MinioContainer() as container:
        yield container


@pytest.fixture
async def client(
    migrated_database_url: str,
    minio_container: MinioContainer,
    monkeypatch: pytest.MonkeyPatch,
) -> AsyncIterator[AsyncClient]:
    engine = create_async_engine(migrated_database_url)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)

    async def override_get_db() -> AsyncIterator:
        async with session_maker() as session:
            yield session

    app.dependency_overrides[get_db] = override_get_db
    app.dependency_overrides[get_session_maker] = lambda: session_maker

    config = minio_container.get_config()
    test_minio_client = Minio(
        config["endpoint"],
        access_key=config["access_key"],
        secret_key=config["secret_key"],
        secure=False,
    )
    monkeypatch.setattr(storage_service, "get_minio_client", lambda: test_minio_client)
    storage_service.ensure_bucket_exists()

    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as ac:
        yield ac

    app.dependency_overrides.clear()
    await engine.dispose()


async def _wait_until_terminal(client: AsyncClient, headers: dict, document_id: str) -> dict:
    """BackgroundTasks normally finish before the ASGI response returns, but
    don't hard-depend on that timing — poll briefly as a safety margin."""
    for _ in range(20):
        resp = await client.get(f"/api/v1/documents/{document_id}", headers=headers)
        body = resp.json()
        if body["status"] not in ("pending", "processing"):
            return body
        await asyncio.sleep(0.25)
    return body


async def test_upload_text_document_is_ingested_and_searchable(
    client: AsyncClient, auth_headers
) -> None:
    headers = auth_headers("doc-test-user")
    content = b"The RAG Chatbot Platform combines FastAPI, LangChain, and pgvector."
    files = {"file": ("note.txt", content, "text/plain")}

    upload_resp = await client.post("/api/v1/documents", files=files, headers=headers)
    assert upload_resp.status_code == 201
    document = upload_resp.json()
    assert document["status"] == "pending"

    final = await _wait_until_terminal(client, headers, document["id"])
    assert final["status"] == "ready", final

    list_resp = await client.get("/api/v1/documents", headers=headers)
    assert list_resp.status_code == 200
    assert any(d["id"] == document["id"] for d in list_resp.json())


async def test_upload_unsupported_type_is_rejected(client: AsyncClient, auth_headers) -> None:
    headers = auth_headers("doc-test-user-2")
    files = {"file": ("archive.zip", b"not really a zip", "application/zip")}

    resp = await client.post("/api/v1/documents", files=files, headers=headers)

    assert resp.status_code == 415


async def test_documents_are_scoped_to_owner(client: AsyncClient, auth_headers) -> None:
    owner_a_headers = auth_headers("owner-a")
    owner_b_headers = auth_headers("owner-b")
    files = {"file": ("note.txt", b"Owner A's private document.", "text/plain")}

    upload_resp = await client.post("/api/v1/documents", files=files, headers=owner_a_headers)
    document_id = upload_resp.json()["id"]

    # Owner B can't see owner A's document, by id or in their own list.
    get_resp = await client.get(f"/api/v1/documents/{document_id}", headers=owner_b_headers)
    assert get_resp.status_code == 404

    list_resp = await client.get("/api/v1/documents", headers=owner_b_headers)
    assert all(d["id"] != document_id for d in list_resp.json())


async def test_empty_document_fails_ingestion_with_a_reason(
    client: AsyncClient, auth_headers
) -> None:
    """A .txt file with no real content passes the content-type check but has
    nothing to extract/chunk — ingestion_service should catch that and record
    why, not leave the document stuck in `processing` forever."""
    headers = auth_headers("doc-test-user-3")
    files = {"file": ("blank.txt", b"   \n\n  ", "text/plain")}

    upload_resp = await client.post("/api/v1/documents", files=files, headers=headers)
    document_id = upload_resp.json()["id"]

    final = await _wait_until_terminal(client, headers, document_id)

    assert final["status"] == "failed"
    assert "extractable text" in final["error_message"]
