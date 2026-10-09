#!/usr/bin/env bash
# Makes an existing account an administrator (or removes it with --remove).  Usage: ./scripts/make-admin.sh yourname [--remove]
set -euo pipefail
cd "$(dirname "$0")/.."
set -a; . ./.env; set +a
name="${1:?Usage: make-admin.sh <username> [--remove]}"
flag=$([ "${2:-}" = "--remove" ] && echo 0 || echo 1)
n=$(docker compose exec -T postgres psql -U pager -d synapse -tAc "UPDATE users SET admin=$flag WHERE name='@${name#@}:${PAGER_DOMAIN}' RETURNING 1" | grep -c '^1$' || true)
[ "$n" = 1 ] && echo "Done: @${name#@}:${PAGER_DOMAIN} admin=$flag" || { echo "No such user: @${name#@}:${PAGER_DOMAIN}" >&2; exit 1; }
