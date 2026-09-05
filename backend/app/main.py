"""FastAPI application entrypoint."""

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.v1.api import api_router
from app.core.config import get_settings
from app.core.logging import configure_logging, get_logger
from app.core.middleware import security_headers_middleware
from app.services.storage_service import ensure_bucket_exists

settings = get_settings()
configure_logging(debug=settings.debug)
logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(_: FastAPI) -> AsyncIterator[None]:
    logger.info("app_startup", environment=settings.environment, llm_provider=settings.llm_provider)
    try:
        ensure_bucket_exists()
    except Exception as exc:  # noqa: BLE001 - MinIO being down shouldn't crash the whole app
        logger.warning("minio_unavailable_at_startup", error=str(exc))
    yield
    logger.info("app_shutdown")


def create_app() -> FastAPI:
    app = FastAPI(
        title=settings.app_name,
        description="FastAPI + LangChain retrieval-augmented-generation chatbot API.",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        openapi_url="/openapi.json",
        lifespan=lifespan,
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_allow_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.middleware("http")(security_headers_middleware)

    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()
