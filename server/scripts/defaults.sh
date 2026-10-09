#!/usr/bin/env bash
# Pager's bridge defaults: download as much history as the networks offer, bridge delivery/read state, and bridge typing.
# Applies to every bridge (new and existing). Safe to re-run. Restarts the bridges unless called with --no-restart.
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
yq() { docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" -w /work docker.io/mikefarah/yq "$@"; }

# Only touches a key if the bridge's config already has it, so a bridge that lacks an option is left alone.
EXPR='
  .backfill.enabled = true
  | .backfill.max_initial_messages = 2000
  | .backfill.max_catchup_messages = 5000
  | (select(.matrix | has("delivery_receipts")) | .matrix.delivery_receipts) = true
  | (select(.matrix | has("message_status_events")) | .matrix.message_status_events) = true
  | (select(.network | has("send_presence_on_typing")) | .network.send_presence_on_typing) = true
  | (select(.bridge | has("send_presence_on_typing")) | .bridge.send_presence_on_typing) = true
  | (select(.network.history_sync) | .network.history_sync.request_full_sync) = true
  | (select(.network.history_sync) | .network.history_sync.max_initial_conversations) = -1
'
for dir in data/bridges/*/; do
  id="$(basename "$dir")"
  [ -f "$dir/config.yaml" ] || continue
  cp -n "$dir/config.yaml" "$dir/config.yaml.pre-defaults" 2>/dev/null || true
  yq -i "$EXPR" "bridges/$id/config.yaml"
done

if [ "${1:-}" != "--no-restart" ]; then
  docker compose restart $(docker compose config --services | grep -E '^(whatsapp|signal|gmessages|messenger|discord|instagram|telegram)$')
fi
echo "Bridge defaults applied to: $(ls -d data/bridges/*/ | xargs -n1 basename | tr '\n' ' ')"
