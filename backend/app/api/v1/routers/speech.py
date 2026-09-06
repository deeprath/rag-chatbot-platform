"""AI text-to-speech (human-sounding voice, via Groq's Orpheus model) — see
app/services/tts_service.py for the full picture, including the one-time
Groq-console setup step this needs before it actually works.
"""

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.security import get_current_owner_id
from app.db.session import get_db
from app.schemas.speech import TTSRequest
from app.services.llm_provider import resolve_groq_api_key
from app.services.tts_service import (
    DEFAULT_VOICE,
    TTSError,
    TTSNotConfiguredError,
    synthesize_speech,
)

router = APIRouter(prefix="/speech", tags=["speech"])


@router.post("/tts")
async def text_to_speech(
    payload: TTSRequest,
    owner_id: Annotated[str, Depends(get_current_owner_id)],
    db: Annotated[AsyncSession, Depends(get_db)],
) -> Response:
    api_key = await resolve_groq_api_key(db, owner_id)
    try:
        audio_bytes, content_type = await synthesize_speech(
            payload.text,
            api_key=api_key,
            voice=payload.voice or DEFAULT_VOICE,
        )
    except TTSNotConfiguredError as exc:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(exc)
        ) from exc
    except TTSError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail=str(exc)
        ) from exc

    return Response(content=audio_bytes, media_type=content_type)
