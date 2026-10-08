#!/usr/bin/env bash
# Builds the web app with Docker, so the server doesn't need Node.js installed.
set -euo pipefail
cd "$(dirname "$0")/../../app"
docker run --rm -u "$(id -u):$(id -g)" -v "$PWD:/app" -w /app docker.io/library/node:22-alpine sh -c "npm ci && npm run build"
echo "Built app/dist"
