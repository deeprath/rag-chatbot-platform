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

router = APIRouter(prefix="/settings/llm", tags=["settings"])


def _to_read_model(row: UserLLMSettings | None) -> LLMSettingsRead:
    if row is None:
        # No row yet — this user is on the deployment-wide LLM_PROVIDER default.
        return LLMSettingsRead(
            provider=get_settings().llm_provider,
            has_anthropic_key=False,
            has_openai_key=False,
        )
    return LLMSettingsRead(
        provider=row.provider,  # type: ignore[arg-type]
        has_anthropic_key=row.encrypted_anthropic_key is not None,
        has_openai_key=row.encrypted_openai_key is not None,
        anthropic_key_preview=row.anthropic_key_preview,
        openai_key_preview=row.openai_key_preview,
    )


@router.get("", response_model=LLMSettingsRead)
async def get_llm_settings(
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsRead:
    return _to_read_model(await llm_settings_repository.get_settings(db, owner_id))


@router.put("", response_model=LLMSettingsRead)
async def update_llm_settings(
    payload: LLMSettingsUpdate,
    owner_id: str = Depends(get_current_owner_id),
    db: AsyncSession = Depends(get_db),
) -> LLMSettingsRead:
    existing = await llm_settings_repository.get_settings(db, owner_id)
    settings = get_settings()
    updates: dict[str, object] = {}

    if payload.provider in ("anthropic", "openai"):
        key_field, preview_field = (
            ("encrypted_anthropic_key", "anthropic_key_preview")
            if payload.provider == "anthropic"
            else ("encrypted_openai_key", "openai_key_preview")
        )
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
    # provider == "ollama": no key involved; any api_key/clear_api_key on the
    # payload is simply ignored rather than touching either stored key.

    row = await llm_settings_repository.upsert_settings(
        db, owner_id, provider=payload.provider, **updates
    )
    return _to_read_model(row)
