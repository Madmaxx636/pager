#!/usr/bin/env bash
# Generates .env, Synapse config, and bridge configs/registrations. Safe to re-run.
# To enable Telegram, add TELEGRAM_API_ID and TELEGRAM_API_HASH (from https://my.telegram.org) to server/.env, then re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

DOCKER_UID="$(id -u):$(id -g)"
# Podman (rootless) needs --userns=keep-id so files in bind mounts stay owned by you.
USERNS=""; case "$(readlink -f "$(command -v docker)")" in *podman*) USERNS="--userns=keep-id" ;; esac
# When the bridges live in the encrypted vault, data/bridges is a link to it: the container must see the vault at the same path for the link to work.
yq() { local v=""; [ -L data/bridges ] && v="$(readlink -f data/bridges)"; docker run --rm -i $USERNS -u "$DOCKER_UID" -v "$PWD/data:/work" ${v:+-v "$v:$v"} -w /work docker.io/mikefarah/yq "$@"; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

touch .env
# Fill in whatever .env doesn't have yet (so you can pre-seed PAGER_DOMAIN, DUCKDNS_*, etc. and let setup add the secrets).
need() { grep -q "^$1=." .env; }
if ! need PAGER_DOMAIN; then read -rp "Public domain for your server (e.g. matrix.example.com): " domain; echo "PAGER_DOMAIN=$domain" >> .env; fi
need POSTGRES_PASSWORD || echo "POSTGRES_PASSWORD=$(rand)" >> .env
need PROVISIONING_SECRET || echo "PROVISIONING_SECRET=$(rand)" >> .env
need INVITE_CODE || echo "INVITE_CODE=$(rand | head -c 12)" >> .env
need SIGNUP_MODE || echo "SIGNUP_MODE=invite" >> .env
need ADMIN_INVITE_CODE || echo "ADMIN_INVITE_CODE=$(rand | head -c 16)" >> .env
# Local or rootless installs: plain HTTP (no certificate possible for localhost/IPs) and unprivileged ports.
domain_now="$(grep '^PAGER_DOMAIN=' .env | cut -d= -f2)"
if ! grep -q '^PAGER_ADDRESS=' .env && [[ "$domain_now" =~ ^(localhost|[0-9.]+|.*\.local)$ ]]; then
  printf 'PAGER_ADDRESS=http://:80\nHTTP_PORT=8080\nHTTPS_PORT=8443\n' >> .env
fi
# The containers must run as whoever owns the generated config and keys (they are created as you, with mode 600).
if ! grep -q '^SYNAPSE_UID=' .env; then
  if [ -n "$USERNS" ]; then u=0; g=0; else u="$(id -u)"; g="$(id -g)"; fi
  printf 'SYNAPSE_UID=%s\nSYNAPSE_GID=%s\nBRIDGE_UID=%s\nBRIDGE_GID=%s\n' "$u" "$g" "$u" "$g" >> .env
fi
# DuckDNS: set DUCKDNS_TOKEN and DUCKDNS_SUBDOMAIN (the part before .duckdns.org) in .env to keep the name pointed at this IP.
if grep -q '^DUCKDNS_TOKEN=.' .env && ! grep -q '^COMPOSE_PROFILES=' .env; then echo 'COMPOSE_PROFILES=duckdns' >> .env; fi
grep -q '^COMPOSE_FILE=' .env || echo 'COMPOSE_FILE=docker-compose.yml:data/bridges.compose.yml' >> .env
set -a; . ./.env; set +a

# Bridge data (logins, message keys) can live in an encrypted vault with its own database: see scripts/vault-setup.sh.
BRIDGE_DB_HOST=postgres; [ -n "${VAULT_DIR:-}" ] && BRIDGE_DB_HOST=bridgedb

# id ; display name ; image ; binary ; extra yq patch ; required env var (empty = always on)
BRIDGE_TABLE=(
  "whatsapp;WhatsApp;whatsapp;mautrix-whatsapp;;"
  "signal;Signal;signal;mautrix-signal;;"
  "discord;Discord (experimental: legacy bridge, log in via its bot chat);discord;mautrix-discord;.appservice.database.type = \"postgres\" | .appservice.database.uri = \"postgres://pager:$POSTGRES_PASSWORD@$BRIDGE_DB_HOST/discord?sslmode=disable\";ENABLE_DISCORD"
  "gmessages;Google Messages (SMS/RCS);gmessages;mautrix-gmessages;;"
  "slack;Slack;slack;mautrix-slack;;"
  "twitter;X (Twitter) DMs;twitter;mautrix-twitter;;"
  "bluesky;Bluesky;bluesky;mautrix-bluesky;;"
  "linkedin;LinkedIn;linkedin;mautrix-linkedin;;"
  "instagram;Instagram (experimental: no published bridge image at last check);instagram;mautrix-instagram;;ENABLE_INSTAGRAM"
  "messenger;Messenger;meta;mautrix-meta;;"
  "telegram;Telegram;telegram;mautrix-telegram;.network.api_id = ${TELEGRAM_API_ID:-0} | .network.api_hash = \"${TELEGRAM_API_HASH:-}\";TELEGRAM_API_HASH"
)

mkdir -p data/synapse data/postgres data/caddy data/bridges data/api

# --- Synapse ---------------------------------------------------------------
if [ ! -f data/synapse/homeserver.yaml ]; then
  docker run --rm $USERNS -u "$DOCKER_UID" -v "$PWD/data/synapse:/data" \
    -e SYNAPSE_SERVER_NAME="$PAGER_DOMAIN" -e SYNAPSE_REPORT_STATS=no \
    docker.io/matrixdotorg/synapse:latest generate
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
  IFS=';' read -r id name image bin patch need <<< "$row"
  if [ -n "$need" ] && [ -z "${!need:-}" ]; then
    echo "Skipping $name (set $need in .env to enable)"
    continue
  fi
  dir="data/bridges/$id"
  mkdir -p "$dir"
  img="dock.mau.dev/mautrix/$image:latest"

  if [ ! -f "$dir/config.yaml" ]; then
    # First run copies the example config and exits.
    docker run --rm $USERNS -u "$DOCKER_UID" -v "$PWD/$dir:/data" "$img" || true
    if [ ! -f "$dir/config.yaml" ]; then echo "Skipping $name (its image could not be started)"; rmdir "$dir" 2>/dev/null || true; continue; fi
    yq -i ".homeserver.address = \"http://synapse:8008\"
      | .homeserver.domain = \"$PAGER_DOMAIN\"
      | .appservice.address = \"http://$id:29318\"
      | .appservice.hostname = \"0.0.0.0\"
      | .appservice.port = 29318
      | .appservice.id = \"$id\"
      | .appservice.bot.username = \"${id}bot\"
      | .appservice.username_template = \"${id}_{{.}}\"
      | .database.type = \"postgres\"
      | .database.uri = \"postgres://pager:$POSTGRES_PASSWORD@$BRIDGE_DB_HOST/$id?sslmode=disable\"
      | .bridge.permissions = {\"$PAGER_DOMAIN\":\"user\"}
      | .provisioning.shared_secret = \"$PROVISIONING_SECRET\"
      | .backfill.enabled = true
      | .encryption.allow = true
      | .encryption.default = true
      | .encryption.require = false${patch:+ | $patch}" "bridges/$id/config.yaml"
  fi
  if [ ! -f "$dir/config.yaml" ]; then echo "Skipping $name (its image could not be started)"; continue; fi
  if [ ! -f "$dir/registration.yaml" ]; then
    docker run --rm $USERNS -u "$DOCKER_UID" -v "$PWD/$dir:/data" --entrypoint "/usr/bin/$bin" \
      "$img" -g -c /data/config.yaml -r /data/registration.yaml
  fi

  cp "$dir/registration.yaml" "data/synapse/appservice-$id.yaml"
  # An existing install's database was created before this bridge existed.
  if docker compose ps --status running "$BRIDGE_DB_HOST" 2>/dev/null | grep -q "$BRIDGE_DB_HOST"; then
    docker compose exec -T "$BRIDGE_DB_HOST" psql -U pager -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$id'" | grep -q 1 \
      || docker compose exec -T "$BRIDGE_DB_HOST" psql -U pager -d postgres -c "CREATE DATABASE $id ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0 OWNER pager" >/dev/null
  fi
  yq -i ".app_service_config_files += [\"/data/appservice-$id.yaml\"]" synapse/homeserver.yaml
  yq -i ". += [{\"id\":\"$id\",\"name\":\"$name\",\"url\":\"http://$id:29318\"}]" bridges.json -o=json
  cat >> data/bridges.compose.yml <<YML
  $id:
    image: $img
    restart: unless-stopped
    environment:
      UID: \${BRIDGE_UID:-1337}
      GID: \${BRIDGE_GID:-1337}
    depends_on:
      $BRIDGE_DB_HOST:
        condition: service_healthy
    volumes: ["./data/bridges/$id:/data"]
    networks: [pager]
YML
  enabled+=("$name")
done

# Bridges act as your real user (sent-from-phone messages show as yours, reading on your phone clears unread in Pager).
./scripts/double-puppet.sh --no-restart >/dev/null
# Download as much history as the networks offer; bridge read/delivery state and typing.
./scripts/defaults.sh --no-restart >/dev/null

echo
echo "Bridges enabled: ${enabled[*]}"
echo "Done. Next:  docker compose up -d --build"
echo "Then open https://$PAGER_DOMAIN/ and sign up with invite code: $INVITE_CODE"
echo "To create the ADMIN account (can manage every profile, bridge and setting), sign up with the admin code instead: $ADMIN_INVITE_CODE"
