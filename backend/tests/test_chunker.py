from edgerag.core.config import ChunkingSettings
from edgerag.rag.chunker import Page, RecursiveChunker, normalize_text


def test_normalize_joins_hyphenated_line_breaks():
    assert "management" in normalize_text("manage-\nment")


def test_normalize_preserves_paragraphs():
    assert normalize_text("a\n\n\n\nb") == "a\n\nb"


def test_chunks_respect_size_and_carry_offsets():
    body = "Sentence number one. " * 200
    chunks = RecursiveChunker(ChunkingSettings(chunk_size=400, chunk_overlap=50)).chunk_pages(
        [Page(number=7, text=body)], document_id="doc", document_name="a.pdf"
    )
    assert chunks
    assert all(len(c.text) <= 500 for c in chunks)
    assert all(c.page == 7 for c in chunks)
    assert all(c.char_end > c.char_start for c in chunks)
    assert [c.ordinal for c in chunks] == list(range(len(chunks)))


def test_offsets_point_at_the_source_text():
    body = "alpha beta gamma. " * 60
    from edgerag.rag.chunker import normalize_text as norm

    normalized = norm(body)
    chunks = RecursiveChunker(ChunkingSettings(chunk_size=200, chunk_overlap=0)).chunk_pages(
        [Page(number=1, text=body)], document_id="d", document_name="a.txt"
    )
    for chunk in chunks:
        assert chunk.text in normalized[chunk.char_start : chunk.char_end + 2]


def test_short_fragments_are_dropped():
    chunks = RecursiveChunker(ChunkingSettings(min_chunk_chars=50)).chunk_pages(
        [Page(number=1, text="tiny")], document_id="d", document_name="a.txt"
    )
    assert chunks == []
