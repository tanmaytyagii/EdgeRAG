"""Persistent BM25 sparse index.

The prototype rebuilt BM25 in memory from the notebook's `chunks` global on every
session and hardcoded k=5, which silently capped the sparse arm of the "hybrid"
search at five candidates while the dense arm returned forty.
"""
from __future__ import annotations

import json
import re
import threading
from pathlib import Path

from ..core.logging import get_logger
from .types import Chunk, ScoredChunk

log = get_logger("rag.bm25")
_TOKEN = re.compile(r"[a-z0-9]+")


def tokenize(text: str) -> list[str]:
    return _TOKEN.findall(text.lower())


class BM25Index:
    """One index per knowledge base, persisted next to the vector store."""

    def __init__(self, root: Path, collection: str) -> None:
        self.root = root
        self.root.mkdir(parents=True, exist_ok=True)
        safe = "".join(ch for ch in collection if ch.isalnum() or ch in "-_")
        self.corpus_path = self.root / f"{safe}.corpus.jsonl"
        self._lock = threading.Lock()
        self._chunks: list[Chunk] | None = None
        self._model = None

    def _read_corpus(self) -> list[Chunk]:
        if self._chunks is not None:
            return self._chunks
        chunks: list[Chunk] = []
        if self.corpus_path.exists():
            with self.corpus_path.open("r", encoding="utf-8") as handle:
                for line in handle:
                    record = json.loads(line)
                    chunks.append(Chunk(**record))
        self._chunks = chunks
        return chunks

    def _write_corpus(self) -> None:
        with self.corpus_path.open("w", encoding="utf-8") as handle:
            for chunk in self._chunks or []:
                handle.write(json.dumps(chunk.to_dict()) + "\n")
        self._model = None

    def add(self, chunks: list[Chunk]) -> None:
        if not chunks:
            return
        with self._lock:
            existing = self._read_corpus()
            known = {c.id for c in existing}
            existing.extend(c for c in chunks if c.id not in known)
            self._chunks = existing
            self._write_corpus()

    def delete_document(self, document_id: str) -> int:
        with self._lock:
            existing = self._read_corpus()
            kept = [c for c in existing if c.document_id != document_id]
            removed = len(existing) - len(kept)
            if removed:
                self._chunks = kept
                self._write_corpus()
            return removed

    def drop(self) -> None:
        with self._lock:
            self.corpus_path.unlink(missing_ok=True)
            self._chunks, self._model = [], None

    def count(self) -> int:
        return len(self._read_corpus())

    def _ensure_model(self):
        if self._model is not None:
            return self._model
        chunks = self._read_corpus()
        if not chunks:
            return None
        from rank_bm25 import BM25Okapi

        self._model = BM25Okapi([tokenize(c.text) for c in chunks])
        return self._model

    def search(self, query: str, top_k: int) -> list[ScoredChunk]:
        model = self._ensure_model()
        if model is None:
            return []
        chunks = self._read_corpus()
        scores = model.get_scores(tokenize(query))
        ranked = sorted(range(len(chunks)), key=lambda i: -scores[i])[:top_k]
        results = []
        for rank, i in enumerate(ranked, start=1):
            if scores[i] <= 0:
                continue
            results.append(ScoredChunk(chunk=chunks[i], sparse_score=float(scores[i]), sparse_rank=rank))
        return results

    def get_chunk(self, chunk_id: str) -> Chunk | None:
        return next((c for c in self._read_corpus() if c.id == chunk_id), None)

    def document_chunks(self, document_id: str) -> list[Chunk]:
        return [c for c in self._read_corpus() if c.document_id == document_id]
