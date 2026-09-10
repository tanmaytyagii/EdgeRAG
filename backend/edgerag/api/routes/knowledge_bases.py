from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from ...core.config import get_settings
from ...core.errors import ConflictError
from ...db.models import Activity, Conversation, Document, KnowledgeBase
from ...db.session import db_session
from ...schemas.api import KnowledgeBaseCreate, KnowledgeBaseOut, KnowledgeBaseUpdate
from ...services.engine import drop_pipeline, get_pipeline
from ..deps import get_kb

router = APIRouter(prefix="/api/knowledge-bases", tags=["knowledge-bases"])


def serialize(session: Session, kb: KnowledgeBase) -> KnowledgeBaseOut:
    totals = (
        session.query(func.count(Document.id), func.coalesce(func.sum(Document.chunk_count), 0))
        .filter(Document.knowledge_base_id == kb.id)
        .one()
    )
    ready = (
        session.query(func.count(Document.id))
        .filter(Document.knowledge_base_id == kb.id, Document.status == "ready")
        .scalar()
    )
    return KnowledgeBaseOut(
        id=kb.id,
        name=kb.name,
        description=kb.description,
        embedding_model=kb.embedding_model,
        document_count=int(totals[0]),
        chunk_count=int(totals[1]),
        ready_document_count=int(ready or 0),
        config=kb.config or {},
        created_at=kb.created_at,
        updated_at=kb.updated_at,
        last_indexed_at=kb.last_indexed_at,
    )


@router.get("", response_model=list[KnowledgeBaseOut])
def list_knowledge_bases(session: Session = Depends(db_session)):
    rows = session.query(KnowledgeBase).order_by(KnowledgeBase.created_at.desc()).all()
    return [serialize(session, kb) for kb in rows]


@router.post("", response_model=KnowledgeBaseOut, status_code=201)
def create_knowledge_base(body: KnowledgeBaseCreate, session: Session = Depends(db_session)):
    if session.query(KnowledgeBase).filter(KnowledgeBase.name == body.name).first():
        raise ConflictError(f"A knowledge base named '{body.name}' already exists.")
    settings = get_settings()
    kb = KnowledgeBase(
        name=body.name,
        description=body.description,
        embedding_model=settings.embedding.model if settings.embedding.provider != "hash-dev" else "hash-dev",
        config={
            "retrieval": settings.retrieval.model_dump(),
            "reranker": settings.reranker.model_dump(),
            "llm": settings.llm.model_dump(),
            "chunking": settings.chunking.model_dump(),
        },
    )
    session.add(kb)
    session.flush()
    session.add(Activity(knowledge_base_id=kb.id, kind="kb.created", summary=f"Created {kb.name}"))
    return serialize(session, kb)


@router.get("/{knowledge_base_id}", response_model=KnowledgeBaseOut)
def read_knowledge_base(knowledge_base_id: str, session: Session = Depends(db_session)):
    return serialize(session, get_kb(session, knowledge_base_id))


@router.patch("/{knowledge_base_id}", response_model=KnowledgeBaseOut)
def update_knowledge_base(knowledge_base_id: str, body: KnowledgeBaseUpdate, session: Session = Depends(db_session)):
    kb = get_kb(session, knowledge_base_id)
    if body.name and body.name != kb.name:
        if session.query(KnowledgeBase).filter(KnowledgeBase.name == body.name).first():
            raise ConflictError(f"A knowledge base named '{body.name}' already exists.")
        kb.name = body.name
    if body.description is not None:
        kb.description = body.description
    if body.config is not None:
        kb.config = {**(kb.config or {}), **body.config}
    return serialize(session, kb)


@router.delete("/{knowledge_base_id}", status_code=204)
def delete_knowledge_base(knowledge_base_id: str, session: Session = Depends(db_session)):
    kb = get_kb(session, knowledge_base_id)
    pipeline = get_pipeline(kb.collection)
    pipeline.vector_store.drop(kb.collection)
    pipeline.bm25.drop()
    drop_pipeline(kb.collection)
    session.delete(kb)
    session.add(Activity(kind="kb.deleted", summary=f"Deleted {kb.name}"))


@router.post("/{knowledge_base_id}/duplicate", response_model=KnowledgeBaseOut, status_code=201)
def duplicate_knowledge_base(knowledge_base_id: str, session: Session = Depends(db_session)):
    """Copy the configuration, not the index. Documents are re-ingested on demand."""
    source = get_kb(session, knowledge_base_id)
    name = f"{source.name} copy"
    suffix = 2
    while session.query(KnowledgeBase).filter(KnowledgeBase.name == name).first():
        name = f"{source.name} copy {suffix}"
        suffix += 1
    clone = KnowledgeBase(
        name=name,
        description=source.description,
        embedding_model=source.embedding_model,
        config=dict(source.config or {}),
    )
    session.add(clone)
    session.flush()
    session.add(Activity(knowledge_base_id=clone.id, kind="kb.duplicated", summary=f"Duplicated {source.name}"))
    return serialize(session, clone)


@router.get("/{knowledge_base_id}/export")
def export_knowledge_base(knowledge_base_id: str, session: Session = Depends(db_session)):
    """Portable JSON: configuration, document manifest and conversation history."""
    kb = get_kb(session, knowledge_base_id)
    documents = session.query(Document).filter(Document.knowledge_base_id == kb.id).all()
    conversations = session.query(Conversation).filter(Conversation.knowledge_base_id == kb.id).all()
    return {
        "format": "edgerag.kb.v1",
        "knowledge_base": {"name": kb.name, "description": kb.description, "config": kb.config},
        "documents": [
            {
                "filename": d.filename, "sha256": d.sha256, "pages": d.page_count,
                "chunks": d.chunk_count, "status": d.status,
            }
            for d in documents
        ],
        "conversations": [
            {
                "title": c.title,
                "messages": [{"role": m.role, "content": m.content, "citations": m.citations} for m in c.messages],
            }
            for c in conversations
        ],
    }
