"""Abstention policy.

The prototype printed a warning when the top reranker score was negative and
then answered anyway -- one of its recorded runs generated a confident-sounding
answer from a context whose best chunk scored -1.58.

Confidence here is a blend of four independent signals rather than a single
threshold on a raw cross-encoder logit, because those logits are unbounded, model
specific, and not calibrated probabilities:

  strength  how good the best chunk is, squashed through a logistic
  margin    how far the best chunk is ahead of the runner-up
  support   how many chunks clear the bar, not just the top one
  agreement whether dense and sparse independently surfaced the same evidence

When the reranker is disabled the score-based signals are unavailable, so
confidence falls back to retriever agreement and support alone and the result is
labelled as such.
"""
from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any

from ..core.config import ConfidenceSettings
from .types import ScoredChunk


@dataclass
class ConfidenceReport:
    score: float
    should_answer: bool
    signals: dict[str, float]
    reason: str

    def to_dict(self) -> dict[str, Any]:
        return {
            "score": round(self.score, 4),
            "should_answer": self.should_answer,
            "signals": {k: round(v, 4) for k, v in self.signals.items()},
            "reason": self.reason,
        }


def _logistic(x: float, midpoint: float = 0.0, steepness: float = 0.45) -> float:
    return 1.0 / (1.0 + math.exp(-steepness * (x - midpoint)))


def assess(
    candidates: list[ScoredChunk],
    settings: ConfidenceSettings,
    *,
    reranker_applied: bool = True,
) -> ConfidenceReport:
    if not candidates:
        return ConfidenceReport(0.0, False, {}, "No chunks were retrieved for this query.")

    agreement = sum(1 for c in candidates if len(c.retrievers) == 2) / len(candidates)

    if not reranker_applied or candidates[0].rerank_score is None:
        support = min(1.0, len(candidates) / max(1, settings.min_supporting_chunks))
        score = 0.5 * support + 0.5 * agreement
        signals = {"support": support, "agreement": agreement}
        ok = (not settings.enabled) or (
            len(candidates) >= settings.min_supporting_chunks and score >= settings.min_confidence
        )
        return ConfidenceReport(
            score,
            ok,
            signals,
            "Scored without a reranker: confidence is based on retriever agreement and support only.",
        )

    scores = [c.rerank_score for c in candidates if c.rerank_score is not None]
    top = scores[0]
    strength = _logistic(top, midpoint=settings.min_top_score)
    runner_up = scores[1] if len(scores) > 1 else top - 1.0
    margin = _logistic(top - runner_up, midpoint=0.5, steepness=1.0)
    supporting = sum(1 for s in scores if s >= settings.min_top_score)
    support = min(1.0, supporting / max(1, settings.min_supporting_chunks))

    score = 0.45 * strength + 0.20 * margin + 0.25 * support + 0.10 * agreement

    if not settings.enabled:
        return ConfidenceReport(
            score,
            True,
            {"strength": strength, "margin": margin, "support": support, "agreement": agreement},
            "Confidence gating is disabled.",
        )

    reasons = []
    if top < settings.min_top_score:
        reasons.append(f"best chunk scored {top:.2f}, below the {settings.min_top_score:.2f} floor")
    if supporting < settings.min_supporting_chunks:
        reasons.append(f"only {supporting} chunk(s) cleared the score floor, {settings.min_supporting_chunks} required")
    if score < settings.min_confidence:
        reasons.append(f"combined confidence {score:.2f} is below {settings.min_confidence:.2f}")

    return ConfidenceReport(
        score=score,
        should_answer=not reasons,
        signals={"strength": strength, "margin": margin, "support": support, "agreement": agreement},
        reason="; ".join(reasons) if reasons else "Retrieved evidence clears every confidence threshold.",
    )
