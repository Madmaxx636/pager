#!/usr/bin/env bash
# Builds the Rust engine for Windows (pager_core.dll) inside the throwaway Fedora image (see windows/Dockerfile).
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; CACHE="$HOME/.cache/pager-native-build"; mkdir -p "$CACHE/cargo" "$CACHE/target-win" "$HERE/build-core-win"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_HOME=/cargo -e CARGO_TARGET_DIR=/target \
  -e CARGO_TARGET_X86_64_PC_WINDOWS_GNU_LINKER=x86_64-w64-mingw32-gcc-posix -e CC_x86_64_pc_windows_gnu=x86_64-w64-mingw32-gcc-posix -e CXX_x86_64_pc_windows_gnu=x86_64-w64-mingw32-g++-posix -e AR_x86_64_pc_windows_gnu=x86_64-w64-mingw32-ar \
  -v "$HERE/core:/work" -v "$CACHE/cargo:/cargo" -v "$CACHE/target-win:/target" -v "$HERE/build-core-win:/out" -w /work localhost/pager-native-wincore \
  bash -c 'cargo build --release --target x86_64-pc-windows-gnu && cp /target/x86_64-pc-windows-gnu/release/pager_core.dll /target/x86_64-pc-windows-gnu/release/libpager_core.dll.a /out/'
