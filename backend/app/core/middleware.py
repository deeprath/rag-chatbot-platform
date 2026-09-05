"""Baseline security response headers.

Found missing by infra/security/zap-scan.sh's API scan (X-Content-Type-Options
on /health, /health/ready, /openapi.json — see docs/SECURITY.md). Deliberately
not a full Content-Security-Policy here: this is a JSON API, not a page, and
/docs (Swagger UI) loads its own assets from a CDN by default — a strict CSP
would break it. The frontend (a real page) has its own, much stricter CSP —
see frontend/nginx.conf.template.
"""

from collections.abc import Awaitable, Callable

from starlette.requests import Request
from starlette.responses import Response

SECURITY_HEADERS = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "strict-origin-when-cross-origin",
}


async def security_headers_middleware(
    request: Request, call_next: Callable[[Request], Awaitable[Response]]
) -> Response:
    response = await call_next(request)
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    return response
