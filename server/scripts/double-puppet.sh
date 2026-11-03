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

# One registration of its own (no address, so Synapse never sends it any events) lets every bridge log in as any user. Putting that
# "any user" pattern in each bridge's own registration made Synapse send every room's events to every bridge, which refused them.
dp="synapse/appservice-doublepuppet.yaml"
changed=0
if [ ! -f "data/$dp" ]; then
  re="${PAGER_DOMAIN//./\\.}"
  rand() { head -c 32 /dev/urandom | od -An -tx1 | tr -d ' \n'; }
  ( umask 077; cat > "data/$dp" <<YML
id: doublepuppet
url:
as_token: $(rand)
hs_token: $(rand)
sender_localpart: doublepuppet
rate_limited: false
namespaces:
  users:
    - regex: '^@.*:${re}\$'
      exclusive: false
YML
  )
  changed=1
fi
if ! grep -q 'appservice-doublepuppet.yaml' data/synapse/homeserver.yaml; then
  sed -i '/^app_service_config_files:/a\  - /data/appservice-doublepuppet.yaml' data/synapse/homeserver.yaml
  changed=1
fi
shared="$(yq '.as_token' "$dp")"
for dir in data/bridges/*/; do
  id="$(basename "$dir")"
  [ -f "$dir/config.yaml" ] && [ -f "$dir/registration.yaml" ] || continue
  # An older version of this script put the "any user" pattern into the bridge's own registration: take it out again.
  if grep -q 'exclusive: false' "$dir/registration.yaml"; then
    cp "$dir/registration.yaml" "$dir/registration.yaml.bak"
    yq -i '.namespaces.users |= map(select(.exclusive != false))' "bridges/$id/registration.yaml"
    changed=1
  fi
  # Bridges that have a double_puppet section (mautrix-go ones) use the shared registration's token.
  if [ "$(yq '.double_puppet | tag' "bridges/$id/config.yaml")" = "!!map" ] && [ "$(yq ".double_puppet.secrets.\"$PAGER_DOMAIN\"" "bridges/$id/config.yaml")" != "as_token:$shared" ]; then
    cp "$dir/config.yaml" "$dir/config.yaml.bak"
    yq -i ".double_puppet.servers = {} | .double_puppet.allow_discovery = false | .double_puppet.secrets = {\"$PAGER_DOMAIN\": \"as_token:$shared\"}" "bridges/$id/config.yaml"
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
