"""The RAG pipeline.

Constructed from explicit providers -- no globals, no notebook state. The whole
object graph can be built in a test with fakes and exercised without a server.
"""
from __future__ import annotations

from collections.abc import Iterator
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from ..core.config import Settings
from ..core.errors import IndexNotReadyError
from ..core.logging import get_logger
from ..core.telemetry import QueryTrace
from . import citations as citation_utils
from .bm25 import BM25Index
from .confidence import ConfidenceReport, assess
from .context import build_context
from .prompts import build_prompt
from .retriever import HybridRetriever
from .types import Citation, RetrievalResult, ScoredChunk

log = get_logger("rag.pipeline")


@dataclass
class Answer:
    question: str
    text: str
    citations: list[Citation] = field(default_factory=list)
    confidence: ConfidenceReport | None = None
    retrieval: RetrievalResult | None = None
    trace: QueryTrace | None = None
    abstained: bool = False
    model: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return {
            "question": self.question,
            "answer": self.text,
            "abstained": self.abstained,
            "model": self.model,
            "citations": [c.to_dict() for c in self.citations],
            "confidence": self.confidence.to_dict() if self.confidence else None,
            "trace": self.trace.to_dict() if self.trace else None,
            "context": [c.to_dict(include_text=False) for c in (self.retrieval.selected if self.retrieval else [])],
        }


class RAGPipeline:
    def __init__(
        self, *, settings: Settings, embeddings, vector_store, reranker, llm,
        collection: str, index_root: Path,
    ) -> None:
        self.settings = settings
        self.embeddings = embeddings
        self.vector_store = vector_store
        self.reranker = reranker
        self.llm = llm
        self.collection = collection
        self.bm25 = BM25Index(index_root / "bm25", collection)
        self.retriever = HybridRetriever(
            embeddings=embeddings,
            vector_store=vector_store,
            bm25=self.bm25,
            reranker=reranker,
            collection=collection,
            settings=settings.retrieval,
            reranker_settings=settings.reranker,
        )

    # -- retrieval only -------------------------------------------------

    def retrieve(self, query: str, *, overrides=None) -> tuple[RetrievalResult, QueryTrace]:
        trace = QueryTrace(query=query)
        if self.bm25.count() == 0 and self.vector_store.count(self.collection) == 0:
            raise IndexNotReadyError("This knowledge base has no indexed content yet.")
        result = self.retriever.retrieve(query, trace, overrides=overrides)
        trace.finish()
        return result, trace

    # -- full answer ----------------------------------------------------

    def answer(self, question: str, *, overrides=None) -> Answer:
        trace = QueryTrace(query=question)
        result = self.retriever.retrieve(question, trace, overrides=overrides)
        report = assess(result.selected, self.settings.confidence, reranker_applied=result.reranker_applied)

        if not report.should_answer:
            trace.finish()
            return Answer(
                question=question,
                text=self.settings.confidence.abstain_message,
                confidence=report,
                retrieval=result,
                trace=trace,
                abstained=True,
                model=self.llm.model,
            )

        built = build_context(result.selected, self.settings.context)
        result.selected = built.used
        system, user = build_prompt(question, built.text)

        with trace.stage("generation") as metrics:
            raw = self.llm.generate(system, user)
            metrics.update({"model": self.llm.model, "characters": len(raw)})

        text, cites = self._finalize(raw, built.used)
        trace.finish()
        abstained = "INSUFFICIENT_EVIDENCE" in raw
        if abstained:
            text = self.settings.confidence.abstain_message
            cites = []
        return Answer(question, text, cites, report, result, trace, abstained, self.llm.model)

    def stream(self, question: str, *, overrides=None) -> Iterator[dict[str, Any]]:
        """Yield typed events. Consumed by the SSE endpoint and the CLI."""
        trace = QueryTrace(query=question)
        try:
            result = self.retriever.retrieve(question, trace, overrides=overrides)
        except Exception as exc:  # noqa: BLE001 - converted to an event by the caller
            raise exc

        for stage in trace.stages:
            yield {"type": "stage", "stage": stage.to_dict()}

        report = assess(result.selected, self.settings.confidence, reranker_applied=result.reranker_applied)
        yield {"type": "confidence", "confidence": report.to_dict()}
        yield {"type": "candidates", "candidates": [c.to_dict(include_text=False) for c in result.selected]}

        if not report.should_answer:
            trace.finish()
            yield {"type": "token", "text": self.settings.confidence.abstain_message}
            yield {
                "type": "done", "abstained": True, "citations": [],
                "trace": trace.to_dict(), "model": self.llm.model,
            }
            return

        built = build_context(result.selected, self.settings.context)
        system, user = build_prompt(question, built.text)

        yield {"type": "generation_started", "model": self.llm.model}
        buffer: list[str] = []
        emitted = 0
        in_reasoning = False
        import time as _time

        start = _time.perf_counter()
        for piece in self.llm.stream(system, user):
            buffer.append(piece)
            joined = "".join(buffer)
            # Hold back tokens while the model is inside a <think> block so the
            # user never sees the chain of thought.
            lowered = joined.lower()
            if not in_reasoning and "<think" in lowered[emitted:]:
                in_reasoning = True
            if in_reasoning:
                if "</think>" in lowered:
                    in_reasoning = False
                    cleaned = citation_utils.strip_reasoning(joined)
                    emitted = len(joined)
                    if cleaned:
                        yield {"type": "token", "text": cleaned}
                continue
            fresh = joined[emitted:]
            emitted = len(joined)
            if fresh:
                yield {"type": "token", "text": fresh}

        raw = "".join(buffer)
        trace.stages.append(
            type(trace.stages[0])(name="generation", duration_ms=(_time.perf_counter() - start) * 1000,
                                  metrics={"model": self.llm.model, "characters": len(raw)})
        )
        text, cites = self._finalize(raw, built.used)
        trace.finish()
        abstained = "INSUFFICIENT_EVIDENCE" in raw
        yield {
            "type": "done",
            "abstained": abstained,
            "answer": self.settings.confidence.abstain_message if abstained else text,
            "citations": [] if abstained else [c.to_dict() for c in cites],
            "trace": trace.to_dict(),
            "model": self.llm.model,
            "citation_coverage": citation_utils.citation_coverage(text, cites),
        }

    def _finalize(self, raw: str, context_chunks: list[ScoredChunk]) -> tuple[str, list[Citation]]:
        text = citation_utils.strip_reasoning(raw) if self.settings.llm.strip_reasoning_tags else raw.strip()
        return citation_utils.extract_citations(text, context_chunks)

    def health(self) -> dict[str, Any]:
        return {
            "embeddings": self.embeddings.health(),
            "reranker": self.reranker.health(),
            "llm": self.llm.health(),
            "vector_store": self.vector_store.health(),
            "chunks_indexed": self.bm25.count(),
        }
