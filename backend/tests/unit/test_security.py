import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwt

from app.core.config import Settings, get_settings
from app.core.security import AuthenticationError, decode_token

pytestmark = pytest.mark.asyncio


async def test_valid_token_decodes_with_expected_subject(make_access_token) -> None:
    token = make_access_token(owner_id="user-abc")
    claims = await decode_token(token)
    assert claims["sub"] == "user-abc"


async def test_expired_token_is_rejected(make_access_token) -> None:
    now = int(time.time())
    token = make_access_token(iat=now - 7200, exp=now - 3600)
    with pytest.raises(AuthenticationError):
        await decode_token(token)


async def test_wrong_issuer_is_rejected(make_access_token) -> None:
    token = make_access_token(iss="http://evil.example.com/realms/other")
    with pytest.raises(AuthenticationError):
        await decode_token(token)


async def test_wrong_audience_is_rejected(make_access_token) -> None:
    # `decode_token` only checks `aud` at all when `keycloak_audience` is set
    # (see its `verify_aud` line) — the ambient `get_settings()` singleton
    # that `make_access_token`/`decode_token` fall back to by default may or
    # may not have one configured (e.g. unset in CI, where there's no
    # backend/.env), which would make this test's pass/fail depend on where
    # it runs rather than on the actual behavior it's meant to check. Passing
    # an explicit `Settings` with a fixed audience makes it deterministic.
    settings = Settings(_env_file=None, keycloak_audience="expected-client")  # type: ignore[call-arg]
    token = make_access_token(aud="some-other-client")
    with pytest.raises(AuthenticationError):
        await decode_token(token, settings)


async def test_token_signed_by_unknown_key_is_rejected(make_access_token) -> None:
    settings = get_settings()
    now = int(time.time())
    # Signed with a *different* key than the one the stubbed JWKS advertises.
    other_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    other_pem = other_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    token = jwt.encode(
        {
            "sub": "user-abc",
            "iss": f"{settings.keycloak_server_url}/realms/{settings.keycloak_realm}",
            "aud": settings.keycloak_audience,
            "iat": now,
            "exp": now + 3600,
        },
        other_pem,
        algorithm="RS256",
        headers={"kid": "some-unknown-kid"},
    )
    with pytest.raises(AuthenticationError):
        await decode_token(token)
