PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  slug_default TEXT NOT NULL UNIQUE,
  published_at TEXT NOT NULL, -- YYYY-MM-DD
  status TEXT NOT NULL CHECK (status IN ('draft', 'published')) DEFAULT 'draft',
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS article_i18n (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  lang TEXT NOT NULL CHECK (lang IN ('fr', 'en')),
  slug TEXT NOT NULL,
  title TEXT NOT NULL,
  excerpt TEXT NOT NULL,
  body_html TEXT NOT NULL,
  seo_title TEXT NOT NULL,
  seo_description TEXT NOT NULL,
  is_complete INTEGER NOT NULL DEFAULT 0 CHECK (is_complete IN (0, 1)),
  PRIMARY KEY (article_id, lang)
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE
);

CREATE TABLE IF NOT EXISTS tag_i18n (
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  lang TEXT NOT NULL CHECK (lang IN ('fr', 'en')),
  label TEXT NOT NULL,
  PRIMARY KEY (tag_id, lang)
);

CREATE TABLE IF NOT EXISTS article_tags (
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  tag_id INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  PRIMARY KEY (article_id, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_articles_status_date ON articles(status, published_at DESC);
CREATE INDEX IF NOT EXISTS idx_article_i18n_lang_complete ON article_i18n(lang, is_complete);
CREATE UNIQUE INDEX IF NOT EXISTS idx_article_i18n_lang_slug ON article_i18n(lang, slug);

CREATE VIEW IF NOT EXISTS v_missing_translations AS
SELECT
  a.id,
  a.slug_default,
  a.published_at,
  CASE WHEN fr.article_id IS NULL OR fr.is_complete = 0 THEN 1 ELSE 0 END AS missing_fr,
  CASE WHEN en.article_id IS NULL OR en.is_complete = 0 THEN 1 ELSE 0 END AS missing_en
FROM articles a
LEFT JOIN article_i18n fr ON fr.article_id = a.id AND fr.lang = 'fr'
LEFT JOIN article_i18n en ON en.article_id = a.id AND en.lang = 'en';
