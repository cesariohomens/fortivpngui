#!/bin/sh
set -e
# Optional: install sudoers template (commented out by default — admin should merge manually)
# if [ ! -f /etc/sudoers.d/fortivpngui ] && [ -f /opt/fortivpngui/resources/sudo/fortivpngui.sudoers ]; then
#   install -m 0440 /opt/fortivpngui/resources/sudo/fortivpngui.sudoers /etc/sudoers.d/fortivpngui
# fi

if command -v update-desktop-database >/dev/null 2>&1; then
  update-desktop-database -q || true
fi
if command -v gtk-update-icon-cache >/dev/null 2>&1; then
  gtk-update-icon-cache -f -t /usr/share/icons/hicolor 2>/dev/null || true
fi

exit 0
