"""Shared fixtures: mint locally-signed JWTs and stub out Keycloak's JWKS endpoint,
so tests don't need a running Keycloak. (A real Keycloak, loaded with
infra/keycloak/realm-export.json, is what's verified manually against this same
verification code — see infra/keycloak/README.md — this just keeps the automated
suite fast and hermetic.)
"""

import time

import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from jose import jwk, jwt

from app.core import security as security_module
from app.core.config import get_settings

_KID = "test-key-1"


def _generate_keypair() -> tuple[bytes, bytes]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PrivateFormat.PKCS8,
        encryption_algorithm=serialization.NoEncryption(),
    )
    public_pem = private_key.public_key().public_bytes(
        encoding=serialization.Encoding.PEM,
        format=serialization.PublicFormat.SubjectPublicKeyInfo,
    )
    return private_pem, public_pem


@pytest.fixture(scope="session")
def _test_keypair() -> tuple[bytes, bytes]:
    return _generate_keypair()


@pytest.fixture(autouse=True)
def _stub_keycloak_jwks(
    _test_keypair: tuple[bytes, bytes], monkeypatch: pytest.MonkeyPatch
) -> None:
    _private_pem, public_pem = _test_keypair
    test_jwk = jwk.construct(public_pem, algorithm="RS256").to_dict()
    test_jwk["kid"] = _KID
    test_jwk["use"] = "sig"
    jwks = {"keys": [test_jwk]}

    async def fake_fetch_jwks(_settings: object) -> dict:
        return jwks

    monkeypatch.setattr(security_module, "fetch_jwks", fake_fetch_jwks)


@pytest.fixture
def make_access_token(_test_keypair: tuple[bytes, bytes]):
    private_pem, _public_pem = _test_keypair

    def _make(owner_id: str = "test-user", **extra_claims: object) -> str:
        settings = get_settings()
        now = int(time.time())
        claims = {
            "sub": owner_id,
            "iss": f"{settings.keycloak_server_url}/realms/{settings.keycloak_realm}",
            "aud": settings.keycloak_audience,
            "iat": now,
            "exp": now + 3600,
            **extra_claims,
        }
        return jwt.encode(claims, private_pem, algorithm="RS256", headers={"kid": _KID})

    return _make


@pytest.fixture
def auth_headers(make_access_token):
    def _headers(owner_id: str = "test-user") -> dict[str, str]:
        return {"Authorization": f"Bearer {make_access_token(owner_id)}"}

    return _headers
