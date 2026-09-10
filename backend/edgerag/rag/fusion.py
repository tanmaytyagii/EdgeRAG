"""Reciprocal Rank Fusion for hybrid retrieval.

The prototype concatenated the dense and sparse lists and deduplicated by exact
string equality, which has two problems: a chunk found by *both* retrievers was
not rewarded for it, and the merged order was simply "all dense results, then
whatever sparse added" -- the sparse retriever could never outrank the dense one.

RRF fixes both. Each retriever contributes 1/(k + rank) to a chunk's score, so
agreement between retrievers compounds and neither list dominates by position.
Scores are never compared across retrievers directly, which matters because
cosine similarity and BM25 are on incomparable scales.
"""
from __future__ import annotations

from .types import ScoredChunk


def reciprocal_rank_fusion(
    dense: list[ScoredChunk],
    sparse: list[ScoredChunk],
    *,
    k: int = 60,
    dense_weight: float = 1.0,
    sparse_weight: float = 1.0,
    top_k: int | None = None,
) -> list[ScoredChunk]:
    merged: dict[str, ScoredChunk] = {}
    scores: dict[str, float] = {}

    def absorb(items: list[ScoredChunk], weight: float, kind: str) -> None:
        for rank, item in enumerate(items, start=1):
            key = item.chunk.id
            existing = merged.get(key)
            if existing is None:
                existing = ScoredChunk(chunk=item.chunk)
                merged[key] = existing
                scores[key] = 0.0
            if kind == "dense":
                existing.dense_score = item.dense_score
                existing.dense_rank = rank
            else:
                existing.sparse_score = item.sparse_score
                existing.sparse_rank = rank
            scores[key] += weight / (k + rank)

    absorb(dense, dense_weight, "dense")
    absorb(sparse, sparse_weight, "sparse")

    ordered = sorted(merged.values(), key=lambda sc: (-scores[sc.chunk.id], sc.chunk.id))
    for rank, item in enumerate(ordered, start=1):
        item.fusion_score = scores[item.chunk.id]
        item.fusion_rank = rank
    return ordered[:top_k] if top_k else ordered
