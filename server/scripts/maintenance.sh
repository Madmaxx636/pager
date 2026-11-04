#!/usr/bin/env bash
# Routine upkeep of the server, by itself, every night (around 05:15, after the nightly backup). Each job is separate: one failing never stops the rest.
#   units       a Pager timer or service that is installed but stopped is started again
#   containers  reports a container that is not running (never starts one: you may have stopped it on purpose)
#   backup      makes a backup if the newest is older than 30 hours (needs the backup key, see backup-schedule.sh)
#   bridges     installs newer bridge versions one at a time (a bridge that does not start is put back), but only after a backup less than 36 hours old
#   synapse     installs a newer Synapse PATCH release (same 1.x series) after a backup less than 24 hours old, and goes back if it does not become healthy.
#               A bigger step (a new series) is left for you: read its release notes, then `pager upgrade` / edit docker-compose.yml.
#   cleanup     old container images and build cache, old journal entries, long log files; warns when the disk is nearly full
# The result of the last run is in data/api/maintenance.json (Admin > Logs warns when a job failed or nothing ran for 3 days); the log is data/maintenance.log.
# Install: ./scripts/maintenance.sh --install    Remove: --remove    Run now: --now    Look: --status
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; UNIT_DIR="$HOME/.config/systemd/user"
LOG="$ROOT/data/maintenance.log"; STATUS="$ROOT/data/api/maintenance.json"
SYNAPSE_REPO="docker.io/matrixdotorg/synapse:latest"

case "${1:-}" in
  --install)
    mkdir -p "$UNIT_DIR" data/api
    cat > "$UNIT_DIR/pager-maintenance.service" <<UNITEOF
[Unit]
Description=Pager nightly maintenance

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/scripts/maintenance.sh --now
Nice=10
IOSchedulingClass=idle
TimeoutStartSec=3h
UNITEOF
    cat > "$UNIT_DIR/pager-maintenance.timer" <<UNITEOF
[Unit]
Description=Pager nightly maintenance

[Timer]
OnCalendar=*-*-* 05:15:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNITEOF
    systemctl --user daemon-reload && systemctl --user enable --now pager-maintenance.timer
    loginctl enable-linger "$USER" 2>/dev/null || echo "(Couldn't turn on lingering: maintenance then only runs while you are logged in.)"
    echo "Maintenance is on: every night around 05:15. Log: $LOG"; exit 0;;
  --remove)
    systemctl --user disable --now pager-maintenance.timer 2>/dev/null; rm -f "$UNIT_DIR/pager-maintenance.service" "$UNIT_DIR/pager-maintenance.timer"
    systemctl --user daemon-reload; rm -f "$STATUS"; echo "Nightly maintenance is off."; exit 0;;
  --status|"")
    systemctl --user list-timers pager-maintenance.timer --no-pager 2>/dev/null; tail -n 25 "$LOG" 2>/dev/null || echo "It has not run yet."; exit 0;;
  --now) ;;
  *) echo "Usage: $0 [--install|--remove|--now|--status]" >&2; exit 1;;
esac

mkdir -p data/api
exec 9> data/.maintenance.lock; flock -n 9 || { echo "Maintenance is already running."; exit 0; }
log() { echo "[$(date -Is)] $*" >> "$LOG"; echo "$*"; }

RESULTS=$(mktemp); trap 'rm -f "$RESULTS"' EXIT
run() { # run <name> <function>: the function prints one line (what it did) and returns 0, or 1 when it failed
  local name="$1" note rc
  note="$("$2" 2>&1)"; rc=$?
  note="$(printf '%s' "$note" | tail -n 3 | tr '\n\t' '  ' | cut -c1-300)"
  log "$name: $([ $rc = 0 ] && echo ok || echo FAILED) ${note:+- $note}"
  printf '%s\t%s\t%s\n' "$name" "$rc" "$note" >> "$RESULTS"
}

hours_since_backup() { # hours since the newest backup, or 9999
  local newest; newest=$(ls -1t data/backups/pager-backup-*.tar.enc 2>/dev/null | head -1)
  [ -n "$newest" ] && echo $(( ($(date +%s) - $(stat -c %Y "$newest")) / 3600 )) || echo 9999
}

job_units() {
  local u fixed="" bad=""
  for u in pager-auto-update.timer pager-backup.timer pager-logwatch.service; do
    systemctl --user is-enabled "$u" >/dev/null 2>&1 || continue
    systemctl --user is-active "$u" >/dev/null 2>&1 && continue
    if systemctl --user start "$u" 2>/dev/null; then fixed="$fixed $u"; else bad="$bad $u"; fi
  done
  [ -z "$bad" ] || { echo "could not start:$bad"; return 1; }
  echo "${fixed:+started again:$fixed}${fixed:-all running}"
}

job_containers() {
  local down; down=$(docker compose ps -a --format '{{.Service}} {{.State}}' 2>/dev/null | awk '$2 != "running" {print $1}' | tr '\n' ' ')
  [ -z "$down" ] || { echo "not running: $down"; return 1; }
  echo "all running"
}

job_backup() {
  [ -f data/backup-public.pem ] || { echo "no backup key, skipped"; return 0; }
  local h; h=$(hours_since_backup)
  [ "$h" -lt 30 ] && { echo "newest is $h hours old"; return 0; }
  systemctl --user is-active pager-backup.service >/dev/null 2>&1 && { echo "the nightly backup is still running"; return 0; }
  ./pager backup --auto >/dev/null 2>&1 || { echo "the backup failed"; return 1; }
  echo "made a backup (the newest was $h hours old)"
}

job_bridges() {
  # The list of newer versions is looked up here when it is more than 6 days old (so the weekly cron entry of update-bridges.sh is not needed).
  if [ ! -f data/versions.available ] || [ -n "$(find data/versions.available -mmin +8640 2>/dev/null)" ]; then ./scripts/update-bridges.sh >/dev/null 2>&1; fi
  local waiting; waiting=$(grep -vx synapse data/versions.available 2>/dev/null | tr '\n' ' ')
  [ -n "${waiting// /}" ] || { echo "nothing waiting"; return 0; }
  local h; h=$(hours_since_backup)
  [ "$h" -le 36 ] || { echo "waiting ($waiting) but the newest backup is $h hours old, so not now"; return 0; }
  local out; out=$(./scripts/update-bridges.sh --apply 2>&1); echo "$out" >> "$LOG"
  local line; line=$(printf '%s\n' "$out" | grep '^== done' | tail -1)
  echo "${line:-no result} (waiting: $waiting)"
  printf '%s' "$line" | grep -q ' 0 put back'
}

synapse_version() { docker run --rm --entrypoint python "$1" -c 'import synapse;print(synapse.__version__)' 2>/dev/null; }
set_env() { # set_env KEY VALUE in .env (empty VALUE removes it)
  grep -v "^$1=" .env > .env.new 2>/dev/null; [ -z "${2:-}" ] || echo "$1=$2" >> .env.new; mv .env.new .env
}
job_synapse() {
  local cur new
  cur=$(docker compose config --format json | python3 -c "import json,sys;print(json.load(sys.stdin)['services']['synapse']['image'])")
  case "$cur" in *@sha256:*) ;; *) echo "not pinned to a version, skipped"; return 0;; esac
  new=$(docker buildx imagetools inspect "$SYNAPSE_REPO" --format '{{.Manifest.Digest}}' 2>/dev/null)
  [ -n "$new" ] || { echo "could not look for a newer version"; return 1; }
  [ "${cur#*@}" != "$new" ] || { echo "current"; return 0; }
  docker pull -q "$SYNAPSE_REPO" >/dev/null 2>&1 || { echo "could not download the newer version"; return 1; }
  local have newv ref="${SYNAPSE_REPO}@${new}"
  have=$(docker compose exec -T synapse python -c 'import synapse;print(synapse.__version__)' 2>/dev/null)
  newv=$(synapse_version "$ref")
  [ -n "$have" ] && [ -n "$newv" ] || { echo "could not read the versions"; return 1; }
  if [ "${have%.*}" != "${newv%.*}" ]; then echo "$newv is a bigger step than $have: left for you (read the release notes first)"; return 0; fi
  local h; h=$(hours_since_backup)
  [ "$h" -le 24 ] || { echo "$newv is ready but the newest backup is $h hours old, so not now"; return 0; }
  set_env SYNAPSE_IMAGE "$ref"
  docker compose up -d --no-deps synapse >/dev/null 2>&1
  local i s
  for i in $(seq 1 36); do s=$(docker inspect --format '{{.State.Health.Status}}' "$(docker compose ps -q synapse)" 2>/dev/null); [ "$s" = healthy ] && break; sleep 5; done
  if [ "$s" = healthy ]; then echo "updated $have to $newv"; return 0; fi
  set_env SYNAPSE_IMAGE "${cur}"
  docker compose up -d --no-deps synapse >/dev/null 2>&1
  echo "$newv did not become healthy: went back to $have"; return 1
}

job_cleanup() {
  docker image prune -f >/dev/null 2>&1
  docker builder prune -f --filter until=168h >/dev/null 2>&1
  journalctl --user --vacuum-time=30d >/dev/null 2>&1
  local f; for f in data/*.log; do [ -f "$f" ] && [ "$(wc -l < "$f")" -gt 2000 ] && { tail -n 1000 "$f" > "$f.tmp" && mv "$f.tmp" "$f"; }; done
  local pct; pct=$(df --output=pcent / | tail -1 | tr -dc '0-9')
  [ "$pct" -lt 90 ] || { echo "the disk is $pct% full"; return 1; }
  echo "disk $pct% full"
}

log "== maintenance started"
run units job_units
run containers job_containers
run backup job_backup
run bridges job_bridges
run synapse job_synapse
run cleanup job_cleanup

python3 - "$RESULTS" "$STATUS" <<'PY'
import json, sys, datetime
tasks = []
for line in open(sys.argv[1], encoding="utf-8"):
    name, rc, note = (line.rstrip("\n").split("\t") + ["", "", ""])[:3]
    tasks.append({"name": name, "ok": rc == "0", "note": note})
doc = {"at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "ok": all(t["ok"] for t in tasks), "tasks": tasks}
json.dump(doc, open(sys.argv[2] + ".tmp", "w")); import os; os.replace(sys.argv[2] + ".tmp", sys.argv[2])
PY
log "== maintenance done"
