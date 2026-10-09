#!/usr/bin/env bash
# Turns on double puppeting for every bridge: messages you send from your phone appear as sent by you, and reading a chat on
# your phone marks it read in Pager. Safe to re-run. Restarts Synapse and the bridges unless called with --no-restart.
set -euo pipefail
cd "$(dirname "$0")/.."
DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
# When the bridges live in the encrypted vault, data/bridges is a link to it: the container must see the vault at the same path for the link to work.
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }
set -a; . ./.env; set +a

changed=0
for dir in data/bridges/*/; do
  id="$(basename "$dir")"
  [ -f "$dir/config.yaml" ] && [ -f "$dir/registration.yaml" ] || continue
  # Let the bridge act as any user on this server (non-exclusive, so it doesn't take the names over).
  if ! grep -q 'exclusive: false' "$dir/registration.yaml"; then
    cp "$dir/registration.yaml" "$dir/registration.yaml.bak"
    re="${PAGER_DOMAIN//./\\\\.}"
    yq -i ".namespaces.users += [{\"regex\": \"^@.*:${re}\$\", \"exclusive\": false}]" "bridges/$id/registration.yaml"
    changed=1
  fi
  token="$(yq '.as_token' "bridges/$id/registration.yaml")"
  if ! grep -q "as_token:" "$dir/config.yaml" || grep -q 'example.com: as_token:foobar' "$dir/config.yaml"; then
    cp "$dir/config.yaml" "$dir/config.yaml.bak"
    yq -i ".double_puppet.servers = {} | .double_puppet.allow_discovery = false | .double_puppet.secrets = {\"$PAGER_DOMAIN\": \"as_token:$token\"}" "bridges/$id/config.yaml"
    changed=1
  fi
  cp "$dir/registration.yaml" "data/synapse/appservice-$id.yaml"
done

if [ "${1:-}" != "--no-restart" ] && [ "$changed" = 1 ]; then
  docker compose restart synapse
  sleep 15
  docker compose restart $(docker compose config --services | grep -E '^(whatsapp|signal|gmessages|messenger|discord|instagram|telegram)$')
fi
echo "Double puppeting is on for: $(ls -d data/bridges/*/ | xargs -n1 basename | tr '\n' ' ')"
