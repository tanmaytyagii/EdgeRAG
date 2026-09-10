# Roadmap

Directional, not a set of promises. Dates are deliberately absent; issues and pull requests
move things faster than this file does.

## Now — 0.1.x

Hardening what exists.

- Broader PDF coverage: multi-column layouts, headers and footers, footnote handling.
- Incremental BM25 updates instead of rebuilding a collection's corpus.
- Better duplicate detection at upload time using the SHA-256 already computed.
- More evaluation cases shipped with the samples.
- Upgrade Vite and React Router to their next majors, clearing the dependency advisories listed in [SECURITY.md](SECURITY.md).

## Next — 0.2

Reducing the cost of running EdgeRAG well.

- **A semantic benchmark suite.** Retrieval quality measured with real embedding models on a corpus large enough to mean something, so the README can publish quality numbers rather than only latency.
- **ONNX embedding provider.** The largest install cost today is torch. An ONNX runtime path would cut installation to a fraction of its current size and make the Docker image genuinely useful out of the box.
- **llama.cpp provider.** A second `LLMProvider` so Ollama is a choice rather than a requirement.
- **Table-aware parsing.** Tables currently flatten into prose and retrieve badly.
- **Approximate vector search.** The exact NumPy store is correct and fine to tens of thousands of chunks. An HNSW option matters beyond that.
- **Per-knowledge-base retrieval settings** persisted, rather than global settings plus per-request overrides.

## Later — 0.3 and beyond

- **Query decomposition** for multi-part questions, with each sub-query traced separately.
- **Metadata filtering** — restrict retrieval by document, date or tag.
- **Conversation-aware retrieval** that rewrites follow-up questions using prior turns.
- **Model-graded evaluation** as an opt-in metric alongside the lexical ones.
- **Export answers** with their citations to Markdown or PDF.
- **Optional multi-user mode** with authentication, for shared self-hosting.

## Explicitly not planned

- **A hosted service.** EdgeRAG is local-first; that is the point.
- **Telemetry.** Not opt-in, not anonymous, not at all.
- **Bundling third-party documents.** Sample data stays original or public domain.
- **Cloud model providers as a default.** A provider could be contributed, but nothing that sends your documents off the machine will ever be the default.
