#!/usr/bin/env bash
# Moves the bridges (their configs, logins and databases) into the encrypted vault. Run after scripts/vault-setup.sh, as the user who
# runs Pager (not root), from anywhere:   ./scripts/vault-migrate.sh
#
# Pager pauses for a minute or two. Nothing is deleted: the old plain copies are kept (data/bridges.plain-old, data/vault-backup-*, and the
# bridge databases in the old database) until you have checked everything works and run ./scripts/vault-finish.sh.
set -euo pipefail
cd "$(dirname "$0")/.."
VAULT="${VAULT_DIR:-/srv/pager-vault}"

mountpoint -q "$VAULT" || { echo "The vault is not open at $VAULT. Run: sudo ./scripts/vault-setup.sh" >&2; exit 1; }
[ -d data/bridges ] || { echo "No data/bridges here. Is this the server folder?" >&2; exit 1; }
# A run that stopped half way (the bridges are already in the vault but not switched on) carries on from step 4.
resume=0
if [ -L data/bridges ]; then
  if [ -d data/bridges.plain-old ] && compgen -G "data/vault-backup-*" >/dev/null; then resume=1; echo "Carrying on from where the last run stopped."
  else echo "data/bridges already points into the vault: nothing to do." >&2; exit 0; fi
fi
[ -w "$VAULT/bridges" ] || { echo "You can't write to $VAULT/bridges. Run vault-setup with --owner $(id -un)." >&2; exit 1; }

if [ $resume = 0 ]; then
read -rp "Pager will pause for a minute or two while the bridges move into the vault. Continue? [y/N] " yn
[ "$yn" = "y" ] || [ "$yn" = "Y" ] || { echo "Cancelled."; exit 0; }
fi

bridges=(); for d in data/bridges/*/; do bridges+=("$(basename "$d")"); done
stamp="$(date +%Y%m%d-%H%M%S)"; backup="data/vault-backup-$stamp"
if [ $resume = 1 ]; then backup="$(ls -d data/vault-backup-* | sort | tail -n1)"; fi
umask 077; mkdir -p "$backup"

if [ $resume = 0 ]; then

echo "1/7 Saving a copy of each bridge database to $backup (plain, kept until you finish)…"
docker compose up -d postgres >/dev/null
until docker compose exec -T postgres pg_isready -U pager >/dev/null 2>&1; do sleep 2; done
for id in "${bridges[@]}"; do
  docker compose exec -T postgres pg_dump -U pager -Fc "$id" > "$backup/$id.dump" 2>/dev/null || { echo "   (no database for $id, skipping)"; rm -f "$backup/$id.dump"; }
done

echo "2/7 Stopping the bridges…"
docker compose stop "${bridges[@]}" >/dev/null 2>&1 || true

echo "3/7 Moving bridge files into the vault…"
mv data/bridges data/bridges.plain-old
ln -s "$VAULT/bridges" data/bridges
cp -a data/bridges.plain-old/. data/bridges/

fi

echo "4/7 Pointing the bridges at their new database…"
sed -i 's#@postgres/#@bridgedb/#g' data/bridges/*/config.yaml
grep -q '^VAULT_DIR=' .env || echo "VAULT_DIR=$VAULT" >> .env
grep -q 'docker-compose.vault.yml' .env || sed -i 's#^COMPOSE_FILE=\(.*\)#COMPOSE_FILE=\1:docker-compose.vault.yml#' .env
./scripts/setup.sh >/dev/null

echo "5/7 Starting the vault database and restoring the bridges' data into it…"
docker compose up -d bridgedb >/dev/null
until docker compose exec -T bridgedb pg_isready -U pager >/dev/null 2>&1; do sleep 2; done
for id in "${bridges[@]}"; do
  [ -f "$backup/$id.dump" ] || continue
  docker compose exec -T bridgedb psql -U pager -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$id'" | grep -q 1 \
    || docker compose exec -T bridgedb psql -U pager -d postgres -c "CREATE DATABASE $id ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0 OWNER pager" >/dev/null
  docker compose exec -T bridgedb pg_restore -U pager -d "$id" --no-owner --clean --if-exists < "$backup/$id.dump" >/dev/null 2>&1 || true
  # The copy must have the same tables as the original before anything is switched on.
  count() { docker compose exec -T "$1" psql -U pager -d "$id" -tAc "SELECT count(*) FROM information_schema.tables WHERE table_schema='public'" | tr -d '[:space:]'; }
  if [ "$(count postgres)" != "$(count bridgedb)" ]; then
    echo "The copy of $id does not match the original. Nothing was deleted. To go back:" >&2
    echo "  docker compose stop; rm data/bridges; mv data/bridges.plain-old data/bridges; sed -i 's#@bridgedb/#@postgres/#' data/bridges/*/config.yaml; docker compose up -d" >&2
    exit 1
  fi
done

echo "6/7 Starting everything…"
docker compose up -d >/dev/null
sleep 15

echo "7/7 Checking…"
docker compose ps --format 'table {{.Name}}\t{{.Status}}' | sed 's/^/   /'
echo
echo "Done. Open Pager and check a few chats on WhatsApp/Signal/etc. send and receive. If anything is wrong, tell me before running vault-finish:"
echo "the plain copies are all still here. When you are happy: ./scripts/vault-finish.sh"
