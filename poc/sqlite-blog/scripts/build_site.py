#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable


ROOT = Path(__file__).resolve().parents[1]
DEFAULT_DB = ROOT / "db" / "blog.db"
DEFAULT_OUT = ROOT / "out"


@dataclass
class ArticleRow:
    article_id: int
    published_at: str
    source_url: str | None
    slug: str
    title: str
    excerpt: str
    body_html: str
    seo_title: str
    seo_description: str
    counterpart_slug: str | None


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Build static FR/EN blog pages from SQLite POC.")
    parser.add_argument("--db", default=str(DEFAULT_DB), help="Path to SQLite DB.")
    parser.add_argument("--out", default=str(DEFAULT_OUT), help="Output directory for generated files.")
    parser.add_argument("--base-url", default="https://ai.underside.be", help="Base URL for canonical/sitemap.")
    return parser.parse_args()


def fetch_articles(conn: sqlite3.Connection, lang: str) -> list[ArticleRow]:
    counterpart = "en" if lang == "fr" else "fr"
    query = """
      SELECT
        a.id AS article_id,
        a.published_at,
        a.source_url,
        i.slug,
        i.title,
        i.excerpt,
        i.body_html,
        i.seo_title,
        i.seo_description,
        ic.slug AS counterpart_slug
      FROM articles a
      JOIN article_i18n i
        ON i.article_id = a.id
       AND i.lang = ?
       AND i.is_complete = 1
      LEFT JOIN article_i18n ic
        ON ic.article_id = a.id
       AND ic.lang = ?
       AND ic.is_complete = 1
      WHERE a.status = 'published'
      ORDER BY a.published_at DESC, a.id DESC
    """
    rows = conn.execute(query, (lang, counterpart)).fetchall()
    return [
        ArticleRow(
            article_id=row["article_id"],
            published_at=row["published_at"],
            source_url=row["source_url"],
            slug=row["slug"],
            title=row["title"],
            excerpt=row["excerpt"],
            body_html=row["body_html"],
            seo_title=row["seo_title"],
            seo_description=row["seo_description"],
            counterpart_slug=row["counterpart_slug"],
        )
        for row in rows
    ]


def fetch_tags_by_article(conn: sqlite3.Connection, lang: str) -> dict[int, list[str]]:
    query = """
      SELECT
        at.article_id,
        COALESCE(ti.label, t.key) AS label
      FROM article_tags at
      JOIN tags t ON t.id = at.tag_id
      LEFT JOIN tag_i18n ti
        ON ti.tag_id = t.id
       AND ti.lang = ?
      ORDER BY at.article_id, label
    """
    rows = conn.execute(query, (lang,)).fetchall()
    result: dict[int, list[str]] = {}
    for row in rows:
        result.setdefault(int(row["article_id"]), []).append(str(row["label"]))
    return result


def fetch_missing_translations(conn: sqlite3.Connection) -> list[dict]:
    rows = conn.execute(
        """
        SELECT id, slug_default, published_at, missing_fr, missing_en
        FROM v_missing_translations
        ORDER BY published_at DESC, id DESC
        """
    ).fetchall()
    return [
        {
            "id": int(row["id"]),
            "slug_default": row["slug_default"],
            "published_at": row["published_at"],
            "missing_fr": bool(row["missing_fr"]),
            "missing_en": bool(row["missing_en"]),
        }
        for row in rows
        if row["missing_fr"] or row["missing_en"]
    ]


def ensure_dirs(out_dir: Path) -> None:
    (out_dir / "en").mkdir(parents=True, exist_ok=True)


def clean_output(out_dir: Path) -> None:
    for pattern in ("*.html", "*.xml", "*.json"):
        for p in out_dir.glob(pattern):
            if p.name == ".gitkeep":
                continue
            p.unlink(missing_ok=True)
        for p in (out_dir / "en").glob(pattern):
            if p.name == ".gitkeep":
                continue
            p.unlink(missing_ok=True)


def lang_switch_html(lang: str, article: ArticleRow | None = None) -> str:
    if article is None:
        fr_href = "index.html" if lang == "fr" else "../index.html"
        en_href = "en/index.html" if lang == "fr" else "index.html"
    else:
        if lang == "fr":
            fr_href = f"{article.slug}.html"
            en_href = f"en/{article.counterpart_slug}.html" if article.counterpart_slug else ""
        else:
            fr_href = f"../{article.counterpart_slug}.html" if article.counterpart_slug else ""
            en_href = f"{article.slug}.html"

    fr_class = "is-active" if lang == "fr" else ""
    en_class = "is-active" if lang == "en" else ""
    fr_link = f'<a class="lang-btn {fr_class}" href="{fr_href}">FR</a>' if fr_href else '<span class="lang-btn is-disabled">FR</span>'
    en_link = f'<a class="lang-btn {en_class}" href="{en_href}">EN</a>' if en_href else '<span class="lang-btn is-disabled">EN</span>'
    return f'<div class="lang-switch">{fr_link}{en_link}</div>'


def common_style() -> str:
    return """
    <style>
      :root { --bg:#060607; --ink:#f5f7fb; --muted:#cbd2dc; --line:rgba(255,255,255,.12); --a:#e64bff; --b:#4b5bff; }
      * { box-sizing: border-box; }
      body { margin: 0; background: var(--bg); color: var(--ink); font-family: Manrope, -apple-system, system-ui, sans-serif; }
      .wrap { width: min(1000px, 92vw); margin: 0 auto; }
      header { border-bottom: 1px solid rgba(255,255,255,.08); background: rgba(6,6,7,.82); backdrop-filter: blur(10px); position: sticky; top: 0; z-index: 5; }
      .top { display:flex; justify-content:space-between; align-items:center; min-height:72px; gap:16px; }
      .brand { font-weight: 800; letter-spacing: .01em; text-decoration:none; color:var(--ink); font-size: 30px; }
      .lang-switch { display:inline-flex; gap:6px; padding:4px; border:1px solid var(--line); border-radius:999px; background: rgba(11,12,18,.75); }
      .lang-btn { text-decoration:none; color:var(--ink); opacity:.82; border-radius:999px; padding:6px 10px; font-size:12px; }
      .lang-btn.is-active { opacity:1; background: linear-gradient(135deg,var(--a),var(--b)); }
      .lang-btn.is-disabled { opacity:.35; padding:6px 10px; font-size:12px; }
      main { padding: 28px 0 48px; }
      h1 { margin: 0 0 10px; font-size: clamp(30px, 4.8vw, 54px); line-height: 1.05; }
      p.lead { margin: 0; color: var(--muted); font-size: 18px; line-height: 1.55; }
      .grid { display:grid; gap:16px; margin-top:22px; }
      .card { border:1px solid var(--line); border-radius:18px; padding:18px; background: rgba(255,255,255,.03); }
      .card h2 { margin: 0 0 8px; font-size: clamp(22px, 2.8vw, 30px); }
      .meta { margin: 0 0 8px; color: var(--muted); font-size: 13px; }
      .tags { display:flex; flex-wrap:wrap; gap:8px; margin-top:10px; }
      .tag { font-size: 12px; color: #ead9ff; border:1px solid rgba(230,75,255,.5); background: rgba(230,75,255,.15); border-radius:999px; padding:4px 10px; }
      .cta { display:inline-block; margin-top:12px; text-decoration:none; color:#fff; padding:10px 14px; border-radius:999px; background: linear-gradient(135deg,var(--a),var(--b)); }
      article .body p { color: var(--muted); line-height: 1.8; font-size: 17px; }
      article .body h2 { margin-top: 24px; font-size: 24px; }
      footer { border-top: 1px solid rgba(255,255,255,.08); padding: 18px 0 28px; color: var(--muted); font-size: 13px; }
    </style>
    """


def index_page(lang: str, rows: list[ArticleRow], tags: dict[int, list[str]], base_url: str) -> str:
    is_en = lang == "en"
    title = "Blog POC SQLite (EN)" if is_en else "Blog POC SQLite (FR)"
    h1 = "Sovereign AI Blog (POC)" if is_en else "Blog IA souveraine (POC)"
    lead = (
        "This page is generated from SQLite data to validate multilingual publication flows."
        if is_en
        else "Cette page est générée depuis SQLite pour valider un flux de publication multi-langue."
    )
    cards = []
    for row in rows:
        article_href = f"{row.slug}.html"
        tag_html = "".join(f'<span class="tag">{t}</span>' for t in tags.get(row.article_id, []))
        cards.append(
            f"""
            <article class="card">
              <p class="meta">{row.published_at}</p>
              <h2><a href="{article_href}" style="text-decoration:none;color:inherit;">{row.title}</a></h2>
              <p class="lead" style="font-size:16px;">{row.excerpt}</p>
              <div class="tags">{tag_html}</div>
              <a class="cta" href="{article_href}">{'Read article' if is_en else "Lire l'article"}</a>
            </article>
            """
        )

    fr_url = f"{base_url}/"
    en_url = f"{base_url}/en/"
    canonical = en_url if is_en else fr_url
    return f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{title}</title>
  <meta name="description" content="{lead}" />
  <link rel="canonical" href="{canonical}" />
  <link rel="alternate" hreflang="fr" href="{fr_url}" />
  <link rel="alternate" hreflang="en" href="{en_url}" />
  <link rel="alternate" hreflang="x-default" href="{fr_url}" />
  {common_style()}
</head>
<body>
  <header>
    <div class="wrap top">
      <a class="brand" href="{'index.html' if is_en else 'index.html'}">Underside.</a>
      {lang_switch_html(lang)}
    </div>
  </header>
  <main class="wrap">
    <h1>{h1}</h1>
    <p class="lead">{lead}</p>
    <section class="grid">
      {''.join(cards)}
    </section>
  </main>
  <footer>
    <div class="wrap">POC SQLite Blog · {'English' if is_en else 'Français'}</div>
  </footer>
</body>
</html>"""


def article_page(lang: str, row: ArticleRow, tag_labels: list[str], base_url: str) -> str:
    is_en = lang == "en"
    fr_path = f"/{row.counterpart_slug}.html" if is_en and row.counterpart_slug else f"/{row.slug}.html"
    en_path = f"/en/{row.slug}.html" if is_en else (f"/en/{row.counterpart_slug}.html" if row.counterpart_slug else "")
    canonical = f"{base_url}{en_path if is_en else fr_path}"

    fr_alt = f"{base_url}{fr_path}" if fr_path else ""
    en_alt = f"{base_url}{en_path}" if en_path else ""
    tags_html = "".join(f'<span class="tag">{tag}</span>' for tag in tag_labels)
    back_href = "index.html" if is_en else "index.html"
    source_html = (
        f'<p><a class="cta" href="{row.source_url}" target="_blank" rel="noopener">{"Source" if is_en else "Source"}</a></p>'
        if row.source_url
        else ""
    )

    hreflang = ""
    if fr_alt:
        hreflang += f'\n  <link rel="alternate" hreflang="fr" href="{fr_alt}" />'
    if en_alt:
        hreflang += f'\n  <link rel="alternate" hreflang="en" href="{en_alt}" />'
    if fr_alt:
        hreflang += f'\n  <link rel="alternate" hreflang="x-default" href="{fr_alt}" />'

    return f"""<!doctype html>
<html lang="{lang}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>{row.seo_title}</title>
  <meta name="description" content="{row.seo_description}" />
  <link rel="canonical" href="{canonical}" />{hreflang}
  {common_style()}
</head>
<body>
  <header>
    <div class="wrap top">
      <a class="brand" href="{back_href}">Underside.</a>
      {lang_switch_html(lang, row)}
    </div>
  </header>
  <main class="wrap">
    <article class="card">
      <p class="meta">{row.published_at}</p>
      <h1>{row.title}</h1>
      <p class="lead">{row.excerpt}</p>
      <div class="tags">{tags_html}</div>
      <section class="body">{row.body_html}</section>
      {source_html}
      <p><a href="{back_href}" style="color:var(--muted);text-decoration:none;">{'Back to list' if is_en else 'Retour à la liste'}</a></p>
    </article>
  </main>
  <footer>
    <div class="wrap">POC SQLite Blog · {'English' if is_en else 'Français'}</div>
  </footer>
</body>
</html>"""


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8")


def build_lang(
    lang: str,
    rows: list[ArticleRow],
    tags_by_article: dict[int, list[str]],
    out_dir: Path,
    base_url: str,
) -> list[str]:
    urls: list[str] = []
    lang_dir = out_dir if lang == "fr" else out_dir / "en"

    index_path = lang_dir / "index.html"
    write_text(index_path, index_page(lang, rows, tags_by_article, base_url))
    urls.append(f"{base_url}/" if lang == "fr" else f"{base_url}/en/")

    for row in rows:
        page_path = lang_dir / f"{row.slug}.html"
        write_text(page_path, article_page(lang, row, tags_by_article.get(row.article_id, []), base_url))
        if lang == "fr":
            urls.append(f"{base_url}/{row.slug}.html")
        else:
            urls.append(f"{base_url}/en/{row.slug}.html")

    return urls


def write_sitemap(out_dir: Path, urls: Iterable[str]) -> None:
    body = "\n".join(f"  <url><loc>{u}</loc></url>" for u in sorted(set(urls)))
    xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{body}
</urlset>
"""
    write_text(out_dir / "sitemap.xml", xml)


def main() -> None:
    args = parse_args()
    db_path = Path(args.db).resolve()
    out_dir = Path(args.out).resolve()
    base_url = args.base_url.rstrip("/")

    ensure_dirs(out_dir)
    clean_output(out_dir)

    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    try:
        rows_fr = fetch_articles(conn, "fr")
        rows_en = fetch_articles(conn, "en")
        tags_fr = fetch_tags_by_article(conn, "fr")
        tags_en = fetch_tags_by_article(conn, "en")
        missing = fetch_missing_translations(conn)
    finally:
        conn.close()

    urls: list[str] = []
    urls.extend(build_lang("fr", rows_fr, tags_fr, out_dir, base_url))
    urls.extend(build_lang("en", rows_en, tags_en, out_dir, base_url))
    write_sitemap(out_dir, urls)

    write_text(out_dir / "missing-translations.json", json.dumps(missing, indent=2, ensure_ascii=False))
    print(f"POC build completed in: {out_dir}")
    print(f"FR articles: {len(rows_fr)} | EN articles: {len(rows_en)}")
    print(f"Missing translations: {len(missing)}")


if __name__ == "__main__":
    main()
