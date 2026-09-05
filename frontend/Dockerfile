# syntax=docker/dockerfile:1

# node:24-slim (Debian/glibc), not -alpine: npm's optional-dependency resolution
# for Rollup's native binary breaks on musl (https://github.com/npm/cli/issues/4828)
# when package-lock.json was generated on a non-Alpine host, which it was here.
FROM node:24-slim AS builder
WORKDIR /app

# package-lock.json deliberately isn't copied in here: npm/cli#4828 means a
# lockfile committed from one platform (ours: macOS) can make `npm ci`/`npm
# install --package-lock-only` fail to resolve optional native deps (Rollup's
# platform binary) for a different build platform. A lockfile-free `npm install`
# always re-resolves correctly for whatever platform is actually building.
COPY package.json ./
RUN npm install

COPY . .

# Vite inlines VITE_* variables into the JS bundle at *build* time, so they have
# to arrive as build args here, not as runtime container env vars.
ARG VITE_API_BASE_URL
ARG VITE_KEYCLOAK_URL
ARG VITE_KEYCLOAK_REALM
ARG VITE_KEYCLOAK_CLIENT_ID
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_KEYCLOAK_URL=${VITE_KEYCLOAK_URL} \
    VITE_KEYCLOAK_REALM=${VITE_KEYCLOAK_REALM} \
    VITE_KEYCLOAK_CLIENT_ID=${VITE_KEYCLOAK_CLIENT_ID}

RUN npm run build


# nginxinc/nginx-unprivileged, not plain nginx: plain nginx:alpine's master
# process runs as root (needs it to bind port 80) — a real Trivy finding
# (DS-0002). This variant is pre-configured to run entirely as a non-root user
# and listens on 8080 instead, so k8s's `runAsNonRoot: true` (see
# infra/helm/templates/frontend/deployment.yaml) actually holds.
FROM nginxinc/nginx-unprivileged:1.27-alpine AS runtime

# Picks up patched Alpine packages released since this base image tag was
# built (musl/libxml2/zlib/... CVEs Trivy would otherwise flag) without
# waiting on upstream to cut a new nginx-unprivileged tag. Switches back to
# the base image's own non-root `nginx` user afterward — apk needs root to
# write the package db, nothing after this needs it. Explicit rather than
# relying on the inherited default: static scanners like Trivy's DS-0002
# check for a USER instruction in *this* Dockerfile, not the base image's.
USER root
RUN apk --no-cache upgrade
USER nginx

COPY --from=builder /app/dist /usr/share/nginx/html
# Not conf.d directly: the base image's own entrypoint envsubst's every
# /etc/nginx/templates/*.template into conf.d at container startup — see
# nginx.conf.template's own header comment for why CSP needs that.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY security-headers.conf.template /etc/nginx/templates/security-headers.conf.template

# Deployment-specific: docker-compose and the Helm chart's Ingress put the API
# gateway and Keycloak at different origins, so both override this at runtime
# (see infra/docker-compose.yml and infra/helm/templates/frontend/deployment.yaml).
# This default covers a plain `docker run` / local `npm run build` preview.
ENV CSP_CONNECT_SRC="http://localhost:8000 http://localhost:8080"

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["nginx", "-g", "daemon off;"]
