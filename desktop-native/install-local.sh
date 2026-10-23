#!/usr/bin/env bash
# Installs the native Pager for your user only (no sudo): ~/.local/opt/pager-native, a launcher in ~/.local/bin and a menu entry.
# Build first:  desktop-native/build-core.sh && cmake -S desktop-native -B desktop-native/build -G Ninja && cmake --build desktop-native/build
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PREFIX="${PREFIX:-$HOME/.local}"
[ -x "$HERE/build/pager-native" ] || { echo "Build it first (see the top of this script)." >&2; exit 1; }
OPT="$PREFIX/opt/pager-native"; mkdir -p "$OPT" "$PREFIX/bin" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/scalable/apps"
install -m 755 "$HERE/build/pager-native" "$OPT/pager-native"
install -m 755 "$HERE/build-core/libpager_core.so" "$OPT/libpager_core.so"
ln -sf "$OPT/pager-native" "$PREFIX/bin/pager-native"
install -m 644 "$HERE/pager.svg" "$PREFIX/share/icons/hicolor/scalable/apps/pager-native.svg"
cat > "$PREFIX/share/applications/pager-native.desktop" <<D
[Desktop Entry]
Type=Application
Name=Pager
Comment=Messages from every chat app in one place
Exec=$OPT/pager-native
Icon=pager-native
Categories=Network;InstantMessaging;Chat;
StartupWMClass=pager-native
Terminal=false
D
echo "Installed. Start it from the menu or run pager-native."
