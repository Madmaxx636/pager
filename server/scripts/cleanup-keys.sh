#!/usr/bin/env bash
# Tidies one person's encryption state on the server: removes sign-ins nobody has used for 6 hours and ALL of their recovery-key
# backups. Afterwards: make ONE new recovery key on the desktop app (it has every key), then enter it on each phone.
# A copy of everything removed is saved first (~/cleanup-backup-*.sql). Usage: ./scripts/cleanup-keys.sh [@user:server]
set -euo pipefail
cd "$(dirname "$0")/.."
psql_() { docker compose exec -T postgres psql -U pager -d synapse -v ON_ERROR_STOP=1 -At "$@"; }
USER_ID="${1:-$(psql_ -c "select name from users where admin=1 order by creation_ts limit 1;")}"
[ -n "$USER_ID" ] || { echo "No user found. Pass one: $0 @name:server"; exit 1; }
CUT=$(( ($(date +%s) - 6*3600) * 1000 ))

echo "Account: $USER_ID"; echo
echo "Sign-ins that STAY (used in the last 6 hours):"
psql_ -c "select '  '||device_id||'  '||coalesce(display_name,'')||'  '||coalesce(to_timestamp(last_seen/1000)::text,'never') from devices where user_id='$USER_ID' and coalesce(last_seen,0) >= $CUT order by last_seen desc;"
echo "Sign-ins that will be REMOVED:"
psql_ -c "select '  '||device_id||'  '||coalesce(display_name,'')||'  '||coalesce(to_timestamp(last_seen/1000)::text,'never') from devices where user_id='$USER_ID' and coalesce(last_seen,0) < $CUT order by last_seen desc nulls last;"
echo "Recovery-key backups that will be REMOVED:"
psql_ -c "select '  version '||version from e2e_room_keys_versions where user_id='$USER_ID' order by version::int;"
echo
read -r -p "Type yes to continue: " ok; [ "${ok,,}" = "yes" ] || { echo "Cancelled. Nothing changed."; exit 0; }

OUT="$HOME/cleanup-backup-$(date +%s).sql"
docker compose exec -T postgres pg_dump -U pager -d synapse --data-only -t e2e_room_keys -t e2e_room_keys_versions -t devices -t e2e_device_keys_json -t e2e_one_time_keys_json -t e2e_fallback_keys_json > "$OUT"
chmod 600 "$OUT"; echo "Saved a copy to $OUT"

psql_ <<SQL
begin;
create temp table stale as select device_id d from devices where user_id='$USER_ID' and coalesce(last_seen,0) < $CUT;
delete from access_tokens where user_id='$USER_ID' and device_id in (select d from stale);
delete from e2e_device_keys_json where user_id='$USER_ID' and device_id in (select d from stale);
delete from e2e_one_time_keys_json where user_id='$USER_ID' and device_id in (select d from stale);
delete from e2e_fallback_keys_json where user_id='$USER_ID' and device_id in (select d from stale);
delete from device_inbox where user_id='$USER_ID' and device_id in (select d from stale);
delete from devices where user_id='$USER_ID' and device_id in (select d from stale);
delete from e2e_room_keys where user_id='$USER_ID';
delete from e2e_room_keys_versions where user_id='$USER_ID';
commit;
SQL
docker compose restart synapse >/dev/null
echo; echo "Done. Next: on the DESKTOP app open Settings > Privacy > Encryption > Recovery key and make a new one,"
echo "save it, then on each phone choose Recovery key and enter it."
