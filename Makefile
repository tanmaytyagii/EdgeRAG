# EdgeRAG developer tasks. `make help` lists everything.
SHELL := /bin/bash
PY    ?= python3
PIP   ?= $(PY) -m pip

.DEFAULT_GOAL := help
.PHONY: help setup setup-minimal install install-local frontend dev serve test lint typecheck format doctor demo screenshots clean docker-build docker-up

help: ## Show this help
	@grep -hE '^[a-zA-Z_-]+:.*?## ' $(MAKEFILE_LIST) | awk 'BEGIN{FS=":.*?## "}{printf "  \033[1m%-16s\033[0m %s\n", $$1, $$2}'

setup: ## Full local setup: venv, backend with ML extras, frontend build, .env
	./scripts/setup.sh

setup-minimal: ## Setup without torch (CI-style; embeddings fall back to hash-dev)
	./scripts/setup.sh --minimal

install: ## Install the backend in editable mode (no ML dependencies)
	$(PIP) install -e "backend[dev]"

install-local: ## Install with sentence-transformers and the cross-encoder reranker
	$(PIP) install -e "backend[all,dev]"

frontend: ## Build the web UI into backend/static
	cd frontend && npm install && npm run build

dev: ## Run the API and the Vite dev server together (two processes)
	@trap 'kill 0' EXIT; \
	$(PY) -m edgerag.cli serve --reload & \
	cd frontend && npm run dev; \
	wait

serve: ## Serve the API and the built UI on http://localhost:8000
	$(PY) -m edgerag.cli serve

test: ## Run the test suite
	cd backend && $(PY) -m pytest -q

lint: ## Lint the backend
	cd backend && $(PY) -m ruff check .

typecheck: ## Type-check the frontend
	cd frontend && npm run typecheck

format: ## Auto-format the backend
	cd backend && $(PY) -m ruff format . && $(PY) -m ruff check --fix .

doctor: ## Check Python, dependencies, Ollama, models and storage
	$(PY) -m edgerag.cli doctor

demo: ## Index the bundled sample documents into a demo knowledge base
	$(PY) -m edgerag.cli demo

screenshots: ## Capture README screenshots from a running instance (needs Playwright)
	$(PY) scripts/capture-screenshots.py

clean: ## Remove build artifacts and caches
	rm -rf backend/static frontend/dist frontend/node_modules backend/*.egg-info
	find . -name __pycache__ -type d -prune -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache .mypy_cache

docker-build: ## Build the container image
	docker build -t edgerag:local .

docker-up: ## Start EdgeRAG and Ollama with compose
	docker compose up --build
