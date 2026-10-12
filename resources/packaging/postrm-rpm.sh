#!/bin/sh
set -e

# RPM: $1 is 0 on uninstall, 1 on upgrade.
SUDOERS_DST=/etc/sudoers.d/fortivpngui

if [ "$1" = "0" ]; then
  rm -f "$SUDOERS_DST"
fi

exit 0
