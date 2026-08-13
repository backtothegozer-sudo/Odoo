#!/bin/bash
set -euo pipefail

export PATH="/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"

readonly REPO_DIR="/workspace/odoo"
readonly PROMPT_FILE="$REPO_DIR/scripts/daily_odoo_publisher_prompt.md"
readonly LOG_DIR="$REPO_DIR/logs"
readonly LOCK_DIR="/tmp/underside-odoo-daily-publisher.lock"
readonly MANIFEST_FILE="/tmp/underside-odoo-daily-publisher-manifest.txt"

mkdir -p "$LOG_DIR"

readonly RUN_ID="$(date '+%Y%m%d-%H%M%S')"
readonly LOG_FILE="$LOG_DIR/daily-publisher-$RUN_ID.log"

log() {
  echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"
}

fail() {
  log "ERROR: $*"
  exit 1
}

cleanup() {
  rmdir "$LOCK_DIR" 2>/dev/null || true
}

{
  log "Starting daily Odoo publisher"

  if ! mkdir "$LOCK_DIR" 2>/dev/null; then
    fail "Another daily publisher run is already active: $LOCK_DIR"
  fi

  trap cleanup EXIT INT TERM

  cd "$REPO_DIR"

  [[ -f "$PROMPT_FILE" ]] || fail "Prompt file not found: $PROMPT_FILE"
  command -v git >/dev/null 2>&1 || fail "git is not available in PATH"
  command -v codex >/dev/null 2>&1 || fail "codex is not available in PATH"

  [[ "$(git rev-parse --show-toplevel)" == "$REPO_DIR" ]] || fail "Not inside expected repository"
  [[ "$(git branch --show-current)" == "main" ]] || fail "Current branch is not main"
  [[ -z "$(git status --porcelain)" ]] || fail "Repository is not clean before fetch/pull"

  git fetch origin
  git pull --ff-only origin main

  [[ "$(git rev-parse HEAD)" == "$(git rev-parse origin/main)" ]] || fail "Local main is not synchronized with origin/main"
  [[ -z "$(git status --porcelain)" ]] || fail "Repository is not clean after pull"

  : > "$MANIFEST_FILE"
  export DAILY_ODOO_PUBLISHER_MANIFEST="$MANIFEST_FILE"

  log "Launching Codex publisher"
  codex exec -C "$REPO_DIR" -s danger-full-access - < "$PROMPT_FILE"

  mapfile -t manifest_files < <(
    sed \
      -e 's/^[[:space:]]*//' \
      -e 's/[[:space:]]*$//' \
      -e '/^$/d' \
      -e '/^#/d' \
      "$MANIFEST_FILE"
  )

  if (( ${#manifest_files[@]} == 0 )); then
    [[ -z "$(git status --porcelain)" ]] || fail "Manifest is empty but repository has changes"
    log "No publication produced; exiting without commit"
    exit 0
  fi

  for line in "${manifest_files[@]}"; do
    [[ -n "$(git status --porcelain -- "$line")" ]] || fail "Manifest path has no Git change: $line"
  done

  changed_paths="$(
    {
      git diff --name-only
      git diff --cached --name-only
      git ls-files --others --exclude-standard
    } | sort -u
  )"

  while IFS= read -r line || [[ -n "$line" ]]; do
    [[ -z "$line" ]] && continue

    found="no"

    for manifest_path in "${manifest_files[@]}"; do
      if [[ "$line" == "$manifest_path" ]]; then
        found="yes"
        break
      fi
    done

    [[ "$found" == "yes" ]] || fail "Git change is not listed in manifest: $line"
  done <<< "$changed_paths"

  git add -- "${manifest_files[@]}"

  git diff --cached --quiet && fail "Manifest files produced no staged changes"

  commit_date="$(date '+%Y-%m-%d')"

  git commit -m "chore: publish daily Odoo update $commit_date"
  git push origin main

  log "Daily Odoo publisher completed successfully"

} >> "$LOG_FILE" 2>&1
