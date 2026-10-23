#!/usr/bin/env bash
# Makes the Windows installer: dist/pager-native-setup-<version>.exe (build the engine, the program and stage it first: build-core.sh, build-app.sh, stage.sh).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$HERE/dist"
V="$(sed -n 's/^project(pager-native VERSION \([0-9.]*\).*/\1/p' "$HERE/CMakeLists.txt")"
[ -f "$HERE/build-win/stage/pager-native.exe" ] || { echo "Stage it first (windows/stage.sh)." >&2; exit 1; }
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
# (The installer program itself is 32-bit, which runs fine on every Windows; it installs the 64-bit app.)
docker run --rm $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$HERE:/src" -w /src localhost/pager-native-win \
  makensis -V2 -DVERSION="$V" -DSTAGE=/src/build-win/stage -DOUTFILE="/src/dist/pager-native-setup-$V.exe" windows/installer.nsi
ls -la "$HERE/dist/pager-native-setup-$V.exe"; sha256sum "$HERE/dist/pager-native-setup-$V.exe"
