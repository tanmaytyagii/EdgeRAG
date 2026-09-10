# Contributing to EdgeRAG

Thanks for considering it. EdgeRAG is a local-first RAG system, and the thing that keeps it
useful is that the retrieval pipeline stays honest and inspectable. Contributions that make it
more so are especially welcome.

## Before you start

- **Bugs**: open an issue with the output of `edgerag doctor`, what you did, and what happened.
- **Features**: open an issue first. A short discussion is cheaper than a rejected pull request.
- **Small fixes**: just send the pull request.

## Setup

```bash
git clone https://github.com/tanmaytyagii/EdgeRAG
cd edgerag
pip install -e "backend[all,dev]"
cd frontend && npm install && cd ..
make dev
```

## Ground rules

**No feature may be visible but non-functional.** If a control appears, it must work. Disabled
with an explanation is fine. Decorative is not.

**No invented numbers.** Every figure the UI shows must come from a measurement or the
database. If a value is unavailable, say so; do not estimate.

**Degrade honestly.** When the reranker is off, or embeddings are `hash-dev`, or Ollama is
unreachable, EdgeRAG says so plainly at every point where it matters.

**Keep the engine independent.** `edgerag.rag` must not import the API, the database or the
service layer. See [docs/contributing.md](docs/contributing.md).

**No third-party documents in the repository.** Samples must be original or explicitly public
domain. Do not commit anything you did not write or that is not clearly redistributable.

## Checks

```bash
make test        # pytest — must pass without torch, Ollama or network
make lint        # ruff
make typecheck   # tsc --noEmit
```

New behaviour needs a test. Bug fixes need a test that fails before the fix.

## Pull requests

- One logical change per pull request.
- Explain *why*, not just what. The diff shows the what.
- Update `docs/` when behaviour changes, and `CHANGELOG.md` under "Unreleased".
- Say what you verified on your own machine and what you did not.

## Commits

Conventional Commits are appreciated but not enforced: `feat:`, `fix:`, `docs:`, `refactor:`,
`test:`, `chore:`.

## Code of Conduct

Participation is governed by [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).
