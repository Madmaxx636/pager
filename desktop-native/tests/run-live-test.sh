#!/usr/bin/env bash
# Runs the engine's real-conversation test against a homeserver you started for the purpose (never your real one).
# Example:  PAGER_TEST_SERVER=http://127.0.0.1:8008 PAGER_TEST_ALICE=alice:alice-pass-1 PAGER_TEST_BOB=bob:bob-pass-1 desktop-native/tests/run-live-test.sh
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"; CACHE="$HOME/.cache/pager-native-build"; mkdir -p "$CACHE/cargo" "$CACHE/target-test"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm --network host $USERNS -u "$(id -u):$(id -g)" -e HOME=/tmp -e CARGO_HOME=/cargo -e CARGO_TARGET_DIR=/target \
  -e PAGER_TEST_SERVER -e PAGER_TEST_ALICE -e PAGER_TEST_BOB \
  -v "$HERE/core:/work" -v "$CACHE/cargo:/cargo" -v "$CACHE/target-test:/target" -w /work docker.io/library/rust:1-bookworm cargo test --release --features test-update-key -- --nocapture
