#!/bin/sh
set -e

# Drop-in created by postinst (resources/deb/postinst.sh). Only on real removal, not on upgrade.
SUDOERS_DST=/etc/sudoers.d/fortivpngui

case "$1" in
  remove|purge)
    rm -f "$SUDOERS_DST"
    ;;
esac

exit 0
