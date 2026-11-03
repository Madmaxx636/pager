#!/usr/bin/env bash
# Makes a backup of the whole server every night and keeps the newest few (data/backups). Each one is locked with a PUBLIC key, so the
# server can make backups but cannot read them back: keep the matching private key somewhere safe that is not this server.
# Setup:   openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out backup-private.pem      (on your own computer)
#          openssl pkey -in backup-private.pem -pubout -out backup-public.pem                      (copy this one to data/backup-public.pem here)
# Install: ./scripts/backup-schedule.sh --install       Remove: --remove       Run one now: --now       Look: --status
# Check one: pager verify <file> backup-private.pem      Put one back: PAGER_BACKUP_KEY=backup-private.pem pager restore <file>
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; UNIT_DIR="$HOME/.config/systemd/user"

case "${1:-}" in
  --install)
    [ -f data/backup-public.pem ] || { echo "Put the public key at $ROOT/data/backup-public.pem first (see the top of this file)." >&2; exit 1; }
    mkdir -p "$UNIT_DIR" data/backups
    cat > "$UNIT_DIR/pager-backup.service" <<UNITEOF
[Unit]
Description=Pager nightly backup

[Service]
Type=oneshot
WorkingDirectory=$ROOT
ExecStart=$ROOT/pager backup --auto
Nice=15
IOSchedulingClass=idle
TimeoutStartSec=3h
UNITEOF
    cat > "$UNIT_DIR/pager-backup.timer" <<UNITEOF
[Unit]
Description=Pager nightly backup

[Timer]
OnCalendar=*-*-* 04:30:00
RandomizedDelaySec=10min
Persistent=true

[Install]
WantedBy=timers.target
UNITEOF
    systemctl --user daemon-reload && systemctl --user enable --now pager-backup.timer
    loginctl enable-linger "$USER" 2>/dev/null || echo "(Couldn't turn on lingering: backups then only run while you are logged in.)"
    echo "Backups are on: every night around 04:30, newest ${BACKUP_KEEP:-2} kept in $ROOT/data/backups."; exit 0;;
  --remove)
    systemctl --user disable --now pager-backup.timer 2>/dev/null; rm -f "$UNIT_DIR/pager-backup.service" "$UNIT_DIR/pager-backup.timer"
    systemctl --user daemon-reload; echo "Scheduled backups are off (the backups already made stay in data/backups)."; exit 0;;
  --now) exec "$ROOT/pager" backup --auto;;
  --status|"")
    systemctl --user list-timers pager-backup.timer --no-pager 2>/dev/null; ls -lh data/backups/pager-backup-* 2>/dev/null || echo "No backups yet."; exit 0;;
  *) echo "Usage: $0 [--install|--remove|--now|--status]" >&2; exit 1;;
esac
