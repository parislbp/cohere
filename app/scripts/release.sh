#!/bin/bash
# Cut a release: bump → check → build/sign/notarize → changelog → commit + tag → push → GitHub Release.
#
#   scripts/release.sh 0.2.0                   notes from docs/releases/v0.2.0.md (must exist)
#   scripts/release.sh 0.2.0 "One-line notes"  writes docs/releases/v0.2.0.md from the text first
#   NOTES_FILE=path scripts/release.sh 0.2.0   notes from another file
#   SKIP_CHECK=1 …                             skip typecheck/lint/tests (not recommended)
#
# The GitHub Release carries: the DMG (versioned + a stable `Cohere.dmg` for the website link),
# the updater archive and its signature, latest.json (what installed copies poll) and SHA256SUMS.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

VERSION="${1:-}"
[ -n "$VERSION" ] || die "usage: release.sh <version> [notes]"
[[ "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || die "version must be MAJOR.MINOR.PATCH (got $VERSION)"
TAG="v$VERSION"
NOTES_MD="$REPO_DIR/docs/releases/$TAG.md"

"$SCRIPTS_DIR/preflight.sh" --release
CURRENT="$(app_version)"
cd "$REPO_DIR"
git rev-parse -q --verify "refs/tags/$TAG" >/dev/null && die "tag $TAG already exists"
gh release view "$TAG" --repo "$GITHUB_REPO" >/dev/null 2>&1 && die "GitHub release $TAG already exists"
python3 - "$CURRENT" "$VERSION" <<'EOF' || die "version must be greater than the current $CURRENT"
import sys
cur, new = (tuple(int(x) for x in v.split(".")) for v in sys.argv[1:3])
sys.exit(0 if new > cur else 1)
EOF

step "release notes"
mkdir -p "$(dirname "$NOTES_MD")"
if [ -n "${NOTES_FILE:-}" ]; then cp "$NOTES_FILE" "$NOTES_MD"; fi
if [ -n "${2:-}" ]; then printf '## Cohere %s\n\n%s\n' "$VERSION" "$2" > "$NOTES_MD"; fi
[ -s "$NOTES_MD" ] || die "write the notes first: $NOTES_MD (Markdown; shown inside the app)"
grep -q '[A-Za-z]' "$NOTES_MD" || die "$NOTES_MD is empty"
ok "$(wc -l < "$NOTES_MD" | tr -d ' ') lines from docs/releases/$TAG.md"

# The working tree may contain only the notes file (and CHANGELOG) as uncommitted changes.
DIRTY="$(git status --porcelain | grep -vE ' (docs/releases/|CHANGELOG.md)' || true)"
[ -z "$DIRTY" ] || { printf '%s\n' "$DIRTY"; die "commit or stash your changes first — a release commit should only carry the version bump"; }

step "bump $CURRENT → $VERSION"
python3 - "$APP_DIR" "$VERSION" <<'EOF'
import json, re, sys, pathlib
app, v = pathlib.Path(sys.argv[1]), sys.argv[2]
p = app / "src-tauri/tauri.conf.json"; c = json.loads(p.read_text()); c["version"] = v
p.write_text(json.dumps(c, indent=2, ensure_ascii=False) + "\n")
p = app / "src-tauri/Cargo.toml"; t = p.read_text()
t = re.sub(r'^(name = "cohere"\nversion = )"[^"]+"', lambda m: f'{m.group(1)}"{v}"', t, count=1, flags=re.M)
p.write_text(t)
EOF
(cd "$APP_DIR" && npm version "$VERSION" --no-git-tag-version --allow-same-version >/dev/null)
(cd "$APP_DIR/src-tauri" && cargo update -p cohere --offline >/dev/null 2>&1 || cargo generate-lockfile --offline >/dev/null 2>&1 || true)
ok "tauri.conf.json · package.json · package-lock.json · Cargo.toml"

if [ "${SKIP_CHECK:-0}" != 1 ]; then
  step "check"
  (cd "$APP_DIR" && npm run -s check 2>&1 | grep -E 'Tests |test result|error|✗|FAIL' | sed 's/^/    /') || die "checks failed"
  ok "typecheck · lint · vitest · cargo test"
fi

"$SCRIPTS_DIR/build.sh"

step "changelog + manifest"
python3 - "$REPO_DIR/CHANGELOG.md" "$NOTES_MD" "$VERSION" <<'EOF'
import sys, pathlib, datetime
cl, notes, v = pathlib.Path(sys.argv[1]), pathlib.Path(sys.argv[2]).read_text().strip(), sys.argv[3]
text = cl.read_text()
marker = "<!-- `make release` inserts the new version below this line. -->"
today = datetime.date.today().isoformat()
body = notes
# normalise the heading so the changelog reads "## 0.2.0 — 2026-09-27"
lines = body.split("\n")
if lines and lines[0].startswith("#"):
    lines = lines[1:]
entry = f"## {v} — {today}\n\n" + "\n".join(lines).strip() + "\n"
if marker in text:
    text = text.replace(marker, marker + "\n\n" + entry, 1)
else:
    text = text.rstrip() + "\n\n" + entry
cl.write_text(text.rstrip() + "\n")
EOF
SIGNATURE="$(cat "$RELEASE_DIR/$PRODUCT.app.tar.gz.sig")"
python3 - "$RELEASE_DIR/latest.json" "$VERSION" "$NOTES_MD" "$SIGNATURE" "$GITHUB_REPO" <<'EOF'
import json, sys, pathlib, datetime
out, v, notes, sig, repo = sys.argv[1:6]
manifest = {
  "version": v,
  "notes": pathlib.Path(notes).read_text().strip(),
  "pub_date": datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
  "platforms": {"darwin-aarch64": {"signature": sig.strip(), "url": f"https://github.com/{repo}/releases/download/v{v}/Cohere.app.tar.gz"}},
}
pathlib.Path(out).write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n")
EOF
cp "$RELEASE_DIR/${PRODUCT}_${VERSION}_aarch64.dmg" "$RELEASE_DIR/$PRODUCT.dmg"
ok "CHANGELOG.md updated · latest.json written"

step "secrets scan"
"$SCRIPTS_DIR/check-secrets.sh" --all || die "refusing to release with a possible secret in the tree"

step "commit · tag · push"
git add -A
git commit -q -m "Release $TAG" -m "$(sed -n '1,40p' "$NOTES_MD")"
git tag -a "$TAG" -m "Cohere $VERSION"
git push -q origin master "$TAG"
ok "pushed master and $TAG"

step "GitHub release"
gh release create "$TAG" --repo "$GITHUB_REPO" --title "Cohere $VERSION" --notes-file "$NOTES_MD" --latest \
  "$RELEASE_DIR/${PRODUCT}_${VERSION}_aarch64.dmg" \
  "$RELEASE_DIR/$PRODUCT.dmg" \
  "$RELEASE_DIR/$PRODUCT.app.tar.gz" \
  "$RELEASE_DIR/$PRODUCT.app.tar.gz.sig" \
  "$RELEASE_DIR/latest.json" \
  "$RELEASE_DIR/SHA256SUMS.txt" >/dev/null
URL="https://github.com/$GITHUB_REPO/releases/tag/$TAG"
ok "$URL"

step "verify what installed copies will see"
sleep 3
GOT="$(curl -fsSL "https://github.com/$GITHUB_REPO/releases/latest/download/latest.json" | python3 -c 'import json,sys; print(json.load(sys.stdin)["version"])' 2>/dev/null || echo '?')"
[ "$GOT" = "$VERSION" ] && ok "latest.json → $GOT" || warn "latest.json not yet serving $VERSION (got $GOT) — GitHub's CDN can lag a minute"

say ""
say "${BOLD}Cohere $VERSION is out.${NC}"
say "  download:  https://github.com/$GITHUB_REPO/releases/latest/download/$PRODUCT.dmg"
say "  install here: make install"
