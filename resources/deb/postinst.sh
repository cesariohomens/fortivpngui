#!/bin/sh
set -e

SUDOERS_SRC=/opt/fortivpngui/resources/sudo/fortivpngui.sudoers
SUDOERS_DST=/etc/sudoers.d/fortivpngui

if [ -f "$SUDOERS_SRC" ]; then
  install -m 0440 -o root -g root "$SUDOERS_SRC" "$SUDOERS_DST"
  if command -v visudo >/dev/null 2>&1; then
    if ! visudo -c -f "$SUDOERS_DST" 2>/dev/null; then
      echo "fortivpngui: visudo rejected $SUDOERS_DST — removing drop-in; fix the file and install manually." >&2
      rm -f "$SUDOERS_DST"
    fi
  fi
fi

# Chromium SUID sandbox: without 4755, the binary aborts before JS runs (--no-sandbox in .desktop is not enough for /opt/.../fortivpngui alone).
SB=/opt/fortivpngui/chrome-sandbox
if [ -f "$SB" ]; then
  chown root:root "$SB" 2>/dev/null || true
  chmod 4755 "$SB" 2>/dev/null || true
fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
