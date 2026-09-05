"""Persistence for UserLLMSettings — see app/models/llm_settings.py."""

from sqlalchemy.ext.asyncio import AsyncSession

from app.models.llm_settings import UserLLMSettings

_UNSET = object()


async def get_settings(db: AsyncSession, owner_id: str) -> UserLLMSettings | None:
    return await db.get(UserLLMSettings, owner_id)


async def upsert_settings(
    db: AsyncSession,
    owner_id: str,
    *,
    provider: str,
    encrypted_anthropic_key: str | None | object = _UNSET,
    anthropic_key_preview: str | None | object = _UNSET,
    encrypted_openai_key: str | None | object = _UNSET,
    openai_key_preview: str | None | object = _UNSET,
) -> UserLLMSettings:
    """Creates or updates the row for `owner_id`.

    The `encrypted_*_key`/`*_key_preview` params default to a private "leave
    unchanged" sentinel rather than `None`, so a caller can switch `provider`
    without accidentally wiping a previously-saved key for a *different*
    provider — pass one explicitly (including `None`, to clear it) only when
    the caller actually means to change it.
    """
    row = await db.get(UserLLMSettings, owner_id)
    if row is None:
        row = UserLLMSettings(owner_id=owner_id, provider=provider)
        db.add(row)
    else:
        row.provider = provider

    if encrypted_anthropic_key is not _UNSET:
        row.encrypted_anthropic_key = encrypted_anthropic_key  # type: ignore[assignment]
    if anthropic_key_preview is not _UNSET:
        row.anthropic_key_preview = anthropic_key_preview  # type: ignore[assignment]
    if encrypted_openai_key is not _UNSET:
        row.encrypted_openai_key = encrypted_openai_key  # type: ignore[assignment]
    if openai_key_preview is not _UNSET:
        row.openai_key_preview = openai_key_preview  # type: ignore[assignment]

    await db.commit()
    await db.refresh(row)
    return row
