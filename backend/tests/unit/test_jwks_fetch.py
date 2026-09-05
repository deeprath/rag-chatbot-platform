"""Unit tests for the real fetch_jwks implementation (not the stubbed-out
version every other test uses via conftest.py's autouse fixture) — its own
network + caching logic is otherwise never exercised by anything.
"""

import httpx
import pytest

from app.core import security as security_module
from app.core.config import Settings, get_settings

# Captured by reference at import time, before conftest.py's autouse fixture
# monkeypatches security_module.fetch_jwks (replacing the module attribute) for
# every test — this name still points at the real implementation regardless.
from app.core.security import fetch_jwks as real_fetch_jwks

pytestmark = pytest.mark.asyncio


@pytest.fixture(autouse=True)
def _reset_jwks_cache():
    security_module._jwks_cache["keys"] = None
    security_module._jwks_cache["fetched_at"] = 0.0
    yield
    security_module._jwks_cache["keys"] = None
    security_module._jwks_cache["fetched_at"] = 0.0


async def test_fetch_jwks_fetches_and_caches(monkeypatch: pytest.MonkeyPatch) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"keys": [{"kid": "k1"}]})

    class FakeAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    settings = get_settings()
    first = await real_fetch_jwks(settings)
    second = await real_fetch_jwks(settings)

    assert first == {"keys": [{"kid": "k1"}]}
    assert second == first
    assert call_count == 1, "second call within the cache window should not refetch"


async def test_fetch_jwks_refetches_after_cache_expiry(monkeypatch: pytest.MonkeyPatch) -> None:
    call_count = 0

    def handler(request: httpx.Request) -> httpx.Response:
        nonlocal call_count
        call_count += 1
        return httpx.Response(200, json={"keys": [{"kid": f"k{call_count}"}]})

    class FakeAsyncClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs):
            kwargs["transport"] = httpx.MockTransport(handler)
            super().__init__(*args, **kwargs)

    monkeypatch.setattr(httpx, "AsyncClient", FakeAsyncClient)

    base = get_settings()
    # A fresh Settings instance (not the cached get_settings() singleton, which
    # other tests share) with an always-stale cache window.
    settings = Settings(
        _env_file=None,  # type: ignore[call-arg]
        keycloak_server_url=base.keycloak_server_url,
        keycloak_realm=base.keycloak_realm,
        keycloak_jwks_cache_seconds=0,
    )

    first = await real_fetch_jwks(settings)
    second = await real_fetch_jwks(settings)

    assert call_count == 2
    assert first != second
