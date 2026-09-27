#!/bin/bash
# Build the signed, notarized, stapled DMG plus the signed updater archive.
#
#   scripts/build.sh              → release/Cohere_<v>_aarch64.dmg · Cohere.app.tar.gz · Cohere.app.tar.gz.sig
#   scripts/build.sh --no-notary  → skip notarization (local testing only; Gatekeeper will complain on other Macs)
#
# `tauri build` signs the .app with the Developer ID (hardened runtime, timestamp) and writes the
# updater artefacts with the minisign key loaded from the keychain. We then notarize the DMG with
# the `cohere-notary` keychain profile and staple the ticket.
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

NOTARIZE=1
[ "${1:-}" = "--no-notary" ] && NOTARIZE=0

"$SCRIPTS_DIR/preflight.sh"
VERSION="$(app_version)"
ARCH="aarch64"
step "build $PRODUCT $VERSION"

cd "$APP_DIR"
load_updater_key
unset CI CARGO_TARGET_DIR
# Tauri notarizes itself only when APPLE_* variables are present; we do it ourselves below.
unset APPLE_ID APPLE_PASSWORD APPLE_TEAM_ID APPLE_API_KEY APPLE_API_ISSUER APPLE_CERTIFICATE

rm -rf "$(bundle_dir)/dmg" "$(bundle_dir)/macos"
say "  running tauri build (release profile, LTO — a few minutes)…"
npx tauri build 2>&1 | sed 's/^/    /' | grep -vE '^\s*(Compiling|Downloaded|Downloading|Fresh)' || true

APP="$(bundle_dir)/macos/$PRODUCT.app"
TAR="$(bundle_dir)/macos/$PRODUCT.app.tar.gz"
SIG="$TAR.sig"
DMG="$(bundle_dir)/dmg/${PRODUCT}_${VERSION}_${ARCH}.dmg"
[ -d "$APP" ] || die "no app bundle at $APP"
[ -f "$TAR" ] && [ -f "$SIG" ] || die "updater artefacts missing (is TAURI_SIGNING_PRIVATE_KEY loaded?)"
[ -f "$DMG" ] || die "no DMG at $DMG"
ok "app, updater archive ($(du -h "$TAR" | cut -f1)), dmg ($(du -h "$DMG" | cut -f1))"

step "verify signature"
codesign --verify --deep --strict --verbose=1 "$APP" 2>&1 | sed 's/^/    /'
codesign -dv --verbose=2 "$APP" 2>&1 | grep -E 'Authority=Developer ID Application|flags=.*runtime' | sed 's/^/    /' || die "app is not signed with the Developer ID + hardened runtime"
BUILT_VERSION="$(defaults read "$APP/Contents/Info" CFBundleShortVersionString)"
[ "$BUILT_VERSION" = "$VERSION" ] || die "Info.plist says $BUILT_VERSION, expected $VERSION"
ok "Developer ID signature with hardened runtime · CFBundleShortVersionString $BUILT_VERSION"

if [ "$NOTARIZE" = 1 ]; then
  step "notarize"
  say "  submitting the DMG to Apple (usually 1–5 minutes)…"
  OUT="$(xcrun notarytool submit "$DMG" --keychain-profile "$NOTARY_PROFILE" --wait 2>&1)" || { printf '%s\n' "$OUT"; die "notarization failed"; }
  printf '%s\n' "$OUT" | grep -E 'id:|status:' | sed 's/^/    /' | sort -u
  if ! printf '%s\n' "$OUT" | grep -q 'status: Accepted'; then
    ID="$(printf '%s\n' "$OUT" | grep -m1 '  id:' | awk '{print $2}')"
    xcrun notarytool log "$ID" --keychain-profile "$NOTARY_PROFILE" 2>&1 | sed 's/^/    /' | head -60
    die "Apple did not accept the DMG"
  fi
  xcrun stapler staple "$DMG" >/dev/null && ok "ticket stapled to the DMG"
  spctl -a -t open --context context:primary-signature -v "$DMG" 2>&1 | sed 's/^/    /'
else
  warn "notarization skipped (--no-notary)"
fi

step "collect"
mkdir -p "$RELEASE_DIR"
rm -f "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.tar.gz "$RELEASE_DIR"/*.sig
cp "$DMG" "$RELEASE_DIR/"
cp "$TAR" "$SIG" "$RELEASE_DIR/"
(cd "$RELEASE_DIR" && shasum -a 256 "$(basename "$DMG")" "$PRODUCT.app.tar.gz" > SHA256SUMS.txt)
ok "release/ → $(ls "$RELEASE_DIR" | tr '\n' ' ')"
say ""
say "  ${DIM}app bundle: $APP${NC}"
