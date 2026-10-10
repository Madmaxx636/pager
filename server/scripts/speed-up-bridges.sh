#!/usr/bin/env bash
# Makes every bridge accept messages from Synapse straight away instead of one at a time. Every bridge is sent the events of every chat
# you are in (it has to be, for double puppeting) and can't read the ones that belong to other bridges; handled one by one, those pile up
# whenever any bridge is importing history, and your own messages wait behind them. Then clears what has already piled up.
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }
for dir in data/bridges/*/; do
  id="$(basename "$dir")"; [ -f "$dir/config.yaml" ] || continue
  cp "$dir/config.yaml" "$dir/config.yaml.bak-async"
  yq -i '.appservice.async_transactions = true' "bridges/$id/config.yaml"
  echo "  $id: done"
done
exec ./scripts/skip-bridge-backlog.sh --yes
