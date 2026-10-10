#!/usr/bin/env bash
# Clears the queue of old events Synapse is still trying to deliver to the bridges. After linking Signal/WhatsApp for the first time,
# thousands of imported messages are queued for EVERY bridge, each unreadable to the bridges that don't own it, and they block real
# messages for hours. Nothing is lost: the queue only holds copies of events that already exist in your chats.
# Messages sent while this runs (a few seconds) should be sent again. Usage: ./scripts/skip-bridge-backlog.sh
set -euo pipefail
cd "$(dirname "$0")/.."
db() { docker compose exec -T postgres psql -U pager -d synapse -v ON_ERROR_STOP=1 -At "$@"; }
echo "Waiting to be delivered, per bridge:"; db -c "select '  '||as_id||': '||count(*) from application_services_txns group by as_id order by as_id;"
if [ "${1:-}" = "--yes" ]; then ok=yes; else read -r -p "Clear this queue? Type yes: " ok; fi; [ "${ok,,}" = "yes" ] || { echo "Cancelled. Nothing changed."; exit 0; }
BR=$(docker compose config --services | grep -vE '^(postgres|bridgedb|synapse|caddy|api|duckdns)$' | tr '\n' ' ')
docker compose stop $BR synapse
db -c "delete from application_services_txns;" -c "update application_services_state set state='up';"
docker compose up -d synapse
until [ "$(docker compose ps synapse --format '{{.Health}}')" = healthy ]; do sleep 2; done
docker compose up -d
echo "Done. Send a test message in a Signal or WhatsApp page and it should go out within seconds."
