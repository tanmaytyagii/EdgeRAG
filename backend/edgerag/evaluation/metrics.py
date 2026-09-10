"""Evaluation metrics.

Deliberately reference-based and cheap: EdgeRAG runs on a laptop and an
LLM-as-judge would cost more than the answer it grades. Each metric states
exactly what it measures so a number is never read as more than it is.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

_WORD = re.compile(r"[a-z0-9]+")


def tokens(text: str) -> set[str]:
    return set(_WORD.findall(text.lower()))


def keyword_recall(answer: str, expected_keywords: list[str]) -> float:
    """Share of expected keywords or phrases present in the answer."""
    if not expected_keywords:
        return float("nan")
    body = answer.lower()
    hits = sum(1 for keyword in expected_keywords if keyword.lower().strip() in body)
    return hits / len(expected_keywords)


def context_precision(selected_documents: list[str], expected_documents: list[str]) -> float:
    """Share of retrieved chunks that came from a document the case expects."""
    if not expected_documents or not selected_documents:
        return float("nan")
    expected = {d.lower() for d in expected_documents}
    hits = sum(1 for name in selected_documents if name.lower() in expected)
    return hits / len(selected_documents)


def context_recall(selected_documents: list[str], expected_documents: list[str]) -> float:
    """Share of expected documents that appear anywhere in the retrieved context."""
    if not expected_documents:
        return float("nan")
    found = {d.lower() for d in selected_documents}
    hits = sum(1 for name in expected_documents if name.lower() in found)
    return hits / len(expected_documents)


def answer_overlap(answer: str, expected_answer: str) -> float:
    """Token F1 between the answer and the reference. A coarse similarity signal."""
    if not expected_answer.strip():
        return float("nan")
    predicted, reference = tokens(answer), tokens(expected_answer)
    if not predicted or not reference:
        return 0.0
    overlap = len(predicted & reference)
    if overlap == 0:
        return 0.0
    precision = overlap / len(predicted)
    recall = overlap / len(reference)
    return 2 * precision * recall / (precision + recall)


def faithfulness(answer: str, context_texts: list[str]) -> float:
    """Share of content words in the answer that also appear in the retrieved context.

    Low scores mean the answer used vocabulary absent from its own evidence,
    which is a hallucination signal -- not proof of one.
    """
    if not context_texts:
        return float("nan")
    stopwords = {
        "the", "a", "an", "and", "or", "of", "to", "in", "is", "are", "for", "on", "that", "this",
        "it", "as", "be", "by", "with", "from", "at", "which", "these", "those", "can", "will",
    }
    answer_tokens = [t for t in _WORD.findall(answer.lower()) if t not in stopwords and len(t) > 2]
    if not answer_tokens:
        return float("nan")
    context_vocabulary = tokens(" ".join(context_texts))
    grounded = sum(1 for t in answer_tokens if t in context_vocabulary)
    return grounded / len(answer_tokens)


@dataclass
class CaseScore:
    case_id: str
    question: str
    answer: str
    abstained: bool
    latency_ms: float
    citation_count: int
    citation_coverage: float
    metrics: dict[str, float]
