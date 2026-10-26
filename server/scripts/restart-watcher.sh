#!/usr/bin/env bash
# Lets an admin restart the whole Pager server (Synapse, every bridge, the database, the web server and the API) from the apps' Admin page.
# It does not reboot the computer. The API container is never given control of your containers: it only leaves a note in data/api, and this small
# watcher (a user service on the server) sees the note and runs `docker compose restart`.
# Install:  ./scripts/restart-watcher.sh --install        Remove:  ./scripts/restart-watcher.sh --remove
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$PWD"; DIR="$ROOT/data/api"; UNIT="$HOME/.config/systemd/user/pager-restart-watcher.service"

case "${1:-}" in
  --install)
    mkdir -p "$(dirname "$UNIT")" "$DIR"
    cat > "$UNIT" <<UNITEOF
[Unit]
Description=Restarts the Pager server when an admin asks for it in the app

[Service]
ExecStart=$ROOT/scripts/restart-watcher.sh
Restart=always
RestartSec=3

[Install]
WantedBy=default.target
UNITEOF
    systemctl --user daemon-reload && systemctl --user enable --now pager-restart-watcher.service
    loginctl enable-linger "$USER" 2>/dev/null || echo "(Couldn't turn on lingering: the watcher then only runs while you are logged in.)"
    echo "Server restart is on. Reload the Admin page."; exit 0;;
  --remove)
    systemctl --user disable --now pager-restart-watcher.service 2>/dev/null; rm -f "$UNIT" "$DIR/restart-watcher" "$DIR/restart-request"
    systemctl --user daemon-reload; echo "Server restart is off."; exit 0;;
esac

rm -f "$DIR/restart-request"          # a note left from before this started is stale
while true; do
  touch "$DIR/restart-watcher"
  if [ -f "$DIR/restart-request" ]; then
    by="$(cat "$DIR/restart-request")"; rm -f "$DIR/restart-request"
    echo "[$(date -Is)] restart asked: $by"
    docker compose restart >/dev/null 2>&1; rc=$?
    printf '{"at":"%s","ok":%s}' "$(date -u +%FT%TZ)" "$([ $rc -eq 0 ] && echo true || echo false)" > "$DIR/restart-last"
    echo "[$(date -Is)] restart finished ($rc)"
  fi
  sleep 3
done
