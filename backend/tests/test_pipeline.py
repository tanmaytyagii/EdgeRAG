"""Pipeline behaviour with a scripted LLM, so generation is deterministic."""
from __future__ import annotations

from pathlib import Path

import pytest

from edgerag.core.config import Settings
from edgerag.providers.embeddings import HashingEmbeddings
from edgerag.providers.reranker import NoopReranker
from edgerag.providers.vectorstore import NumpyVectorStore
from edgerag.rag.chunker import Page, RecursiveChunker
from edgerag.rag.pipeline import RAGPipeline


class ScriptedLLM:
    name = "scripted"
    model = "scripted-test"

    def __init__(self, reply: str) -> None:
        self.reply = reply
        self.last_prompt: tuple[str, str] | None = None

    def generate(self, system, user):
        self.last_prompt = (system, user)
        return self.reply

    def stream(self, system, user):
        self.last_prompt = (system, user)
        for piece in self.reply.split(" "):
            yield piece + " "

    def health(self):
        return {"provider": "scripted", "model": self.model, "available": True, "model_installed": True}

    def list_models(self):
        return [self.model]


@pytest.fixture()
def pipeline(tmp_path: Path):
    def build(reply: str, **overrides) -> RAGPipeline:
        settings = Settings(data_dir=tmp_path, **overrides)
        settings.embedding.provider = "hash-dev"
        settings.confidence.enabled = False  # exercised separately in test_confidence
        engine = RAGPipeline(
            settings=settings,
            embeddings=HashingEmbeddings(settings.embedding),
            vector_store=NumpyVectorStore(tmp_path / "vectors"),
            reranker=NoopReranker(),
            llm=ScriptedLLM(reply),
            collection="test",
            index_root=tmp_path / "indexes",
        )
        chunks = RecursiveChunker(settings.chunking).chunk_pages(
            [
                Page(number=1, text="The three direct project objectives are performance, cost and time. " * 6),
                Page(number=2, text="BM25 scores documents by term frequency adjusted for rarity and length. " * 6),
            ],
            document_id="doc1",
            document_name="handbook.pdf",
        )
        vectors = engine.embeddings.embed_documents([c.text for c in chunks])
        engine.vector_store.upsert(
            "test",
            [c.id for c in chunks],
            vectors,
            [
                {"document_id": c.document_id, "document_name": c.document_name, "page": c.page,
                 "ordinal": c.ordinal, "char_start": c.char_start, "char_end": c.char_end, "text": c.text}
                for c in chunks
            ],
        )
        engine.bm25.add(chunks)
        return engine

    return build


def test_answer_is_grounded_and_cited(pipeline):
    engine = pipeline("Performance, cost and time [1].")
    answer = engine.answer("What are the three direct project objectives?")
    assert answer.abstained is False
    assert [c.index for c in answer.citations] == [1]
    assert answer.citations[0].document_name == "handbook.pdf"
    assert answer.citations[0].page in (1, 2)


def test_prompt_contains_only_retrieved_context(pipeline):
    engine = pipeline("ok [1]")
    engine.answer("What is BM25?")
    system, user = engine.llm.last_prompt
    assert "only the numbered excerpts" in system
    assert "CONTEXT" in user and "handbook.pdf" in user


def test_reasoning_tags_never_reach_the_answer(pipeline):
    engine = pipeline("<think>I should check the sources first.</think>The answer is time [1].")
    answer = engine.answer("objectives?")
    assert "<think>" not in answer.text
    assert "should check" not in answer.text


def test_insufficient_evidence_sentinel_becomes_an_abstention(pipeline):
    engine = pipeline("INSUFFICIENT_EVIDENCE")
    answer = engine.answer("What is the capital of Peru?")
    assert answer.abstained is True
    assert answer.citations == []


def test_trace_covers_every_stage(pipeline):
    engine = pipeline("fine [1]")
    answer = engine.answer("objectives?")
    names = [s.name for s in answer.trace.stages]
    assert names == [
        "query_processing", "dense_retrieval", "sparse_retrieval",
        "hybrid_fusion", "reranking", "generation",
    ]
    assert answer.trace.total_ms > 0


def test_streaming_emits_typed_events_in_order(pipeline):
    engine = pipeline("Streamed answer [1].")
    events = list(engine.stream("objectives?"))
    kinds = [e["type"] for e in events]
    assert kinds[0] == "stage"
    assert "confidence" in kinds and "candidates" in kinds and "generation_started" in kinds
    assert kinds[-1] == "done"
    assert "".join(e["text"] for e in events if e["type"] == "token").strip().startswith("Streamed")
    assert events[-1]["citations"]


def test_retrieval_without_an_index_raises(tmp_path):
    from edgerag.core.errors import IndexNotReadyError

    settings = Settings(data_dir=tmp_path)
    settings.embedding.provider = "hash-dev"
    engine = RAGPipeline(
        settings=settings,
        embeddings=HashingEmbeddings(settings.embedding),
        vector_store=NumpyVectorStore(tmp_path / "v"),
        reranker=NoopReranker(),
        llm=ScriptedLLM("x"),
        collection="empty",
        index_root=tmp_path / "i",
    )
    with pytest.raises(IndexNotReadyError):
        engine.retrieve("anything")
