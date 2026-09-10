# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to
[Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

Nothing yet.

## [0.1.0] — 2026-09-09

First release. EdgeRAG began as a research notebook and this version is the productionised
system built from it.

### Added

**Retrieval**
- Hybrid dense + BM25 retrieval with weighted reciprocal rank fusion.
- Optional cross-encoder reranking, reported honestly when disabled.
- Four-signal confidence estimation (strength, margin, support, retriever agreement) with configurable abstention.
- Search Explorer showing dense, BM25, fused and reranked results separately, with every per-stage score.
- Per-query telemetry: stage latency and candidate counts, measured and surfaced in the UI and API.

**Grounding**
- System prompt constraining answers to the retrieved context, requiring citations and explicit insufficiency statements.
- Citation validation against the assembled context; invented markers are removed.
- Citation coverage measurement.
- Document viewer that opens a cited source at the highlighted passage.

**Ingestion**
- PDF, text, Markdown and Word loaders with page and character-offset tracking.
- Seven-stage pipeline with real progress, ingestion logs, cancellation and safe re-indexing.
- Streamed uploads with size limits, extension allowlist, filename sanitization and path-traversal defence.

**Application**
- Multiple knowledge bases with create, rename, duplicate, export, re-index and delete.
- Streaming chat over SSE with live stage status and an expandable answer trace.
- Overview dashboard reading real values from the index.
- Evaluation harness with retrieval, grounding and latency metrics.
- Settings covering retrieval budgets, chunking, models, abstention, privacy and developer mode.
- Command palette, keyboard shortcuts, dark and light themes, responsive layouts, reduced-motion support.

**Repository**
- Apache-2.0 license, contributing guide, code of conduct, security policy and roadmap.
- GitHub Actions CI matrix over Python 3.10–3.12, plus frontend type-check, build, and a Docker image build.
- Dependabot for pip, npm, GitHub Actions and Docker, grouped and monthly.
- Issue forms for bugs, features and retrieval-quality reports; a pull request template with the project's ground rules.
- `scripts/setup.sh` for one-command local setup and `scripts/capture-screenshots.py` for README images.
- `.env.example` documenting every setting, verified against the schema by a test.

**Engineering**
- Layered backend with `Protocol`-based providers for embeddings, vector stores, rerankers, LLMs and loaders.
- `RAGPipeline` usable without the web layer.
- Persistent NumPy and Chroma vector stores, and a persistent BM25 index.
- Structured errors carrying remediation guidance.
- `edgerag` CLI: `serve`, `ingest`, `query`, `list`, `models`, `eval`, `doctor`, `demo`.
- Test suite covering chunking, fusion, citations, confidence, path safety, the API and the pipeline.
- Docker image and compose file bundling Ollama.

### Fixed

Carried over from the prototype:

- Two syntax errors that made the notebook unrunnable as saved.
- An uninitialised `reranker` global that would have raised `NameError` on any reranking call.
- Naive fusion (concatenate and string-deduplicate) replaced with reciprocal rank fusion, so sparse-only results can outrank dense ones and agreement is rewarded.
- A sparse retriever capped at 5 results while the dense arm used 40, which made the keyword half nearly irrelevant.
- An in-memory Chroma client that rebuilt the entire vector index on every restart — 417 seconds for 3,200 chunks. Both stores now persist.
- A confidence check that printed a warning and answered anyway; the recorded run answered confidently on a top reranker score of −1.58. The same inputs now abstain.
- `<think>` reasoning blocks leaking into displayed answers.
- Answers with no way to trace a claim back to a document or page.
- Hardcoded persona, paths, models and chunk sizes, all now configurable.

### Changed

- List-valued settings (`EDGERAG_CORS_ORIGINS`, `EDGERAG_UPLOADS__ALLOWED_EXTENSIONS`) accept a comma-separated string as well as a JSON array, so a copied `.env.example` loads without editing.
- `EDGERAG_DATA_DIR` expands `~` and resolves to an absolute path, instead of creating a literal `~` directory.
- Removed the unused `aiofiles` dependency and a `npm run lint` script that referenced an ESLint setup the project does not have.

### Security

- Upload validation, path-traversal defence, sanitized filenames, no execution or deserialization of uploaded content, no telemetry. See [SECURITY.md](SECURITY.md).
- Four known advisories in the frontend toolchain are documented, scoped and left unpatched because each needs a major version bump. See the dependency table in [SECURITY.md](SECURITY.md).

### Notes

- The copyrighted textbook used during prototyping is deliberately **not** included. `samples/` contains original CC0 documents instead.

[Unreleased]: https://github.com/tanmaytyagii/EdgeRAG/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/tanmaytyagii/EdgeRAG/releases/tag/v0.1.0
