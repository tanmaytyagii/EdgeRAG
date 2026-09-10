# EdgeRAG image. The web UI is built in a Node stage, then copied into a slim
# Python runtime that serves both the API and the static files.

# ---------------------------------------------------------------- web build ---
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm install
COPY frontend/ ./
RUN npm run build -- --outDir dist --emptyOutDir

# ------------------------------------------------------------------ runtime ---
FROM python:3.12-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1 \
    EDGERAG_DATA_DIR=/data \
    EDGERAG_HOST=0.0.0.0 \
    EDGERAG_PORT=8000 \
    HF_HOME=/data/models

WORKDIR /app

# Install the backend first so the dependency layer is cached across code edits.
COPY backend/pyproject.toml ./backend/pyproject.toml
COPY README.md ./README.md
RUN mkdir -p backend/edgerag && touch backend/edgerag/__init__.py \
 && pip install -e "./backend"

COPY backend/ ./backend/
COPY samples/ ./samples/
COPY --from=web /web/dist ./backend/static

# Run as a non-root user; /data is the only writable location it needs.
RUN useradd --create-home --uid 10001 edgerag \
 && mkdir -p /data && chown -R edgerag:edgerag /data /app
USER edgerag

VOLUME ["/data"]
EXPOSE 8000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD python -c "import urllib.request,sys; sys.exit(0 if urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=4).status==200 else 1)"

ENTRYPOINT ["python", "-m", "edgerag.cli"]
CMD ["serve"]
