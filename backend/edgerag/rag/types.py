"""Core value objects shared by every stage of the pipeline."""
from __future__ import annotations

import hashlib
from dataclasses import dataclass, field
from typing import Any, Literal

Retriever = Literal["dense", "sparse", "hybrid"]


@dataclass
class Chunk:
    """A unit of indexed text with enough provenance to build a citation."""

    id: str
    document_id: str
    document_name: str
    text: str
    page: int | None = None
    ordinal: int = 0
    char_start: int = 0
    char_end: int = 0
    metadata: dict[str, Any] = field(default_factory=dict)

    @property
    def content_hash(self) -> str:
        return hashlib.sha256(self.text.encode("utf-8")).hexdigest()[:16]

    def to_dict(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "document_id": self.document_id,
            "document_name": self.document_name,
            "text": self.text,
            "page": self.page,
            "ordinal": self.ordinal,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "metadata": self.metadata,
        }


@dataclass
class ScoredChunk:
    """A chunk plus every score any stage has assigned to it.

    Scores are kept separate rather than overwritten so the Retrieval Explorer
    can show what each retriever thought independently of the final ordering.
    """

    chunk: Chunk
    dense_score: float | None = None
    dense_rank: int | None = None
    sparse_score: float | None = None
    sparse_rank: int | None = None
    fusion_score: float | None = None
    fusion_rank: int | None = None
    rerank_score: float | None = None
    rerank_rank: int | None = None

    @property
    def retrievers(self) -> list[str]:
        found = []
        if self.dense_rank is not None:
            found.append("dense")
        if self.sparse_rank is not None:
            found.append("sparse")
        return found

    @property
    def source(self) -> Retriever:
        found = self.retrievers
        if len(found) == 2:
            return "hybrid"
        return found[0] if found else "dense"  # type: ignore[return-value]

    def to_dict(self, *, include_text: bool = True, preview_chars: int = 320) -> dict[str, Any]:
        text = self.chunk.text
        return {
            "chunk_id": self.chunk.id,
            "document_id": self.chunk.document_id,
            "document_name": self.chunk.document_name,
            "page": self.chunk.page,
            "ordinal": self.chunk.ordinal,
            "char_start": self.chunk.char_start,
            "char_end": self.chunk.char_end,
            "text": text if include_text else None,
            "preview": text[:preview_chars],
            "source": self.source,
            "retrievers": self.retrievers,
            "dense_score": self.dense_score,
            "dense_rank": self.dense_rank,
            "sparse_score": self.sparse_score,
            "sparse_rank": self.sparse_rank,
            "fusion_score": self.fusion_score,
            "fusion_rank": self.fusion_rank,
            "rerank_score": self.rerank_score,
            "rerank_rank": self.rerank_rank,
        }


@dataclass
class Citation:
    """A validated pointer from a sentence in the answer back to a chunk."""

    index: int
    chunk_id: str
    document_id: str
    document_name: str
    page: int | None
    excerpt: str
    char_start: int
    char_end: int
    score: float | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "index": self.index,
            "chunk_id": self.chunk_id,
            "document_id": self.document_id,
            "document_name": self.document_name,
            "page": self.page,
            "excerpt": self.excerpt,
            "char_start": self.char_start,
            "char_end": self.char_end,
            "score": self.score,
        }


@dataclass
class RetrievalResult:
    """Everything the retriever saw, kept stage by stage for observability."""

    query: str
    dense: list[ScoredChunk] = field(default_factory=list)
    sparse: list[ScoredChunk] = field(default_factory=list)
    fused: list[ScoredChunk] = field(default_factory=list)
    reranked: list[ScoredChunk] = field(default_factory=list)
    selected: list[ScoredChunk] = field(default_factory=list)
    reranker_applied: bool = False
