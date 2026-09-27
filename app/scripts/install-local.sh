#!/bin/bash
# Put the most recent build into /Applications and launch it.
#   scripts/install-local.sh           from release/*.dmg (what users get) — preferred
#   scripts/install-local.sh --app     straight from src-tauri/target/release/bundle/macos/Cohere.app
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

DEST="/Applications/$PRODUCT.app"
step "install $PRODUCT locally"
if pgrep -xq "$PRODUCT" 2>/dev/null || pgrep -q "$DEST/Contents/MacOS" 2>/dev/null; then
  osascript -e "tell application \"$PRODUCT\" to quit" >/dev/null 2>&1 || true
  sleep 1
fi

if [ "${1:-}" = "--app" ]; then
  SRC="$(bundle_dir)/macos/$PRODUCT.app"
  [ -d "$SRC" ] || die "no build at $SRC — run: make build"
  rm -rf "$DEST" && ditto "$SRC" "$DEST"
else
  DMG="$(ls -t "$RELEASE_DIR"/cohere-*.dmg 2>/dev/null | head -1)"
  [ -n "$DMG" ] || die "no DMG in release/ — run: make build"
  MNT="$(mktemp -d /tmp/cohere-dmg.XXXX)"
  hdiutil attach "$DMG" -nobrowse -readonly -mountpoint "$MNT" -quiet || die "could not mount $DMG"
  rm -rf "$DEST" && ditto "$MNT/$PRODUCT.app" "$DEST"
  hdiutil detach "$MNT" -quiet || hdiutil detach "$MNT" -force -quiet
  rmdir "$MNT" 2>/dev/null || true
  say "  from $(basename "$DMG")"
fi
ok "installed $(defaults read "$DEST/Contents/Info" CFBundleShortVersionString) → $DEST"
spctl -a -vv "$DEST" 2>&1 | grep -E 'accepted|rejected|source=' | sed 's/^/    /' || true
open "$DEST"
