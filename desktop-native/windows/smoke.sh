#!/usr/bin/env bash
# Starts the staged Windows program under Wine (needs the Wine image: windows/Dockerfile.wine) with made-up chats and saves a screenshot:
# proves it starts and the screens load. Wine is not Windows, but it catches missing libraries and broken screens.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; OUTDIR="$HERE/build-win"; NAME="${1:-smoke.png}"; shift || true
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
rm -f "$OUTDIR/$NAME"
docker run --rm $USERNS -u "$(id -u):$(id -g)" -v "$HERE/build-win/stage:/app" -v "$OUTDIR:/out" -e NAME="$NAME" -e EXTRA="$*" localhost/pager-native-winwine bash -c '
  mkdir -p /tmp/h; export HOME=/tmp/h WINEPREFIX=/tmp/h/wine WINEDEBUG=err+all WINEDLLOVERRIDES="mscoree,mshtml=" QT_QUICK_BACKEND=software
  Xvfb :99 -screen 0 1280x800x24 >/dev/null 2>&1 & sleep 2; export DISPLAY=:99
  timeout 90 wineboot -u >/dev/null 2>&1 || true
  timeout 120 wine /app/pager-native.exe --demo --data-dir "Z:\\tmp\\pd" $EXTRA --screenshot "Z:\\out\\$NAME" > /tmp/out.txt 2>&1; echo "exit: $?"
  grep -vE "fixme|winediag" /tmp/out.txt | tail -15'
ls -la "$OUTDIR/$NAME"
