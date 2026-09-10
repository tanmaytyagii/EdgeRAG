from edgerag.core.config import ConfidenceSettings
from edgerag.rag.confidence import assess
from edgerag.rag.types import Chunk, ScoredChunk


def candidate(score: float, both: bool = False) -> ScoredChunk:
    item = ScoredChunk(chunk=Chunk(id=f"c{score}", document_id="d", document_name="a.pdf", text="t"))
    item.rerank_score = score
    item.dense_rank = 1
    if both:
        item.sparse_rank = 1
    return item


def test_no_candidates_means_no_answer():
    report = assess([], ConfidenceSettings())
    assert report.should_answer is False


def test_strong_evidence_answers():
    report = assess([candidate(7.4, both=True), candidate(4.7, both=True)], ConfidenceSettings())
    assert report.should_answer is True
    assert report.score > 0.5


def test_the_prototype_failure_case_now_abstains():
    """Recorded prototype run: best chunk scored -1.58 and it answered anyway."""
    scores = [-1.58, -3.35, -4.34, -5.11, -5.98]
    report = assess([candidate(s) for s in scores], ConfidenceSettings())
    assert report.should_answer is False
    assert "below" in report.reason


def test_gating_can_be_disabled():
    report = assess([candidate(-9.0)], ConfidenceSettings(enabled=False))
    assert report.should_answer is True


def test_without_a_reranker_confidence_says_so():
    report = assess([candidate(0.0, both=True)], ConfidenceSettings(), reranker_applied=False)
    assert "without a reranker" in report.reason.lower()
