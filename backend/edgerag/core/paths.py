"""Filesystem safety helpers. Uploaded names are never trusted."""
from __future__ import annotations

import re
import unicodedata
from pathlib import Path

from .errors import ValidationError

_UNSAFE = re.compile(r"[^A-Za-z0-9._-]+")
_RESERVED = {"con", "prn", "aux", "nul", "com1", "lpt1", ".", ".."}


def sanitize_filename(name: str, *, fallback: str = "document") -> str:
    """Strip directories, control characters and separators from a client filename."""
    name = unicodedata.normalize("NFKD", name or "")
    name = name.replace("\\", "/").split("/")[-1]
    name = _UNSAFE.sub("_", name).strip("._-")
    if not name or name.lower() in _RESERVED:
        name = fallback
    stem, dot, suffix = name.rpartition(".")
    return f"{stem[:120]}.{suffix[:16]}" if dot else name[:120]


def resolve_within(root: Path, *parts: str) -> Path:
    """Join under `root` and refuse anything that escapes it."""
    root = root.resolve()
    candidate = root.joinpath(*parts).resolve()
    if candidate != root and root not in candidate.parents:
        raise ValidationError("Resolved path escapes the storage root.")
    return candidate
