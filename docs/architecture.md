# Architecture

EdgeRAG is a layered application. The rule that keeps it maintainable: **each layer may only
call the layer beneath it, and the RAG engine may not know that a web server exists.**

```
CLI  ─┐
      ├─→ services  ─→  rag (RAGPipeline)  ─→  providers  ─→  models / disk
API  ─┘        │
               └─────→  db (SQLAlchemy)
```

## Layers

| Layer | Package | Responsibility |
| --- | --- | --- |
| Transport | `edgerag.api` | HTTP routing, validation, SSE, error translation. No retrieval logic. |
| Contracts | `edgerag.schemas` | Pydantic request and response models. The only shapes crossing the boundary. |
| Orchestration | `edgerag.services` | Pipeline caching, ingestion workflow, health aggregation. |
| Engine | `edgerag.rag` | Chunking, fusion, confidence, prompts, citations, `RAGPipeline`. |
| Capabilities | `edgerag.providers` | Embeddings, vector stores, rerankers, LLMs, loaders. |
| Persistence | `edgerag.db` | SQLAlchemy models, session scope. |
| Cross-cutting | `edgerag.core` | Config, errors, logging, telemetry, path safety. |

`RAGPipeline` accepts providers by constructor injection. That is what makes
`tests/test_pipeline.py` possible: it builds a pipeline with a `ScriptedLLM` and asserts on
grounding, `<think>` stripping, abstention, trace ordering and SSE event order, with no server
and no model.

## Provider interfaces

Defined as `typing.Protocol` in `providers/base.py`:

```python
class EmbeddingProvider(Protocol):
    dimensions: int
    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...

class VectorStore(Protocol):
    def add(self, chunks: list[Chunk], vectors: list[list[float]]) -> None: ...
    def search(self, vector: list[float], top_k: int) -> list[ScoredChunk]: ...
    def delete_document(self, document_id: str) -> None: ...

class RerankerProvider(Protocol):
    def rerank(self, query: str, chunks: list[ScoredChunk], top_k: int) -> list[ScoredChunk]: ...

class LLMProvider(Protocol):
    def complete(self, system: str, user: str) -> str: ...
    def stream(self, system: str, user: str) -> Iterator[str]: ...
```

Adding llama.cpp means writing one class and registering it in the factory. Nothing in
`rag/` changes.

Heavy dependencies are imported **inside** the provider that needs them, not at module import
time. That is why the API, the CLI and the entire test suite run without torch installed.

## Request lifecycle

1. A router validates the request into a schema.
2. `services.engine` returns a cached `RAGPipeline` for the collection, sharing provider
   instances process-wide so a model is loaded once.
3. The pipeline opens a `QueryTrace`. Every stage runs inside `trace.stage(name)`, which
   records duration and stage-specific metrics.
4. Retrieval, fusion, reranking, confidence, context assembly, generation.
5. Citations are validated against the assembled context; invalid markers are removed.
6. The router serializes the result. **The trace shown in the UI is the same object the
   pipeline measured** — there is no second, decorative source of metrics.

## Telemetry

`core/telemetry.py` is the single source of truth for numbers. A stage that is skipped is
recorded as skipped, not omitted, so the UI can say "reranking: skipped" rather than silently
showing a shorter pipeline.

## Persistence

SQLite with WAL and foreign keys on, holding knowledge bases, documents, conversations,
messages, evaluation cases and runs, and activity. Vectors live beside it as `.npy` plus a
`.jsonl` sidecar (or in Chroma, if selected); the BM25 corpus is a per-collection JSONL file.
All three are keyed by collection name (`kb_{id}`), so deleting a knowledge base removes all
of them.

## Frontend

React with a typed API client in `lib/api.ts`. No component calls `fetch` directly, so there is
exactly one place where the API contract lives. `lib/types.ts` mirrors the Pydantic schemas.
`lib/stream.ts` decodes the SSE event union. `lib/app-context.tsx` owns knowledge-base
selection, settings, theme and health polling.
