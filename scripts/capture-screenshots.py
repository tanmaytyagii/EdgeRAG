#!/usr/bin/env python3
"""Capture the screenshots referenced by the README.

EdgeRAG ships no pre-rendered screenshots: an image of an interface showing
data that was never indexed is a fake screenshot, and this project does not use
those. Run this against your own running instance instead.

    pip install playwright && playwright install chromium
    edgerag serve                     # in another terminal
    python scripts/capture-screenshots.py

The images land in screenshots/ and are git-ignored by default; commit them
deliberately if you want them in your fork's README, and check first that no
document title, filename or answer text in them is confidential.
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

SHOTS: list[tuple[str, str, str]] = [
    ("overview", "/app", "Dashboard with live index counts"),
    ("knowledge-bases", "/app/knowledge-bases", "Knowledge base list"),
    ("documents", "/app/documents", "Ingestion with per-stage progress"),
    ("chat", "/app/chat", "A grounded answer with citations"),
    ("explorer", "/app/explorer", "Dense / BM25 / fused / reranked comparison"),
    ("pipeline", "/app/pipeline", "Retrieval pipeline trace"),
    ("evaluations", "/app/evaluations", "Evaluation runs"),
    ("landing", "/", "Landing page"),
]


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--base-url", default="http://localhost:8000")
    parser.add_argument("--out", type=Path, default=Path(__file__).resolve().parents[1] / "screenshots")
    parser.add_argument("--width", type=int, default=1440)
    parser.add_argument("--height", type=int, default=900)
    parser.add_argument("--theme", choices=["dark", "light"], default="dark")
    parser.add_argument("--full-page", action="store_true")
    args = parser.parse_args()

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print("Playwright is not installed. Run:", file=sys.stderr)
        print("    pip install playwright && playwright install chromium", file=sys.stderr)
        return 1

    args.out.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        page = browser.new_page(
            viewport={"width": args.width, "height": args.height},
            device_scale_factor=2,
            color_scheme=args.theme,
        )
        for name, path, description in SHOTS:
            url = f"{args.base_url.rstrip('/')}{path}"
            try:
                page.goto(url, wait_until="networkidle", timeout=20_000)
                page.wait_for_timeout(700)  # let counts and health polling settle
                target = args.out / f"{name}.png"
                page.screenshot(path=str(target), full_page=args.full_page)
                print(f"  {target.name:24} {description}")
            except Exception as exc:  # noqa: BLE001 - report and continue
                print(f"  {name:24} FAILED: {exc}", file=sys.stderr)
        browser.close()

    print(f"\nWrote to {args.out}")
    print("Review each image for confidential filenames or answer text before committing.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
