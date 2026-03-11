#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sqlite3
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
DB_PATH = ROOT / "db" / "blog.db"
SCHEMA_PATH = ROOT / "schema.sql"


SEED_DATA = [
    {
        "slug_default": "ia-souveraine-industrie-2026",
        "published_at": "2026-03-11",
        "status": "published",
        "source_url": "https://ai.underside.be/actualites",
        "translations": {
            "fr": {
                "slug": "ia-souveraine-industrie-2026",
                "title": "IA souveraine industrielle: passer du pilote à la production",
                "excerpt": "Comment structurer une trajectoire IA souveraine robuste pour PME et grands comptes.",
                "seo_title": "IA souveraine industrielle: du pilote à la production",
                "seo_description": "Guide opérationnel pour industrialiser une IA souveraine en entreprise.",
                "body_html": (
                    "<p>L'industrialisation de l'IA souveraine commence par une gouvernance claire des données, "
                    "des modèles et des droits d'accès.</p>"
                    "<h2>Décisions prioritaires</h2>"
                    "<p>Définir une cible d'architecture, contractualiser la réversibilité et imposer des preuves "
                    "d'audit en continu.</p>"
                ),
                "is_complete": 1,
            },
            "en": {
                "slug": "sovereign-ai-industrialization-2026",
                "title": "Industrial sovereign AI: moving from pilots to production",
                "excerpt": "How to structure a robust sovereign AI trajectory for SMEs and large enterprises.",
                "seo_title": "Industrial sovereign AI: from pilot to production",
                "seo_description": "Operational guide to scale sovereign AI in enterprise environments.",
                "body_html": (
                    "<p>Industrializing sovereign AI starts with clear governance of data, models, and access rights.</p>"
                    "<h2>Priority decisions</h2>"
                    "<p>Define a target architecture, contract real reversibility, and enforce continuous audit evidence.</p>"
                ),
                "is_complete": 1,
            },
        },
        "tags": ["sovereign-ai", "governance", "industrialization"],
    },
    {
        "slug_default": "nvidia-apple-silicon-arbitrage-2026",
        "published_at": "2026-03-10",
        "status": "published",
        "source_url": "https://ai.underside.be/blog",
        "translations": {
            "fr": {
                "slug": "nvidia-apple-silicon-arbitrage-2026",
                "title": "NVIDIA GPU vs Apple Silicon: arbitrer selon vos cas d'usage",
                "excerpt": "Une méthode simple pour choisir entre performance brute, coût et souveraineté locale.",
                "seo_title": "NVIDIA vs Apple Silicon: le bon arbitrage IA",
                "seo_description": "Comparatif opérationnel pour choisir l'infrastructure IA adaptée.",
                "body_html": (
                    "<p>Le choix de l'infrastructure IA dépend du type de charge, des contraintes de confidentialité "
                    "et des objectifs de coûts.</p>"
                    "<h2>Approche recommandée</h2>"
                    "<p>Classer les workloads par criticité et latence, puis aligner chaque classe sur la cible "
                    "NVIDIA, Apple Silicon ou hybride.</p>"
                ),
                "is_complete": 1,
            },
            "en": {
                "slug": "nvidia-apple-silicon-tradeoffs-2026",
                "title": "NVIDIA GPUs vs Apple Silicon: choose by use case",
                "excerpt": "A practical method to balance raw performance, cost, and local sovereignty.",
                "seo_title": "NVIDIA vs Apple Silicon: choosing the right AI stack",
                "seo_description": "Operational comparison to select the right AI infrastructure.",
                "body_html": (
                    "<p>AI infrastructure choices depend on workload type, confidentiality constraints, and cost targets.</p>"
                    "<h2>Recommended approach</h2>"
                    "<p>Classify workloads by criticality and latency, then align each class with NVIDIA, Apple Silicon, or hybrid targets.</p>"
                ),
                "is_complete": 1,
            },
        },
        "tags": ["infrastructure", "nvidia", "apple-silicon"],
    },
]


TAG_LABELS = {
    "sovereign-ai": {"fr": "IA souveraine", "en": "Sovereign AI"},
    "governance": {"fr": "Gouvernance", "en": "Governance"},
    "industrialization": {"fr": "Industrialisation", "en": "Industrialization"},
    "infrastructure": {"fr": "Infrastructure", "en": "Infrastructure"},
    "nvidia": {"fr": "NVIDIA", "en": "NVIDIA"},
    "apple-silicon": {"fr": "Apple Silicon", "en": "Apple Silicon"},
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Initialize isolated SQLite POC database.")
    parser.add_argument("--db", default=str(DB_PATH), help="Path to SQLite DB file.")
    parser.add_argument("--reset", action="store_true", help="Delete existing DB before initialization.")
    return parser.parse_args()


def init_schema(conn: sqlite3.Connection) -> None:
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    conn.executescript(schema_sql)


def upsert_tag(conn: sqlite3.Connection, key: str) -> int:
    conn.execute("INSERT OR IGNORE INTO tags(key) VALUES (?)", (key,))
    row = conn.execute("SELECT id FROM tags WHERE key = ?", (key,)).fetchone()
    assert row is not None
    return int(row[0])


def seed(conn: sqlite3.Connection) -> None:
    for article in SEED_DATA:
        conn.execute(
            """
            INSERT INTO articles(slug_default, published_at, status, source_url)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(slug_default) DO UPDATE SET
              published_at=excluded.published_at,
              status=excluded.status,
              source_url=excluded.source_url,
              updated_at=datetime('now')
            """,
            (
                article["slug_default"],
                article["published_at"],
                article["status"],
                article.get("source_url"),
            ),
        )
        article_id = conn.execute(
            "SELECT id FROM articles WHERE slug_default = ?", (article["slug_default"],)
        ).fetchone()[0]

        for lang, payload in article["translations"].items():
            conn.execute(
                """
                INSERT INTO article_i18n(
                  article_id, lang, slug, title, excerpt, body_html,
                  seo_title, seo_description, is_complete
                )
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(article_id, lang) DO UPDATE SET
                  slug=excluded.slug,
                  title=excluded.title,
                  excerpt=excluded.excerpt,
                  body_html=excluded.body_html,
                  seo_title=excluded.seo_title,
                  seo_description=excluded.seo_description,
                  is_complete=excluded.is_complete
                """,
                (
                    article_id,
                    lang,
                    payload["slug"],
                    payload["title"],
                    payload["excerpt"],
                    payload["body_html"],
                    payload["seo_title"],
                    payload["seo_description"],
                    payload["is_complete"],
                ),
            )

        for tag_key in article["tags"]:
            tag_id = upsert_tag(conn, tag_key)
            labels = TAG_LABELS.get(tag_key, {"fr": tag_key, "en": tag_key})
            for lang in ("fr", "en"):
                conn.execute(
                    """
                    INSERT INTO tag_i18n(tag_id, lang, label)
                    VALUES (?, ?, ?)
                    ON CONFLICT(tag_id, lang) DO UPDATE SET
                      label=excluded.label
                    """,
                    (tag_id, lang, labels[lang]),
                )
            conn.execute(
                "INSERT OR IGNORE INTO article_tags(article_id, tag_id) VALUES (?, ?)",
                (article_id, tag_id),
            )


def main() -> None:
    args = parse_args()
    db_path = Path(args.db).resolve()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.reset and db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(str(db_path))
    try:
        conn.execute("PRAGMA foreign_keys = ON")
        init_schema(conn)
        seed(conn)
        conn.commit()
    finally:
        conn.close()

    print(f"SQLite POC initialized: {db_path}")


if __name__ == "__main__":
    main()
