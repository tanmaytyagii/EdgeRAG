"""Hybrid retriever: dense + sparse + reciprocal rank fusion + cross-encoder rerank.

Every stage records its own timings and candidate counts into the supplied
QueryTrace. The Retrieval Explorer and the pipeline visualization in the UI read
that trace directly.
"""
from __future__ import annotations

from ..core.config import RerankerSettings, RetrievalSettings
from ..core.errors import RerankerUnavailableError
from ..core.logging import get_logger
from ..core.telemetry import QueryTrace
from .bm25 import BM25Index
from .fusion import reciprocal_rank_fusion
from .types import Chunk, RetrievalResult, ScoredChunk

log = get_logger("rag.retriever")


def chunk_from_payload(chunk_id: str, payload: dict) -> Chunk:
    return Chunk(
        id=chunk_id,
        document_id=payload.get("document_id", ""),
        document_name=payload.get("document_name", ""),
        text=payload.get("text", ""),
        page=payload.get("page"),
        ordinal=int(payload.get("ordinal", 0) or 0),
        char_start=int(payload.get("char_start", 0) or 0),
        char_end=int(payload.get("char_end", 0) or 0),
    )


class HybridRetriever:
    def __init__(
        self,
        *,
        embeddings,
        vector_store,
        bm25: BM25Index,
        reranker,
        collection: str,
        settings: RetrievalSettings,
        reranker_settings: RerankerSettings,
    ) -> None:
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.bm25 = bm25
        self.reranker = reranker
        self.collection = collection
        self.settings = settings
        self.reranker_settings = reranker_settings

    def retrieve(self, query: str, trace: QueryTrace, *, overrides: RetrievalSettings | None = None) -> RetrievalResult:
        config = overrides or self.settings
        result = RetrievalResult(query=query)

        with trace.stage("query_processing") as metrics:
            normalized = " ".join(query.split())
            metrics.update({"characters": len(normalized), "terms": len(normalized.split())})

        with trace.stage("dense_retrieval") as metrics:
            vector = self.embeddings.embed_query(normalized)
            hits = self.vector_store.query(self.collection, vector, config.dense_top_k)
            result.dense = [
                ScoredChunk(chunk=chunk_from_payload(cid, payload), dense_score=score, dense_rank=rank)
                for rank, (cid, score, payload) in enumerate(hits, start=1)
            ]
            metrics.update({
                "candidates": len(result.dense),
                "model": getattr(self.embeddings, "name", "unknown"),
                "top_score": round(result.dense[0].dense_score, 4) if result.dense else None,
            })

        with trace.stage("sparse_retrieval") as metrics:
            result.sparse = self.bm25.search(normalized, config.sparse_top_k)
            metrics.update({
                "candidates": len(result.sparse),
                "algorithm": "BM25Okapi",
                "top_score": round(result.sparse[0].sparse_score, 4) if result.sparse else None,
            })

        with trace.stage("hybrid_fusion") as metrics:
            result.fused = reciprocal_rank_fusion(
                result.dense,
                result.sparse,
                k=config.rrf_k,
                dense_weight=config.dense_weight,
                sparse_weight=config.sparse_weight,
                top_k=config.fusion_top_k,
            )
            overlap = sum(1 for c in result.fused if len(c.retrievers) == 2)
            metrics.update({
                "unique_candidates": len(result.fused),
                "found_by_both": overlap,
                "strategy": f"RRF(k={config.rrf_k})",
            })

        with trace.stage("reranking") as metrics:
            pool = result.fused[: config.rerank_top_k]
            if getattr(self.reranker, "name", "none") == "none" or not pool:
                result.reranked = pool
                result.reranker_applied = False
                metrics.update({"applied": False, "reason": "Reranker disabled" if pool else "No candidates",
                                "scored": 0, "selected": min(len(pool), config.context_top_k)})
            else:
                try:
                    scores = self.reranker.score(normalized, [c.chunk.text for c in pool])
                    for candidate, score in zip(pool, scores, strict=True):
                        candidate.rerank_score = score
                    ordered = sorted(pool, key=lambda c: -(c.rerank_score or float("-inf")))
                    for rank, candidate in enumerate(ordered, start=1):
                        candidate.rerank_rank = rank
                    result.reranked = ordered
                    result.reranker_applied = True
                    metrics.update({
                        "applied": True,
                        "model": getattr(self.reranker, "name", "unknown"),
                        "scored": len(pool),
                        "selected": min(len(ordered), config.context_top_k),
                        "top_score": round(ordered[0].rerank_score, 4) if ordered else None,
                    })
                except RerankerUnavailableError as exc:
                    # Degrade to fusion order rather than failing the whole query,
                    # and say so instead of presenting fusion scores as rerank scores.
                    log.warning("Reranker unavailable, falling back to fusion order: %s", exc)
                    result.reranked = pool
                    result.reranker_applied = False
                    metrics.update({"applied": False, "reason": exc.message, "scored": 0})

        result.selected = result.reranked[: config.context_top_k]
        return result
