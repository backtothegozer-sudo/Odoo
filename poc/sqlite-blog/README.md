# POC SQLite Blog (Isolé)

Ce POC est totalement isolé du site actuel.

- Dossier POC: `/Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog`
- Site actuel non touché: `/Users/christophedegraeve/Documents/Codex/underside-ai/site`

## Objectif

Tester une source de contenu blog multi-langue (FR/EN) dans SQLite, puis générer des pages statiques.

## Structure

- `schema.sql`: schéma SQLite (articles, traductions, tags, relations)
- `scripts/init_db.py`: initialise et peuple la base de démo
- `scripts/build_site.py`: génère un mini site statique FR/EN depuis la DB
- `db/blog.db`: base SQLite locale du POC
- `out/`: sortie HTML statique du POC (générée)

## Lancer le POC

1. Initialiser la base:

```bash
python3 /Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/scripts/init_db.py --reset
```

2. Générer le site statique de test:

```bash
python3 /Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/scripts/build_site.py
```

Option recommandée (importer les vrais articles du site actuel dans la DB POC):

```bash
python3 /Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/scripts/import_site_articles.py --truncate
python3 /Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/scripts/build_site.py
```

3. Ouvrir en local:

- `/Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/out/index.html`
- `/Users/christophedegraeve/Documents/Codex/underside-ai/poc/sqlite-blog/out/en/index.html`

## Notes

- Ce POC ne dépend d'aucun service externe.
- Le build génère aussi:
  - `sitemap.xml`
  - `missing-translations.json` (articles incomplets par langue)
