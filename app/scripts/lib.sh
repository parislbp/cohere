#!/bin/bash
# Shared helpers for Cohere's build and release scripts. Source, don't run.
# Secrets are read from the macOS keychain at run time and never echoed.

set -euo pipefail

BOLD=$'\033[1m'; DIM=$'\033[2m'; RED=$'\033[31m'; GREEN=$'\033[32m'; YELLOW=$'\033[33m'; NC=$'\033[0m'

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="$(dirname "$SCRIPTS_DIR")"
REPO_DIR="$(dirname "$APP_DIR")"
RELEASE_DIR="$REPO_DIR/release"

# ── identity of this project ─────────────────────────────────────────────────
GITHUB_REPO="parislbp/cohere"
PRODUCT="Cohere"
IDENTIFIER="com.cohere.desk"
SIGNING_IDENTITY="Developer ID Application: PARIS LUIS BLAISDELL-PIJUAN (9X5P3Z4ZAQ)"
NOTARY_PROFILE="cohere-notary"                 # xcrun notarytool store-credentials cohere-notary …
KEYCHAIN_UPDATER_KEY="cohere-updater-key"      # base64 of the minisign secret key file
KEYCHAIN_UPDATER_PW="cohere-updater-key-password"

# Tool paths that are not on a plain login PATH.
export PATH="$HOME/.cargo/bin:/Users/paris/user/root/installations/node-v22.12.0/bin:/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"

say()  { printf '%s\n' "$*"; }
step() { printf '\n%s▸ %s%s\n' "$BOLD" "$*" "$NC"; }
ok()   { printf '  %s✓%s %s\n' "$GREEN" "$NC" "$*"; }
warn() { printf '  %s!%s %s\n' "$YELLOW" "$NC" "$*"; }
die()  { printf '  %s✗ %s%s\n' "$RED" "$*" "$NC" >&2; exit 1; }

need() { command -v "$1" >/dev/null 2>&1 || die "$1 is required${2:+ — $2}"; }

# Read a keychain generic password without echoing it.
keychain_get() { security find-generic-password -s "$1" -w 2>/dev/null; }

# Current version from tauri.conf.json (the source of truth).
app_version() { python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["version"])' "$APP_DIR/src-tauri/tauri.conf.json"; }

# Export the updater signing key for `tauri build` (createUpdaterArtifacts).
load_updater_key() {
  local b64 pw
  b64="$(keychain_get "$KEYCHAIN_UPDATER_KEY")" || die "keychain item '$KEYCHAIN_UPDATER_KEY' not found (see docs/plan/10-release.md)"
  pw="$(keychain_get "$KEYCHAIN_UPDATER_PW")" || die "keychain item '$KEYCHAIN_UPDATER_PW' not found"
  TAURI_SIGNING_PRIVATE_KEY="$(printf '%s' "$b64" | base64 -d)"
  TAURI_SIGNING_PRIVATE_KEY_PASSWORD="$pw"
  export TAURI_SIGNING_PRIVATE_KEY TAURI_SIGNING_PRIVATE_KEY_PASSWORD
}

bundle_dir() { printf '%s' "$APP_DIR/src-tauri/target/release/bundle"; }
