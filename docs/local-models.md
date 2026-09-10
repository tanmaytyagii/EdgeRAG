# Local models

Three models are involved, and only one of them is the LLM.

## Generation (Ollama)

```bash
ollama pull deepseek-r1:1.5b     # ~1.1 GB, fast, the default
ollama pull qwen2.5:7b           # ~4.7 GB, noticeably better answers
ollama pull llama3.1:8b          # ~4.9 GB
```

Set with `EDGERAG_LLM__MODEL`, or from Settings, which lists the models Ollama actually has
pulled rather than a hardcoded menu.

Rough CPU-only guidance: a 1.5B model answers in tens of seconds; a 7B model in minutes. With
a GPU, both are far faster. EdgeRAG streams tokens, so you see progress immediately either way.

**Reasoning models** (DeepSeek-R1 and similar) emit `<think>…</think>` before the answer.
EdgeRAG strips these from both the final answer and the stream, holding back partial tokens so
a half-open tag never flashes on screen. Disable with
`EDGERAG_LLM__STRIP_REASONING_TAGS=false` if you want to see them.

## Embeddings

| Model | Dimensions | Size | Notes |
| --- | --- | --- | --- |
| `all-MiniLM-L6-v2` | 384 | ~90 MB | Default. Good quality per megabyte. |
| `all-mpnet-base-v2` | 768 | ~420 MB | Better, slower, larger index. |
| `bge-small-en-v1.5` | 384 | ~130 MB | Strong on retrieval benchmarks. |

**Changing the embedding model invalidates every existing index.** Vectors from different
models are not comparable. EdgeRAG will not silently re-embed your corpus: it tells you a
re-index is required and leaves the decision to you.

The `hash-dev` provider is a deterministic hashing embedder used so CI and smoke tests can run
without torch. It has **no semantic meaning** — a query only matches on lexical accident. It is
labelled as development-only in Settings and `doctor`. Never evaluate retrieval quality with it.

## Reranking

See [reranking.md](reranking.md). Default `ms-marco-MiniLM-L-6-v2`, ~80 MB, and the best
quality-per-megabyte in the whole stack.

## Disk and first run

The first query after installing downloads the embedding and reranker weights from Hugging
Face (roughly 170 MB with the defaults) into `HF_HOME`. That is the one moment EdgeRAG needs
the network. Afterwards it runs fully offline; pre-seed the cache if the machine will never
have connectivity.
