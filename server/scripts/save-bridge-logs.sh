#!/usr/bin/env bash
# Keeps each bridge's log on disk. A container's own log is thrown away whenever the container is replaced (a bridge update, a rebuild), which is
# exactly when you want to look back at what happened before. This copies new lines out every few minutes into data/bridge-logs/<name>.log.
#   save-bridge-logs.sh               copy the new lines now
#   save-bridge-logs.sh --install     do it every 5 minutes (cron)
#   save-bridge-logs.sh --remove      stop doing it
#   save-bridge-logs.sh --show NAME [PATTERN]   print a bridge's saved log (optionally only lines matching PATTERN), e.g. --show gmessages 'ERR|WRN'
# Lines about the web requests the Pager app makes to the bridge ("Access component=provisioning") are left out: they are most of the log and say nothing about the bridge.
# Each file is cut back to its newest 10 MB once it passes 20 MB, so this never fills the disk.
set -uo pipefail
cd "$(dirname "$0")/.."
DIR=data/bridge-logs; mkdir -p "$DIR/.last"
case "${1:-}" in
  --install) command -v crontab >/dev/null || { echo "No crontab here." >&2; exit 1; }
    ( crontab -l 2>/dev/null | grep -v save-bridge-logs.sh; echo "*/5 * * * * $PWD/scripts/save-bridge-logs.sh >/dev/null 2>&1" ) | crontab - && echo "Installed: bridge logs are saved every 5 minutes to $PWD/$DIR"; exit 0;;
  --remove) ( crontab -l 2>/dev/null | grep -v save-bridge-logs.sh ) | crontab - && echo "Removed"; exit 0;;
  --show) f="$DIR/${2:-}.log"; [ -f "$f" ] || { echo "No saved log for '${2:-}'. Have: $(ls $DIR | sed 's/\.log$//' | tr '\n' ' ')" >&2; exit 1; }
    if [ -n "${3:-}" ]; then grep -E "$3" "$f"; else cat "$f"; fi; exit 0;;
esac
exec 9>"$DIR/.lock"; flock -n 9 || exit 0
for c in $(docker ps --format '{{.Names}}' | grep '^pager-' | grep -vE 'postgres|caddy|duckdns|bridgedb'); do
  name="${c#pager-}"; name="${name%-1}"
  last_file="$DIR/.last/$name"; last=$(cat "$last_file" 2>/dev/null || true)
  since_arg=(); [ -n "$last" ] && since_arg=(--since "$last")
  out=$(docker logs --timestamps "${since_arg[@]}" "$c" 2>&1 | sed 's/\x1b\[[0-9;]*m//g' | awk -v last="$last" '$1 > last') || continue
  [ -n "$out" ] || continue
  newest=$(printf '%s\n' "$out" | tail -1 | cut -d' ' -f1)
  printf '%s\n' "$out" | grep -v 'Access component=' >> "$DIR/$name.log"
  [ -n "$newest" ] && echo "$newest" > "$last_file"
  if [ "$(stat -c %s "$DIR/$name.log" 2>/dev/null || echo 0)" -gt 20000000 ]; then tail -c 10000000 "$DIR/$name.log" | tail -n +2 > "$DIR/$name.log.new" && mv "$DIR/$name.log.new" "$DIR/$name.log"; fi
done
