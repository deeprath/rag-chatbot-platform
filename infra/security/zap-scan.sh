#!/usr/bin/env bash
# OWASP ZAP scan against the local docker-compose stack (infra/docker-compose.yml).
#
# Two scans, because a passive baseline scan and an OpenAPI-driven scan cover
# different ground:
#   1. zap-baseline.py against the frontend (http://localhost:5173) — passive
#      checks (security headers, cookies, TLS, information disclosure) on the
#      static SPA shell. ZAP's basic spider doesn't execute JS, so it won't
#      discover client-side routes on its own; this catches shell-level issues,
#      not deep in-app behavior.
#   2. zap-api-scan.py against the backend's OpenAPI spec (through Kong,
#      http://localhost:8000/openapi.json) — walks every documented endpoint.
#      Runs unauthenticated, so it mainly proves public routes (health, docs)
#      and the 401 boundary behave correctly rather than exercising
#      authenticated business logic. Wiring up a Keycloak auth context for a
#      deeper authenticated scan is a documented next step, not done here.
#
# Usage:
#   cd infra && docker compose up -d   # stack must already be running
#   ./infra/security/zap-scan.sh
#
# Reports land in infra/security/reports/ (gitignored — see root .gitignore).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPORT_DIR="$SCRIPT_DIR/reports"
mkdir -p "$REPORT_DIR"

ZAP_IMAGE="ghcr.io/zaproxy/zaproxy:stable"
FRONTEND_URL="${FRONTEND_URL:-http://host.docker.internal:5173}"
API_URL="${API_URL:-http://host.docker.internal:8000}"

echo "==> Pulling $ZAP_IMAGE"
docker pull "$ZAP_IMAGE"

# --add-host is what makes host.docker.internal resolve at all on native
# Linux Docker (GitHub Actions runners included) — Docker Desktop (macOS/
# Windows) has always provided it natively, where this flag is harmless.
HOST_GATEWAY=(--add-host host.docker.internal:host-gateway)

echo "==> Baseline scan: $FRONTEND_URL"
docker run --rm "${HOST_GATEWAY[@]}" -v "$REPORT_DIR:/zap/wrk:rw" "$ZAP_IMAGE" \
  zap-baseline.py -t "$FRONTEND_URL" \
  -r frontend-baseline-report.html -J frontend-baseline-report.json \
  -I || true # zap-baseline.py exits non-zero on WARN-level findings too; don't fail the script on that

echo "==> API scan (OpenAPI-driven): $API_URL/openapi.json"
docker run --rm "${HOST_GATEWAY[@]}" -v "$REPORT_DIR:/zap/wrk:rw" "$ZAP_IMAGE" \
  zap-api-scan.py -t "$API_URL/openapi.json" -f openapi \
  -r api-scan-report.html -J api-scan-report.json \
  -I || true

echo "==> Reports written to $REPORT_DIR"
echo "    frontend-baseline-report.html / .json"
echo "    api-scan-report.html / .json"
