# syntax=docker/dockerfile:1

FROM python:3.12-slim AS builder

COPY --from=ghcr.io/astral-sh/uv:0.5.11 /uv /uvx /bin/

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never

# Install dependencies first (separately from app code) so this layer is cached
# across code-only changes.
RUN --mount=type=cache,target=/root/.cache/uv \
    --mount=type=bind,source=uv.lock,target=uv.lock \
    --mount=type=bind,source=pyproject.toml,target=pyproject.toml \
    uv sync --frozen --no-install-project --no-dev

COPY . .

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-dev


FROM python:3.12-slim AS runtime

# Fixed, known UID/GID (not just --system, which picks an arbitrary free one)
# so Kubernetes' securityContext.runAsUser/fsGroup can reference the same
# value and actually own mounted volumes — see infra/helm/templates/backend/deployment.yaml.
RUN groupadd --gid 1000 app && useradd --uid 1000 --gid app --create-home app

WORKDIR /app

COPY --from=builder --chown=app:app /app /app

ENV PATH="/app/.venv/bin:$PATH" \
    PYTHONUNBUFFERED=1 \
    HF_HOME=/home/app/.cache/huggingface

# HF_HOME is where sentence-transformers/huggingface_hub cache the embedding
# model on first use (see app/services/embedding_service.py) — created here so
# it exists (and is owned by `app`) under a read-only root filesystem too, as
# long as it's mounted as a writable volume at runtime (see
# infra/helm/templates/backend/deployment.yaml).
RUN mkdir -p /home/app/.cache/huggingface && chown -R app:app /home/app/.cache

USER app

EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
    CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/v1/health')" || exit 1

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
