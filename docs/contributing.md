# Working on EdgeRAG

See [../CONTRIBUTING.md](../CONTRIBUTING.md) for process. This file is about the code.

## Setup

```bash
pip install -e "backend[all,dev]"
cd frontend && npm install && cd ..
make dev       # API with reload + Vite on :5173, proxying /api
```

## The layering rule

`edgerag.rag` must never import from `edgerag.api`, `edgerag.db` or `edgerag.services`. If a
change to the pipeline needs a database, the design is wrong — pass the data in.

The practical test: `RAGPipeline` must remain constructible and testable with no server, no
database and no model, as `tests/test_pipeline.py` does with `ScriptedLLM`.

## Adding a provider

1. Implement the `Protocol` from `providers/base.py`.
2. Import heavy dependencies **inside** the class, not at module level — the base install has no torch.
3. Register it in the factory in the same module.
4. Add the setting to `core/config.py` and to `.env.example`.
5. Test it against the protocol, and make failure produce a `ProviderUnavailable` with a real remediation string.

## Adding an API endpoint

1. Schemas in `schemas/api.py`.
2. A router in `api/routes/`; keep logic in `services/` or `rag/`.
3. Types in `frontend/src/lib/types.ts` and a method in `lib/api.ts`. Components never call `fetch` directly.
4. An integration test in `tests/test_api.py`.

## Frontend conventions

- Colour carries meaning. Blue is dense retrieval, amber is BM25, green is agreement between them. Do not use those three for decoration.
- Numbers are `font-mono` with tabular figures, so they do not jitter while streaming.
- Every state a request can be in — loading, empty, error, success — has an explicit rendering. `ErrorState` takes a `remediation`.
- **No control may exist that does not work.** A disabled affordance with a reason is fine; a decorative one is not.

## Tests

```bash
make test        # pytest
make lint        # ruff
make typecheck   # tsc --noEmit
```

Tests must pass without torch, without Ollama and without network access. Anything requiring
a model belongs behind the `hash-dev` provider or a scripted double.
