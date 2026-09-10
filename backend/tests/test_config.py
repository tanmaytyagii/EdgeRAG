"""Configuration loading.

The important contract here is that `.env.example` is copyable: every variable
it documents must actually exist, and the flat string syntax it uses must
parse. A settings file that only accepts JSON for list values would make the
documented example fail on first run.
"""
from __future__ import annotations

from pathlib import Path

import pytest

from edgerag.core.config import Settings

REPO_ROOT = Path(__file__).resolve().parents[2]
ENV_EXAMPLE = REPO_ROOT / ".env.example"


def _example_variables() -> list[str]:
    lines = ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()
    return [line.split("=", 1)[0].strip() for line in lines if line.strip() and not line.startswith("#")]


def _known_variables(model: object, prefix: str = "EDGERAG_") -> set[str]:
    names: set[str] = set()
    for field in type(model).model_fields:
        value = getattr(model, field)
        if hasattr(type(value), "model_fields"):
            names |= _known_variables(value, f"{prefix}{field.upper()}__")
        else:
            names.add(f"{prefix}{field.upper()}")
    return names


@pytest.mark.skipif(not ENV_EXAMPLE.exists(), reason=".env.example is not present in this checkout")
def test_env_example_documents_only_real_settings() -> None:
    known = _known_variables(Settings())
    unknown = [name for name in _example_variables() if name not in known]
    assert unknown == [], f".env.example documents variables the application does not read: {unknown}"


@pytest.mark.skipif(not ENV_EXAMPLE.exists(), reason=".env.example is not present in this checkout")
def test_env_example_loads(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    body = "\n".join(
        line for line in ENV_EXAMPLE.read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.startswith("#")
    )
    (tmp_path / ".env").write_text(body, encoding="utf-8")
    monkeypatch.chdir(tmp_path)

    settings = Settings()
    assert settings.retrieval.rrf_k == 60
    assert settings.uploads.allowed_extensions[0] == ".pdf"
    assert len(settings.cors_origins) == 2


def test_list_settings_accept_comma_separated_strings(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGERAG_CORS_ORIGINS", "http://a.test, http://b.test")
    monkeypatch.setenv("EDGERAG_UPLOADS__ALLOWED_EXTENSIONS", ".pdf,.txt")
    settings = Settings()
    assert settings.cors_origins == ("http://a.test", "http://b.test")
    assert settings.uploads.allowed_extensions == (".pdf", ".txt")


def test_list_settings_still_accept_json(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGERAG_CORS_ORIGINS", '["http://a.test"]')
    assert Settings().cors_origins == ("http://a.test",)


def test_data_dir_expands_tilde(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("EDGERAG_DATA_DIR", "~/edgerag-test-dir")
    assert Settings().data_dir == Path.home() / "edgerag-test-dir"
