#!/usr/bin/env bash
# Builds the Rust engine inside a container (so Rust does not have to be installed here) and puts libpager_core.so next to the Qt app's build.
# Usage: desktop-native/build-core.sh [cargo arguments, default: build --release]    Caches live in ~/.cache/pager-native-build (delete it when done).
set -euo pipefail
HERE="$(cd "$(dirname "$0")" && pwd)"; CACHE="$HOME/.cache/pager-native-build"; mkdir -p "$CACHE/cargo" "$CACHE/target"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_HOME=/cargo -e CARGO_TARGET_DIR=/target \
  -v "$HERE/core:/work" -v "$CACHE/cargo:/cargo" -v "$CACHE/target:/target" -w /work docker.io/library/rust:1-bookworm cargo "${@:-build --release}"
