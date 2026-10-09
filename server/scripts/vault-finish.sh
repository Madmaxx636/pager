#!/usr/bin/env bash
# Run only after vault-migrate.sh and after you've checked that your chats still work. Deletes the plain (unencrypted) copies it left behind.
set -euo pipefail
cd "$(dirname "$0")/.."
[ -L data/bridges ] || { echo "The bridges are not in the vault yet (run vault-migrate.sh first)." >&2; exit 1; }
read -rp "Delete the old unencrypted bridge copies for good? [y/N] " yn
[ "$yn" = "y" ] || [ "$yn" = "Y" ] || { echo "Cancelled."; exit 0; }

for d in data/vault-backup-*/; do [ -d "$d" ] || continue; find "$d" -type f -exec shred -u {} + 2>/dev/null || true; rm -rf "$d"; done
if [ -d data/bridges.plain-old ]; then find data/bridges.plain-old -type f -exec shred -u {} + 2>/dev/null || true; rm -rf data/bridges.plain-old; fi
for id in $(ls data/bridges); do
  docker compose exec -T postgres psql -U pager -d postgres -c "DROP DATABASE IF EXISTS $id" >/dev/null 2>&1 || true
done
echo "Done. Bridge data now lives only in the encrypted vault."
echo "Note: on SSDs and journaled disks, deleted data can linger in free space until it is overwritten; encrypting the whole disk is the only full answer to that."
