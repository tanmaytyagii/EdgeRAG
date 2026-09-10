"""Seed the bundled CC0 samples into a fresh deployment.

The hosted demo runs on ephemeral container storage: every deploy starts with an
empty database, so the sample corpus has to be indexed on boot rather than baked
into an image layer or restored from a volume. This is the whole reason the demo
needs no persistent disk.

It is deliberately inert unless `demo_seed_on_startup` is set, and it does
nothing when documents already exist — a restart with a mounted volume will not
re-index or duplicate anything.

Nothing here is used by a local install.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from sqlalchemy import func

from ..core.config import Settings, get_settings
from ..core.logging import get_logger
from ..db.models import Document, KnowledgeBase
from ..db.session import session_scope

log = get_logger("services.demo_seed")

DEMO_KB_NAME = "EdgeRAG Demo"

# The seeded knowledge base gets a derived, stable id rather than a random one.
#
# A hosted demo has no persistent disk: every new container starts with an empty
# database and re-seeds. With the model's default random uuid4 primary key, the
# demo knowledge base got a different id on every deploy, so any id captured
# earlier — from a saved curl command, the API docs, a bookmarked request —
# resolved to nothing afterwards and the API correctly answered `not_found`.
# Deriving the id from the name makes it reproducible across deployments while
# staying a normal 32-character primary key that is looked up like any other.
DEMO_KB_ID = uuid.uuid5(uuid.NAMESPACE_URL, "https://edgerag.local/demo/EdgeRAG Demo").hex
DEMO_KB_DESCRIPTION = (
    "Public CC0 sample documents shipped with EdgeRAG. This demo is read-only — "
    "run EdgeRAG locally to index your own files."
)


def samples_dir() -> Path:
    """The `samples/` directory that ships next to the backend package."""
    return Path(__file__).resolve().parents[3] / "samples"


def seed_if_empty(settings: Settings | None = None) -> int:
    """Index the samples when the database has no documents yet.

    Returns the number of documents indexed; 0 means it was already populated,
    the samples are missing, or seeding is switched off.
    """
    settings = settings or get_settings()
    if not settings.demo_seed_on_startup:
        return 0

    with session_scope() as session:
        if (session.query(func.count(Document.id)).scalar() or 0) > 0:
            log.info("Demo seed skipped: documents already present.")
            return 0

    root = samples_dir()
    if not root.is_dir():
        log.warning("Demo seed skipped: no samples directory at %s", root)
        return 0

    files = sorted(
        path for path in root.rglob("*") if path.suffix.lower() in settings.uploads.allowed_extensions
    )
    if not files:
        log.warning("Demo seed skipped: no supported files in %s", root)
        return 0

    # Imported here so the module stays importable without the ingestion stack.
    from . import ingestion

    with session_scope() as session:
        knowledge_base = session.query(KnowledgeBase).filter(KnowledgeBase.name == DEMO_KB_NAME).one_or_none()
        if knowledge_base is None:
            knowledge_base = KnowledgeBase(
                id=DEMO_KB_ID,
                name=DEMO_KB_NAME,
                description=DEMO_KB_DESCRIPTION,
                # Recorded the same way the CLI records it, so the index and the
                # knowledge base always agree on which embedder produced it.
                embedding_model=(
                    settings.embedding.model if settings.embedding.provider != "hash-dev" else "hash-dev"
                ),
                config={},
            )
            session.add(knowledge_base)
            session.flush()
        kb_id = knowledge_base.id

    indexed = 0
    for file in files:
        try:
            with file.open("rb") as handle:
                document = ingestion.save_upload(kb_id, file.name, handle)
            ingestion.ingest_document(document.id)
            indexed += 1
        except Exception:  # noqa: BLE001 - one bad sample must not stop the boot
            log.exception("Demo seed failed for %s", file.name)

    log.info("Demo seed indexed %d/%d sample documents into '%s'.", indexed, len(files), DEMO_KB_NAME)
    return indexed
