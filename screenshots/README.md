# screenshots

**This directory is intentionally empty of images.**

EdgeRAG shows real data from a real index. A screenshot of the interface filled
with documents nobody indexed would be a mock-up, and this project does not ship
mock-ups — the same rule that keeps invented statistics out of the dashboard
keeps invented screenshots out of the README.

## Producing them

```bash
pip install playwright && playwright install chromium

edgerag demo          # index the bundled CC0 samples
edgerag serve         # in another terminal

python scripts/capture-screenshots.py
```

That writes `overview.png`, `documents.png`, `chat.png`, `explorer.png`,
`pipeline.png`, `evaluations.png` and `landing.png` here at 2× scale.

Useful flags: `--theme light`, `--full-page`, `--base-url`, `--width`.

For the chat and explorer views, ask a question first — an empty state makes a
poor screenshot. `edgerag demo` plus a question such as *"Why is one retriever
not enough?"* gives every page something real to show.

## Before committing images

- Check every filename, document title, answer and citation excerpt visible in the frame. Screenshots of a personal corpus leak its contents.
- `*.png` under this directory is **not** git-ignored, so images you add here are committed deliberately.
- Keep them under a few hundred KB each. Do not reach for Git LFS; if an image needs LFS it is too large for a README.

Then reference them from the README, replacing the placeholder list in the
Screenshots section.
