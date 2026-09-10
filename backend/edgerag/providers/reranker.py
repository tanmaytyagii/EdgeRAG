from __future__ import annotations

import threading
from typing import Any

from ..core.config import RerankerSettings
from ..core.errors import RerankerUnavailableError
from ..core.logging import get_logger

log = get_logger("providers.reranker")


class CrossEncoderReranker:
    """Cross-encoder relevance scoring.

    The prototype called a bare `reranker.predict(...)` against a notebook global
    that was never assigned in the saved file. Here the model is an explicit,
    injectable dependency with a declared name and lazy loading.
    """

    def __init__(self, settings: RerankerSettings) -> None:
        self.settings = settings
        self.name = settings.model
        self._model = None
        self._lock = threading.Lock()

    def _ensure(self):
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model
            try:
                from sentence_transformers import CrossEncoder
            except ImportError as exc:
                raise RerankerUnavailableError(
                    "The sentence-transformers package is not installed.", details=str(exc)
                ) from exc
            try:
                log.info("Loading reranker %s", self.settings.model)
                self._model = CrossEncoder(self.settings.model)
            except Exception as exc:  # noqa: BLE001
                raise RerankerUnavailableError(
                    f"Reranker '{self.settings.model}' could not be loaded.", details=str(exc)
                ) from exc
        return self._model

    def score(self, query: str, texts: list[str]) -> list[float]:
        if not texts:
            return []
        model = self._ensure()
        pairs = [[query, text] for text in texts]
        scores = model.predict(pairs, batch_size=self.settings.batch_size, show_progress_bar=False)
        return [float(s) for s in scores]

    def health(self) -> dict[str, Any]:
        return {"provider": "cross-encoder", "model": self.settings.model, "loaded": self._model is not None}


class NoopReranker:
    """Pass-through. Assigns no scores, so downstream code reports the reranking
    stage as skipped rather than inventing numbers for it."""

    name = "none"

    def score(self, query: str, texts: list[str]) -> list[float]:
        return []

    def health(self) -> dict[str, Any]:
        return {"provider": "none", "model": None, "loaded": True,
                "warning": "Reranking disabled. Results are ordered by fusion score."}


def build_reranker(settings: RerankerSettings):
    if settings.provider == "none":
        return NoopReranker()
    return CrossEncoderReranker(settings)
