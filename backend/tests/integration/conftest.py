"""Shared fixtures for integration tests: spins up a real TimescaleDB container,
runs Alembic migrations against it, and hands out an async DB session bound to it.
"""

import os
import subprocess
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
import pytest_asyncio
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from testcontainers.community.postgres import PostgresContainer

BACKEND_DIR = Path(__file__).resolve().parents[2]


@pytest.fixture(scope="session")
def timescale_container() -> Iterator[PostgresContainer]:
    with PostgresContainer(
        "timescale/timescaledb:latest-pg16",
        username="rag",
        password="rag",
        dbname="rag_chatbot_test",
        driver="asyncpg",
    ) as container:
        yield container


@pytest.fixture(scope="session")
def migrated_database_url(timescale_container: PostgresContainer) -> str:
    """Run `alembic upgrade head` against the container, return its async URL."""
    async_url = timescale_container.get_connection_url()
    subprocess.run(  # noqa: S603
        ["uv", "run", "alembic", "upgrade", "head"],  # noqa: S607
        cwd=BACKEND_DIR,
        env={**os.environ, "DATABASE_URL": async_url},
        check=True,
    )
    return async_url


@pytest_asyncio.fixture
async def db_session(migrated_database_url: str) -> AsyncIterator[AsyncSession]:
    engine = create_async_engine(migrated_database_url)
    session_maker = async_sessionmaker(bind=engine, expire_on_commit=False)
    async with session_maker() as session:
        yield session
    await engine.dispose()
