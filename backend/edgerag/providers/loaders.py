"""Document loaders. Text extraction only -- nothing in an uploaded file is ever executed."""
from __future__ import annotations

from pathlib import Path
from typing import Any

from ..core.errors import DocumentParseError, UnsupportedFileError
from ..rag.chunker import Page


class PDFLoader:
    extensions = (".pdf",)

    def load(self, path: Path) -> tuple[list[Page], dict[str, Any]]:
        try:
            import pymupdf
        except ImportError:
            try:
                import fitz as pymupdf  # type: ignore[no-redef]
            except ImportError as exc:
                raise DocumentParseError("PyMuPDF is not installed.", details=str(exc)) from exc
        try:
            document = pymupdf.open(path)
        except Exception as exc:  # noqa: BLE001
            raise DocumentParseError("This file could not be opened as a PDF.", details=str(exc)) from exc

        pages: list[Page] = []
        with document:
            metadata = {
                "title": (document.metadata or {}).get("title") or "",
                "author": (document.metadata or {}).get("author") or "",
                "page_count": document.page_count,
            }
            for number, page in enumerate(document, start=1):
                pages.append(Page(number=number, text=page.get_text("text")))

        if not any(p.text.strip() for p in pages):
            raise DocumentParseError(
                "No readable text was extracted from this PDF.",
                remediation="The file is probably a scan. Run OCR on it, then upload it again.",
            )
        return pages, metadata


class TextLoader:
    extensions = (".txt", ".md", ".markdown")

    def load(self, path: Path) -> tuple[list[Page], dict[str, Any]]:
        try:
            body = path.read_text(encoding="utf-8", errors="replace")
        except OSError as exc:
            raise DocumentParseError("This file could not be read.", details=str(exc)) from exc
        if not body.strip():
            raise DocumentParseError("This file is empty.")
        # Plain text has no pages. Split on form feeds if present, else one page.
        parts = body.split("\f")
        pages = [Page(number=i if len(parts) > 1 else None, text=part) for i, part in enumerate(parts, start=1)]
        return pages, {"title": path.stem, "page_count": len(pages)}


class DocxLoader:
    extensions = (".docx",)

    def load(self, path: Path) -> tuple[list[Page], dict[str, Any]]:
        try:
            import docx  # python-docx
        except ImportError as exc:
            raise DocumentParseError(
                "python-docx is not installed.",
                remediation="Install it with `pip install python-docx` to index Word documents.",
                details=str(exc),
            ) from exc
        try:
            document = docx.Document(str(path))
        except Exception as exc:  # noqa: BLE001
            raise DocumentParseError("This file could not be opened as a Word document.", details=str(exc)) from exc
        body = "\n\n".join(p.text for p in document.paragraphs if p.text.strip())
        if not body.strip():
            raise DocumentParseError("No readable text was extracted from this document.")
        return [Page(number=None, text=body)], {"title": path.stem, "page_count": 1}


_LOADERS = [PDFLoader(), TextLoader(), DocxLoader()]


def loader_for(path: Path):
    suffix = path.suffix.lower()
    for loader in _LOADERS:
        if suffix in loader.extensions:
            return loader
    raise UnsupportedFileError(f"'{suffix or path.name}' is not a supported document type.")


def load_document(path: Path) -> tuple[list[Page], dict[str, Any]]:
    return loader_for(path).load(path)
