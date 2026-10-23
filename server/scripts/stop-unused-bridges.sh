#!/usr/bin/env bash
# Stops the bridges nobody uses, so they stop taking memory and keep no idle connections. A bridge counts as used when someone is logged in to it or it
# has bridged chats. One that has had neither for a whole week (the first week is the time to link your accounts) is stopped. Stopped bridges stay set up:
# start one again in the app (Admin > Bridges > Start) or with `docker compose up -d <name>`, and it is not stopped again while it is in use.
# Usage: server/scripts/stop-unused-bridges.sh [--days N] [--now] [--dry-run]     |     --install-cron | --remove-cron   (weekly, Sundays 05:30)
set -uo pipefail
cd "$(dirname "$0")/.."
DAYS=7; DRY=0
while [ $# -gt 0 ]; do case "$1" in
  --days) DAYS="${2:?days}"; shift 2;;
  --now) DAYS=0; shift;;
  --dry-run) DRY=1; shift;;
  --install-cron) command -v crontab >/dev/null || { echo "No crontab here; run this script weekly some other way." >&2; exit 1; }
    ( crontab -l 2>/dev/null | grep -v stop-unused-bridges.sh; echo "30 5 * * 0 $PWD/scripts/stop-unused-bridges.sh >> $PWD/data/stop-unused-bridges.log 2>&1" ) | crontab - && echo "Installed: unused bridges are stopped every Sunday at 05:30 (log: data/stop-unused-bridges.log)"; exit 0;;
  --remove-cron) ( crontab -l 2>/dev/null | grep -v stop-unused-bridges.sh ) | crontab - && echo "Removed the weekly check"; exit 0;;
  *) echo "Unknown option $1" >&2; exit 1;; esac; done

# Where the bridges keep their own databases: a separate database service when the encrypted vault is set up, else the main one. Synapse always lives in "postgres".
BRIDGEDB=postgres; [ -n "$(docker compose ps -q bridgedb 2>/dev/null)" ] && BRIDGEDB=bridgedb
q() { local svc="$1" db="$2"; shift 2; docker compose exec -T "$svc" psql -U pager -d "$db" -tAc "$@" 2>/dev/null | tr -d '[:space:]'; }
num() { [[ "${1:-}" =~ ^[0-9]+$ ]] && echo "$1" || echo 0; }
echo "== $(date '+%F %T') looking for unused bridges (wait ${DAYS} days)$([ $DRY = 1 ] && echo ', dry run')"
now=$(date +%s)
for svc in whatsapp signal gmessages messenger instagram slack twitter bluesky linkedin gvoice teams discord telegram groupme heisenbridge; do
  docker compose config --services 2>/dev/null | grep -qx "$svc" || continue
  [ -n "$(docker compose ps -q "$svc" 2>/dev/null)" ] || continue          # already stopped or never started
  logins=$(num "$(q "$BRIDGEDB" "$svc" 'select count(*) from user_login')")
  ghosts=$(num "$(q postgres synapse "select count(*) from users where name ~ '^@_?${svc}_'")")
  used=0; [ "$logins" -gt 0 ] || [ "$ghosts" -gt 0 ] && used=1
  # IRC (Heisenbridge) has no logins: it is used once it has any room besides its own control room.
  if [ "$svc" = heisenbridge ]; then rooms=$(num "$(q postgres synapse "select count(distinct room_id) from current_state_events where type='m.room.member' and state_key like '@heisenbridge:%' and membership='join'")"); [ "$rooms" -gt 1 ] && used=1 || used=0; fi
  mark="data/bridges/$svc/.unused-since"
  if [ "$used" = 1 ]; then rm -f "$mark" 2>/dev/null; echo "-- $svc: in use ($logins login(s), $ghosts bridged people)"; continue; fi
  [ -f "$mark" ] || { [ "$DRY" = 1 ] || date +%s > "$mark" 2>/dev/null; }
  since=$(cat "$mark" 2>/dev/null || echo "$now")
  age=$(( (now - since) / 86400 ))
  if [ "$age" -ge "$DAYS" ]; then
    if [ "$DRY" = 1 ]; then echo "-- $svc: unused for $age day(s): would stop it"; else echo "-- $svc: unused for $age day(s): stopping it"; docker compose stop "$svc" >/dev/null 2>&1; fi
  else echo "-- $svc: nobody uses it yet ($age of $DAYS days)"; fi
done
echo "== done"
