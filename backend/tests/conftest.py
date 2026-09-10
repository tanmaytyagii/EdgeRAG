from __future__ import annotations

import os
import tempfile
from pathlib import Path

import pytest


@pytest.fixture(scope="session", autouse=True)
def isolated_environment():
    """Every test run gets its own data directory and dependency-free providers."""
    tmp = tempfile.mkdtemp(prefix="edgerag-tests-")
    os.environ["EDGERAG_DATA_DIR"] = tmp
    os.environ["EDGERAG_EMBEDDING__PROVIDER"] = "hash-dev"
    os.environ["EDGERAG_RERANKER__PROVIDER"] = "none"
    yield Path(tmp)


@pytest.fixture()
def client(isolated_environment):
    from fastapi.testclient import TestClient

    from edgerag.api.app import create_app

    return TestClient(create_app())


@pytest.fixture()
def samples() -> Path:
    return Path(__file__).resolve().parents[2] / "samples"
