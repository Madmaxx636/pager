#!/usr/bin/env bash
# Moves Docker's own storage (every image, container and volume) from the boot disk to a bigger, faster drive, so the boot disk stops filling up.
# Pager's data (Synapse, Postgres, the bridges' vault) is NOT in here; it lives wherever scripts/move-data.sh put it.
#
#   sudo ./scripts/move-docker.sh                 # to /mnt/nvme-main/docker
#   sudo ./scripts/move-docker.sh /some/other/dir
#
# Needs root. EVERYTHING that runs in Docker on this machine stops while the files are copied (Pager, Jellyfin, Immich, ...), usually 5 to 15
# minutes, then starts again by itself. The old copy is kept as /var/lib/docker.moved-old so you can go back; delete it once you are happy.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run this with sudo."; exit 1; }
TARGET="${1:-/mnt/nvme-main/docker}"
SRC=/var/lib/docker
[ -d "$SRC" ] || { echo "$SRC not found"; exit 1; }
[ "$(readlink -f "$TARGET")" != "$(readlink -f "$SRC")" ] || { echo "That is where Docker already is."; exit 1; }
mkdir -p "$TARGET"
[ "$(stat -c %d "$TARGET")" != "$(stat -c %d "$SRC")" ] || { echo "$TARGET is on the same disk as $SRC. Pick a folder on another drive."; exit 1; }
used=$(du -sk "$SRC" 2>/dev/null | cut -f1); free=$(df -k --output=avail "$TARGET" | tail -1)
[ "$free" -gt $(( used * 12 / 10 )) ] || { echo "Not enough room on $TARGET ($((free/1024/1024)) GB free, need about $((used*12/10/1024/1024)) GB)."; exit 1; }
echo "Docker is $((used/1024/1024)) GB; $TARGET has $((free/1024/1024)) GB free."
read -r -p "This stops all Docker containers on this machine. Type yes to go on: " ok; [ "$ok" = yes ] || { echo "Nothing changed."; exit 1; }

systemctl stop docker.socket docker
rsync -aHAX --numeric-ids --info=progress2 "$SRC"/ "$TARGET"/
# Point Docker at the new place (keeping whatever else is in daemon.json).
mkdir -p /etc/docker
[ -f /etc/docker/daemon.json ] && cp -p /etc/docker/daemon.json /etc/docker/daemon.json.before-move
python3 - "$TARGET" <<'PY'
import json, os, sys
p = "/etc/docker/daemon.json"
d = json.load(open(p)) if os.path.exists(p) and os.path.getsize(p) else {}
d["data-root"] = sys.argv[1]
json.dump(d, open(p, "w"), indent=2)
PY
mv "$SRC" "$SRC.moved-old"
systemctl start docker
sleep 5
echo "Docker now stores its files in: $(docker info --format '{{.DockerRootDir}}')"
echo "Containers running: $(docker ps -q | wc -l)"
echo "If something looks wrong:  sudo systemctl stop docker; sudo rm /etc/docker/daemon.json; [restore daemon.json.before-move if it existed]; sudo mv $SRC.moved-old $SRC; sudo systemctl start docker"
echo "When everything has been fine for a day:  sudo rm -rf $SRC.moved-old"
