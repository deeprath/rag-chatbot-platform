"""Keycloak JWT verification.

Every request is authenticated by verifying its Bearer token's signature against
Keycloak's JWKS (JSON Web Key Set) — RS256, so the backend never needs Keycloak's
private key, just its published public keys. `get_current_owner_id` is the single
FastAPI dependency every protected route depends on; it used to (Phase 3/4) read a
plain `X-Owner-Id` header, and every call site kept working unchanged once this was
swapped in, because the function's signature (a str owner_id, from Depends) never
changed — only its implementation did.
"""

import time

import httpx
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

from app.core.config import Settings, get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)

_bearer_scheme = HTTPBearer(auto_error=True)

# Module-level so tests can monkeypatch it wholesale instead of running a real
# Keycloak container for every unit-level test (an integration test against a
# real one is what proves realm-export.json itself is correct).
_jwks_cache: dict[str, object] = {"keys": None, "fetched_at": 0.0}


class AuthenticationError(HTTPException):
    def __init__(self, detail: str) -> None:
        super().__init__(status_code=status.HTTP_401_UNAUTHORIZED, detail=detail)


async def fetch_jwks(settings: Settings) -> dict:
    """Fetch (and cache) Keycloak's JSON Web Key Set for the configured realm."""
    now = time.monotonic()
    cache_age = now - _jwks_cache["fetched_at"]
    if _jwks_cache["keys"] is not None and cache_age < settings.keycloak_jwks_cache_seconds:
        return _jwks_cache["keys"]  # type: ignore[return-value]

    jwks_url = (
        f"{settings.keycloak_server_url}/realms/{settings.keycloak_realm}"
        "/protocol/openid-connect/certs"
    )
    async with httpx.AsyncClient(timeout=10) as client:
        response = await client.get(jwks_url)
        response.raise_for_status()
        jwks = response.json()

    _jwks_cache["keys"] = jwks
    _jwks_cache["fetched_at"] = now
    logger.info("keycloak_jwks_refreshed", realm=settings.keycloak_realm)
    return jwks


def _issuer(settings: Settings) -> str:
    base_url = settings.keycloak_issuer_url or settings.keycloak_server_url
    return f"{base_url}/realms/{settings.keycloak_realm}"


def _find_key(jwks: dict, kid: str | None) -> dict | None:
    return next((k for k in jwks.get("keys", []) if k.get("kid") == kid), None)


async def decode_token(token: str, settings: Settings | None = None) -> dict:
    """Verify signature, issuer, expiry and (if configured) audience; return claims."""
    settings = settings or get_settings()
    jwks = await fetch_jwks(settings)

    try:
        unverified_header = jwt.get_unverified_header(token)
    except JWTError as exc:
        raise AuthenticationError("Malformed token") from exc

    key = _find_key(jwks, unverified_header.get("kid"))
    if key is None:
        # Keys may have rotated since we cached them; refresh once and retry.
        _jwks_cache["keys"] = None
        jwks = await fetch_jwks(settings)
        key = _find_key(jwks, unverified_header.get("kid"))
        if key is None:
            raise AuthenticationError("Unknown signing key")

    try:
        return jwt.decode(
            token,
            key,
            algorithms=["RS256"],
            audience=settings.keycloak_audience,
            issuer=_issuer(settings),
            options={"verify_aud": settings.keycloak_audience is not None},
        )
    except JWTError as exc:
        logger.warning("jwt_verification_failed", error=str(exc))
        raise AuthenticationError(f"Invalid token: {exc}") from exc


async def get_current_owner_id(
    credentials: HTTPAuthorizationCredentials = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency: verify the Bearer token, return the user's stable id (`sub`)."""
    claims = await decode_token(credentials.credentials)
    subject = claims.get("sub")
    if not subject:
        raise AuthenticationError("Token has no subject (sub) claim")
    return subject
