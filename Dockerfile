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
    HF_HOME=/opt/hf

# EDGERAG_PORT is deliberately NOT set here. Hosting platforms (Railway, Render,
# Fly) inject the port to bind as $PORT, and an image-level EDGERAG_PORT would
# override it. Settings falls back to 8000 when $PORT is absent, so plain
# `docker run` and docker-compose are unchanged.

WORKDIR /app

# Which extras to install, as a build argument.
#
#   (empty)  default. Small image, no torch. Semantic embeddings and the
#            cross-encoder are unavailable, so this build must run with
#            EDGERAG_EMBEDDING__PROVIDER=hash-dev — fine for smoke tests, and
#            NOT representative of retrieval quality.
#   [local]  real embeddings and reranking. Pulls torch: roughly 2 GB of image
#            and ~1.5 GB of RAM at runtime. This is what a public demo needs if
#            it is to show EdgeRAG honestly.
#
# Build with:  docker build --build-arg EDGERAG_EXTRAS='[local]' .
ARG EDGERAG_EXTRAS=""

# Install the backend first so the dependency layer is cached across code edits.
COPY backend/pyproject.toml ./backend/pyproject.toml
COPY README.md ./README.md
RUN mkdir -p backend/edgerag && touch backend/edgerag/__init__.py \
 && pip install -e "./backend${EDGERAG_EXTRAS}"

COPY backend/ ./backend/
COPY samples/ ./samples/
COPY --from=web /web/dist ./backend/static

# Bake the sentence-transformers and cross-encoder weights into the image when
# they are installed. Without this the first request on a fresh container spends
# a minute downloading ~120 MB, and a platform with no persistent disk repeats
# that on every deploy.
ARG EDGERAG_PREFETCH_MODELS=""
RUN if [ -n "$EDGERAG_PREFETCH_MODELS" ]; then \
      python -c "\
from sentence_transformers import SentenceTransformer, CrossEncoder; \
SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2'); \
CrossEncoder('cross-encoder/ms-marco-MiniLM-L-6-v2')"; \
    fi

# Run as a non-root user; /data is the only writable location it needs.
RUN useradd --create-home --uid 10001 edgerag \
 && mkdir -p /data /opt/hf && chown -R edgerag:edgerag /data /app /opt/hf
USER edgerag

VOLUME ["/data"]
EXPOSE 8000

# Shell form so ${PORT} expands; the model download on first boot is slow, so
# the start period is generous.
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD python -c "import os,urllib.request,sys; p=os.environ.get('PORT','8000'); sys.exit(0 if urllib.request.urlopen(f'http://127.0.0.1:{p}/api/health', timeout=4).status==200 else 1)"

ENTRYPOINT ["python", "-m", "edgerag.cli"]
CMD ["serve"]
