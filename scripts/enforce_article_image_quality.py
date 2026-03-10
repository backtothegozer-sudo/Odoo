#!/usr/bin/env python3
"""
Enforce local article image quality for site/article-*.html.

Rules:
- Only local images are accepted in article figures.
- If a figure image is below min width OR min height, remove the figure.
- If a figure is removed, remove og:image and twitter:image meta tags.

Usage:
  python3 scripts/enforce_article_image_quality.py
  python3 scripts/enforce_article_image_quality.py --site-dir site --min-width 1000 --min-height 600
  python3 scripts/enforce_article_image_quality.py --dry-run
"""

from __future__ import annotations

import argparse
import re
import subprocess
from pathlib import Path


FIGURE_RE = re.compile(
    r"\n\s*<figure class=\"article-media[^\"]*\">[\s\S]*?<img src=\"([^\"]+)\"[^>]*>[\s\S]*?</figure>\n",
    re.IGNORECASE,
)
OG_IMAGE_RE = re.compile(r"\n\s*<meta property=\"og:image\"[^\n]*", re.IGNORECASE)
TW_IMAGE_RE = re.compile(r"\n\s*<meta name=\"twitter:image\"[^\n]*", re.IGNORECASE)


def get_size(path: Path) -> tuple[int, int]:
    cmd = ["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(path)]
    out = subprocess.check_output(cmd, text=True, stderr=subprocess.DEVNULL)
    mw = re.search(r"pixelWidth:\s*(\d+)", out)
    mh = re.search(r"pixelHeight:\s*(\d+)", out)
    if not mw or not mh:
        raise RuntimeError(f"Unable to read image size: {path}")
    return int(mw.group(1)), int(mh.group(1))


def resolve_local_path(site_dir: Path, src: str) -> Path | None:
    if src.startswith("http://") or src.startswith("https://"):
        return None
    clean = src.lstrip("/")
    return (site_dir / clean).resolve()


def process_article(
    article_path: Path,
    site_dir: Path,
    min_width: int,
    min_height: int,
    dry_run: bool,
) -> str:
    html = article_path.read_text()
    match = FIGURE_RE.search(html)
    if not match:
        return "no-figure"

    src = match.group(1)
    local_path = resolve_local_path(site_dir, src)
    if local_path is None:
        # Remote image is not allowed by policy.
        new_html = FIGURE_RE.sub("\n\n", html, count=1)
        new_html = OG_IMAGE_RE.sub("", new_html)
        new_html = TW_IMAGE_RE.sub("", new_html)
        if not dry_run:
            article_path.write_text(new_html)
        return "removed-remote"

    if not local_path.exists():
        new_html = FIGURE_RE.sub("\n\n", html, count=1)
        new_html = OG_IMAGE_RE.sub("", new_html)
        new_html = TW_IMAGE_RE.sub("", new_html)
        if not dry_run:
            article_path.write_text(new_html)
        return "removed-missing"

    width, height = get_size(local_path)
    if width < min_width or height < min_height:
        new_html = FIGURE_RE.sub("\n\n", html, count=1)
        new_html = OG_IMAGE_RE.sub("", new_html)
        new_html = TW_IMAGE_RE.sub("", new_html)
        if not dry_run:
            article_path.write_text(new_html)
        return f"removed-low-quality({width}x{height})"

    return f"kept({width}x{height})"


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--site-dir", default="site", help="Site root directory")
    parser.add_argument("--min-width", type=int, default=1000)
    parser.add_argument("--min-height", type=int, default=600)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    site_dir = Path(args.site_dir).resolve()
    if not site_dir.exists():
        raise SystemExit(f"Site directory not found: {site_dir}")

    articles = sorted(site_dir.glob("article-*.html"))
    if not articles:
        print("No article files found.")
        return 0

    changed = 0
    for article in articles:
        status = process_article(
            article_path=article,
            site_dir=site_dir,
            min_width=args.min_width,
            min_height=args.min_height,
            dry_run=args.dry_run,
        )
        if status.startswith("removed-"):
            changed += 1
        print(f"{article.name}: {status}")

    mode = "dry-run" if args.dry_run else "apply"
    print(f"\nDone ({mode}). Removed figures in {changed} article(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
