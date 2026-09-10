# API reference

Base URL `http://localhost:8000`. Interactive docs at `/api/docs`.

There is no authentication — EdgeRAG binds to localhost and assumes a single trusted user.

## Errors

Every failure returns the same shape:

```json
{
  "code": "llm_unavailable",
  "message": "Could not reach Ollama at http://localhost:11434.",
  "remediation": "Start Ollama with `ollama serve`, then retry."
}
```

`details` is present only when `developer_mode` is on. Codes include `not_found`,
`validation_error`, `conflict`, `unsupported_file` (415), `file_too_large` (413),
`document_parse_failed` (422), `index_not_ready` (409), `llm_unavailable` (503),
`embedding_unavailable` (503), `reranker_unavailable` (503).

The frontend renders `remediation` as the actionable line and never shows a raw stack trace.

## System

- `GET /api/health` — per-component status with remediation hints.
- `GET /api/models` — installed Ollama models plus configured embedding and reranker models.
- `GET /api/settings` / `PATCH /api/settings` — read and update. The response includes `reindex_required` when a change affects existing indexes.
- `GET /api/overview` — dashboard figures, all read from the database and indexes.

## Knowledge bases

- `GET /api/knowledge-bases`
- `POST /api/knowledge-bases` — `{ name, description? }`
- `GET|PATCH|DELETE /api/knowledge-bases/{id}`
- `POST /api/knowledge-bases/{id}/duplicate` — copies configuration, not documents
- `GET /api/knowledge-bases/{id}/export` — JSON manifest

## Documents

- `GET /api/documents?knowledge_base_id=…`
- `POST /api/documents` — multipart; returns immediately, indexing continues in the background
- `GET /api/documents/{id}` — includes `status`, `stage`, `progress` and the ingestion log
- `GET /api/documents/{id}/file` — the original file, for the viewer
- `GET /api/documents/{id}/chunks` — indexed chunks with character offsets
- `POST /api/documents/{id}/reindex`
- `POST /api/documents/{id}/cancel`
- `DELETE /api/documents/{id}` — removes it from both indexes and from disk

## Search

`POST /api/search`

```json
{
  "knowledge_base_id": "…",
  "query": "reciprocal rank fusion",
  "overrides": { "dense_top_k": 60, "context_top_k": 8 }
}
```

Returns `dense`, `sparse`, `fused`, `reranked` and `selected` lists — each candidate carrying
its rank and score from every stage — plus `reranker_applied`, `config` and the full `trace`.
No generation happens.

`POST /api/retrieval/debug` returns the same with additional per-stage internals.

## Chat

`POST /api/chat` → `{ answer, citations[], confidence, abstained, trace, model, conversation_id }`.

`POST /api/chat/stream` → SSE. Event order is stable and asserted in the tests:

```
conversation → stage* → confidence → candidates → token* → done
```

`error` may replace `done`. `token` carries `{ "text": "…" }`; `done` carries the validated
answer, citations and trace. Reasoning tokens are withheld from the stream when
`strip_reasoning_tags` is on.

## Evaluation

- `GET|POST /api/evaluation/cases`
- `DELETE /api/evaluation/cases/{id}`
- `POST /api/evaluation/runs` — `{ knowledge_base_id, retrieval_only? }`
- `GET /api/evaluation/runs?knowledge_base_id=…`
- `GET /api/evaluation/runs/{id}` — summary and per-case results
