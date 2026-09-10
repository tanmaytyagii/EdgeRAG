"""Provider protocols.

Every model-backed capability sits behind one of these. Swapping Ollama for
llama.cpp, or Chroma for pgvector, means adding a class here -- not editing the
pipeline.
"""
from __future__ import annotations

from collections.abc import Iterator
from typing import Any, Protocol, runtime_checkable


@runtime_checkable
class EmbeddingProvider(Protocol):
    name: str
    dimensions: int

    def embed_documents(self, texts: list[str]) -> list[list[float]]: ...
    def embed_query(self, text: str) -> list[float]: ...
    def health(self) -> dict[str, Any]: ...


@runtime_checkable
class RerankerProvider(Protocol):
    name: str

    def score(self, query: str, texts: list[str]) -> list[float]: ...
    def health(self) -> dict[str, Any]: ...


@runtime_checkable
class LLMProvider(Protocol):
    name: str
    model: str

    def generate(self, system: str, user: str) -> str: ...
    def stream(self, system: str, user: str) -> Iterator[str]: ...
    def health(self) -> dict[str, Any]: ...
    def list_models(self) -> list[str]: ...


@runtime_checkable
class VectorStore(Protocol):
    name: str

    def upsert(
        self, collection: str, ids: list[str], vectors: list[list[float]], payloads: list[dict[str, Any]]
    ) -> None: ...
    def query(
        self, collection: str, vector: list[float], top_k: int
    ) -> list[tuple[str, float, dict[str, Any]]]: ...
    def delete_document(self, collection: str, document_id: str) -> int: ...
    def drop(self, collection: str) -> None: ...
    def count(self, collection: str) -> int: ...
    def health(self) -> dict[str, Any]: ...
