"""Recursive character chunking with character offsets preserved.

The prototype used LangChain's RecursiveCharacterTextSplitter, which discards
the position of a chunk inside its page. EdgeRAG needs those offsets to
highlight the exact passage in the document viewer, so the splitter is
reimplemented here with offset tracking and no LangChain dependency.
"""
from __future__ import annotations

import re
from dataclasses import dataclass

from ..core.config import ChunkingSettings
from .types import Chunk

DEFAULT_SEPARATORS = ["\n\n", "\n", ". ", "? ", "! ", "; ", ", ", " ", ""]
_WHITESPACE = re.compile(r"[ \t]+")


@dataclass
class Page:
    """One unit of source text, usually a PDF page."""

    number: int | None
    text: str


def normalize_text(text: str) -> str:
    """Collapse runs of spaces and hard-wrap artefacts without losing paragraphs."""
    text = text.replace("\r\n", "\n").replace("\r", "\n")
    text = text.replace("\u00ad", "")  # soft hyphen, common in typeset PDFs
    text = re.sub(r"(\w)-\n(\w)", r"\1\2", text)  # de-hyphenate across line breaks
    text = _WHITESPACE.sub(" ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


def _split_with_offsets(text: str, size: int, overlap: int, separators: list[str]) -> list[tuple[int, int]]:
    """Return (start, end) spans covering `text`, splitting on the first separator that fits."""
    if len(text) <= size:
        return [(0, len(text))] if text.strip() else []

    separator = ""
    for candidate in separators:
        if candidate == "":
            separator = ""
            break
        if candidate in text:
            separator = candidate
            break

    if separator == "":
        step = max(1, size - overlap)
        return [(i, min(i + size, len(text))) for i in range(0, len(text), step)]

    pieces: list[tuple[int, int]] = []
    cursor = 0
    for part in text.split(separator):
        start = cursor
        end = start + len(part)
        pieces.append((start, end))
        cursor = end + len(separator)

    spans: list[tuple[int, int]] = []
    buffer_start: int | None = None
    buffer_end = 0
    remaining = separators[separators.index(separator) + 1 :] if separator in separators else [""]

    def flush() -> None:
        nonlocal buffer_start, buffer_end
        if buffer_start is None:
            return
        length = buffer_end - buffer_start
        if length > size:
            for sub_start, sub_end in _split_with_offsets(text[buffer_start:buffer_end], size, overlap, remaining):
                spans.append((buffer_start + sub_start, buffer_start + sub_end))
        elif text[buffer_start:buffer_end].strip():
            spans.append((buffer_start, buffer_end))
        buffer_start = None
        buffer_end = 0

    for start, end in pieces:
        if buffer_start is None:
            buffer_start, buffer_end = start, end
            continue
        if end - buffer_start <= size:
            buffer_end = end
        else:
            flush()
            buffer_start, buffer_end = start, end
    flush()

    if overlap <= 0 or len(spans) < 2:
        return spans

    overlapped: list[tuple[int, int]] = [spans[0]]
    for start, end in spans[1:]:
        overlapped.append((max(0, start - overlap), end))
    return overlapped


class RecursiveChunker:
    def __init__(self, settings: ChunkingSettings | None = None) -> None:
        self.settings = settings or ChunkingSettings()

    def chunk_pages(self, pages: list[Page], *, document_id: str, document_name: str) -> list[Chunk]:
        chunks: list[Chunk] = []
        ordinal = 0
        for page in pages:
            text = normalize_text(page.text)
            if not text:
                continue
            for start, end in _split_with_offsets(
                text, self.settings.chunk_size, self.settings.chunk_overlap, list(DEFAULT_SEPARATORS)
            ):
                body = text[start:end].strip()
                if len(body) < self.settings.min_chunk_chars:
                    continue
                chunks.append(
                    Chunk(
                        id=f"{document_id}:{ordinal}",
                        document_id=document_id,
                        document_name=document_name,
                        text=body,
                        page=page.number,
                        ordinal=ordinal,
                        char_start=start,
                        char_end=end,
                    )
                )
                ordinal += 1
        return chunks
