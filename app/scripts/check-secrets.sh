#!/bin/bash
# Refuse to commit or release anything that looks like a secret.
#   check-secrets.sh            scan files staged for commit (pre-commit hook)
#   check-secrets.sh --all      scan every tracked file
#   check-secrets.sh <files…>   scan the given files
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
cd "$REPO_DIR"

if [ "${1:-}" = "--all" ]; then
  FILES="$(git ls-files)"
elif [ $# -gt 0 ]; then
  FILES="$(printf '%s\n' "$@")"
else
  FILES="$(git diff --cached --name-only --diff-filter=ACMR)"
fi
[ -n "$FILES" ] || exit 0

# pattern | description
PATTERNS=(
  'gh[pousr]_[A-Za-z0-9]{20,}|GitHub token'
  'github_pat_[A-Za-z0-9_]{20,}|GitHub fine-grained token'
  '-----BEGIN [A-Z ]*PRIVATE KEY-----|private key block'
  'untrusted comment: rusty secret key|Tauri/minisign updater SECRET key'
  '(^|[^A-Za-z0-9])[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}([^A-Za-z0-9-]|$)|Apple app-specific password'
  'AKIA[0-9A-Z]{16}|AWS access key'
  'xox[baprs]-[A-Za-z0-9-]{10,}|Slack token'
  'sk-[A-Za-z0-9]{20,}|API secret key'
  'TAURI_SIGNING_PRIVATE_KEY(_PASSWORD)?=["'"'"']?[A-Za-z0-9+/]{16,}|updater key pasted into a file'
  '@gmail\.com|personal e-mail address'
)
# Files where a match is expected and harmless (the scanner itself carries the patterns).
ALLOW='^(app/package-lock\.json|app/scripts/check-secrets\.sh|.*\.png|.*\.icns|.*\.svg|.*\.pdf)$'

FAIL=0
while IFS= read -r f; do
  [ -f "$f" ] || continue
  [[ "$f" =~ $ALLOW ]] && continue
  file --mime "$f" | grep -q 'charset=binary' && continue
  for entry in "${PATTERNS[@]}"; do
    pat="${entry%%|*}"; desc="${entry##*|}"
    if hits="$(grep -nE "$pat" "$f" 2>/dev/null)"; then
      # CSS/JS property words such as "text-fill-color-" match the app-password shape; skip lines with obvious code.
      hits="$(printf '%s\n' "$hits" | grep -vE '(-webkit-|background-clip|text-fill|--[a-z]+-[a-z]+-[a-z]+-[a-z]+|[a-z]{4}-[a-z]{4}-[a-z]{4}-[a-z]{4}(-|\.|:| ?\())' || true)"
      [ -z "$hits" ] && continue
      FAIL=1
      printf '%s✗ %s%s — %s\n' "$RED" "$f" "$NC" "$desc"
      printf '%s\n' "$hits" | sed -E 's/^([0-9]+):(.{0,100}).*/    \1: \2/' | head -5
    fi
  done
done <<< "$FILES"

if [ "$FAIL" = 1 ]; then
  say ""
  die "possible secret(s) found. Remove them (rotate if they were real), then try again. Bypass only if certain: git commit --no-verify"
fi
exit 0
