#!/usr/bin/env bash
# Pager's bridge defaults: download ALL history the networks offer (every chat, no message limits), bridge delivery/read state, and bridge typing.
# Bridges only read chats that already exist on the phone: nothing here starts a chat.
# Message status events and error notices are off: every bridge sees every message you send (so double puppeting works), and with them on each bridge
# that does not own the chat tried to join it just to say "no portal", hundreds of refused joins that kept Synapse busy during big syncs.
# Applies to every bridge (new and existing). Safe to re-run. Restarts the bridges unless called with --no-restart.
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
# When the bridges live in the encrypted vault, data/bridges is a link to it: the container must see the vault at the same path for the link to work.
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }

# Only touches a key if the bridge's config already has it, so a bridge that lacks an option is left alone.
EXPR='
  .backfill.enabled = true
  | .backfill.max_initial_messages = 1000000
  | .backfill.max_catchup_messages = 1000000
  | (select(.network | has("initial_chat_sync_count")) | .network.initial_chat_sync_count) = 10000
  | (select(.network | has("conversation_sync_limit")) | .network.conversation_sync_limit) = 10000
  | (select(.network.sync | has("create_limit")) | .network.sync.create_limit) = 0
  | (select(.network.sync | has("update_limit")) | .network.sync.update_limit) = 0
  | (select(.network.history_sync) | .network.history_sync.dispatch_wait) = "5m"
  | (select(.network.history_sync) | .network.history_sync.full_sync_config.days_limit) = 36500
  | (select(.network.history_sync) | .network.history_sync.full_sync_config.size_mb_limit) = 102400
  | (select(.network.history_sync) | .network.history_sync.full_sync_config.storage_quota_mb) = 102400
  | (select(.matrix | has("delivery_receipts")) | .matrix.delivery_receipts) = true
  | (select(.matrix | has("message_status_events")) | .matrix.message_status_events) = false
  | (select(.matrix | has("message_error_notices")) | .matrix.message_error_notices) = false
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
