from __future__ import annotations

from fastapi import Depends
from sqlalchemy.orm import Session

from ..core.config import RetrievalSettings, Settings, get_settings
from ..core.errors import DemoModeError, NotFoundError
from ..db.models import KnowledgeBase
from ..db.session import db_session
from ..schemas.api import RetrievalOverrides
from ..services.engine import get_pipeline


def settings_dep() -> Settings:
    return get_settings()


def require_writable() -> None:
    """Refuse mutating requests on the public demo.

    The hosted demo runs on ephemeral storage with a fixed sample corpus and an
    anonymous audience, so ingestion, deletion and settings writes are closed
    there. Locally `demo_mode` is off and every one of them works as before —
    indexing private documents is the product.
    """
    if get_settings().demo_mode:
        raise DemoModeError("This public demo is read-only.")


def get_kb(session: Session, knowledge_base_id: str) -> KnowledgeBase:
    knowledge_base = session.get(KnowledgeBase, knowledge_base_id)
    if knowledge_base is None:
        raise NotFoundError(f"No knowledge base with id '{knowledge_base_id}'.")
    return knowledge_base


def pipeline_for(session: Session, knowledge_base_id: str):
    return get_pipeline(get_kb(session, knowledge_base_id).collection)


def apply_overrides(base: RetrievalSettings, overrides: RetrievalOverrides | None) -> RetrievalSettings:
    if overrides is None:
        return base
    patch = overrides.model_dump(exclude_none=True)
    if not patch:
        return base
    return base.model_copy(update=patch)


SessionDep = Depends(db_session)
