#!/usr/bin/env bash
# Runs inside the Fedora image: gathers pager-native.exe, the engine, the Qt libraries it needs and the Qt plugins/QML modules into build-win/stage/.
set -euo pipefail
cd /src
R=/usr/x86_64-w64-mingw32/sys-root/mingw; BIN=$R/bin; S=build-win/stage
rm -rf "$S"; mkdir -p "$S/platforms" "$S/styles" "$S/imageformats" "$S/iconengines" "$S/tls" "$S/qml"
cp build-win/pager-native.exe "$S/"; cp build-core-win/pager_core.dll "$S/"
x86_64-w64-mingw32-strip --strip-unneeded "$S/pager-native.exe" "$S/pager_core.dll"
cp "$R/lib/qt6/plugins/platforms/qwindows.dll" "$S/platforms/"
cp "$R/lib/qt6/plugins/styles/"*.dll "$S/styles/" 2>/dev/null || true
cp "$R/lib/qt6/plugins/imageformats/"{qsvg,qjpeg,qgif,qico}.dll "$S/imageformats/" 2>/dev/null || true
cp "$R/lib/qt6/plugins/iconengines/qsvgicon.dll" "$S/iconengines/" 2>/dev/null || true
cp "$R/lib/qt6/plugins/tls/"*.dll "$S/tls/" 2>/dev/null || true
# QML modules the screens import (the list Qt's import scanner made while building)
grep -o 'RELATIVEPATH;[^;]*' build-win/.qt/qml_imports/*.cmake | sed 's/.*RELATIVEPATH;//' | sort -u | while read -r rel; do
  [ -d "$R/lib/qt6/qml/$rel" ] || continue
  mkdir -p "$S/qml/$rel"; find "$R/lib/qt6/qml/$rel" -maxdepth 1 -type f \( -name 'qmldir' -o -name '*.dll' -o -name '*.qmltypes' \) -exec cp {} "$S/qml/$rel/" \;
done
# every DLL these need, found by reading their import tables, again and again until nothing new turns up
need() { x86_64-w64-mingw32-objdump -p "$1" 2>/dev/null | awk '/DLL Name:/ {print $3}'; }
for i in 1 2 3 4 5 6 7 8; do
  added=0
  while read -r f; do
    while read -r d; do
      if [ ! -f "$S/$d" ] && [ -f "$BIN/$d" ]; then cp "$BIN/$d" "$S/"; added=1; fi
    done < <(need "$f")
  done < <(find "$S" \( -name '*.dll' -o -name '*.exe' \))
  [ "$added" = 0 ] && break
done
find "$S" -name '*.dll' ! -name 'pager_core.dll' -exec x86_64-w64-mingw32-strip --strip-unneeded {} + 2>/dev/null || true
cp pager.svg "$S/" ; cp windows/pager.ico "$S/" 2>/dev/null || true
cat > "$S/qt.conf" <<'Q'
[Paths]
Plugins = .
Qml2Imports = qml
Q
du -sh "$S"; find "$S" -name '*.dll' | wc -l
