#!/usr/bin/env bash
# Generates .env, Synapse config, and bridge configs/registrations. Safe to re-run.
# To enable Telegram, add TELEGRAM_API_ID and TELEGRAM_API_HASH (from https://my.telegram.org) to server/.env, then re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

DOCKER_UID="$(id -u):$(id -g)"
yq() { docker run --rm -i -u "$DOCKER_UID" -v "$PWD/data:/work" -w /work mikefarah/yq "$@"; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

if [ ! -f .env ]; then
  read -rp "Public domain for your server (e.g. matrix.example.com): " domain
  printf 'PAGER_DOMAIN=%s\nPOSTGRES_PASSWORD=%s\nPROVISIONING_SECRET=%s\nINVITE_CODE=%s\nSIGNUP_MODE=invite\n' \
    "$domain" "$(rand)" "$(rand)" "$(rand | head -c 12)" > .env
fi
grep -q '^COMPOSE_FILE=' .env || echo 'COMPOSE_FILE=docker-compose.yml:data/bridges.compose.yml' >> .env
set -a; . ./.env; set +a

# id | display name | image | binary | extra yq patch | required env var (empty = always on)
BRIDGE_TABLE=(
  "whatsapp|WhatsApp|whatsapp|mautrix-whatsapp||"
  "signal|Signal|signal|mautrix-signal||"
  "discord|Discord|discord|mautrix-discord||"
  "gmessages|Google Messages (SMS/RCS)|gmessages|mautrix-gmessages||"
  "instagram|Instagram|meta|mautrix-meta|.network.mode = \"instagram\"|"
  "messenger|Messenger|meta|mautrix-meta|.network.mode = \"facebook\"|"
  "telegram|Telegram|telegram|mautrix-telegram|.network.api_id = ${TELEGRAM_API_ID:-0} | .network.api_hash = \"${TELEGRAM_API_HASH:-}\"|TELEGRAM_API_HASH"
)

mkdir -p data/synapse data/postgres data/caddy data/bridges

# --- Synapse ---------------------------------------------------------------
if [ ! -f data/synapse/homeserver.yaml ]; then
  docker run --rm -u "$DOCKER_UID" -v "$PWD/data/synapse:/data" \
    -e SYNAPSE_SERVER_NAME="$PAGER_DOMAIN" -e SYNAPSE_REPORT_STATS=no \
    matrixdotorg/synapse:latest generate
  yq -i ".public_baseurl = \"https://$PAGER_DOMAIN/\"
    | .database = {\"name\":\"psycopg2\",\"args\":{\"user\":\"pager\",\"password\":\"$POSTGRES_PASSWORD\",\"database\":\"synapse\",\"host\":\"postgres\",\"cp_min\":5,\"cp_max\":10}}
    | .enable_registration = false
    | .federation_domain_whitelist = []
    | .suppress_key_server_warning = true
    | .url_preview_enabled = true
    | .url_preview_ip_range_blacklist = [\"127.0.0.0/8\",\"10.0.0.0/8\",\"172.16.0.0/12\",\"192.168.0.0/16\",\"100.64.0.0/10\",\"169.254.0.0/16\",\"::1/128\",\"fe80::/10\",\"fc00::/7\"]
    | .max_event_delay_duration = \"7d\"
    | .experimental_features.msc4140_enabled = true" synapse/homeserver.yaml
fi
# The API needs Synapse's registration secret to create users.
if ! grep -q '^REGISTRATION_SECRET=' .env; then
  echo "REGISTRATION_SECRET=$(yq '.registration_shared_secret' synapse/homeserver.yaml)" >> .env
fi

# --- Bridges ---------------------------------------------------------------
yq -i '.app_service_config_files = []' synapse/homeserver.yaml
echo "services:" > data/bridges.compose.yml
echo "[]" > data/bridges.json
enabled=()

for row in "${BRIDGE_TABLE[@]}"; do
  IFS='|' read -r id name image bin patch need <<< "$row"
  if [ -n "$need" ] && [ -z "${!need:-}" ]; then
    echo "Skipping $name (set $need in .env to enable)"
    continue
  fi
  dir="data/bridges/$id"
  mkdir -p "$dir"
  img="dock.mau.dev/mautrix/$image:latest"

  if [ ! -f "$dir/config.yaml" ]; then
    # First run copies the example config and exits.
    docker run --rm -u "$DOCKER_UID" -v "$PWD/$dir:/data" "$img" || true
    yq -i ".homeserver.address = \"http://synapse:8008\"
      | .homeserver.domain = \"$PAGER_DOMAIN\"
      | .appservice.address = \"http://$id:29318\"
      | .appservice.hostname = \"0.0.0.0\"
      | .appservice.port = 29318
      | .appservice.id = \"$id\"
      | .database.type = \"postgres\"
      | .database.uri = \"postgres://pager:$POSTGRES_PASSWORD@postgres/$id?sslmode=disable\"
      | .bridge.permissions = {\"$PAGER_DOMAIN\":\"user\"}
      | .provisioning.shared_secret = \"$PROVISIONING_SECRET\"
      | .encryption.allow = false${patch:+ | $patch}" "bridges/$id/config.yaml"
  fi
  if [ ! -f "$dir/registration.yaml" ]; then
    docker run --rm -u "$DOCKER_UID" -v "$PWD/$dir:/data" --entrypoint "/usr/bin/$bin" \
      "$img" -g -c /data/config.yaml -r /data/registration.yaml
  fi

  cp "$dir/registration.yaml" "data/synapse/appservice-$id.yaml"
  yq -i ".app_service_config_files += [\"/data/appservice-$id.yaml\"]" synapse/homeserver.yaml
  yq -i ". += [{\"id\":\"$id\",\"name\":\"$name\",\"url\":\"http://$id:29318\"}]" bridges.json -o=json
  cat >> data/bridges.compose.yml <<YML
  $id:
    image: $img
    restart: unless-stopped
    depends_on:
      postgres:
        condition: service_healthy
    volumes: ["./data/bridges/$id:/data"]
    networks: [pager]
YML
  enabled+=("$name")
done

echo
echo "Bridges enabled: ${enabled[*]}"
echo "Done. Next:  docker compose up -d --build"
echo "Then open https://$PAGER_DOMAIN/ and sign up with invite code: $INVITE_CODE"
