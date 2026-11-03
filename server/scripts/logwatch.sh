#!/usr/bin/env bash
# Keeps a live record of what goes wrong on the server: errors, crashes and unhealthy services, each with the lines around it.
# The apps show it in Admin > Logs (only the important things; warnings are counted and hidden unless asked for).
# Install:  ./scripts/logwatch.sh --install        Remove:  ./scripts/logwatch.sh --remove        Look:  ./scripts/logwatch.sh --show
# Your own "this is harmless" patterns go in data/logwatch.ignore (one regular expression per line).
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; UNIT_DIR="$HOME/.config/systemd/user"; UNIT="pager-logwatch.service"
command -v python3 >/dev/null || { echo "Python 3 is needed" >&2; exit 1; }

case "${1:-}" in
  --install)
    mkdir -p "$UNIT_DIR" data/api/logs
    cat > "$UNIT_DIR/$UNIT" <<UNITEOF
[Unit]
Description=Pager log watcher (keeps the important errors, with the lines around them)

[Service]
WorkingDirectory=$ROOT
ExecStart=/usr/bin/env python3 $ROOT/logwatch/logwatch.py
Restart=always
RestartSec=5
Nice=10

[Install]
WantedBy=default.target
UNITEOF
    systemctl --user daemon-reload && systemctl --user enable --now "$UNIT"
    loginctl enable-linger "$USER" 2>/dev/null || echo "(Couldn't turn on lingering: it then only runs while you are logged in.)"
    echo "The log watcher is on. Look at Admin > Logs in the app, or run: ./scripts/logwatch.sh --show"; exit 0;;
  --remove)
    systemctl --user disable --now "$UNIT" 2>/dev/null; rm -f "$UNIT_DIR/$UNIT"; systemctl --user daemon-reload
    echo "The log watcher is off (what it kept stays in data/api/logs)."; exit 0;;
  --show|"")
    f=data/api/logs/incidents.json
    [ -f "$f" ] || { echo "Nothing recorded yet."; exit 0; }
    python3 - "$f" <<'PY'
import json, sys, time
d = json.load(open(sys.argv[1]))
for r in sorted(d["incidents"], key=lambda r: r["last"], reverse=True):
    if r["severity"] == "warning": continue
    print("%s  %-9s %-12s x%-4d %s" % (time.strftime("%m-%d %H:%M", time.localtime(r["last"])), r["severity"], r["service"], r["count"], r["message"][:110]))
PY
    exit 0;;
  *) echo "Usage: $0 [--install|--remove|--show]" >&2; exit 1;;
esac
