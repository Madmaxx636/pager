#!/usr/bin/env bash
# Builds the web app with Docker, so the server doesn't need Node.js installed.
set -euo pipefail
cd "$(dirname "$0")/../../app"
cp ../VERSION VERSION 2>/dev/null || true   # shown in the app under Settings → About
if [ -d dist ] && [ ! -w dist ]; then echo "app/dist is owned by another user (Docker created it). Run: sudo rm -rf $PWD/dist" >&2; exit 1; fi
# Rootless Podman needs --userns=keep-id so files in the folder stay writable by you.
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
docker run --rm $USERNS -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app docker.io/library/node:22-alpine sh -c "npm ci && npm run build"
echo "Built app/dist"
