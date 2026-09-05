"""Per-user LLM provider + API key settings — see app/models/llm_settings.py.

Security notes (see also docs/SECURITY.md):
- A key is encrypted (Fernet, app/core/crypto.py) before it ever reaches the
  database; this router never writes plaintext to storage or logs.
- GET never returns, and never decrypts, a real key — it reads back only the
  masked preview computed once at write time (`mask_secret`, stored
  separately from the ciphertext), so displaying "a key is saved, ending in
  ...a1b2" needs no decryption. The real key is decrypted nowhere but
  app/services/llm_provider.py, transiently, right before an actual chat call.
- PUT accepts a key only over the same authenticated (Bearer JWT), same-origin
  path as every other API call — nothing new is exposed to store or change it.
"""

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.crypto import encrypt_secret, mask_secret
from app.core.security import get_current_owner_id
from app.db.session import get_db
from app.models.llm_settings import UserLLMSettings
from app.repositories import llm_settings_repository
from app.schemas.llm_settings import LLMSettingsRead, LLMSettingsUpdate
from app.services.llm_provider import check_ollama_available

router = APIRouter(prefix="/settings/llm", tags=["settings"])

# provider -> (encrypted-key column, masked-preview column) on UserLLMSettings,
# for the providers that need a key at all ("ollama" is deliberately absent).
_KEY_FIELDS: dict[str, tuple[str, str]] = {
    "anthropic": ("encrypted_anthropic_key", "anthropic_key_preview"),
    "openai": ("encrypted_openai_key", "openai_key_preview"),
    "groq": ("encrypted_groq_key", "groq_key_preview"),
}


async def _to_read_model(row: UserLLMSettings | None) -> LLMSettingsRead:
    ollama_available = await check_ollama_available()
    if row is None:
        # No row yet — this user is on the deployment-wide LLM_PROVIDER default.
        return LLMSettingsRead(
            provider=get_settings().llm_provider,
            has_anthropic_key=False,
            has_openai_key=False,
            has_groq_key=False,
            ollama_available=ollama_available,
        )
    return LLMSettingsRead(
        provider=row.provider,  # type: ignore[arg-type]
        has_anthropic_key=row.encrypted_anthropic_key is not None,
        has_openai_key=row.encrypted_openai_key is not None,
        has_groq_key=row.encrypted_groq_key is not None,
        anthropic_key_preview=row.anthropic_key_preview,
        openai_key_preview=row.openai_key_preview,
        groq_key_preview=row.groq_key_preview,
        ollama_available=ollama_available,
    )


@router.get("", response_model=LLMSettingsRead)
async def get_llm_settings(
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsRead:
    return await _to_read_model(await llm_settings_repository.get_settings(db, owner_id))


@router.put("", response_model=LLMSettingsRead)
async def update_llm_settings(
    payload: LLMSettingsUpdate,
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsRead:
    existing = await llm_settings_repository.get_settings(db, owner_id)
    settings = get_settings()
    updates: dict[str, object] = {}

    if payload.provider in _KEY_FIELDS:
        key_field, preview_field = _KEY_FIELDS[payload.provider]
        already_has_key = bool(existing and getattr(existing, key_field))

        if payload.clear_api_key:
            updates[key_field] = None
            updates[preview_field] = None
        elif payload.api_key:
            updates[key_field] = encrypt_secret(payload.api_key, settings)
            updates[preview_field] = mask_secret(payload.api_key)
        elif not already_has_key:
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"An {payload.provider.capitalize()} API key is required the first "
                    "time you select this provider."
                ),
            )
        # else: switching to a provider that already has a saved key — reuse it.
    elif payload.provider == "ollama":
        # Any api_key/clear_api_key on the payload is simply ignored — Ollama
        # needs no key. It does need to actually be reachable, though: unlike
        # a missing API key (fixable by pasting one in), an unreachable local
        # server can't be fixed from this form, so reject it up front with a
        # clear next step instead of saving a choice that will just fail on
        # the first chat message.
        if not await check_ollama_available(settings):
            raise HTTPException(
                status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
                detail=(
                    f"Ollama isn't reachable at {settings.ollama_base_url}. Start it with "
                    "`make ollama-up` (see infra/README.md) or choose another provider."
                ),
            )

    row = await llm_settings_repository.upsert_settings(
        db, owner_id, provider=payload.provider, **updates
    )
    return await _to_read_model(row)
