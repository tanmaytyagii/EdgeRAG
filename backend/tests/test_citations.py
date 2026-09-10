from edgerag.rag.citations import citation_coverage, extract_citations, strip_reasoning
from edgerag.rag.types import Chunk, ScoredChunk


def context(count: int) -> list[ScoredChunk]:
    return [
        ScoredChunk(
            chunk=Chunk(id=f"c{i}", document_id="d", document_name="book.pdf", text=f"passage {i}", page=i),
            rerank_score=float(count - i),
        )
        for i in range(1, count + 1)
    ]


def test_reasoning_blocks_are_removed():
    assert strip_reasoning("<think>internal monologue</think>The answer.") == "The answer."


def test_unterminated_reasoning_block_is_removed():
    assert strip_reasoning("Visible.<think>cut off mid thought") == "Visible."


def test_valid_citations_are_kept():
    answer, citations = extract_citations("Scope, cost and time [1][2].", context(3))
    assert [c.index for c in citations] == [1, 2]
    assert citations[0].document_name == "book.pdf"
    assert citations[0].page == 1


def test_out_of_range_citations_are_stripped_not_invented():
    """The model referencing [9] against a 3-chunk context must not produce a citation."""
    answer, citations = extract_citations("Grounded [1] and invented [9].", context(3))
    assert [c.index for c in citations] == [1]
    assert "[9]" not in answer


def test_answer_with_no_citations_yields_none():
    _, citations = extract_citations("An unsupported claim.", context(3))
    assert citations == []


def test_coverage_counts_cited_sentences():
    _, citations = extract_citations("The first claim is supported [1].", context(2))
    answer = "The first claim is supported [1]. The second claim has no marker at all."
    assert citation_coverage(answer, citations) == 0.5


def test_coverage_is_zero_without_citations():
    assert citation_coverage("A claim with no supporting marker anywhere.", []) == 0.0
