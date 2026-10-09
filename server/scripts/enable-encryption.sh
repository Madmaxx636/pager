#!/usr/bin/env bash
# Turns on end-to-end encryption for bridged chats: every NEW chat a bridge creates is encrypted (the bridge holds the keys it needs
# to pass messages along, your devices hold the rest). Chats that already exist stay as they are until you decide otherwise.
#
#   ./scripts/enable-encryption.sh                 every bridge
#   ./scripts/enable-encryption.sh signal          just Signal (a good first try)
#   ./scripts/enable-encryption.sh --off signal    back to plain chats for new rooms
#
# Update the Pager apps FIRST: a device that cannot decrypt shows "Waiting for the key" for encrypted chats.
set -euo pipefail
cd "$(dirname "$0")/.."
on=true; if [ "${1:-}" = "--off" ]; then on=false; shift; fi

DOCKER_UID="$(id -u):$(id -g)"
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
# When the bridges live in the encrypted vault, data/bridges is a link to it: the container must see the vault at the same path for the link to work.
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }

ids=("$@")
if [ ${#ids[@]} -eq 0 ]; then for d in data/bridges/*/; do ids+=("$(basename "$d")"); done; fi

changed=()
for id in "${ids[@]}"; do
  cfg="bridges/$id/config.yaml"
  [ -f "data/$cfg" ] || { echo "No bridge called '$id' here (skipping)"; continue; }
  # Newer bridges keep the settings at the top (.encryption); the older Discord/Telegram ones under .bridge.
  if [ "$(yq '.encryption | type' "$cfg")" = "!!map" ]; then path=".encryption"
  elif [ "$(yq '.bridge.encryption | type' "$cfg")" = "!!map" ]; then path=".bridge.encryption"
  else echo "$id: this bridge has no encryption settings (skipping)"; continue; fi
  now="$(yq "$path.allow" "$cfg")/$(yq "$path.default" "$cfg")"
  if $on; then
    yq -i "$path.allow = true | $path.default = true | $path.require = false" "$cfg"
  else
    yq -i "$path.default = false" "$cfg"   # existing encrypted chats keep working: allow stays on
  fi
  echo "$id: allow/default was $now, now $(yq "$path.allow" "$cfg")/$(yq "$path.default" "$cfg")"
  changed+=("$id")
done

[ ${#changed[@]} -gt 0 ] || { echo "Nothing changed."; exit 0; }
echo "Restarting: ${changed[*]}"
docker compose restart "${changed[@]}"
echo "Done. Send a message in a NEW chat on one of these networks to try it; it should show a lock in Pager."
