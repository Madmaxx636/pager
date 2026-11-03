#!/usr/bin/env bash
# Keeps every bridge on an exact version (a digest), so nothing changes under you. Newer versions are looked for, reported, and installed only when you say so.
#   update-bridges.sh              look for newer versions and report them (Admin > Logs shows "newer versions are ready"); changes nothing. Run weekly by cron.
#   update-bridges.sh --apply [service ...]    install the newer versions one at a time (no names = all that have one); a bridge that does not start is put back.
#                                              Same as `pager upgrade`.
#   update-bridges.sh --pin        remember the versions that are running now (done once; also fixes a bridge that has no version recorded yet).
#   update-bridges.sh --list       what is running, and which have a newer version.
# The recorded versions are in data/versions.lock (one line per image: the name with its tag, then the name with its digest). setup.sh reads it, so
# `pager update` keeps them. Pager's own builds (GroupMe, Microsoft Teams) are not touched; Synapse is only checked (it is pinned in docker-compose.yml).
# Cron: server/scripts/update-bridges.sh --install-cron / --remove-cron.
set -uo pipefail
cd "$(dirname "$0")/.."
LOCK=data/versions.lock; AVAIL=data/versions.available; COMPOSE=data/bridges.compose.yml
if [ "${1:-}" = "--install-cron" ]; then
  line="0 5 * * 0 $PWD/scripts/update-bridges.sh >> $PWD/data/update-bridges.log 2>&1"
  ( crontab -l 2>/dev/null | grep -v update-bridges.sh; echo "$line" ) | crontab - && echo "Installed: every Sunday at 05:00 the server looks for newer bridge versions and reports them (log: data/update-bridges.log)"; exit 0
fi
if [ "${1:-}" = "--remove-cron" ]; then ( crontab -l 2>/dev/null | grep -v update-bridges.sh ) | crontab - && echo "Removed the weekly look for newer versions"; exit 0
fi
MODE=check; case "${1:-}" in --apply|--pin|--list) MODE="${1#--}"; shift;; esac

strip() { echo "${1%%@*}"; }                                         # name:tag without the digest
lock_get() { awk -v r="$1" '$1==r {print $2}' "$LOCK" 2>/dev/null | head -1; }
lock_set() { { grep -v "^$1 " "$LOCK" 2>/dev/null; echo "$1 $2"; } > "$LOCK.new" && mv "$LOCK.new" "$LOCK"; }
services() { # bridges that use a registry image, as "service image"
  docker compose config --format json | python3 -c "
import json,sys
for k,v in sorted(json.load(sys.stdin)['services'].items()):
    i=v.get('image','')
    if i.startswith('dock.mau.dev/') or i.startswith('docker.io/hif1/heisenbridge'): print(k, i)"
}
remote_digest() { docker buildx imagetools inspect "$1" --format '{{.Manifest.Digest}}' 2>/dev/null; }
local_digest() { # the registry digest of the image a container is running
  local iid; iid=$(docker inspect --format '{{.Image}}' "$1" 2>/dev/null) || return 1
  docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$iid" | head -1 | sed 's/.*@//'
}
swap_image() { sed -i "s|^    image: $1\$|    image: $2|" "$COMPOSE"; }       # the compose line of one bridge

want=("$@")
pick() { [ "${#want[@]}" -eq 0 ] && return 0; local w; for w in "${want[@]}"; do [ "$w" = "$1" ] && return 0; done; return 1; }

case "$MODE" in
pin)
  while read -r svc img; do
    cid=$(docker compose ps -q "$svc" 2>/dev/null | head -1); [ -n "$cid" ] || continue
    d=$(local_digest "$cid"); [ -n "$d" ] || { echo "-- $svc: no registry version known, left as it is"; continue; }
    ref=$(strip "$img"); pin="$ref@$d"
    [ "$img" = "$pin" ] && continue
    lock_set "$ref" "$pin"; swap_image "$img" "$pin"; echo "-- $svc: pinned to ${d:0:19}"
  done < <(services)
  echo "Pinned. The bridges keep running; they pick the pinned name up the next time they restart.";;

check|list)
  : > "$AVAIL.new"; rows=()
  while read -r svc img; do
    ref=$(strip "$img"); have=${img#*@}; [ "$have" = "$img" ] && have=""
    new=$(remote_digest "$ref")
    if [ -z "$new" ]; then rows+=("$svc: could not look"); continue; fi
    if [ -n "$have" ] && [ "$new" != "$have" ]; then echo "$svc" >> "$AVAIL.new"; rows+=("$svc: newer version ready")
    elif [ -z "$have" ]; then rows+=("$svc: not pinned (run --pin)")
    else rows+=("$svc: current"); fi
  done < <(services)
  # Synapse is pinned in docker-compose.yml: changing it is done on purpose (read its release notes first).
  simg=$(docker compose config --format json | python3 -c "import json,sys;print(json.load(sys.stdin)['services']['synapse']['image'])")
  snew=$(remote_digest "$(strip "$simg")")
  if [ -n "$snew" ] && [ "${simg#*@}" != "$snew" ] && [ "$simg" != "$(strip "$simg")" ]; then echo synapse >> "$AVAIL.new"; rows+=("synapse: newer version ready (upgrade it by hand)"); fi
  mv "$AVAIL.new" "$AVAIL"
  if [ "$MODE" = list ]; then printf '%s\n' "${rows[@]}"; else echo "== $(date '+%F %T') looked for newer versions: $(wc -l < "$AVAIL") ready ($(tr '\n' ' ' < "$AVAIL"))"; fi;;

apply)
  echo "== $(date '+%F %T') installing newer bridge versions"
  changed=0; failed=0; UPDATED=(); PUTBACK=()
  while read -r svc img; do
    pick "$svc" || continue
    cid=$(docker compose ps -q "$svc" 2>/dev/null | head -1)
    [ -n "$cid" ] || { echo "-- $svc: not running here, skipped"; continue; }
    ref=$(strip "$img")
    docker pull -q "$ref" >/dev/null 2>&1 || { echo "-- $svc: could not download, skipped"; continue; }
    r=${ref#docker.io/}
    d=$(docker image inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' "$ref" | grep "^${r%%:*}@" | head -1 | sed 's/.*@//')
    [ -n "$d" ] || { echo "-- $svc: no version found, skipped"; continue; }
    pin="$ref@$d"
    [ "$img" = "$pin" ] && { echo "-- $svc: already newest"; continue; }
    echo "-- $svc: updating"; changed=$((changed+1))
    docker tag "$(docker inspect --format '{{.Image}}' "$cid")" "pager-rollback/$svc:prev"
    swap_image "$img" "$pin"
    docker compose up -d --no-deps "$svc" >/dev/null 2>&1
    sleep 40
    ncid=$(docker compose ps -q "$svc" | head -1)
    if [ -n "$ncid" ] && [ "$(docker inspect --format '{{.State.Running}} {{.RestartCount}}' "$ncid")" = "true 0" ]; then
      echo "   $svc is running the new version"; UPDATED+=("$svc"); lock_set "$ref" "$pin"; docker rmi "pager-rollback/$svc:prev" >/dev/null 2>&1
    else
      echo "   $svc did NOT start cleanly: putting the old version back"; failed=$((failed+1)); PUTBACK+=("$svc")
      swap_image "$pin" "$img"; docker compose up -d --no-deps "$svc" >/dev/null 2>&1; docker rmi "pager-rollback/$svc:prev" >/dev/null 2>&1
    fi
  done < <(services)
  docker image prune -f >/dev/null 2>&1
  # What happened, for the apps: admins get a notification the next time they check (the Pager API reads this file).
  if [ "${#UPDATED[@]}" -gt 0 ] || [ "${#PUTBACK[@]}" -gt 0 ]; then
    UPD="${UPDATED[*]:-}" PUT="${PUTBACK[*]:-}" python3 - <<'PY'
import json, os, datetime
p = "data/api/bridge-updates.json"
try: rows = json.load(open(p))
except Exception: rows = []
rows.append({"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "updated": os.environ["UPD"].split(), "putBack": os.environ["PUT"].split()})
json.dump(rows[-20:], open(p, "w"))
PY
  fi
  "$0" >/dev/null 2>&1      # refresh the list of what is still waiting
  echo "== done: $changed updated, $failed put back";;
esac
