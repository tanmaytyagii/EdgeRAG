from __future__ import annotations

import hashlib
import math
import threading
from typing import Any

from ..core.config import EmbeddingSettings
from ..core.errors import EmbeddingUnavailableError
from ..core.logging import get_logger

log = get_logger("providers.embeddings")


class SentenceTransformerEmbeddings:
    """all-MiniLM-L6-v2 by default. The model is loaded lazily on first use so
    starting the API server does not pull 90 MB of weights into memory."""

    def __init__(self, settings: EmbeddingSettings) -> None:
        self.settings = settings
        self.name = settings.model
        self.dimensions = settings.dimensions
        self._model = None
        self._lock = threading.Lock()

    def _ensure(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            try:
                from sentence_transformers import SentenceTransformer
            except ImportError as exc:
                raise EmbeddingUnavailableError(
                    "The sentence-transformers package is not installed.",
                    details=str(exc),
                ) from exc
            try:
                log.info("Loading embedding model %s", self.settings.model)
                self._model = SentenceTransformer(self.settings.model)
                self.dimensions = int(self._model.get_sentence_embedding_dimension())
            except Exception as exc:  # noqa: BLE001 - surfaced to the user verbatim
                raise EmbeddingUnavailableError(
                    f"Embedding model '{self.settings.model}' could not be loaded.",
                    details=str(exc),
                ) from exc
        return self._model

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        model = self._ensure()
        vectors = model.encode(
            texts,
            batch_size=self.settings.batch_size,
            normalize_embeddings=self.settings.normalize,
            show_progress_bar=False,
            convert_to_numpy=True,
        )
        return [v.tolist() for v in vectors]

    def embed_query(self, text: str) -> list[float]:
        return self.embed_documents([text])[0]

    def health(self) -> dict[str, Any]:
        return {
            "provider": "sentence-transformers",
            "model": self.settings.model,
            "loaded": self._model is not None,
            "dimensions": self.dimensions,
        }


class HashingEmbeddings:
    """Deterministic hashed bag-of-words vectors.

    This is a real embedder but a weak one: it captures lexical overlap and no
    semantics. It exists so CI and unit tests can exercise the full pipeline
    without downloading a transformer. EdgeRAG labels it as `hash-dev`
    everywhere it is surfaced so a running instance never misreports which model
    produced its vectors.
    """

    def __init__(self, settings: EmbeddingSettings) -> None:
        self.settings = settings
        self.name = "hash-dev"
        self.dimensions = settings.dimensions

    def _vector(self, text: str) -> list[float]:
        vec = [0.0] * self.dimensions
        for token in text.lower().split():
            digest = hashlib.blake2b(token.encode("utf-8"), digest_size=8).digest()
            slot = int.from_bytes(digest[:4], "big") % self.dimensions
            sign = 1.0 if digest[4] % 2 == 0 else -1.0
            vec[slot] += sign
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        return [self._vector(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vector(text)

    def health(self) -> dict[str, Any]:
        return {"provider": "hash-dev", "model": "hash-dev", "loaded": True, "dimensions": self.dimensions,
                "warning": "Development embedder. Lexical only, no semantic quality."}


def build_embeddings(settings: EmbeddingSettings):
    if settings.provider == "hash-dev":
        return HashingEmbeddings(settings)
    return SentenceTransformerEmbeddings(settings)
