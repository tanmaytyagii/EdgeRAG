"""Request and response schemas. Every endpoint validates through these."""
from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field, field_validator


class ErrorBody(BaseModel):
    code: str
    message: str
    remediation: str | None = None
    details: Any | None = None


class KnowledgeBaseCreate(BaseModel):
    name: str = Field(min_length=1, max_length=200)
    description: str = Field("", max_length=2000)

    @field_validator("name")
    @classmethod
    def _strip(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("Name cannot be blank.")
        return cleaned


class KnowledgeBaseUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=200)
    description: str | None = Field(None, max_length=2000)
    config: dict[str, Any] | None = None


class KnowledgeBaseOut(BaseModel):
    id: str
    name: str
    description: str
    embedding_model: str
    document_count: int
    chunk_count: int
    ready_document_count: int
    config: dict[str, Any]
    created_at: datetime
    updated_at: datetime
    last_indexed_at: datetime | None


class DocumentOut(BaseModel):
    id: str
    knowledge_base_id: str
    filename: str
    content_type: str
    size_bytes: int
    page_count: int
    chunk_count: int
    status: str
    stage: str
    progress: float
    error: str | None
    logs: list[dict[str, Any]]
    metadata: dict[str, Any]
    created_at: datetime
    indexed_at: datetime | None


class RetrievalOverrides(BaseModel):
    dense_top_k: int | None = Field(None, ge=1, le=500)
    sparse_top_k: int | None = Field(None, ge=1, le=500)
    fusion_top_k: int | None = Field(None, ge=1, le=500)
    rerank_top_k: int | None = Field(None, ge=1, le=500)
    context_top_k: int | None = Field(None, ge=1, le=50)
    rrf_k: int | None = Field(None, ge=1, le=1000)
    dense_weight: float | None = Field(None, ge=0, le=10)
    sparse_weight: float | None = Field(None, ge=0, le=10)


class ChatRequest(BaseModel):
    knowledge_base_id: str
    question: str = Field(min_length=1, max_length=4000)
    conversation_id: str | None = None
    overrides: RetrievalOverrides | None = None


class SearchRequest(BaseModel):
    knowledge_base_id: str
    query: str = Field(min_length=1, max_length=4000)
    overrides: RetrievalOverrides | None = None


class MessageOut(BaseModel):
    id: str
    role: str
    content: str
    citations: list[dict[str, Any]]
    trace: dict[str, Any] | None
    confidence: dict[str, Any] | None
    abstained: bool
    model: str | None
    latency_ms: float
    created_at: datetime


class ConversationOut(BaseModel):
    id: str
    knowledge_base_id: str
    title: str
    message_count: int
    created_at: datetime
    updated_at: datetime


class EvalCaseIn(BaseModel):
    question: str = Field(min_length=1, max_length=2000)
    expected_answer: str = Field("", max_length=4000)
    expected_keywords: list[str] = Field(default_factory=list)
    expected_documents: list[str] = Field(default_factory=list)


class EvalCaseOut(EvalCaseIn):
    id: str
    knowledge_base_id: str
    created_at: datetime


class EvalRunRequest(BaseModel):
    knowledge_base_id: str
    case_ids: list[str] | None = None
    retrieval_only: bool = Field(
        False, description="Skip generation and score retrieval only. Much faster on CPU."
    )


class SettingsPatch(BaseModel):
    """Only the fields a user is allowed to change at runtime."""

    chunking: dict[str, Any] | None = None
    embedding: dict[str, Any] | None = None
    retrieval: dict[str, Any] | None = None
    reranker: dict[str, Any] | None = None
    llm: dict[str, Any] | None = None
    confidence: dict[str, Any] | None = None
    context: dict[str, Any] | None = None
    developer_mode: bool | None = None


class ChunkRef(BaseModel):
    document_id: str
    chunk_id: str


HealthState = Literal["ok", "degraded", "unavailable"]
