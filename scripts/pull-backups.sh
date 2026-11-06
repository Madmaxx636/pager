#!/usr/bin/env bash
# Copies the newest server backups to THIS computer, so they exist somewhere other than the server's own disk. They are already locked with the backup
# public key (the server cannot read them, and neither can anyone who gets this copy without backup-private.pem), so storing them here is safe.
# Needs the home network (the server's address is in ~/.config/pager/release.env); when the server cannot be reached it says so and stops without fuss.
#   scripts/pull-backups.sh [--keep N] [--dir DIR]     copy what is new, check each file, keep the newest N (default 2, folder ~/PagerBackups)
#   scripts/pull-backups.sh --install-timer            do it every day (and soon after the computer wakes at home) as a user systemd timer
#   scripts/pull-backups.sh --remove-timer | --status
set -uo pipefail
ENV="${PAGER_RELEASE_ENV:-$HOME/.config/pager/release.env}"
[ -f "$ENV" ] || { echo "No $ENV (it defines SERVER and SSH_KEY)." >&2; exit 1; }
# shellcheck disable=SC1090
source "$ENV"
DIR="${PAGER_BACKUP_PULL_DIR:-$HOME/PagerBackups}"; KEEP=2; REMOTE_DIR="${PAGER_REMOTE_BACKUPS:-pager/server/data/backups}"
UNIT_DIR="$HOME/.config/systemd/user"; SELF="$(readlink -f "$0")"
while [ $# -gt 0 ]; do case "$1" in --keep) KEEP="$2"; shift 2;; --dir) DIR="$2"; shift 2;; *) break;; esac; done
ssh_() { ssh -i "$SSH_KEY" -o BatchMode=yes -o ConnectTimeout=8 "$SERVER" "$@"; }

case "${1:-}" in
  --install-timer)
    mkdir -p "$UNIT_DIR" "$DIR"
    cat > "$UNIT_DIR/pager-pull-backups.service" <<UNIT
[Unit]
Description=Copy the newest Pager server backups to this computer
[Service]
Type=oneshot
ExecStart=$SELF --keep $KEEP --dir $DIR
Nice=15
IOSchedulingClass=idle
TimeoutStartSec=2h
UNIT
    cat > "$UNIT_DIR/pager-pull-backups.timer" <<UNIT
[Unit]
Description=Copy the newest Pager server backups to this computer every day
[Timer]
OnCalendar=*-*-* 12:00:00
Persistent=true
RandomizedDelaySec=10min
[Install]
WantedBy=timers.target
UNIT
    systemctl --user daemon-reload && systemctl --user enable --now pager-pull-backups.timer && echo "On: every day around 12:00 (or when the computer wakes after that). Copies go to $DIR, newest $KEEP kept."; exit 0;;
  --remove-timer) systemctl --user disable --now pager-pull-backups.timer 2>/dev/null; rm -f "$UNIT_DIR"/pager-pull-backups.{service,timer}; systemctl --user daemon-reload; echo "Off (copies already made stay in $DIR)."; exit 0;;
  --status) systemctl --user list-timers pager-pull-backups.timer --no-pager 2>/dev/null; ls -lh --time-style=long-iso "$DIR"/pager-backup-* 2>/dev/null || echo "No copies yet in $DIR."; exit 0;;
esac

mkdir -p "$DIR"
list="$(ssh_ "ls -1t $REMOTE_DIR/pager-backup-*.tar.enc 2>/dev/null | head -n $KEEP" 2>/dev/null)" || { echo "The server cannot be reached from here (not at home?): nothing copied."; exit 0; }
[ -n "$list" ] || { echo "The server has no backups yet."; exit 0; }
got=0
for remote in $list; do
  name="$(basename "$remote")"; dest="$DIR/$name"
  size="$(ssh_ "stat -c %s $remote")" || continue
  if [ -f "$dest" ] && [ "$(stat -c %s "$dest")" = "$size" ]; then continue; fi
  echo "Copying $name ($(numfmt --to=iec "$size"))…"
  if command -v rsync >/dev/null; then rsync -e "ssh -i $SSH_KEY -o BatchMode=yes" --partial --inplace "$SERVER:$remote" "$dest.part" || { echo "Copy failed: $name"; continue; }
  else scp -q -i "$SSH_KEY" -o BatchMode=yes "$SERVER:$remote" "$dest.part" || { echo "Copy failed: $name"; continue; }; fi
  # A good copy has the right size and starts with the backup header (a locked backup, not something else).
  if [ "$(stat -c %s "$dest.part")" = "$size" ] && [ "$(head -c 8 "$dest.part")" = "PAGERBK2" ]; then mv "$dest.part" "$dest"; chmod 600 "$dest"; got=$((got+1)); else rm -f "$dest.part"; echo "The copy of $name did not check out: removed."; fi
done
# keep the newest $KEEP here
ls -1t "$DIR"/pager-backup-*.tar.enc 2>/dev/null | tail -n +$((KEEP + 1)) | xargs -r rm -f --
echo "Done: $got new copy(ies). In $DIR now: $(ls "$DIR"/pager-backup-*.tar.enc 2>/dev/null | wc -l) ($(du -sh "$DIR" | cut -f1))."
