#!/bin/sh
set -e

# RPM %postun: $1 is the number of remaining installed versions.
# 0 means the package is really gone; 1 means an upgrade replaced it.

SUDOERS_DST=/etc/sudoers.d/fortivpngui

if [ "$1" = 0 ]; then
  rm -f "$SUDOERS_DST"
  if command -v update-desktop-database >/dev/null 2>&1; then
    update-desktop-database -q || true
  fi
fi

exit 0
