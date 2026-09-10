from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from sqlalchemy import create_engine, event
from sqlalchemy.orm import Session, sessionmaker

from ..core.config import get_settings
from .models import Base

_engine = None
_factory = None


def _build(db_path: Path):
    engine = create_engine(
        f"sqlite:///{db_path}",
        connect_args={"check_same_thread": False},
        future=True,
    )

    @event.listens_for(engine, "connect")
    def _pragmas(dbapi_connection, _record):  # pragma: no cover - driver level
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()

    Base.metadata.create_all(engine)
    return engine


def get_engine():
    global _engine, _factory
    if _engine is None:
        settings = get_settings()
        settings.ensure_dirs()
        _engine = _build(settings.db_path)
        _factory = sessionmaker(bind=_engine, expire_on_commit=False, future=True)
    return _engine


def get_session_factory():
    get_engine()
    return _factory


@contextmanager
def session_scope() -> Iterator[Session]:
    factory = get_session_factory()
    session = factory()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def db_session() -> Iterator[Session]:
    """FastAPI dependency."""
    with session_scope() as session:
        yield session


def reset_engine() -> None:
    """Used by tests after pointing EDGERAG_DATA_DIR somewhere new."""
    global _engine, _factory
    if _engine is not None:
        _engine.dispose()
    _engine = None
    _factory = None
