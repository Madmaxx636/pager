#!/usr/bin/env bash
# Runs the Windows installer silently under Wine, checks the files landed where they should, then runs the uninstaller and checks they are gone.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; V="$(sed -n 's/^project(pager-native VERSION \([0-9.]*\).*/\1/p' "$HERE/CMakeLists.txt")"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm $USERNS -u "$(id -u):$(id -g)" -v "$HERE/dist:/dist:ro" localhost/pager-native-winwine bash -c '
  mkdir -p /tmp/h; export HOME=/tmp/h WINEPREFIX=/tmp/h/wine WINEDEBUG=-all WINEDLLOVERRIDES="mscoree,mshtml="
  Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 & sleep 2; export DISPLAY=:99
  timeout 90 wineboot -u >/dev/null 2>&1 || true
  timeout 180 wine /dist/pager-native-setup-'"$V"'.exe /S >/dev/null 2>&1 || true
  sleep 5
  D="$(find /tmp/h/wine/drive_c/users -type d -name "Pager Native" | head -1)"
  echo "installed in: $D"
  for f in pager-native.exe pager_core.dll Qt6Core.dll Uninstall.exe platforms/qwindows.dll qml/QtQuick/qmldir; do [ -e "$D/$f" ] && echo "ok   $f" || { echo "MISSING $f"; exit 1; }; done
  timeout 60 wine reg query "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Uninstall\\PagerNative" /v DisplayVersion 2>/dev/null | grep -q "'"$V"'" && echo "ok   uninstall entry in the registry" || { echo "MISSING registry entry"; exit 1; }
  timeout 120 wine "$D/Uninstall.exe" /S >/dev/null 2>&1 || true
  sleep 3
  [ -e "$D/pager-native.exe" ] && { echo "uninstall left the program behind"; exit 1; } || echo "ok   uninstalled"'
