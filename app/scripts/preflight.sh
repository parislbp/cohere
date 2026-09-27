#!/bin/bash
# Check every prerequisite for a signed, notarized release before spending minutes on a build.
# Usage: scripts/preflight.sh [--release]   (--release also checks git state and GitHub login)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

step "tools"
for t in node npm cargo rustc python3 xcrun codesign hdiutil; do need "$t"; done
ok "node $(node --version) · $(cargo --version | cut -d' ' -f1-2) · $(python3 --version)"
[ -d "$APP_DIR/node_modules" ] || die "node_modules missing — run: make setup"
ok "node_modules present"

step "signing"
if security find-identity -v -p codesigning | grep -Fq "$SIGNING_IDENTITY"; then ok "identity: $SIGNING_IDENTITY"; else die "signing identity not in keychain: $SIGNING_IDENTITY"; fi
if xcrun notarytool history --keychain-profile "$NOTARY_PROFILE" >/dev/null 2>&1; then ok "notarytool profile: $NOTARY_PROFILE"; else die "notarytool profile '$NOTARY_PROFILE' missing or rejected — xcrun notarytool store-credentials $NOTARY_PROFILE --apple-id … --team-id …"; fi
keychain_get "$KEYCHAIN_UPDATER_KEY" >/dev/null || die "keychain item '$KEYCHAIN_UPDATER_KEY' missing"
keychain_get "$KEYCHAIN_UPDATER_PW" >/dev/null || die "keychain item '$KEYCHAIN_UPDATER_PW' missing"
ok "updater signing key in keychain"
python3 - "$APP_DIR/src-tauri/tauri.conf.json" <<'EOF' || die "tauri.conf.json: updater pubkey / endpoint / createUpdaterArtifacts not configured"
import json,sys
c=json.load(open(sys.argv[1]))
assert c["bundle"].get("createUpdaterArtifacts") is True
u=c["plugins"]["updater"]; assert u["pubkey"] and u["endpoints"]
assert c["bundle"]["macOS"]["signingIdentity"]
EOF
ok "tauri.conf.json: signing identity, updater pubkey and endpoint set"

if [ "${1:-}" = "--release" ]; then
  step "release"
  need gh "brew install gh"
  gh auth status >/dev/null 2>&1 || die "gh is not logged in — run: gh auth login"
  ok "gh: $(gh api user --jq .login 2>/dev/null || echo '?')"
  cd "$REPO_DIR"
  [ "$(git rev-parse --abbrev-ref HEAD)" = "master" ] || die "releases are cut from master (on $(git rev-parse --abbrev-ref HEAD))"
  git remote get-url origin >/dev/null 2>&1 || die "no git remote 'origin'"
  git fetch -q origin master
  [ -z "$(git log origin/master..HEAD --oneline)" ] || warn "local commits not yet pushed will go out with the release"
  [ -z "$(git log HEAD..origin/master --oneline)" ] || die "origin/master is ahead — git pull first"
  ok "on master, in sync with origin"
fi

say ""
ok "preflight passed"
