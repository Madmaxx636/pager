#!/usr/bin/env bash
# Makes dist/pager-native_<version>_amd64.deb (installs system-wide: /usr/lib/pager-native, /usr/bin/pager-native, menu entry and icon).
# Build first (see install-local.sh). A copy installed this way is updated by installing the newer .deb, not by the in-app updater.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
V="$(sed -n 's/^project(pager-native VERSION \([0-9.]*\).*/\1/p' "$HERE/CMakeLists.txt")"
[ -x "$HERE/build/pager-native" ] && [ -f "$HERE/build-core/libpager_core.so" ] || { echo "Build it first." >&2; exit 1; }
S="$(mktemp -d)"; trap 'rm -rf "$S"' EXIT
install -d "$S/DEBIAN" "$S/usr/lib/pager-native" "$S/usr/bin" "$S/usr/share/applications" "$S/usr/share/icons/hicolor/scalable/apps"
install -m 755 "$HERE/build/pager-native" "$S/usr/lib/pager-native/pager-native"
install -m 755 "$HERE/build-core/libpager_core.so" "$S/usr/lib/pager-native/libpager_core.so"
strip --strip-unneeded "$S/usr/lib/pager-native/"* 2>/dev/null || true
ln -s ../lib/pager-native/pager-native "$S/usr/bin/pager-native"
install -m 644 "$HERE/pager.svg" "$S/usr/share/icons/hicolor/scalable/apps/pager-native.svg"
cat > "$S/usr/share/applications/pager-native.desktop" <<D
[Desktop Entry]
Type=Application
Name=Pager
Comment=Messages from every chat app in one place
Exec=/usr/bin/pager-native
Icon=pager-native
Categories=Network;InstantMessaging;Chat;
StartupWMClass=pager-native
Terminal=false
D
find "$S" -type d -exec chmod 755 {} +; chmod 644 "$S/usr/share/applications/pager-native.desktop"
SIZE=$(du -sk "$S/usr" | cut -f1)
cat > "$S/DEBIAN/control" <<C
Package: pager-native
Version: $V
Architecture: amd64
Maintainer: Pager <noreply@users.noreply.github.com>
Installed-Size: $SIZE
Section: net
Priority: optional
Depends: libc6 (>= 2.38), libstdc++6, libgcc-s1, libqt6core6t64 | libqt6core6, libqt6gui6, libqt6widgets6, libqt6qml6, libqt6quick6, libqt6quickcontrols2-6, libqt6network6, qml6-module-qtquick, qml6-module-qtquick-controls, qml6-module-qtquick-layouts, qml6-module-qtquick-window, qml6-module-qtquick-templates, qml6-module-qtquick-dialogs, qml6-module-qtqml, qml6-module-qtqml-models, qml6-module-qtqml-workerscript
Description: Pager, the native app
 A native (Qt and Rust) Pager client: your chat apps in one place, end-to-end encrypted,
 with no web page and no Chromium.
C
mkdir -p "$HERE/dist"; OUT="$HERE/dist/pager-native_${V}_amd64.deb"
dpkg-deb -Zxz --root-owner-group --build "$S" "$OUT" >/dev/null
echo "$OUT"; dpkg-deb -I "$OUT" | grep -E "Package|Version|Installed-Size"; sha256sum "$OUT"
