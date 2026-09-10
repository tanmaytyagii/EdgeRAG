"""Central configuration.

Every tunable in EdgeRAG lives here. Nothing in the RAG engine reads
environment variables directly -- settings are injected, so the pipeline can be
constructed in tests without touching the process environment.
"""
from __future__ import annotations

import json
import os
from functools import lru_cache
from pathlib import Path
from typing import Annotated, Literal

from pydantic import BaseModel, Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


def default_data_dir() -> Path:
    override = os.environ.get("EDGERAG_DATA_DIR")
    if override:
        return Path(override).expanduser().resolve()
    return (Path.home() / ".edgerag").resolve()


def _csv_or_sequence(value: object) -> object:
    """Accept comma-separated strings for list-valued settings.

    Environment variables and .env files carry flat strings, and requiring JSON
    (`["a","b"]`) for a two-item list makes a copied .env.example fail on first
    run. `a, b` is parsed here. A JSON array is still accepted, so existing
    configuration keeps working. Anything else is passed through unchanged for
    pydantic to validate.
    """
    if not isinstance(value, str):
        return value
    text = value.strip()
    if text.startswith("["):
        try:
            return json.loads(text)
        except json.JSONDecodeError:
            return value
    return tuple(part.strip() for part in text.split(",") if part.strip())


class ChunkingSettings(BaseModel):
    """How documents are split. Defaults match the validated prototype."""

    chunk_size: int = Field(800, ge=128, le=8192)
    chunk_overlap: int = Field(100, ge=0, le=2048)
    splitter: Literal["recursive"] = "recursive"
    min_chunk_chars: int = Field(48, ge=0, description="Chunks shorter than this are dropped as noise.")


class EmbeddingSettings(BaseModel):
    provider: Literal["sentence-transformers", "hash-dev"] = "sentence-transformers"
    model: str = "sentence-transformers/all-MiniLM-L6-v2"
    dimensions: int = 384
    batch_size: int = Field(64, ge=1, le=512)
    normalize: bool = True


class VectorStoreSettings(BaseModel):
    provider: Literal["numpy", "chroma"] = "numpy"
    collection_prefix: str = "edgerag_kb_"


class RetrievalSettings(BaseModel):
    """Candidate budgets for each stage of the funnel."""

    dense_top_k: int = Field(40, ge=1, le=500)
    sparse_top_k: int = Field(40, ge=1, le=500)
    fusion_top_k: int = Field(40, ge=1, le=500)
    rerank_top_k: int = Field(40, ge=1, le=500, description="How many fused candidates are scored by the reranker.")
    context_top_k: int = Field(5, ge=1, le=50, description="How many chunks reach the LLM.")
    rrf_k: int = Field(60, ge=1, le=1000, description="Reciprocal-rank-fusion smoothing constant.")
    dense_weight: float = Field(1.0, ge=0.0, le=10.0)
    sparse_weight: float = Field(1.0, ge=0.0, le=10.0)


class RerankerSettings(BaseModel):
    provider: Literal["cross-encoder", "none"] = "cross-encoder"
    model: str = "cross-encoder/ms-marco-MiniLM-L-6-v2"
    batch_size: int = Field(32, ge=1, le=256)


class LLMSettings(BaseModel):
    provider: Literal["ollama"] = "ollama"
    model: str = "deepseek-r1:1.5b"
    base_url: str = "http://localhost:11434"
    temperature: float = Field(0.1, ge=0.0, le=2.0)
    max_tokens: int = Field(1024, ge=64, le=32768)
    timeout_seconds: int = Field(180, ge=5, le=3600)
    strip_reasoning_tags: bool = Field(
        True,
        description="Reasoning models such as deepseek-r1 emit <think> blocks. Keep them out of the answer.",
    )


class ConfidenceSettings(BaseModel):
    """Abstention policy. See docs/retrieval.md for the rationale."""

    enabled: bool = True
    min_top_score: float = Field(0.0, description="Reranker score the best chunk must beat.")
    min_supporting_chunks: int = Field(1, ge=1, le=20)
    min_confidence: float = Field(0.35, ge=0.0, le=1.0)
    abstain_message: str = (
        "The indexed sources do not provide enough information to answer this confidently."
    )


class ContextSettings(BaseModel):
    max_context_chars: int = Field(6000, ge=500, le=100_000)
    max_chars_per_chunk: int = Field(1600, ge=200, le=20_000)


class UploadSettings(BaseModel):
    max_file_bytes: int = Field(100 * 1024 * 1024, ge=1024)
    allowed_extensions: Annotated[tuple[str, ...], NoDecode] = (".pdf", ".txt", ".md", ".markdown", ".docx")

    _parse_extensions = field_validator("allowed_extensions", mode="before")(_csv_or_sequence)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="EDGERAG_",
        env_nested_delimiter="__",
        env_file=".env",
        extra="ignore",
    )

    app_name: str = "EdgeRAG"
    data_dir: Path = Field(default_factory=default_data_dir)

    @field_validator("data_dir", mode="after")
    @classmethod
    def _expand_data_dir(cls, value: Path) -> Path:
        """Expand `~` and make the path absolute.

        A .env file carries a literal string, so `EDGERAG_DATA_DIR=~/.edgerag`
        would otherwise create a directory named `~` in the working directory.
        """
        return Path(value).expanduser().resolve()
    host: str = "127.0.0.1"
    port: int = 8000
    cors_origins: Annotated[tuple[str, ...], NoDecode] = (
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    )

    _parse_cors = field_validator("cors_origins", mode="before")(_csv_or_sequence)
    log_level: str = "INFO"
    developer_mode: bool = Field(False, description="Surface stack traces and internal paths to the client.")
    telemetry_enabled: bool = Field(
        False, description="EdgeRAG ships no remote telemetry. This flag is reserved and unused."
    )

    chunking: ChunkingSettings = ChunkingSettings()
    embedding: EmbeddingSettings = EmbeddingSettings()
    vector_store: VectorStoreSettings = VectorStoreSettings()
    retrieval: RetrievalSettings = RetrievalSettings()
    reranker: RerankerSettings = RerankerSettings()
    llm: LLMSettings = LLMSettings()
    confidence: ConfidenceSettings = ConfidenceSettings()
    context: ContextSettings = ContextSettings()
    uploads: UploadSettings = UploadSettings()

    @property
    def db_path(self) -> Path:
        return self.data_dir / "edgerag.db"

    @property
    def documents_dir(self) -> Path:
        return self.data_dir / "documents"

    @property
    def index_dir(self) -> Path:
        return self.data_dir / "indexes"

    @property
    def cache_dir(self) -> Path:
        return self.data_dir / "cache"

    def ensure_dirs(self) -> None:
        for path in (self.data_dir, self.documents_dir, self.index_dir, self.cache_dir):
            path.mkdir(parents=True, exist_ok=True)


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    settings = Settings()
    settings.ensure_dirs()
    return settings


def reset_settings_cache() -> None:
    get_settings.cache_clear()
