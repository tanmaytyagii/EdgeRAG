from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...db.session import db_session
from ...schemas.api import SearchRequest
from ..deps import apply_overrides, get_kb, pipeline_for

router = APIRouter(prefix="/api", tags=["retrieval"])


@router.post("/search")
def search(body: SearchRequest, session: Session = Depends(db_session)):
    """Retrieval only -- no LLM. Powers the Retrieval Explorer."""
    kb = get_kb(session, body.knowledge_base_id)
    pipeline = pipeline_for(session, kb.id)
    overrides = apply_overrides(get_settings().retrieval, body.overrides)
    result, trace = pipeline.retrieve(body.query, overrides=overrides)
    return {
        "query": body.query,
        "knowledge_base": {"id": kb.id, "name": kb.name},
        "dense": [c.to_dict(include_text=False) for c in result.dense],
        "sparse": [c.to_dict(include_text=False) for c in result.sparse],
        "fused": [c.to_dict(include_text=False) for c in result.fused],
        "reranked": [c.to_dict(include_text=False) for c in result.reranked],
        "selected": [c.to_dict(include_text=False) for c in result.selected],
        "reranker_applied": result.reranker_applied,
        "trace": trace.to_dict(),
        "config": overrides.model_dump(),
    }


@router.post("/retrieval/debug")
def retrieval_debug(body: SearchRequest, session: Session = Depends(db_session)):
    """Same retrieval, plus full chunk text and the exact context that would be sent."""
    from ...rag.context import build_context

    kb = get_kb(session, body.knowledge_base_id)
    pipeline = pipeline_for(session, kb.id)
    overrides = apply_overrides(get_settings().retrieval, body.overrides)
    result, trace = pipeline.retrieve(body.query, overrides=overrides)
    built = build_context(result.selected, get_settings().context)
    return {
        "query": body.query,
        "stages": {
            "dense": [c.to_dict() for c in result.dense],
            "sparse": [c.to_dict() for c in result.sparse],
            "fused": [c.to_dict() for c in result.fused],
            "reranked": [c.to_dict() for c in result.reranked],
        },
        "context": {
            "text": built.text, "characters": built.total_chars,
            "chunks_used": len(built.used), "dropped": built.dropped,
        },
        "reranker_applied": result.reranker_applied,
        "trace": trace.to_dict(),
    }
