#!/usr/bin/env bash
# Set up EdgeRAG for local development.
#
#   ./scripts/setup.sh            backend + frontend, with the ML extras
#   ./scripts/setup.sh --minimal  backend without torch (CI-style install)
#
# Idempotent: safe to re-run.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

MINIMAL=0
[[ "${1:-}" == "--minimal" ]] && MINIMAL=1

info()  { printf '\033[1m==>\033[0m %s\n' "$1"; }
warn()  { printf '\033[33m warn\033[0m %s\n' "$1"; }
die()   { printf '\033[31merror\033[0m %s\n' "$1" >&2; exit 1; }

# ---------------------------------------------------------------- prerequisites
command -v python3 >/dev/null || die "python3 is required."
python3 - <<'PY' || die "Python 3.10 or newer is required."
import sys
raise SystemExit(0 if sys.version_info >= (3, 10) else 1)
PY
info "Python $(python3 -c 'import platform;print(platform.python_version())')"

command -v node >/dev/null || die "Node 18 or newer is required to build the web UI."
info "Node $(node --version)"

# ---------------------------------------------------------------------- backend
if [[ -z "${VIRTUAL_ENV:-}" && ! -d .venv ]]; then
  info "Creating a virtual environment in .venv"
  python3 -m venv .venv
fi
if [[ -z "${VIRTUAL_ENV:-}" && -d .venv ]]; then
  # shellcheck disable=SC1091
  source .venv/bin/activate
  info "Activated .venv"
fi

python3 -m pip install --upgrade pip >/dev/null
if [[ $MINIMAL -eq 1 ]]; then
  info "Installing the backend without the ML extras"
  warn "Embeddings will fall back to 'hash-dev', which is NOT semantic. Use --minimal for CI only."
  python3 -m pip install -e "backend[dev]"
else
  info "Installing the backend with sentence-transformers and the reranker (this pulls torch)"
  python3 -m pip install -e "backend[all,dev]"
fi

# --------------------------------------------------------------------- frontend
info "Installing frontend dependencies"
(cd frontend && npm install)
info "Building the web UI into backend/static"
(cd frontend && npm run build)

# -------------------------------------------------------------------------- env
if [[ ! -f .env ]]; then
  cp .env.example .env
  info "Created .env from .env.example"
fi

# ------------------------------------------------------------------------ ollama
if command -v ollama >/dev/null; then
  info "Ollama found: $(ollama --version 2>/dev/null || echo 'installed')"
else
  warn "Ollama is not installed. Retrieval works without it; generation does not."
  warn "Install from https://ollama.com, then: ollama pull deepseek-r1:1.5b"
fi

echo
info "Setup complete. Next:"
echo "    edgerag doctor      # verify the environment"
echo "    edgerag demo        # index the bundled sample documents"
echo "    edgerag serve       # http://localhost:8000"
