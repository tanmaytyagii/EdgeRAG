"""Runs an evaluation set against a knowledge base and records the results."""
from __future__ import annotations

import math
import statistics
import threading
from typing import Any

from ..core.config import get_settings
from ..core.logging import get_logger
from ..db.models import EvalCase, EvalRun, KnowledgeBase
from ..db.session import session_scope
from ..rag.citations import citation_coverage
from ..services.engine import get_pipeline
from . import metrics as M

log = get_logger("evaluation.runner")


def _mean(values: list[float]) -> float | None:
    clean = [v for v in values if not math.isnan(v)]
    return round(statistics.fmean(clean), 4) if clean else None


def run_evaluation(run_id: str, retrieval_only: bool = False) -> None:
    settings = get_settings()
    with session_scope() as session:
        run = session.get(EvalRun, run_id)
        if run is None:
            return
        kb = session.get(KnowledgeBase, run.knowledge_base_id)
        collection = kb.collection
        case_ids = run.config.get("case_ids") or []
        cases = session.query(EvalCase).filter(EvalCase.id.in_(case_ids)).all() if case_ids else \
            session.query(EvalCase).filter(EvalCase.knowledge_base_id == kb.id).all()
        payloads = [
            {
                "id": c.id,
                "question": c.question,
                "expected_answer": c.expected_answer,
                "expected_keywords": c.expected_keywords or [],
                "expected_documents": c.expected_documents or [],
            }
            for c in cases
        ]

    pipeline = get_pipeline(collection, settings)
    results: list[dict[str, Any]] = []

    for case in payloads:
        try:
            if retrieval_only:
                retrieval, trace = pipeline.retrieve(case["question"])
                selected = retrieval.selected
                answer_text, citations, abstained = "", [], False
            else:
                answer = pipeline.answer(case["question"])
                selected = answer.retrieval.selected if answer.retrieval else []
                trace = answer.trace
                answer_text = answer.text
                citations = answer.citations
                abstained = answer.abstained

            documents = [c.chunk.document_name for c in selected]
            context_texts = [c.chunk.text for c in selected]
            case_metrics = {
                "context_precision": M.context_precision(documents, case["expected_documents"]),
                "context_recall": M.context_recall(documents, case["expected_documents"]),
                "keyword_recall": (
                    M.keyword_recall(answer_text, case["expected_keywords"]) if not retrieval_only else float("nan")
                ),
                "answer_overlap": (
                    M.answer_overlap(answer_text, case["expected_answer"]) if not retrieval_only else float("nan")
                ),
                "faithfulness": M.faithfulness(answer_text, context_texts) if not retrieval_only else float("nan"),
            }
            results.append(
                {
                    "case_id": case["id"],
                    "question": case["question"],
                    "answer": answer_text,
                    "abstained": abstained,
                    "latency_ms": round(trace.total_ms, 2) if trace else 0.0,
                    "stage_ms": {s.name: round(s.duration_ms, 2) for s in (trace.stages if trace else [])},
                    "citation_count": len(citations),
                    "citation_coverage": (
                        round(citation_coverage(answer_text, citations), 4) if not retrieval_only else None
                    ),
                    "retrieved": [
                        {"document": c.chunk.document_name, "page": c.chunk.page,
                         "score": c.rerank_score if c.rerank_score is not None else c.fusion_score}
                        for c in selected
                    ],
                    "metrics": {k: (None if math.isnan(v) else round(v, 4)) for k, v in case_metrics.items()},
                    "error": None,
                }
            )
        except Exception as exc:  # noqa: BLE001 - one bad case must not kill the run
            log.warning("Evaluation case failed: %s", exc)
            results.append({"case_id": case["id"], "question": case["question"], "error": str(exc), "metrics": {}})

    scored = [r for r in results if not r.get("error")]
    summary = {
        "cases": len(results),
        "failed": len(results) - len(scored),
        "abstained": sum(1 for r in scored if r.get("abstained")),
        "mean_latency_ms": _mean([r["latency_ms"] for r in scored]) if scored else None,
        "metrics": {
            key: _mean([r["metrics"].get(key) for r in scored if r["metrics"].get(key) is not None])
            for key in ("context_precision", "context_recall", "keyword_recall", "answer_overlap", "faithfulness")
        },
        "mean_citation_coverage": (
            _mean([r["citation_coverage"] for r in scored if r.get("citation_coverage") is not None])
            if scored
            else None
        ),
        "retrieval_only": retrieval_only,
    }

    with session_scope() as session:
        run = session.get(EvalRun, run_id)
        if run:
            run.results = results
            run.summary = summary
            run.status = "completed"


def run_in_background(run_id: str, retrieval_only: bool = False) -> None:
    threading.Thread(target=run_evaluation, args=(run_id, retrieval_only), daemon=True).start()
