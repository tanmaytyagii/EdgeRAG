from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .. import __version__
from ..core.config import get_settings
from ..core.errors import EdgeRAGError
from ..core.logging import configure_logging, get_logger
from .routes import chat, documents, evaluation, knowledge_bases, search, system

log = get_logger("api")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging(settings.log_level)

    app = FastAPI(
        title="EdgeRAG",
        version=__version__,
        description="Private, local-first intelligence for your documents.",
        docs_url="/api/docs",
        openapi_url="/api/openapi.json",
    )

    app.add_middleware(
        CORSMiddleware,
        allow_origins=list(settings.cors_origins),
        allow_credentials=False,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    @app.exception_handler(EdgeRAGError)
    async def handle_app_error(_request: Request, exc: EdgeRAGError):
        return JSONResponse(
            status_code=exc.status_code,
            content={"error": exc.to_dict(include_details=settings.developer_mode)},
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception):
        log.exception("Unhandled error")
        body = {"code": "internal_error", "message": "Something went wrong. Check the server logs."}
        if settings.developer_mode:
            body["details"] = repr(exc)
        return JSONResponse(status_code=500, content={"error": body})

    for module in (knowledge_bases, documents, chat, search, evaluation, system):
        app.include_router(module.router)

    # Serve the built frontend when it exists, so `edgerag serve` is one process.
    static_dir = Path(__file__).resolve().parents[2] / "static"
    if static_dir.is_dir():
        app.mount("/assets", StaticFiles(directory=static_dir / "assets"), name="assets")

        @app.get("/{full_path:path}", include_in_schema=False)
        async def spa(full_path: str):
            candidate = static_dir / full_path
            if full_path and candidate.is_file():
                return FileResponse(candidate)
            return FileResponse(static_dir / "index.html")

    return app


app = create_app()
