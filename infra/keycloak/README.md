# Keycloak realm bootstrap

`realm-export.json` defines the `rag-chatbot` realm used by both the frontend and
backend. It's imported automatically by the Keycloak container (see
`infra/docker-compose.yml`, added in Phase 7) via `--import-realm`, or manually:

```bash
docker run -d --name rag-chatbot-keycloak-dev -p 8080:8080 \
  -e KEYCLOAK_ADMIN=admin -e KEYCLOAK_ADMIN_PASSWORD=admin \
  -v "$(pwd)/infra/keycloak/realm-export.json:/opt/keycloak/data/import/realm-export.json" \
  quay.io/keycloak/keycloak:latest start-dev --import-realm
```

Admin console: http://localhost:8080/admin (`admin` / `admin`, dev container only).

## What's in the realm

| Client | Type | Purpose |
|---|---|---|
| `rag-chatbot-frontend` | public, PKCE (`S256`) | The React SPA logs in with this. Redirect URIs/web origins cover both `http://localhost:5173` (docker-compose) and `http://rag-chatbot.local` (the Helm chart's default Ingress host, see `infra/helm/`), so the same realm export serves both deployment paths. |
| `rag-chatbot-backend` | bearer-only | Exists so tokens can carry it as an `aud` (audience) claim — see the `oidc-audience-mapper` on the frontend client |

A default user, **`testuser` / `testuser123`**, is seeded with the `chatbot-user`
realm role, so you can log in immediately without touching the admin console.

`rag-chatbot-frontend` has **Direct Access Grants enabled** — a deliberate,
dev-only relaxation so you can fetch a token with a single `curl` call (see below)
instead of driving a full browser redirect for every manual test or Postman run.
A production realm would disable it and rely solely on the Authorization
Code + PKCE flow the SPA actually uses.

## Getting a token without a browser (dev/test only)

```bash
curl -s -X POST \
  http://localhost:8080/realms/rag-chatbot/protocol/openid-connect/token \
  -d grant_type=password \
  -d client_id=rag-chatbot-frontend \
  -d username=testuser \
  -d password=testuser123 | python3 -c "import sys,json;print(json.load(sys.stdin)['access_token'])"
```

Use the resulting token as `Authorization: Bearer <token>` against the backend
(directly on port 8000, or through Kong once `infra/kong/kong.yml` is wired up).
