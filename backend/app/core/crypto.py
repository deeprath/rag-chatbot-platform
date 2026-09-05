"""Symmetric encryption for secrets we store at rest (per-user LLM API keys).

Uses Fernet (AES-128-CBC + HMAC, from the `cryptography` package — already a
transitive dependency via `python-jose[cryptography]`). Keys are encrypted
before ever reaching the database and only decrypted transiently, in memory,
at the point a chat request actually needs to call the provider's SDK — never
logged, never returned to the frontend, never written back out in plaintext.
"""

from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import Settings, get_settings


class EncryptionNotConfiguredError(RuntimeError):
    """Raised when SECRET_ENCRYPTION_KEY isn't set but encryption was needed."""


@lru_cache
def _fernet(secret_encryption_key: str) -> Fernet:
    try:
        return Fernet(secret_encryption_key.encode("utf-8"))
    except (ValueError, TypeError) as exc:
        raise EncryptionNotConfiguredError(
            "SECRET_ENCRYPTION_KEY is set but isn't a valid Fernet key. Generate one with: "
            'python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())"'
        ) from exc


def _get_fernet(settings: Settings | None = None) -> Fernet:
    settings = settings or get_settings()
    if not settings.secret_encryption_key:
        raise EncryptionNotConfiguredError(
            "SECRET_ENCRYPTION_KEY is not set — required to store a per-user API key. "
            'Generate one with: python -c "from cryptography.fernet import Fernet; '
            'print(Fernet.generate_key().decode())" and set it in backend/.env or infra/.env.'
        )
    return _fernet(settings.secret_encryption_key)


def encrypt_secret(plaintext: str, settings: Settings | None = None) -> str:
    """Encrypts `plaintext` (e.g. an API key) into an opaque token safe to store."""
    token = _get_fernet(settings).encrypt(plaintext.encode("utf-8"))
    return token.decode("utf-8")


def decrypt_secret(ciphertext: str, settings: Settings | None = None) -> str:
    """Decrypts a token produced by `encrypt_secret`. Raises on tampering/wrong key."""
    try:
        return _get_fernet(settings).decrypt(ciphertext.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise EncryptionNotConfiguredError(
            "Stored key could not be decrypted — SECRET_ENCRYPTION_KEY may have changed."
        ) from exc


def mask_secret(plaintext: str) -> str:
    """A display-safe preview — never the real value. e.g. 'sk-ant-…a1b2'."""
    if len(plaintext) <= 8:
        return "…" + plaintext[-2:]
    prefix = plaintext[:7]
    suffix = plaintext[-4:]
    return f"{prefix}…{suffix}"
