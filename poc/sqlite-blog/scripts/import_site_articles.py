#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
import sqlite3
from dataclasses import dataclass
from html import unescape
from pathlib import Path
from urllib.parse import urlparse


POC_ROOT = Path(__file__).resolve().parents[1]
REPO_ROOT = Path(__file__).resolve().parents[3]
DEFAULT_DB = POC_ROOT / "db" / "blog.db"
SCHEMA_PATH = POC_ROOT / "schema.sql"
SITE_ROOT = REPO_ROOT / "site"


@dataclass
class ParsedArticle:
    lang: str
    file_slug: str
    default_key: str
    slug: str
    title: str
    excerpt: str
    body_html: str
    seo_title: str
    seo_description: str
    published_at: str
    source_url: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Import existing /site articles into isolated SQLite POC.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="SQLite DB path.")
    parser.add_argument("--site-root", default=str(SITE_ROOT), help="Source site directory (read-only).")
    parser.add_argument("--truncate", action="store_true", help="Clear article/tag tables before import.")
    return parser.parse_args()


def slug_from_href(href: str) -> str:
    path = urlparse(href).path
    name = Path(path).name
    return name[:-5] if name.endswith(".html") else name


def extract_one(pattern: str, text: str, default: str = "", flags: int = re.IGNORECASE | re.DOTALL) -> str:
    m = re.search(pattern, text, flags)
    return m.group(1).strip() if m else default


def strip_tags(html: str) -> str:
    return re.sub(r"<[^>]+>", "", html)


def normalize_ws(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def extract_article_body(html: str) -> str:
    body = extract_one(r"<main[^>]*>\s*<article[^>]*>(.*?)</article>\s*</main>", html)
    if not body:
        body = extract_one(r"<article[^>]*>(.*?)</article>", html)

    # Keep content blocks, remove heading/meta/share controls.
    body = re.sub(r"<h1[^>]*>.*?</h1>", "", body, flags=re.IGNORECASE | re.DOTALL)
    body = re.sub(r"<p[^>]*class=\"meta\"[^>]*>.*?</p>", "", body, flags=re.IGNORECASE | re.DOTALL)
    body = re.sub(r"<div[^>]*class=\"share-bar\"[^>]*>.*?</div>", "", body, flags=re.IGNORECASE | re.DOTALL)
    return body.strip()


def extract_source_url(html: str) -> str | None:
    m = re.search(
        r"<a[^>]+href=\"(https?://[^\"]+)\"[^>]*>\s*(?:Lire|Read)[^<]*(?:source|Source)[^<]*</a>",
        html,
        re.IGNORECASE | re.DOTALL,
    )
    if m:
        return m.group(1)
    return None


def parse_article(path: Path, lang: str) -> ParsedArticle:
    html = path.read_text(encoding="utf-8", errors="ignore")
    file_slug = path.stem

    title_tag = unescape(extract_one(r"<title>(.*?)</title>", html, default=file_slug))
    seo_title = normalize_ws(title_tag)
    seo_description = normalize_ws(unescape(extract_one(r"<meta\s+name=\"description\"\s+content=\"(.*?)\"\s*/?>", html)))
    h1 = normalize_ws(unescape(strip_tags(extract_one(r"<h1[^>]*>(.*?)</h1>", html, default=seo_title))))
    excerpt = normalize_ws(unescape(strip_tags(extract_one(r"<p[^>]*class=\"lead\"[^>]*>(.*?)</p>", html, default=""))))
    published_at = extract_one(r"\"datePublished\"\s*:\s*\"(\d{4}-\d{2}-\d{2})\"", html, default="1970-01-01")
    source_url = extract_source_url(html)
    body_html = extract_article_body(html)

    alt_fr = extract_one(r"<link\s+rel=\"alternate\"\s+hreflang=\"fr\"\s+href=\"([^\"]+)\"", html)
    if alt_fr:
        default_key = slug_from_href(alt_fr)
    else:
        default_key = file_slug if lang == "fr" else file_slug

    return ParsedArticle(
        lang=lang,
        file_slug=file_slug,
        default_key=default_key,
        slug=file_slug,
        title=h1 or seo_title,
        excerpt=excerpt or seo_description,
        body_html=body_html,
        seo_title=seo_title,
        seo_description=seo_description,
        published_at=published_at,
        source_url=source_url,
    )


def parse_tag_labels(blog_html: str) -> dict[str, str]:
    labels: dict[str, str] = {}
    for key, label in re.findall(
        r"<button[^>]*data-filter=\"([^\"]+)\"[^>]*>(.*?)</button>",
        blog_html,
        flags=re.IGNORECASE | re.DOTALL,
    ):
        key = key.strip().lower()
        if not key or key == "all":
            continue
        labels[key] = normalize_ws(unescape(strip_tags(label)))
    return labels


def parse_article_tags(blog_html: str) -> dict[str, set[str]]:
    result: dict[str, set[str]] = {}
    blocks = re.findall(
        r"<article[^>]*class=\"post\"[^>]*data-tags=\"([^\"]+)\"[^>]*>.*?<h2>\s*<a[^>]*href=\"([^\"]+)\"",
        blog_html,
        flags=re.IGNORECASE | re.DOTALL,
    )
    for raw_tags, href in blocks:
        slug = slug_from_href(href)
        tags = {t.strip().lower() for t in raw_tags.split() if t.strip()}
        if not tags:
            continue
        result.setdefault(slug, set()).update(tags)
    return result


def upsert_tag(conn: sqlite3.Connection, key: str) -> int:
    conn.execute("INSERT OR IGNORE INTO tags(key) VALUES (?)", (key,))
    row = conn.execute("SELECT id FROM tags WHERE key = ?", (key,)).fetchone()
    assert row is not None
    return int(row[0])


def import_data(conn: sqlite3.Connection, site_root: Path) -> tuple[int, int]:
    fr_files = sorted(site_root.glob("article-*.html"))
    en_files = sorted((site_root / "en").glob("article-*.html"))

    grouped: dict[str, dict[str, ParsedArticle]] = {}
    for f in fr_files:
        row = parse_article(f, "fr")
        grouped.setdefault(row.default_key, {})["fr"] = row
    for f in en_files:
        row = parse_article(f, "en")
        grouped.setdefault(row.default_key, {})["en"] = row

    fr_blog = (site_root / "blog.html").read_text(encoding="utf-8", errors="ignore")
    en_blog = (site_root / "en" / "blog.html").read_text(encoding="utf-8", errors="ignore")
    fr_labels = parse_tag_labels(fr_blog)
    en_labels = parse_tag_labels(en_blog)
    fr_tags_by_slug = parse_article_tags(fr_blog)
    en_tags_by_slug = parse_article_tags(en_blog)

    article_count = 0
    translation_count = 0

    for default_key, langs in sorted(grouped.items()):
        representative = langs.get("fr") or langs.get("en")
        if representative is None:
            continue
        conn.execute(
            """
            INSERT INTO articles(slug_default, published_at, status, source_url)
            VALUES (?, ?, 'published', ?)
            ON CONFLICT(slug_default) DO UPDATE SET
              published_at=excluded.published_at,
              status='published',
              source_url=excluded.source_url,
              updated_at=datetime('now')
            """,
            (default_key, representative.published_at, representative.source_url),
        )
        article_id = int(
            conn.execute("SELECT id FROM articles WHERE slug_default = ?", (default_key,)).fetchone()[0]
        )
        article_count += 1

        for lang in ("fr", "en"):
            row = langs.get(lang)
            if row is None:
                continue
            conn.execute(
                """
                INSERT INTO article_i18n(
                  article_id, lang, slug, title, excerpt, body_html,
                  seo_title, seo_description, is_complete
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                ON CONFLICT(article_id, lang) DO UPDATE SET
                  slug=excluded.slug,
                  title=excluded.title,
                  excerpt=excluded.excerpt,
                  body_html=excluded.body_html,
                  seo_title=excluded.seo_title,
                  seo_description=excluded.seo_description,
                  is_complete=1
                """,
                (
                    article_id,
                    lang,
                    row.slug,
                    row.title,
                    row.excerpt,
                    row.body_html,
                    row.seo_title,
                    row.seo_description,
                ),
            )
            translation_count += 1

        # Tags: prioritize FR blog mapping, fallback EN.
        tag_keys = set()
        if "fr" in langs:
            tag_keys.update(fr_tags_by_slug.get(langs["fr"].slug, set()))
        if not tag_keys and "en" in langs:
            tag_keys.update(en_tags_by_slug.get(langs["en"].slug, set()))

        for key in sorted(tag_keys):
            if not re.fullmatch(r"[a-z0-9-]+", key):
                continue
            tag_id = upsert_tag(conn, key)
            fr_label = fr_labels.get(key, key.replace("-", " ").capitalize())
            en_label = en_labels.get(key, fr_label)
            conn.execute(
                """
                INSERT INTO tag_i18n(tag_id, lang, label)
                VALUES (?, 'fr', ?)
                ON CONFLICT(tag_id, lang) DO UPDATE SET label=excluded.label
                """,
                (tag_id, fr_label),
            )
            conn.execute(
                """
                INSERT INTO tag_i18n(tag_id, lang, label)
                VALUES (?, 'en', ?)
                ON CONFLICT(tag_id, lang) DO UPDATE SET label=excluded.label
                """,
                (tag_id, en_label),
            )
            conn.execute(
                "INSERT OR IGNORE INTO article_tags(article_id, tag_id) VALUES (?, ?)",
                (article_id, tag_id),
            )

    return article_count, translation_count


def main() -> None:
    args = parse_args()
    db_path = Path(args.db).resolve()
    site_root = Path(args.site_root).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))

        if args.truncate:
            conn.executescript(
                """
                DELETE FROM article_tags;
                DELETE FROM tag_i18n;
                DELETE FROM tags;
                DELETE FROM article_i18n;
                DELETE FROM articles;
                """
            )

        articles, translations = import_data(conn, site_root)
        conn.commit()
    finally:
        conn.close()

    print(f"Imported {articles} articles / {translations} translations from {site_root}")
    print(f"DB updated: {db_path}")


if __name__ == "__main__":
    main()
