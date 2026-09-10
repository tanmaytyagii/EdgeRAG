# Ingestion

Seven stages, each reported to the UI with real progress: `queued → parsing → chunking →
embedding → indexing → validating → ready`.

## Upload safety

Before anything is parsed:

- the extension must be in `upload.allowed_extensions`, otherwise `415`;
- the body is streamed to disk in 1 MB blocks and aborted past `upload.max_file_bytes` (`413`) — the file is never buffered whole in memory;
- a SHA-256 is computed during that stream, so duplicates are detectable;
- the filename is sanitized, and the file is stored as `{document_id}{suffix}` — the original name is metadata only;
- every path is resolved and asserted to be inside the data directory, so `../../etc/passwd` cannot escape (`tests/test_paths.py`).

Uploaded files are never executed, and nothing is deserialized from them.

## Parsing

| Type | Loader | Notes |
| --- | --- | --- |
| `.pdf` | PyMuPDF | Text per page. Page numbers are retained for citations. |
| `.txt`, `.md` | built-in | UTF-8 with a permissive fallback. |
| `.docx` | python-docx | Paragraph text. Needs the `[docx]` extra. |

Text extraction only — no embedded scripts, macros or objects are evaluated.

## Chunking

A recursive character splitter that prefers paragraph breaks, then sentences, then words.
Default 800 characters with 100 of overlap, discarding fragments under
`chunking.min_chunk_chars`.

Every chunk keeps `start_char` and `end_char` **relative to the source document**. This is what
makes the citation → viewer jump exact rather than approximate: the viewer can highlight the
precise span, not merely the page.

## Embedding and indexing

Chunks are embedded in batches (default 64) and written to the vector store, then appended to
the BM25 corpus. Both are persisted immediately, so a restart costs nothing.

## Cancellation and re-indexing

Cancellation is checked between stages; a cancelled document leaves no partial vectors.
Re-indexing deletes the document's chunks from both indexes first, so it is safe to run
repeatedly — it never accumulates duplicates.

## Logs

Each document keeps a timestamped ingestion log, visible from the Documents page. When
parsing fails, the log and the error message are shown together with a re-index button, rather
than a generic failure state.
