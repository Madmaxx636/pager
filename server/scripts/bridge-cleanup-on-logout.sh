#!/usr/bin/env bash
# Turns "delete a network's chats when you disconnect it" on or off for one bridge. Use it to start a network over with its full history:
#   ./scripts/bridge-cleanup-on-logout.sh whatsapp on     (then disconnect the network in Pager, then:)
#   ./scripts/bridge-cleanup-on-logout.sh whatsapp off    (then connect the network again)
# While it is ON, disconnecting deletes every chat of that network from Pager (the messages stay on your phone). Leave it OFF otherwise.
set -euo pipefail
cd "$(dirname "$0")/.."
ID="${1:?Usage: $0 <bridge id like whatsapp> on|off}"; MODE="${2:?Usage: $0 <bridge id> on|off}"
DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }
[ -f "data/bridges/$ID/config.yaml" ] || { echo "No bridge called $ID"; exit 1; }
if [ "$MODE" = on ]; then
  yq -i '.bridge.cleanup_on_logout.enabled = true | .bridge.cleanup_on_logout.manual.private = "delete" | .bridge.cleanup_on_logout.manual.shared_no_users = "delete" | .bridge.cleanup_on_logout.manual.shared_has_users = "delete" | .bridge.cleanup_on_logout.manual.relayed = "delete"' "bridges/$ID/config.yaml"
else
  yq -i '.bridge.cleanup_on_logout.enabled = false | .bridge.cleanup_on_logout.manual.private = "nothing" | .bridge.cleanup_on_logout.manual.shared_no_users = "nothing" | .bridge.cleanup_on_logout.manual.shared_has_users = "nothing" | .bridge.cleanup_on_logout.manual.relayed = "nothing"' "bridges/$ID/config.yaml"
fi
docker compose restart "$ID" >/dev/null
echo "$ID: deleting chats on disconnect is now ${MODE^^}."
