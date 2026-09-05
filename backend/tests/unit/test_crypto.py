import pytest
from cryptography.fernet import Fernet

from app.core.config import Settings
from app.core.crypto import (
    EncryptionNotConfiguredError,
    decrypt_secret,
    encrypt_secret,
    mask_secret,
)


def _settings_with_key() -> Settings:
    return Settings(_env_file=None, secret_encryption_key=Fernet.generate_key().decode())  # type: ignore[call-arg]


def test_round_trip() -> None:
    settings = _settings_with_key()
    ciphertext = encrypt_secret("sk-ant-super-secret-value", settings)
    assert ciphertext != "sk-ant-super-secret-value"
    assert decrypt_secret(ciphertext, settings) == "sk-ant-super-secret-value"


def test_ciphertext_is_not_the_plaintext_or_a_trivial_encoding() -> None:
    settings = _settings_with_key()
    plaintext = "sk-ant-super-secret-value"
    ciphertext = encrypt_secret(plaintext, settings)
    assert plaintext not in ciphertext
    assert plaintext.encode().hex() not in ciphertext


def test_wrong_key_cannot_decrypt() -> None:
    settings_a = _settings_with_key()
    settings_b = _settings_with_key()
    ciphertext = encrypt_secret("sk-ant-super-secret-value", settings_a)
    with pytest.raises(EncryptionNotConfiguredError):
        decrypt_secret(ciphertext, settings_b)


def test_missing_key_raises_clear_error() -> None:
    settings = Settings(_env_file=None, secret_encryption_key=None)  # type: ignore[call-arg]
    with pytest.raises(EncryptionNotConfiguredError, match="SECRET_ENCRYPTION_KEY"):
        encrypt_secret("anything", settings)


def test_mask_secret_never_reveals_the_middle() -> None:
    masked = mask_secret("sk-ant-api03-abcdefghijklmnopqrstuvwxyz")
    assert masked.startswith("sk-ant-")
    assert masked.endswith("wxyz")
    assert "abcdefghijklmnopqrstuv" not in masked


def test_mask_secret_handles_short_values() -> None:
    masked = mask_secret("short")
    assert masked == "…rt"
