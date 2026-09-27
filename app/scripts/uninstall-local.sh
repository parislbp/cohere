#!/bin/bash
# Remove the installed app (and, unless --keep-data, the data folder) by moving them to the Trash.
#   scripts/uninstall-local.sh [--keep-data] [--dev]      (--dev targets the tauri-dev data folder instead)
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

KEEP=0; DEV=0
for a in "$@"; do case "$a" in --keep-data) KEEP=1;; --dev) DEV=1;; esac; done
ID="$IDENTIFIER"; [ "$DEV" = 1 ] && ID="$IDENTIFIER.dev"
DATA="$HOME/Library/Application Support/$ID"
APP="/Applications/$PRODUCT.app"

trash_it() {
  [ -e "$1" ] || return 0
  local name target n=1
  name="$(basename "$1")"; target="$HOME/.Trash/$name"
  while [ -e "$target" ]; do n=$((n+1)); target="$HOME/.Trash/$name $n"; done
  mv "$1" "$target" && ok "→ Trash: $1"
}

step "uninstall $PRODUCT"
osascript -e "tell application \"$PRODUCT\" to quit" >/dev/null 2>&1 || true
[ "$DEV" = 1 ] || trash_it "$APP"
if [ "$KEEP" = 1 ]; then
  warn "kept data: $DATA"
else
  if [ -d "$DATA" ]; then
    N="$(ls "$DATA/projects" 2>/dev/null | wc -l | tr -d ' ')"
    say "  $DATA holds $N project(s), $(du -sh "$DATA" 2>/dev/null | cut -f1)."
    read -r -p "  move it to the Trash too? [y/N] " yn
    case "$yn" in y|Y) trash_it "$DATA";; *) warn "kept data";; esac
  fi
  for d in "$HOME/Library/Preferences/$ID.plist" "$HOME/Library/Saved Application State/$ID.savedState" "$HOME/Library/WebKit/$ID" "$HOME/Library/Caches/$ID" "$HOME/Library/HTTPStorages/$ID"; do trash_it "$d"; done
fi
ok "done — everything is recoverable from the Trash"
