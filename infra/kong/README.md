# Kong gateway config

`kong.yml` is Kong's declarative (DB-less) config: it defines one service (the
FastAPI backend) and one route (`/api`, `/docs`, `/redoc`, `/openapi.json`),
with CORS, rate-limiting, and a request-size-limiting plugin attached. It's
mounted into the Kong container in `infra/docker-compose.yml` (Phase 7).

Kong's role is deliberately narrow: routing, CORS, and rate-limiting. JWT
verification happens in the FastAPI backend (`app/core/security.py`) against
the same Keycloak JWKS — see `docs/ARCHITECTURE.md` for why (short version:
Kong OSS's JWT plugin doesn't speak OIDC/JWKS natively, and duplicating
verification in both places is one more thing to keep in sync for no benefit).

## Standalone verification (no docker-compose yet)

`kong.yml`'s service targets `http://backend:8000`, which only resolves inside
the Phase 7 compose network. To verify the gateway config against a backend
running directly on the host (`uv run fastapi dev`), point it at Docker
Desktop's host gateway instead:

```bash
sed 's#http://backend:8000#http://host.docker.internal:8001#' \
  infra/kong/kong.yml > /tmp/kong.standalone.yml

docker run -d --name rag-chatbot-kong-dev \
  -e KONG_DATABASE=off \
  -e "KONG_DECLARATIVE_CONFIG=/kong.yml" \
  -e KONG_PROXY_LISTEN=0.0.0.0:8000 \
  -v /tmp/kong.standalone.yml:/kong.yml \
  -p 8000:8000 \
  kong:latest

curl http://localhost:8000/api/v1/health   # -> proxied straight through to the backend
```
