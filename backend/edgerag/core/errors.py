"""Typed application errors.

Each error carries a stable machine code, an HTTP status, a message written for
a human, and an optional remediation the UI can turn into a button.
"""
from __future__ import annotations

from typing import Any


class EdgeRAGError(Exception):
    code = "internal_error"
    status_code = 500
    remediation: str | None = None

    def __init__(self, message: str, *, details: Any = None, remediation: str | None = None) -> None:
        super().__init__(message)
        self.message = message
        self.details = details
        if remediation is not None:
            self.remediation = remediation

    def to_dict(self, *, include_details: bool = False) -> dict[str, Any]:
        payload: dict[str, Any] = {"code": self.code, "message": self.message}
        if self.remediation:
            payload["remediation"] = self.remediation
        if include_details and self.details is not None:
            payload["details"] = self.details
        return payload


class NotFoundError(EdgeRAGError):
    code = "not_found"
    status_code = 404


class ValidationError(EdgeRAGError):
    code = "validation_error"
    status_code = 422


class ConflictError(EdgeRAGError):
    code = "conflict"
    status_code = 409


class UnsupportedFileError(EdgeRAGError):
    code = "unsupported_file"
    status_code = 415
    remediation = "Upload a PDF, TXT, Markdown or DOCX file."


class FileTooLargeError(EdgeRAGError):
    code = "file_too_large"
    status_code = 413
    remediation = "Raise EDGERAG_UPLOADS__MAX_FILE_BYTES or split the document."


class DocumentParseError(EdgeRAGError):
    code = "document_parse_failed"
    status_code = 422
    remediation = "This file may be a scanned image. Run OCR on it first, then re-upload."


class ProviderUnavailableError(EdgeRAGError):
    code = "provider_unavailable"
    status_code = 503


class LLMUnavailableError(ProviderUnavailableError):
    code = "llm_unavailable"
    remediation = "Start Ollama with `ollama serve`, then pull the model with `ollama pull deepseek-r1:1.5b`."


class EmbeddingUnavailableError(ProviderUnavailableError):
    code = "embedding_unavailable"
    remediation = "Install the embedding extra: `pip install 'edgerag[local]'`."


class RerankerUnavailableError(ProviderUnavailableError):
    code = "reranker_unavailable"
    remediation = "Install the reranker extra or set EDGERAG_RERANKER__PROVIDER=none."


class IndexNotReadyError(EdgeRAGError):
    code = "index_not_ready"
    status_code = 409
    remediation = "Index at least one document in this knowledge base first."
