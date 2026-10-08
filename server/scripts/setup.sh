#!/usr/bin/env bash
# Generates .env, Synapse config, and bridge configs/registrations. Safe to re-run.
set -euo pipefail
cd "$(dirname "$0")/.."

BRIDGES=(whatsapp signal discord)
DOCKER_UID="$(id -u):$(id -g)"

yq() { docker run --rm -i -u "$DOCKER_UID" -v "$PWD/data:/work" -w /work mikefarah/yq "$@"; }
rand() { head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 40; }

if [ ! -f .env ]; then
  read -rp "Public domain for your server (e.g. matrix.example.com): " domain
  printf 'PAGER_DOMAIN=%s\nPOSTGRES_PASSWORD=%s\n' "$domain" "$(rand)" > .env
fi
set -a; . ./.env; set +a

mkdir -p data/synapse data/postgres data/caddy
for b in "${BRIDGES[@]}"; do mkdir -p "data/bridges/$b"; done

# --- Synapse ---------------------------------------------------------------
if [ ! -f data/synapse/homeserver.yaml ]; then
  docker run --rm -u "$DOCKER_UID" -v "$PWD/data/synapse:/data" \
    -e SYNAPSE_SERVER_NAME="$PAGER_DOMAIN" -e SYNAPSE_REPORT_STATS=no \
    matrixdotorg/synapse:latest generate
  hs=data/synapse/homeserver.yaml
  yq -i ".public_baseurl = \"https://$PAGER_DOMAIN/\"
    | .database = {\"name\":\"psycopg2\",\"args\":{\"user\":\"pager\",\"password\":\"$POSTGRES_PASSWORD\",\"database\":\"synapse\",\"host\":\"postgres\",\"cp_min\":5,\"cp_max\":10}}
    | .enable_registration = false
    | .federation_domain_whitelist = []
    | .suppress_key_server_warning = true
    | .app_service_config_files = []" synapse/homeserver.yaml
fi

# --- Bridges ---------------------------------------------------------------
for b in "${BRIDGES[@]}"; do
  dir="data/bridges/$b"
  image="dock.mau.dev/mautrix/$b:latest"
  if [ ! -f "$dir/config.yaml" ]; then
    # First run copies the example config and exits.
    docker run --rm -u "$DOCKER_UID" -v "$PWD/$dir:/data" "$image" || true
    yq -i ".homeserver.address = \"http://synapse:8008\"
      | .homeserver.domain = \"$PAGER_DOMAIN\"
      | .appservice.address = \"http://$b:29318\"
      | .appservice.hostname = \"0.0.0.0\"
      | .appservice.port = 29318
      | .database.type = \"postgres\"
      | .database.uri = \"postgres://pager:$POSTGRES_PASSWORD@postgres/$b?sslmode=disable\"
      | .bridge.permissions = {\"$PAGER_DOMAIN\":\"user\"}
      | .encryption.allow = false" "bridges/$b/config.yaml"
  fi
  if [ ! -f "$dir/registration.yaml" ]; then
    docker run --rm -u "$DOCKER_UID" -v "$PWD/$dir:/data" --entrypoint /usr/bin/mautrix-$b \
      "$image" -g -c /data/config.yaml -r /data/registration.yaml
  fi
  cp "$dir/registration.yaml" "data/synapse/appservice-$b.yaml"
  yq -i ".app_service_config_files |= (. + [\"/data/appservice-$b.yaml\"] | unique)" synapse/homeserver.yaml
done

echo
echo "Done. Next:  docker compose up -d"
echo "Then create your first user:"
echo "  docker compose exec synapse register_new_matrix_user -c /data/homeserver.yaml -a http://localhost:8008"
