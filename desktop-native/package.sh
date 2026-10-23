#!/usr/bin/env bash
# Makes the Linux download: dist/pager-native-<version>-linux-x64.tar.gz (the program, its engine, an icon and an install script).
# Build first (see install-local.sh). It needs Qt 6.4+ on the computer; install.sh says which packages if something is missing.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"
V="$(sed -n 's/^project(pager-native VERSION \([0-9.]*\).*/\1/p' "$HERE/CMakeLists.txt")"
[ -x "$HERE/build/pager-native" ] && [ -f "$HERE/build-core/libpager_core.so" ] || { echo "Build it first." >&2; exit 1; }
STAGE="$(mktemp -d)"; trap 'rm -rf "$STAGE"' EXIT
D="$STAGE/pager-native"; mkdir -p "$D" "$HERE/dist"
install -m 755 "$HERE/build/pager-native" "$D/pager-native"
install -m 755 "$HERE/build-core/libpager_core.so" "$D/libpager_core.so"
strip --strip-unneeded "$D/pager-native" "$D/libpager_core.so" 2>/dev/null || true
install -m 644 "$HERE/pager.svg" "$D/pager.svg"
cat > "$D/install.sh" <<'S'
#!/usr/bin/env bash
# Installs Pager for your user (no sudo): ~/.local/opt/pager-native, a command in ~/.local/bin and an entry in the applications menu.
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; PREFIX="${PREFIX:-$HOME/.local}"; OPT="$PREFIX/opt/pager-native"
missing="$(LD_LIBRARY_PATH="$HERE" ldd "$HERE/pager-native" 2>/dev/null | awk '/not found/ {print $1}' | tr '\n' ' ')"
if [ -n "$missing" ]; then echo "Pager needs Qt 6 on this computer. Missing: $missing" >&2
  echo "On Ubuntu/Debian:  sudo apt install qt6-base-dev qml6-module-qtquick qml6-module-qtquick-controls qml6-module-qtquick-layouts qml6-module-qtquick-dialogs qml6-module-qtquick-templates qml6-module-qtqml-workerscript" >&2; exit 1; fi
mkdir -p "$OPT" "$PREFIX/bin" "$PREFIX/share/applications" "$PREFIX/share/icons/hicolor/scalable/apps"
for f in pager-native libpager_core.so; do install -m 755 "$HERE/$f" "$OPT/$f"; done
install -m 644 "$HERE/pager.svg" "$PREFIX/share/icons/hicolor/scalable/apps/pager-native.svg"
ln -sf "$OPT/pager-native" "$PREFIX/bin/pager-native"
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
echo "Installed. Start Pager from the applications menu, or run pager-native."
S
chmod 755 "$D/install.sh"
OUT="$HERE/dist/pager-native-$V-linux-x64.tar.gz"
tar -czf "$OUT" -C "$STAGE" pager-native
echo "$OUT"
sha256sum "$OUT"
