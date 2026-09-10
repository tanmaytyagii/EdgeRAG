"""Builds and caches one RAGPipeline per knowledge base.

Models are expensive to load, so the embedding, reranker and LLM providers are
process-wide singletons shared by every pipeline; only the collection-scoped
indexes differ.
"""
from __future__ import annotations

import threading
from typing import Any

from ..core.config import Settings, get_settings
from ..providers.embeddings import build_embeddings
from ..providers.llm import build_llm
from ..providers.reranker import build_reranker
from ..providers.vectorstore import build_vector_store
from ..rag.pipeline import RAGPipeline

_lock = threading.Lock()
_pipelines: dict[str, RAGPipeline] = {}
_shared: dict[str, Any] = {}


def _providers(settings: Settings) -> dict[str, Any]:
    if not _shared:
        _shared["embeddings"] = build_embeddings(settings.embedding)
        _shared["reranker"] = build_reranker(settings.reranker)
        _shared["llm"] = build_llm(settings.llm)
        _shared["vector_store"] = build_vector_store(settings.vector_store, settings.index_dir)
    return _shared


def get_pipeline(collection: str, settings: Settings | None = None) -> RAGPipeline:
    settings = settings or get_settings()
    with _lock:
        if collection not in _pipelines:
            providers = _providers(settings)
            _pipelines[collection] = RAGPipeline(
                settings=settings,
                embeddings=providers["embeddings"],
                vector_store=providers["vector_store"],
                reranker=providers["reranker"],
                llm=providers["llm"],
                collection=collection,
                index_root=settings.index_dir,
            )
        return _pipelines[collection]


def drop_pipeline(collection: str) -> None:
    with _lock:
        _pipelines.pop(collection, None)


def reset_engine_cache() -> None:
    with _lock:
        _pipelines.clear()
        _shared.clear()


def system_health(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    providers = _providers(settings)
    vector_store = providers["vector_store"]
    return {
        "embeddings": providers["embeddings"].health(),
        "reranker": providers["reranker"].health(),
        "llm": providers["llm"].health(),
        "vector_store": vector_store.health(),
        "storage": {"data_dir": str(settings.data_dir) if settings.developer_mode else "~/.edgerag"},
    }
