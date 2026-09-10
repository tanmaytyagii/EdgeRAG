from __future__ import annotations

from fastapi import APIRouter, Depends, File, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from ...core.errors import NotFoundError, ValidationError
from ...db.models import Activity, Document
from ...db.session import db_session
from ...schemas.api import DocumentOut
from ...services import ingestion
from ...services.engine import get_pipeline
from ..deps import get_kb, require_writable

router = APIRouter(prefix="/api", tags=["documents"])


def serialize(document: Document) -> DocumentOut:
    return DocumentOut(
        id=document.id,
        knowledge_base_id=document.knowledge_base_id,
        filename=document.filename,
        content_type=document.content_type,
        size_bytes=document.size_bytes,
        page_count=document.page_count,
        chunk_count=document.chunk_count,
        status=document.status,
        stage=document.stage,
        progress=document.progress,
        error=document.error,
        logs=document.logs or [],
        metadata=document.doc_metadata or {},
        created_at=document.created_at,
        indexed_at=document.indexed_at,
    )


def _get(session: Session, document_id: str) -> Document:
    document = session.get(Document, document_id)
    if document is None:
        raise NotFoundError(f"No document with id '{document_id}'.")
    return document


@router.get("/knowledge-bases/{knowledge_base_id}/documents", response_model=list[DocumentOut])
def list_documents(knowledge_base_id: str, session: Session = Depends(db_session)):
    get_kb(session, knowledge_base_id)
    rows = (
        session.query(Document)
        .filter(Document.knowledge_base_id == knowledge_base_id)
        .order_by(Document.created_at.desc())
        .all()
    )
    return [serialize(d) for d in rows]


@router.post(
    "/knowledge-bases/{knowledge_base_id}/documents",
    response_model=DocumentOut,
    status_code=202,
    dependencies=[Depends(require_writable)],
)
async def upload_document(
    knowledge_base_id: str,
    file: UploadFile = File(...),
    session: Session = Depends(db_session),
):
    get_kb(session, knowledge_base_id)
    if not file.filename:
        raise ValidationError("The upload has no filename.")
    document = ingestion.save_upload(
        knowledge_base_id, file.filename, file.file, content_type=file.content_type or ""
    )
    ingestion.ingest_in_background(document.id)
    return serialize(document)


@router.get("/documents/{document_id}", response_model=DocumentOut)
def read_document(document_id: str, session: Session = Depends(db_session)):
    return serialize(_get(session, document_id))


@router.get("/documents/{document_id}/file")
def download_document(document_id: str, session: Session = Depends(db_session)):
    """Serve the original file so the viewer can render the real PDF."""
    document = _get(session, document_id)
    path = ingestion.document_path(document)
    if not path.exists():
        raise NotFoundError("The stored file for this document is missing.")
    media = "application/pdf" if path.suffix.lower() == ".pdf" else "text/plain; charset=utf-8"
    return FileResponse(path, media_type=media, filename=document.filename)


@router.get("/documents/{document_id}/chunks")
def document_chunks(document_id: str, session: Session = Depends(db_session)):
    """Chunk text with page and character offsets, used to highlight passages."""
    document = _get(session, document_id)
    kb = get_kb(session, document.knowledge_base_id)
    pipeline = get_pipeline(kb.collection)
    return [c.to_dict() for c in pipeline.bm25.document_chunks(document_id)]


@router.post(
    "/documents/{document_id}/reindex",
    response_model=DocumentOut,
    status_code=202,
    dependencies=[Depends(require_writable)],
)
def reindex_document(document_id: str, session: Session = Depends(db_session)):
    document = _get(session, document_id)
    document.status = "pending"
    document.stage = "queued"
    document.progress = 0.0
    document.error = None
    document.logs = []
    session.flush()
    ingestion.ingest_in_background(document_id)
    return serialize(document)


@router.post("/documents/{document_id}/cancel", response_model=DocumentOut, dependencies=[Depends(require_writable)])
def cancel_document(document_id: str, session: Session = Depends(db_session)):
    document = _get(session, document_id)
    ingestion.request_cancel(document_id)
    return serialize(document)


@router.delete("/documents/{document_id}", status_code=204, dependencies=[Depends(require_writable)])
def delete_document(document_id: str, session: Session = Depends(db_session)):
    document = _get(session, document_id)
    kb = get_kb(session, document.knowledge_base_id)
    pipeline = get_pipeline(kb.collection)
    pipeline.vector_store.delete_document(kb.collection, document_id)
    pipeline.bm25.delete_document(document_id)
    path = ingestion.document_path(document)
    path.unlink(missing_ok=True)
    name = document.filename
    session.delete(document)
    session.add(Activity(knowledge_base_id=kb.id, kind="document.deleted", summary=f"Removed {name}"))
