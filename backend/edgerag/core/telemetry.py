"""In-process timing for the retrieval pipeline.

Everything the Retrieval Pipeline page renders comes from a QueryTrace. There is
no separate metrics path, so the UI cannot show a number the engine did not
actually measure.
"""
from __future__ import annotations

import time
import uuid
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass, field
from typing import Any


@dataclass
class StageTiming:
    name: str
    duration_ms: float
    metrics: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        return {"name": self.name, "duration_ms": round(self.duration_ms, 2), "metrics": self.metrics}


@dataclass
class QueryTrace:
    trace_id: str = field(default_factory=lambda: uuid.uuid4().hex)
    query: str = ""
    stages: list[StageTiming] = field(default_factory=list)
    started_at: float = field(default_factory=time.perf_counter)
    total_ms: float = 0.0

    @contextmanager
    def stage(self, name: str) -> Iterator[dict[str, Any]]:
        metrics: dict[str, Any] = {}
        start = time.perf_counter()
        try:
            yield metrics
        finally:
            elapsed = (time.perf_counter() - start) * 1000
            self.stages.append(StageTiming(name=name, duration_ms=elapsed, metrics=metrics))

    def finish(self) -> QueryTrace:
        self.total_ms = (time.perf_counter() - self.started_at) * 1000
        return self

    def stage_ms(self, name: str) -> float:
        return next((s.duration_ms for s in self.stages if s.name == name), 0.0)

    def to_dict(self) -> dict[str, Any]:
        return {
            "trace_id": self.trace_id,
            "query": self.query,
            "stages": [s.to_dict() for s in self.stages],
            "total_ms": round(self.total_ms, 2),
        }
