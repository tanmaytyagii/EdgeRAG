from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...db.models import Activity, Conversation, Document, KnowledgeBase
from ...db.session import db_session
from ...schemas.api import SettingsPatch
from ...services.engine import reset_engine_cache, system_health
from ..deps import require_writable

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health():
    detail = system_health()
    llm_ok = detail["llm"].get("available") and detail["llm"].get("model_installed")
    embedding_ok = detail["embeddings"].get("provider") != "unavailable"
    state = "ok" if llm_ok else ("degraded" if embedding_ok else "unavailable")
    return {"status": state, "version": __import__("edgerag").__version__, "components": detail}


@router.get("/models")
def models():
    detail = system_health()
    return {
        "llm": {
            "provider": detail["llm"]["provider"],
            "active": detail["llm"]["model"],
            "installed": detail["llm"].get("models", []),
            "available": detail["llm"].get("available", False),
        },
        "embedding": detail["embeddings"],
        "reranker": detail["reranker"],
    }


@router.get("/settings")
def read_settings():
    settings = get_settings()
    return {
        "chunking": settings.chunking.model_dump(),
        "embedding": settings.embedding.model_dump(),
        "vector_store": settings.vector_store.model_dump(),
        "retrieval": settings.retrieval.model_dump(),
        "reranker": settings.reranker.model_dump(),
        # The hosted-provider key must never reach the browser. `api_key` is
        # dropped here rather than masked, so there is nothing to leak even in
        # a screenshot, and the UI has no field that could send it back.
        "llm": {k: v for k, v in settings.llm.model_dump().items() if k != "api_key"},
        "confidence": settings.confidence.model_dump(),
        "context": settings.context.model_dump(),
        "uploads": {"max_file_bytes": settings.uploads.max_file_bytes,
                    "allowed_extensions": list(settings.uploads.allowed_extensions)},
        "demo_mode": settings.demo_mode,
        "privacy": {
            "local_only": not settings.demo_mode,
            "telemetry_enabled": settings.telemetry_enabled,
            "note": "EdgeRAG makes no outbound network calls except to the model host you configure.",
        },
        "developer_mode": settings.developer_mode,
    }


@router.patch("/settings", dependencies=[Depends(require_writable)])
def patch_settings(body: SettingsPatch):
    """Apply runtime settings. Changes to chunking or embeddings only affect
    documents indexed afterwards -- existing indexes are not silently rewritten."""
    settings = get_settings()
    patch = body.model_dump(exclude_none=True)
    reindex_required = False

    for section in ("chunking", "embedding", "retrieval", "reranker", "llm", "confidence", "context"):
        if section in patch:
            current = getattr(settings, section)
            values = patch[section]
            if section == "llm":
                # Credentials come from the server environment only; a client
                # may retune the model but never inject or replace a key.
                values = {k: v for k, v in values.items() if k != "api_key"}
            updated = current.model_copy(update=values)
            setattr(settings, section, updated)
            if section in ("chunking", "embedding"):
                reindex_required = True
    if "developer_mode" in patch:
        settings.developer_mode = patch["developer_mode"]

    reset_engine_cache()
    return {"saved": True, "reindex_required": reindex_required, "settings": read_settings()}


@router.get("/overview")
def overview(session: Session = Depends(db_session)):
    """Everything the dashboard renders. All counts come from the database."""
    settings = get_settings()
    kb_count = session.query(func.count(KnowledgeBase.id)).scalar() or 0
    doc_count = session.query(func.count(Document.id)).scalar() or 0
    chunk_count = session.query(func.coalesce(func.sum(Document.chunk_count), 0)).scalar() or 0
    bytes_stored = session.query(func.coalesce(func.sum(Document.size_bytes), 0)).scalar() or 0
    pending = (
        session.query(func.count(Document.id))
        .filter(Document.status.in_(["pending", "processing"]))
        .scalar()
        or 0
    )
    failed = session.query(func.count(Document.id)).filter(Document.status == "failed").scalar() or 0
    last_indexed = session.query(func.max(Document.indexed_at)).scalar()

    recent_docs = session.query(Document).order_by(Document.created_at.desc()).limit(6).all()
    recent_convos = session.query(Conversation).order_by(Conversation.updated_at.desc()).limit(6).all()
    recent_activity = session.query(Activity).order_by(Activity.created_at.desc()).limit(12).all()

    return {
        "counts": {
            "knowledge_bases": int(kb_count),
            "documents": int(doc_count),
            "chunks": int(chunk_count),
            "conversations": session.query(func.count(Conversation.id)).scalar() or 0,
        },
        "indexing": {"in_progress": int(pending), "failed": int(failed), "last_indexed_at": last_indexed},
        "storage": {"bytes": int(bytes_stored)},
        "stack": {
            "embedding_model": settings.embedding.model if settings.embedding.provider != "hash-dev" else "hash-dev",
            "llm_model": settings.llm.model,
            "vector_store": settings.vector_store.provider,
            "retrieval": "Hybrid + reranker" if settings.reranker.provider != "none" else "Hybrid",
        },
        "health": system_health(),
        "recent_documents": [
            {"id": d.id, "filename": d.filename, "status": d.status, "chunk_count": d.chunk_count,
             "knowledge_base_id": d.knowledge_base_id, "created_at": d.created_at}
            for d in recent_docs
        ],
        "recent_conversations": [
            {"id": c.id, "title": c.title, "knowledge_base_id": c.knowledge_base_id, "updated_at": c.updated_at}
            for c in recent_convos
        ],
        "activity": [
            {"id": a.id, "kind": a.kind, "summary": a.summary, "created_at": a.created_at, "payload": a.payload}
            for a in recent_activity
        ],
    }
