"""Document ingestion.

Runs in a background thread and writes its progress to the document row, which
is what the upload UI polls. Every stage percentage the interface renders is the
real value written here.
"""
from __future__ import annotations

import hashlib
import shutil
import threading
from datetime import datetime, timezone
from pathlib import Path
from typing import BinaryIO

from ..core.config import Settings, get_settings
from ..core.errors import DocumentParseError, EdgeRAGError, FileTooLargeError, UnsupportedFileError
from ..core.logging import get_logger
from ..core.paths import resolve_within, sanitize_filename
from ..db.models import Activity, Document, KnowledgeBase
from ..db.session import session_scope
from ..providers.loaders import load_document
from ..rag.chunker import RecursiveChunker
from .engine import get_pipeline

log = get_logger("services.ingestion")

STAGES = ["queued", "parsing", "chunking", "embedding", "indexing", "validating", "ready"]
_cancelled: set[str] = set()
_cancel_lock = threading.Lock()


def request_cancel(document_id: str) -> None:
    with _cancel_lock:
        _cancelled.add(document_id)


def _is_cancelled(document_id: str) -> bool:
    with _cancel_lock:
        return document_id in _cancelled


def _clear_cancel(document_id: str) -> None:
    with _cancel_lock:
        _cancelled.discard(document_id)


def _update(document_id: str, **fields) -> None:
    with session_scope() as session:
        document = session.get(Document, document_id)
        if not document:
            return
        log_line = fields.pop("log", None)
        for key, value in fields.items():
            setattr(document, key, value)
        if log_line:
            document.logs = (document.logs or []) + [
                {"at": datetime.now(timezone.utc).isoformat(), "message": log_line}
            ]


def save_upload(
    knowledge_base_id: str,
    filename: str,
    stream: BinaryIO,
    *,
    content_type: str = "",
    settings: Settings | None = None,
) -> Document:
    """Validate and persist an upload, then create the document row."""
    settings = settings or get_settings()
    safe_name = sanitize_filename(filename)
    suffix = Path(safe_name).suffix.lower()
    if suffix not in settings.uploads.allowed_extensions:
        raise UnsupportedFileError(f"'{suffix or safe_name}' is not a supported document type.")

    target_dir = resolve_within(settings.documents_dir, knowledge_base_id)
    target_dir.mkdir(parents=True, exist_ok=True)

    digest = hashlib.sha256()
    size = 0
    temp_path = target_dir / f".incoming-{safe_name}"
    with temp_path.open("wb") as handle:
        while True:
            block = stream.read(1024 * 1024)
            if not block:
                break
            size += len(block)
            if size > settings.uploads.max_file_bytes:
                handle.close()
                temp_path.unlink(missing_ok=True)
                raise FileTooLargeError(
                    f"This file is larger than the {settings.uploads.max_file_bytes // (1024 * 1024)} MB limit."
                )
            digest.update(block)
            handle.write(block)

    if size == 0:
        temp_path.unlink(missing_ok=True)
        raise DocumentParseError("This file is empty.")

    checksum = digest.hexdigest()
    with session_scope() as session:
        knowledge_base = session.get(KnowledgeBase, knowledge_base_id)
        if knowledge_base is None:
            temp_path.unlink(missing_ok=True)
            raise EdgeRAGError("Knowledge base not found.")
        document = Document(
            knowledge_base_id=knowledge_base_id,
            filename=safe_name,
            stored_name="",
            content_type=content_type,
            size_bytes=size,
            sha256=checksum,
            status="pending",
            stage="queued",
        )
        session.add(document)
        session.flush()
        stored = f"{document.id}{suffix}"
        document.stored_name = stored
        # Flush before returning: refreshing here would discard the assignment.
        session.flush()
        final_path = resolve_within(target_dir, stored)
        shutil.move(str(temp_path), final_path)
        session.add(
            Activity(
                knowledge_base_id=knowledge_base_id,
                kind="document.uploaded",
                summary=f"Uploaded {safe_name}",
                payload={"document_id": document.id, "size_bytes": size},
            )
        )
        return document


def document_path(document: Document, settings: Settings | None = None) -> Path:
    settings = settings or get_settings()
    return resolve_within(settings.documents_dir, document.knowledge_base_id, document.stored_name)


def ingest_document(document_id: str, settings: Settings | None = None) -> None:
    """Parse, chunk, embed and index. Safe to re-run: it reindexes in place."""
    settings = settings or get_settings()
    _clear_cancel(document_id)

    with session_scope() as session:
        document = session.get(Document, document_id)
        if document is None:
            return
        knowledge_base = session.get(KnowledgeBase, document.knowledge_base_id)
        collection = knowledge_base.collection
        path = document_path(document, settings)
        name = document.filename

    pipeline = get_pipeline(collection, settings)

    def cancelled() -> bool:
        if _is_cancelled(document_id):
            _update(document_id, status="cancelled", stage="queued", progress=0.0, log="Ingestion cancelled.")
            return True
        return False

    try:
        _update(document_id, status="processing", stage="parsing", progress=0.05, error=None, log="Extracting text.")
        pages, metadata = load_document(path)
        if cancelled():
            return
        _update(
            document_id,
            stage="chunking",
            progress=0.25,
            page_count=metadata.get("page_count", len(pages)),
            doc_metadata=metadata,
            log=f"Extracted {len(pages)} page(s).",
        )

        chunks = RecursiveChunker(settings.chunking).chunk_pages(pages, document_id=document_id, document_name=name)
        if not chunks:
            raise DocumentParseError("No text chunks could be produced from this document.")
        if cancelled():
            return
        _update(
            document_id, stage="embedding", progress=0.35,
            chunk_count=len(chunks), log=f"Created {len(chunks)} chunks.",
        )

        # Reindex safely: drop anything already stored for this document first.
        pipeline.vector_store.delete_document(collection, document_id)
        pipeline.bm25.delete_document(document_id)

        batch_size = settings.embedding.batch_size
        total = len(chunks)
        for start in range(0, total, batch_size):
            if cancelled():
                return
            batch = chunks[start : start + batch_size]
            vectors = pipeline.embeddings.embed_documents([c.text for c in batch])
            pipeline.vector_store.upsert(
                collection,
                [c.id for c in batch],
                vectors,
                [
                    {
                        "document_id": c.document_id,
                        "document_name": c.document_name,
                        "page": c.page,
                        "ordinal": c.ordinal,
                        "char_start": c.char_start,
                        "char_end": c.char_end,
                        "text": c.text,
                    }
                    for c in batch
                ],
            )
            done = min(start + batch_size, total)
            _update(document_id, progress=0.35 + 0.45 * (done / total))

        _update(document_id, stage="indexing", progress=0.85, log="Building the keyword index.")
        pipeline.bm25.add(chunks)

        _update(document_id, stage="validating", progress=0.95, log="Verifying the indexes.")
        indexed = pipeline.vector_store.count(collection)
        if indexed == 0:
            raise EdgeRAGError("Indexing completed but the vector store is empty.")

        now = datetime.now(timezone.utc)
        _update(
            document_id,
            status="ready",
            stage="ready",
            progress=1.0,
            indexed_at=now,
            log=f"Indexed {len(chunks)} chunks.",
        )
        with session_scope() as session:
            knowledge_base = session.get(KnowledgeBase, session.get(Document, document_id).knowledge_base_id)
            knowledge_base.last_indexed_at = now
            session.add(
                Activity(
                    knowledge_base_id=knowledge_base.id,
                    kind="document.indexed",
                    summary=f"Indexed {name}",
                    payload={"document_id": document_id, "chunks": len(chunks)},
                )
            )
        log.info("Indexed %s (%d chunks)", name, len(chunks))

    except EdgeRAGError as exc:
        log.warning("Ingestion failed for %s: %s", name, exc.message)
        _update(document_id, status="failed", error=exc.message, progress=0.0, log=f"Failed: {exc.message}")
    except Exception as exc:  # noqa: BLE001
        log.exception("Unexpected ingestion failure for %s", name)
        _update(document_id, status="failed", error=str(exc), progress=0.0, log=f"Failed: {exc}")
    finally:
        _clear_cancel(document_id)


def ingest_in_background(document_id: str) -> None:
    threading.Thread(target=ingest_document, args=(document_id,), daemon=True).start()
