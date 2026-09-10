"""EdgeRAG command line.

Everything the UI can do, the CLI can do, because both call the same services.
"""
from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

import typer
from rich.console import Console
from rich.panel import Panel
from rich.table import Table

from . import __version__
from .core.config import get_settings
from .core.errors import EdgeRAGError
from .core.logging import configure_logging

app = typer.Typer(help="EdgeRAG — private, local-first intelligence for your documents.", no_args_is_help=True)
console = Console()


def _kb_by_name(session, name: str, create: bool = True):
    from .db.models import KnowledgeBase

    kb = session.query(KnowledgeBase).filter(KnowledgeBase.name == name).first()
    if kb or not create:
        return kb
    settings = get_settings()
    kb = KnowledgeBase(
        name=name,
        description="",
        embedding_model=settings.embedding.model if settings.embedding.provider != "hash-dev" else "hash-dev",
        config={},
    )
    session.add(kb)
    session.flush()
    return kb


@app.command()
def version() -> None:
    """Print the EdgeRAG version."""
    console.print(f"EdgeRAG {__version__}")


@app.command()
def serve(
    host: str = typer.Option(None, help="Bind address."),
    port: int = typer.Option(None, help="Port."),
    reload: bool = typer.Option(False, help="Reload on code changes."),
) -> None:
    """Start the API and, if it has been built, the web interface."""
    import uvicorn

    settings = get_settings()
    configure_logging(settings.log_level)
    console.print(f"[bold]EdgeRAG[/] {__version__}  ·  http://{host or settings.host}:{port or settings.port}")
    uvicorn.run("edgerag.api.app:app", host=host or settings.host, port=port or settings.port, reload=reload)


@app.command()
def ingest(
    path: Path = typer.Argument(..., exists=True, help="A file or a directory of documents."),
    kb: str = typer.Option("Default", "--kb", help="Knowledge base name. Created if it does not exist."),
) -> None:
    """Index a file or every supported file in a directory."""
    from .db.session import session_scope
    from .services import ingestion

    settings = get_settings()
    files = [path] if path.is_file() else sorted(
        p for p in path.rglob("*") if p.suffix.lower() in settings.uploads.allowed_extensions
    )
    if not files:
        console.print("[yellow]No supported documents found.[/]")
        raise typer.Exit(1)

    with session_scope() as session:
        knowledge_base = _kb_by_name(session, kb)
        kb_id = knowledge_base.id

    failures = 0
    for file in files:
        try:
            with file.open("rb") as handle:
                document = ingestion.save_upload(kb_id, file.name, handle)
            ingestion.ingest_document(document.id)
            with session_scope() as session:
                from .db.models import Document

                row = session.get(Document, document.id)
                if row.status == "ready":
                    console.print(f"  [green]✓[/] {file.name}  {row.page_count} pages  {row.chunk_count} chunks")
                else:
                    failures += 1
                    console.print(f"  [red]✗[/] {file.name}  {row.error}")
        except EdgeRAGError as exc:
            failures += 1
            console.print(f"  [red]✗[/] {file.name}  {exc.message}")

    console.print(f"\n{len(files) - failures}/{len(files)} indexed into [bold]{kb}[/].")
    if failures:
        raise typer.Exit(1)


@app.command()
def query(
    question: str = typer.Argument(..., help="The question to ask."),
    kb: str = typer.Option("Default", "--kb"),
    json_output: bool = typer.Option(False, "--json", help="Emit the full result as JSON."),
    retrieval_only: bool = typer.Option(False, "--retrieval-only", help="Skip generation."),
) -> None:
    """Ask a question and print a grounded answer with its citations."""
    from .db.session import session_scope
    from .services.engine import get_pipeline

    with session_scope() as session:
        knowledge_base = _kb_by_name(session, kb, create=False)
        if knowledge_base is None:
            console.print(f"[red]No knowledge base named '{kb}'.[/] Run `edgerag ingest` first.")
            raise typer.Exit(1)
        collection = knowledge_base.collection

    pipeline = get_pipeline(collection)
    try:
        if retrieval_only:
            result, trace = pipeline.retrieve(question)
            table = Table("Rank", "Score", "Retriever", "Document", "Page", "Preview", box=None)
            for rank, candidate in enumerate(result.selected, 1):
                score = candidate.rerank_score if candidate.rerank_score is not None else candidate.fusion_score
                table.add_row(
                    str(rank), f"{score:.4f}", candidate.source, candidate.chunk.document_name,
                    str(candidate.chunk.page or "-"), candidate.chunk.text[:60].replace("\n", " "),
                )
            console.print(table)
            console.print(f"\n{trace.total_ms:.0f} ms total")
            return

        answer = pipeline.answer(question)
        if json_output:
            console.print_json(json.dumps(answer.to_dict()))
            return
        console.print(Panel(answer.text, title="Answer", border_style="cyan"))
        if answer.citations:
            for citation in answer.citations:
                page = f", p. {citation.page}" if citation.page else ""
                console.print(f"  [dim][{citation.index}][/] {citation.document_name}{page} — {citation.excerpt[:90]}…")
        if answer.confidence:
            console.print(f"\n[dim]confidence {answer.confidence.score:.2f} · {answer.trace.total_ms:.0f} ms[/]")
    except EdgeRAGError as exc:
        console.print(f"[red]{exc.message}[/]")
        if exc.remediation:
            console.print(f"[dim]{exc.remediation}[/]")
        raise typer.Exit(1) from exc


@app.command("list")
def list_command() -> None:
    """List knowledge bases and their contents."""
    from sqlalchemy import func

    from .db.models import Document, KnowledgeBase
    from .db.session import session_scope

    table = Table("Knowledge base", "Documents", "Chunks", "Last indexed", box=None)
    with session_scope() as session:
        for kb in session.query(KnowledgeBase).order_by(KnowledgeBase.name).all():
            docs, chunks = (
                session.query(func.count(Document.id), func.coalesce(func.sum(Document.chunk_count), 0))
                .filter(Document.knowledge_base_id == kb.id)
                .one()
            )
            table.add_row(kb.name, str(docs), str(chunks),
                          kb.last_indexed_at.strftime("%Y-%m-%d %H:%M") if kb.last_indexed_at else "never")
    console.print(table)


@app.command()
def models() -> None:
    """Show which models are configured and which are actually installed."""
    from .services.engine import system_health

    health = system_health()
    llm = health["llm"]
    console.print(f"[bold]LLM[/] ({llm['provider']}) → {llm['model']}")
    if llm.get("available"):
        for name in llm.get("models", []):
            marker = "[green]●[/]" if name == llm["model"] else "[dim]○[/]"
            console.print(f"  {marker} {name}")
    else:
        console.print(f"  [red]unreachable[/] — {llm.get('remediation', '')}")
    console.print(f"[bold]Embeddings[/] → {health['embeddings']['model']}")
    console.print(f"[bold]Reranker[/] → {health['reranker']['model'] or 'disabled'}")


@app.command()
def eval(
    kb: str = typer.Option("Default", "--kb"),
    retrieval_only: bool = typer.Option(False, "--retrieval-only"),
) -> None:
    """Run the evaluation cases stored for a knowledge base."""
    from .db.models import EvalCase, EvalRun
    from .db.session import session_scope
    from .evaluation.runner import run_evaluation

    with session_scope() as session:
        knowledge_base = _kb_by_name(session, kb, create=False)
        if knowledge_base is None:
            console.print(f"[red]No knowledge base named '{kb}'.[/]")
            raise typer.Exit(1)
        count = session.query(EvalCase).filter(EvalCase.knowledge_base_id == knowledge_base.id).count()
        if count == 0:
            console.print("[yellow]No evaluation cases defined. Add them on the Evaluations page.[/]")
            raise typer.Exit(1)
        run = EvalRun(knowledge_base_id=knowledge_base.id, config={"retrieval_only": retrieval_only})
        session.add(run)
        session.flush()
        run_id = run.id

    console.print(f"Running {count} case(s)…")
    run_evaluation(run_id, retrieval_only)

    with session_scope() as session:
        summary = session.get(EvalRun, run_id).summary
    table = Table("Metric", "Value", box=None)
    table.add_row("cases", str(summary["cases"]))
    table.add_row("abstained", str(summary["abstained"]))
    table.add_row("mean latency", f"{summary['mean_latency_ms']:.0f} ms" if summary["mean_latency_ms"] else "—")
    for key, value in summary["metrics"].items():
        table.add_row(key.replace("_", " "), f"{value:.3f}" if value is not None else "—")
    console.print(table)


@app.command()
def doctor() -> None:
    """Diagnose the environment: dependencies, models, storage and indexes."""
    from .services.engine import system_health

    settings = get_settings()
    problems: list[str] = []
    table = Table("Check", "Status", "Detail", box=None)

    def row(name: str, ok: bool | None, detail: str) -> None:
        mark = "[green]ok[/]" if ok else ("[yellow]warn[/]" if ok is None else "[red]fail[/]")
        table.add_row(name, mark, detail)

    row("python", sys.version_info >= (3, 10), sys.version.split()[0])

    for package, label, required in [
        ("fastapi", "fastapi", True),
        ("numpy", "numpy", True),
        ("rank_bm25", "rank-bm25", True),
        ("pymupdf", "pymupdf", True),
        ("sentence_transformers", "sentence-transformers", False),
        ("chromadb", "chromadb", False),
        ("docx", "python-docx", False),
    ]:
        try:
            __import__(package)
            row(label, True, "installed")
        except ImportError:
            row(label, False if required else None, "missing" if required else "optional, not installed")
            if required:
                problems.append(f"{label} is required. Run: pip install -e 'backend[all]'")

    try:
        settings.ensure_dirs()
        probe = settings.data_dir / ".write-probe"
        probe.write_text("ok")
        probe.unlink()
        usage = shutil.disk_usage(settings.data_dir)
        row("storage", True, f"{settings.data_dir} · {usage.free // (1024**3)} GB free")
    except OSError as exc:
        row("storage", False, str(exc))
        problems.append(f"Cannot write to {settings.data_dir}.")

    try:
        from .db.models import Document, KnowledgeBase
        from .db.session import session_scope

        with session_scope() as session:
            row("database", True, f"{session.query(KnowledgeBase).count()} knowledge base(s), "
                                  f"{session.query(Document).count()} document(s)")
    except Exception as exc:  # noqa: BLE001
        row("database", False, str(exc))
        problems.append("The database could not be opened.")

    health = system_health()
    llm = health["llm"]
    if llm.get("available") and llm.get("model_installed"):
        row("ollama", True, f"{llm['model']} ready at {llm['base_url']}")
    elif llm.get("available"):
        row("ollama", False, f"model '{llm['model']}' is not pulled")
        problems.append(f"Run: ollama pull {llm['model']}")
    else:
        row("ollama", False, f"unreachable at {llm['base_url']}")
        problems.append("Start Ollama with: ollama serve")

    row("vector store", True, f"{health['vector_store']['provider']}")
    loaded = "loaded" if health["embeddings"]["loaded"] else "lazy"
    row("embeddings", True, f"{health['embeddings']['model']} ({loaded})")
    row("reranker", None if health["reranker"]["model"] is None else True,
        health["reranker"]["model"] or "disabled — retrieval precision will be lower")

    console.print(table)
    if problems:
        console.print("\n[bold]To fix:[/]")
        for problem in problems:
            console.print(f"  · {problem}")
        raise typer.Exit(1)
    console.print("\n[green]Everything checks out.[/]")


@app.command()
def demo(kb: str = typer.Option("EdgeRAG Demo", "--kb")) -> None:
    """Index the bundled CC0 sample documents so you have something to query."""
    root = Path(__file__).resolve().parents[2] / "samples"
    if not root.is_dir():
        console.print("[red]Sample directory not found.[/]")
        raise typer.Exit(1)
    ingest(path=root, kb=kb)
    console.print(f'\nTry: [bold]edgerag query "why is one retriever not enough?" --kb "{kb}"[/]')


def main() -> None:
    app()


if __name__ == "__main__":
    main()
