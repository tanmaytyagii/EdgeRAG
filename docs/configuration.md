# Configuration

Three sources, in increasing precedence: defaults in `core/config.py`, a `.env` file,
environment variables. The Settings page writes runtime overrides that apply immediately.

Prefix is `EDGERAG_`; nested settings use a double underscore:

```bash
EDGERAG_RETRIEVAL__CONTEXT_TOP_K=8
EDGERAG_LLM__MODEL=qwen2.5:7b
```

## Storage

| Setting | Default | Notes |
| --- | --- | --- |
| `EDGERAG_DATA_DIR` | `~/.edgerag` | Holds `edgerag.db`, `documents/`, `indexes/`, `cache/`. `~` is expanded. |

## Chunking — `EDGERAG_CHUNKING__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `CHUNK_SIZE` | `800` | Characters. Larger keeps more context per chunk, dilutes retrieval. |
| `CHUNK_OVERLAP` | `100` | Prevents a fact being split at a boundary. |
| `MIN_CHUNK_CHARS` | `48` | Fragments below this are dropped. |
| `SPLITTER` | `recursive` | Paragraph → sentence → word. |

Applies to newly indexed documents only. Re-index to adopt new values.

## Embeddings — `EDGERAG_EMBEDDING__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `PROVIDER` | `sentence-transformers` | Or `hash-dev` (development only, not semantic). |
| `MODEL` | `sentence-transformers/all-MiniLM-L6-v2` | |
| `DIMENSIONS` | `384` | Must match the model. |
| `BATCH_SIZE` | `64` | Lower it if memory is tight. |
| `NORMALIZE` | `true` | Unit-normalize vectors so dot product is cosine. |

## Vector store — `EDGERAG_VECTOR_STORE__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `PROVIDER` | `numpy` | Or `chroma` (needs the `[chroma]` extra). Both persist to disk. |

## Retrieval — `EDGERAG_RETRIEVAL__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `DENSE_TOP_K` | `40` | |
| `SPARSE_TOP_K` | `40` | Keep comparable to dense. |
| `RERANK_TOP_K` | `40` | Main latency knob. |
| `CONTEXT_TOP_K` | `5` | Chunks reaching the model. |
| `FUSION_TOP_K` | `40` | Candidates kept after fusion, before reranking. |
| `RRF_K` | `60` | Higher flattens the influence of top ranks. |
| `DENSE_WEIGHT` / `SPARSE_WEIGHT` | `1.0` | Favour one arm. |

Per-request overrides are accepted by `/api/search` without changing global settings.

## Reranker — `EDGERAG_RERANKER__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `PROVIDER` | `cross-encoder` | Or `none`. |
| `MODEL` | `cross-encoder/ms-marco-MiniLM-L-6-v2` | |
| `BATCH_SIZE` | `32` | |

## LLM — `EDGERAG_LLM__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `PROVIDER` | `ollama` | |
| `BASE_URL` | `http://localhost:11434` | |
| `MODEL` | `deepseek-r1:1.5b` | |
| `TEMPERATURE` | `0.1` | Keep low; grounded answers should not be creative. |
| `MAX_TOKENS` | `1024` | |
| `STRIP_REASONING_TAGS` | `true` | Removes `<think>` blocks. |
| `TIMEOUT_SECONDS` | `180` | Raise for large models on CPU. |

## Confidence — `EDGERAG_CONFIDENCE__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `ENABLED` | `true` | Off means answering from weak evidence. |
| `MIN_TOP_SCORE` | `0.0` | Raw reranker logit floor. |
| `MIN_SUPPORTING_CHUNKS` | `1` | |
| `MIN_CONFIDENCE` | `0.35` | Blended four-signal floor. |
| `ABSTAIN_MESSAGE` | *(see `.env.example`)* | What EdgeRAG says when it refuses. |

## Context — `EDGERAG_CONTEXT__*`

| Setting | Default | Notes |
| --- | --- | --- |
| `MAX_CONTEXT_CHARS` | `6000` | Total characters assembled into the prompt. |
| `MAX_CHARS_PER_CHUNK` | `1600` | Per-chunk cap, so one long chunk cannot crowd out the rest. |

Raise `MIN_CONFIDENCE` if you see confident answers from thin evidence; lower it if EdgeRAG
abstains on questions your corpus does answer. Check the Search Explorer first — frequent
abstention usually means retrieval, not the threshold.

## Uploads — `EDGERAG_UPLOADS__*`

| Setting | Default |
| --- | --- |
| `MAX_FILE_BYTES` | `104857600` (100 MB) |
| `ALLOWED_EXTENSIONS` | `.pdf,.txt,.md,.markdown,.docx` |

List-valued settings accept a comma-separated string or a JSON array.


## Server

| Setting | Default | Notes |
| --- | --- | --- |
| `EDGERAG_APP_NAME` | `EdgeRAG` | Shown in the API title. |
| `EDGERAG_HOST` | `127.0.0.1` | Localhost only by default, deliberately. |
| `EDGERAG_PORT` | `8000` | |
| `EDGERAG_CORS_ORIGINS` | `http://localhost:5173,http://127.0.0.1:5173` | Only needed for the Vite dev server. |
| `EDGERAG_LOG_LEVEL` | `INFO` | |
| `EDGERAG_DEVELOPER_MODE` | `false` | Adds internals and stack traces to API errors. |
| `EDGERAG_TELEMETRY_ENABLED` | `false` | Reserved and unused. No code path sends anything anywhere. |

EdgeRAG has no authentication. Binding it to `0.0.0.0` exposes your documents to the network;
put it behind a reverse proxy with auth if you must.
