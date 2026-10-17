#!/usr/bin/env bash
# Updates every bridge to the newest image, one at a time. A bridge whose new version does not start is put back on the old one.
# Pager's own builds (GroupMe, Microsoft Teams) are not touched here; Synapse, Postgres and Caddy are left alone on purpose.
# Usage: server/scripts/update-bridges.sh [service ...]     (no names = every bridge)   Run weekly by cron, see --install-cron.
set -uo pipefail
cd "$(dirname "$0")/.."
if [ "${1:-}" = "--install-cron" ]; then
  line="0 5 * * 0 $PWD/scripts/update-bridges.sh >> $PWD/data/update-bridges.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v update-bridges.sh; echo "$line" ) | crontab - && echo "Installed: bridges update every Sunday at 05:00 (log: data/update-bridges.log)"; exit 0
fi
if [ "${1:-}" = "--remove-cron" ]; then ( crontab -l 2>/dev/null | grep -v update-bridges.sh ) | crontab - && echo "Removed the weekly bridge update"; exit 0
fi
echo "== $(date '+%F %T') updating bridges"
mapfile -t ALL < <(docker compose config --format json | python3 -c "
import json,sys
for k,v in sorted(json.load(sys.stdin)['services'].items()):
    i=v.get('image','')
    if i.startswith('dock.mau.dev/') or i.startswith('docker.io/hif1/heisenbridge'): print(k)")
SERVICES=("${@:-${ALL[@]}}")
changed=0; failed=0
for svc in "${SERVICES[@]}"; do
  cid=$(docker compose ps -q "$svc" 2>/dev/null | head -1)
  [ -n "$cid" ] || { echo "-- $svc: not running here, skipped"; continue; }
  img=$(docker compose config --format json | python3 -c "import json,sys;print(json.load(sys.stdin)['services']['$svc']['image'])")
  old=$(docker inspect --format '{{.Image}}' "$cid")
  docker compose pull -q "$svc" >/dev/null 2>&1 || { echo "-- $svc: could not download, skipped"; continue; }
  new=$(docker image inspect --format '{{.Id}}' "$img" 2>/dev/null)
  [ "$new" = "$old" ] && { echo "-- $svc: already newest"; continue; }
  echo "-- $svc: updating"; changed=$((changed+1))
  docker tag "$old" "pager-rollback/$svc:prev"
  docker compose up -d --no-deps "$svc" >/dev/null 2>&1
  sleep 40
  ncid=$(docker compose ps -q "$svc" | head -1)
  if [ -n "$ncid" ] && [ "$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' "$ncid")" = "true 0" ]; then
    echo "   $svc is running the new version"; docker rmi "pager-rollback/$svc:prev" >/dev/null 2>&1
  else
    echo "   $svc did NOT start cleanly: putting the old version back"; failed=$((failed+1))
    docker tag "pager-rollback/$svc:prev" "$img"; docker compose up -d --no-deps "$svc" >/dev/null 2>&1; docker rmi "pager-rollback/$svc:prev" >/dev/null 2>&1
  fi
done
docker image prune -f >/dev/null 2>&1
echo "== done: $changed updated, $failed put back"
