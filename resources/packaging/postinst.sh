#!/bin/sh
set -e

# Tauri packages install resources under /usr/lib/<productName>/
SUDOERS_SRC=/usr/lib/fortivpngui/sudo/fortivpngui.sudoers
SUDOERS_DST=/etc/sudoers.d/fortivpngui

if [ -f "$SUDOERS_SRC" ]; then
  install -m 0440 -o root -g root "$SUDOERS_SRC" "$SUDOERS_DST"
  if command -v visudo >/dev/null 2>&1; then
    if ! visudo -c -f "$SUDOERS_DST"; then
      echo "fortivpngui: visudo rejected $SUDOERS_DST — removing drop-in; fix the file and install manually." >&2
      rm -f "$SUDOERS_DST"
    fi
  fi
else
  echo "fortivpngui: sudoers template missing at $SUDOERS_SRC; not installing $SUDOERS_DST." >&2
fi

# Stop running instances so the next launch loads the new package.
pkill -x fortivpngui 2>/dev/null || true

exit 0
