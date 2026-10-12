#!/usr/bin/env bash
# Makes Synapse log only warnings and errors (no line for every request), which saves CPU and disk. No restart: Synapse reloads on SIGHUP.
# Usage: server/scripts/quiet-logs.sh [on|off]   (on = quiet, the default; off = back to INFO)
set -euo pipefail
cd "$(dirname "$0")/.."
f=$(ls data/synapse/*.log.config 2>/dev/null | head -1)
[ -n "$f" ] || { echo "No Synapse log config found"; exit 1; }
if [ "${1:-on}" = off ]; then lvl=INFO; else lvl=WARNING; fi
sed -i -E "/^root:/,/handlers/ s/level: .*/level: $lvl/" "$f"
# Signal from inside the container: "docker kill" would mark it as stopped by hand, and Docker then does not start it again after a reboot.
docker compose exec -T synapse sh -c "kill -HUP 1" >/dev/null 2>&1 || docker compose exec -T synapse python -c "import os,signal; os.kill(1, signal.SIGHUP)"
echo "Synapse now logs $lvl and up."
