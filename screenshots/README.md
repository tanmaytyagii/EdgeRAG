# screenshots

The images the root [README](../README.md) uses.

Every one is a real EdgeRAG run over the bundled CC0 samples in [`samples/`](../samples) — indexed
with `edgerag demo`, then captured from the running interface. Nothing here is a mock-up: the same
rule that keeps invented statistics out of the dashboard keeps invented screenshots out of the
README, so each frame shows counts, scores and timings the software actually produced.

| File | Page |
| --- | --- |
| `landing.png` | Landing page |
| `overview.png` | Dashboard — live index counts and component health |
| `knowledge-bases.png` | Knowledge base list |
| `documents.png` | Ingestion, with per-file status and chunk counts |
| `chat.png` | An answer with its retrieval trace, confidence signals and context |
| `explorer.png` | Dense / BM25 / fused / reranked comparison |
| `pipeline.png` | Retrieval pipeline trace |
| `evaluations.png` | Evaluation runs |

## Regenerating them

```bash
pip install playwright && playwright install chromium

edgerag demo          # index the bundled CC0 samples
edgerag serve         # in another terminal

python scripts/capture-screenshots.py
```

That rewrites the files above at 2× scale. Useful flags: `--theme light`, `--full-page`,
`--base-url`, `--width`.

Ask a question first for the chat and explorer views — an empty state makes a poor screenshot, and a
query such as *"Why is one retriever not enough?"* gives every page something real to show. Run each
query twice before capturing: the first one includes one-time model loading, so its timings are not
representative.

## Before committing images

- Check every filename, document title, answer and citation excerpt visible in the frame. Screenshots
  of a personal corpus leak its contents.
- `*.png` under this directory is **not** git-ignored, so images added here are committed deliberately.
- Keep them under a few hundred KB each. Do not reach for Git LFS; if an image needs LFS it is too
  large for a README.
