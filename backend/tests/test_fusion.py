from edgerag.rag.fusion import reciprocal_rank_fusion
from edgerag.rag.types import Chunk, ScoredChunk


def chunk(identifier: str) -> ScoredChunk:
    return ScoredChunk(chunk=Chunk(id=identifier, document_id="d", document_name="a.pdf", text=identifier))


def test_agreement_between_retrievers_wins():
    """A chunk both retrievers found should outrank one only dense found first."""
    dense = [chunk("only-dense"), chunk("both")]
    sparse = [chunk("both"), chunk("only-sparse")]
    fused = reciprocal_rank_fusion(dense, sparse, k=60)
    assert fused[0].chunk.id == "both"
    assert fused[0].source == "hybrid"


def test_sparse_only_results_can_outrank_dense_results():
    """The prototype's concatenation made this impossible."""
    dense = [chunk(f"d{i}") for i in range(10)]
    sparse = [chunk("s-top")]
    fused = reciprocal_rank_fusion(dense, sparse, k=1)
    assert "s-top" in [c.chunk.id for c in fused[:2]]


def test_weights_shift_the_balance():
    dense = [chunk("d1")]
    sparse = [chunk("s1")]
    dense_heavy = reciprocal_rank_fusion(dense, sparse, dense_weight=5.0, sparse_weight=1.0)
    sparse_heavy = reciprocal_rank_fusion(dense, sparse, dense_weight=1.0, sparse_weight=5.0)
    assert dense_heavy[0].chunk.id == "d1"
    assert sparse_heavy[0].chunk.id == "s1"


def test_ranks_are_assigned_and_deduplicated():
    fused = reciprocal_rank_fusion([chunk("a"), chunk("b")], [chunk("a")], k=60)
    assert len(fused) == 2
    assert [c.fusion_rank for c in fused] == [1, 2]


def test_top_k_truncates():
    dense = [chunk(f"d{i}") for i in range(20)]
    assert len(reciprocal_rank_fusion(dense, [], top_k=5)) == 5


def test_empty_inputs():
    assert reciprocal_rank_fusion([], []) == []
