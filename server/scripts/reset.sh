#!/usr/bin/env bash
# Wipes this Pager server and sets it up again from nothing: every account, room, message, bridge login and key is deleted.
# Kept: your domain/DuckDNS settings, the HTTPS certificates, the encrypted vault (emptied) and its key. A copy of the old .env is saved
# to your home folder. Afterwards you make the first admin account with the code this prints, and link every app again.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "This DELETES everything on this Pager server: accounts, chats, bridge logins (WhatsApp, Signal, ...), recovery backups."
echo "It cannot be undone. Your phones and desktop will need to sign in again as new accounts."
read -r -p "Type nuke to continue: " ok; [ "${ok,,}" = "nuke" ] || { echo "Cancelled. Nothing changed."; exit 0; }

wipe() { docker run --rm -v "$1:/w" docker.io/library/postgres:16-alpine sh -c 'rm -rf /w/* /w/.[!.]* 2>/dev/null; true'; }

echo "1/6 Stopping everything…"
docker compose down --remove-orphans || true

echo "2/6 Saving the old settings…"
OLD="$HOME/pager-env-before-reset-$(date +%s)"; cp .env "$OLD"; chmod 600 "$OLD"; echo "    saved to $OLD"
set -a; . ./.env; set +a

echo "3/6 Deleting data…"
wipe "$PWD/data/postgres"; wipe "$PWD/data/synapse"; wipe "$PWD/data/api"
rm -f data/bridges.json data/bridges.compose.yml
if [ -n "${VAULT_DIR:-}" ]; then
  mountpoint -q "$VAULT_DIR" || { echo "The vault is not open at $VAULT_DIR. Run: sudo /usr/local/sbin/pager-vault start" >&2; exit 1; }
  wipe "$VAULT_DIR/bridges"; wipe "$VAULT_DIR/bridgedb"
  [ -L data/bridges ] || { rm -rf data/bridges; ln -s "$VAULT_DIR/bridges" data/bridges; }
else
  wipe "$PWD/data/bridges"
fi

echo "4/6 Writing fresh settings (new passwords and codes)…"
keep='^(PAGER_DOMAIN|DUCKDNS_SUBDOMAIN|DUCKDNS_TOKEN|PAGER_ADDRESS|HTTP_PORT|HTTPS_PORT|SIGNUP_MODE|COMPOSE_PROFILES|VAULT_DIR|SYNAPSE_UID|SYNAPSE_GID|BRIDGE_UID|BRIDGE_GID|TELEGRAM_API_ID|TELEGRAM_API_HASH|ENABLE_[A-Z]+)='
grep -E "$keep" "$OLD" > .env
CF="docker-compose.yml:data/bridges.compose.yml"; [ -n "${VAULT_DIR:-}" ] && CF="$CF:docker-compose.vault.yml"
echo "COMPOSE_FILE=$CF" >> .env

echo "5/6 Setting up the server and every bridge…"
./scripts/setup.sh
docker compose up -d --build

echo "6/6 Building the web app…"
./scripts/build-web.sh

set -a; . ./.env; set +a
echo
echo "Done. Open https://$PAGER_DOMAIN and create your account with the ADMIN code: ${ADMIN_INVITE_CODE}"
echo "(Other people sign up with the invite code: ${INVITE_CODE})"
echo "Then in each app: sign in, make a recovery key, and link your messaging apps again."
