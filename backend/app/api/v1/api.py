"""Aggregates all v1 routers. Feature routers (chat, documents, auth) are added in later phases."""

from fastapi import APIRouter

from app.api.v1.routers import chat, documents, health

api_router = APIRouter()
api_router.include_router(health.router)
api_router.include_router(documents.router)
api_router.include_router(chat.router)
