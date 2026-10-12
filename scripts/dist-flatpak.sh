#!/usr/bin/env bash
# Build a local Flatpak bundle from the Tauri .deb (Tauri Flathub local-test flow).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

VERSION="$(node -p "require('./package.json').version")"
DEB="$ROOT/src-tauri/target/release/bundle/deb/fortivpngui_${VERSION}_amd64.deb"
MANIFEST="$ROOT/flatpak/com.cesariogarcia.fortivpngui.yml"
BUILD_DIR="$ROOT/src-tauri/target/release/bundle/flatpak/build"
REPO_DIR="$ROOT/src-tauri/target/release/bundle/flatpak/repo"
STATE_DIR="$ROOT/src-tauri/target/release/bundle/flatpak/.flatpak-builder"
OUT_DIR="$ROOT/src-tauri/target/release/bundle/flatpak"
BUNDLE="$OUT_DIR/fortivpngui_${VERSION}_x86_64.flatpak"
APP_ID="com.cesariogarcia.fortivpngui"
RUNTIME_VER="47"

if [[ ! -f "$DEB" ]]; then
  echo "Missing $DEB — run npm run dist:deb (or npm run dist) first." >&2
  exit 1
fi

# Keep the manifest deb path in sync with package version.
sed -i -E "s|fortivpngui_[0-9]+\.[0-9]+\.[0-9]+_amd64\\.deb|fortivpngui_${VERSION}_amd64.deb|" "$MANIFEST"

if ! flatpak remotes --user 2>/dev/null | grep -q '^flathub'; then
  flatpak remote-add --user --if-not-exists flathub https://dl.flathub.org/repo/flathub.flatpakrepo
fi

flatpak install -y --user flathub \
  "org.gnome.Platform//${RUNTIME_VER}" \
  "org.gnome.Sdk//${RUNTIME_VER}"

mkdir -p "$OUT_DIR"
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR" "$REPO_DIR"

flatpak-builder \
  --force-clean \
  --user \
  --disable-cache \
  --state-dir "$STATE_DIR" \
  --repo "$REPO_DIR" \
  "$BUILD_DIR" \
  "$MANIFEST"

flatpak build-bundle "$REPO_DIR" "$BUNDLE" "$APP_ID" --arch=x86_64
echo "Wrote $BUNDLE"
