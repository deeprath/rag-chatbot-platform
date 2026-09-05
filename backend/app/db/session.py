"""Async SQLAlchemy engine/session setup and FastAPI dependency."""

from collections.abc import AsyncIterator

from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=settings.db_echo, pool_pre_ping=True)

AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
)


async def get_db() -> AsyncIterator[AsyncSession]:
    """FastAPI dependency yielding a request-scoped async DB session.

    Do NOT use this for a StreamingResponse body: FastAPI closes `yield`
    dependencies as soon as the endpoint function *returns* the Response object,
    which for a streaming response is before the body generator has actually run.
    Use get_session_maker() there instead and open the session inside the
    generator itself (see app/api/v1/routers/chat.py).
    """
    async with AsyncSessionLocal() as session:
        yield session


def get_session_maker() -> async_sessionmaker[AsyncSession]:
    """FastAPI dependency handing out the session *factory* itself, for code
    (streaming endpoints, background tasks) that must control its own session's
    lifetime rather than borrowing one scoped to the request."""
    return AsyncSessionLocal
