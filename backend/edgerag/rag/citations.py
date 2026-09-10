"""Citation extraction and validation.

The model is asked to emit [n] markers. We never trust them: a marker survives
only if n indexes a chunk that was actually in the context we sent. Markers
pointing anywhere else are removed from the answer text, because a citation the
user can click and land nowhere is worse than no citation at all.
"""
from __future__ import annotations

import re

from .types import Citation, ScoredChunk

_MARKER = re.compile(r"\[(\d{1,2})\]")
_THINK_BLOCK = re.compile(r"<(think|thinking|reasoning)>.*?</\1>", re.DOTALL | re.IGNORECASE)
_ORPHAN_OPEN = re.compile(r"<(think|thinking|reasoning)>.*", re.DOTALL | re.IGNORECASE)


def strip_reasoning(text: str) -> str:
    """Remove <think> blocks emitted by reasoning models such as deepseek-r1.

    The prototype piped these straight into the final answer, so users read the
    model's internal monologue as if it were the response.
    """
    cleaned = _THINK_BLOCK.sub("", text)
    cleaned = _ORPHAN_OPEN.sub("", cleaned)
    cleaned = re.sub(r"^\s*</(think|thinking|reasoning)>\s*", "", cleaned, flags=re.IGNORECASE)
    return cleaned.strip()


def excerpt_for(text: str, *, limit: int = 240) -> str:
    body = " ".join(text.split())
    if len(body) <= limit:
        return body
    return body[:limit].rsplit(" ", 1)[0] + "…"


def extract_citations(answer: str, context_chunks: list[ScoredChunk]) -> tuple[str, list[Citation]]:
    """Return the answer with invalid markers removed, plus the citations it uses."""
    valid_range = range(1, len(context_chunks) + 1)
    referenced: list[int] = []

    for match in _MARKER.finditer(answer):
        index = int(match.group(1))
        if index in valid_range and index not in referenced:
            referenced.append(index)

    def replace(match: re.Match[str]) -> str:
        index = int(match.group(1))
        return match.group(0) if index in valid_range else ""

    cleaned = _MARKER.sub(replace, answer)
    cleaned = re.sub(r"[ \t]{2,}", " ", cleaned)
    cleaned = re.sub(r" +([.,;:])", r"\1", cleaned).strip()

    citations = []
    for index in sorted(referenced):
        candidate = context_chunks[index - 1]
        citations.append(
            Citation(
                index=index,
                chunk_id=candidate.chunk.id,
                document_id=candidate.chunk.document_id,
                document_name=candidate.chunk.document_name,
                page=candidate.chunk.page,
                excerpt=excerpt_for(candidate.chunk.text),
                char_start=candidate.chunk.char_start,
                char_end=candidate.chunk.char_end,
                score=candidate.rerank_score if candidate.rerank_score is not None else candidate.fusion_score,
            )
        )
    return cleaned, citations


def citation_coverage(answer: str, citations: list[Citation]) -> float:
    """Share of non-trivial sentences in the answer that carry a citation marker."""
    sentences = [s for s in re.split(r"(?<=[.!?])\s+", answer.strip()) if len(s.split()) >= 4]
    if not sentences:
        return 0.0
    if not citations:
        return 0.0
    cited = sum(1 for s in sentences if _MARKER.search(s))
    return cited / len(sentences)
