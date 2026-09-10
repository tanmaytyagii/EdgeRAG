"""Turn selected chunks into a numbered context block for the prompt.

Chunks are budgeted by character count so a long chunk cannot crowd out the rest
of the evidence, and each block is labelled with the citation index the model is
told to use.
"""
from __future__ import annotations

from dataclasses import dataclass

from ..core.config import ContextSettings
from .types import ScoredChunk


@dataclass
class BuiltContext:
    text: str
    used: list[ScoredChunk]
    total_chars: int
    dropped: int


def build_context(chunks: list[ScoredChunk], settings: ContextSettings) -> BuiltContext:
    blocks: list[str] = []
    used: list[ScoredChunk] = []
    total = 0

    for candidate in chunks:
        body = candidate.chunk.text.strip()
        if len(body) > settings.max_chars_per_chunk:
            body = body[: settings.max_chars_per_chunk].rsplit(" ", 1)[0] + " …"
        index = len(used) + 1
        location = candidate.chunk.document_name
        if candidate.chunk.page is not None:
            location += f", p. {candidate.chunk.page}"
        block = f"[{index}] {location}\n{body}"
        if total + len(block) > settings.max_context_chars and used:
            break
        blocks.append(block)
        used.append(candidate)
        total += len(block)

    return BuiltContext(
        text="\n\n".join(blocks),
        used=used,
        total_chars=total,
        dropped=len(chunks) - len(used),
    )
