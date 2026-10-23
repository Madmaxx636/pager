#!/usr/bin/env bash
# Cross-compiles the Windows program (pager-native.exe) with MinGW's Qt inside the throwaway Fedora image. Needs build-core-win/ from windows/build-core.sh.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; mkdir -p "$HERE/build-win"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$HERE:/src" -w /src localhost/pager-native-win \
  bash -c 'mingw64-cmake -S . -B build-win -G Ninja -DPAGER_CORE_DIR=/src/build-core-win -DPAGER_BUILD_TESTS=OFF -DCMAKE_BUILD_TYPE=Release && cmake --build build-win'
# gather the program, its engine and the Qt libraries into build-win/stage/
docker run --rm $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -v "$HERE:/src" -w /src localhost/pager-native-win bash windows/stage.sh
