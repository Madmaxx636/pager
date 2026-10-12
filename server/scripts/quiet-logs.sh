#!/usr/bin/env bash
# Makes Synapse log only warnings and errors (no line for every request), which saves CPU and disk. No restart: Synapse reloads on SIGHUP.
# Usage: server/scripts/quiet-logs.sh [on|off]   (on = quiet, the default; off = back to INFO)
set -euo pipefail
cd "$(dirname "$0")/.."
f=$(ls data/synapse/*.log.config 2>/dev/null | head -1)
[ -n "$f" ] || { echo "No Synapse log config found"; exit 1; }
if [ "${1:-on}" = off ]; then lvl=INFO; else lvl=WARNING; fi
sed -i -E "/^root:/,/handlers/ s/level: .*/level: $lvl/" "$f"
docker compose kill -s HUP synapse >/dev/null
echo "Synapse now logs $lvl and up."
