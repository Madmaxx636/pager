#!/usr/bin/env bash
# Creates any missing bridge databases in the encrypted bridge database (safe to re-run), then starts the bridges.
set -euo pipefail
cd "$(dirname "$0")/.."
for id in whatsapp signal discord gmessages instagram messenger telegram slack twitter bluesky linkedin; do
  docker compose exec -T bridgedb psql -U pager -d postgres -tAc "select 1 from pg_database where datname='$id'" | grep -q 1 \
    || docker compose exec -T bridgedb psql -U pager -d postgres -c "CREATE DATABASE $id ENCODING 'UTF8' LC_COLLATE='C' LC_CTYPE='C' TEMPLATE=template0 OWNER pager" >/dev/null
done
docker compose up -d
echo "Bridge databases ready."
