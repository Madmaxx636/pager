#!/usr/bin/env bash
# Moves Pager's data (server/data) and the encrypted bridge vault file onto another disk, e.g. a bigger or faster one.
#
#   sudo ./scripts/move-data.sh /mnt/nvme-main/pager
#   sudo ./scripts/move-data.sh --dry-run /mnt/nvme-main/pager     (only checks and shows what it would do)
#
# What happens: the stack is stopped, everything is COPIED to the new place and the copy is checked, then Pager is pointed at the copy and
# started again. The old files are kept (renamed ...-moved-old) until you delete them yourself, so you can go back at any time.
# Other containers on this machine (Jellyfin and so on) keep running. It also tells Docker to wait for that disk at boot: otherwise a missing disk would let Postgres quietly start an empty database.
# Make a backup first:  ./pager backup
set -euo pipefail

DRY=0; SKIP_SERVICES=0
while [[ "${1:-}" == --* ]]; do case "$1" in --dry-run) DRY=1;; --skip-services) SKIP_SERVICES=1;; *) echo "Unknown option $1" >&2; exit 1;; esac; shift; done
TARGET="${1:?Usage: sudo $0 [--dry-run] <folder on the new disk, e.g. /mnt/nvme-main/pager>}"
TARGET="${TARGET%/}"

SERVER_DIR="${PAGER_SERVER_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
IMG="${PAGER_VAULT_IMG:-/var/lib/pager-vault.img}"
HELPER="${PAGER_VAULT_HELPER:-/usr/local/sbin/pager-vault}"
SYSTEMD_DIR="${PAGER_SYSTEMD_DIR:-/etc/systemd/system}"
OWNER="${SUDO_USER:-$(stat -c %U "$SERVER_DIR")}"
say() { printf '%s\n' "$*"; }
die() { printf '\033[31mProblem: %s\033[0m\n' "$*" >&2; exit 1; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }
run() { if [ "$DRY" = 1 ]; then say "  (would run) $*"; else "$@"; fi; }
as_owner() { if [ "$(id -u)" = 0 ] && [ "$OWNER" != root ]; then sudo -u "$OWNER" "$@"; else "$@"; fi; }

[ "$(id -u)" = 0 ] || [ "$DRY" = 1 ] || [ "${PAGER_TEST:-}" = 1 ] || die "Run this with sudo."
for c in rsync cmp findmnt du df; do command -v "$c" >/dev/null || die "$c is needed."; done
[ -d "$SERVER_DIR/data" ] || die "No data folder at $SERVER_DIR/data."
[ ! -L "$SERVER_DIR/data" ] || die "$SERVER_DIR/data is already a link (to $(readlink "$SERVER_DIR/data")). It looks like the move was done already."

# ---- checks ---------------------------------------------------------------------------------------------------------------
step "Checking"
PARENT="$TARGET"; while [ ! -d "$PARENT" ]; do PARENT="$(dirname "$PARENT")"; done
MNT="$(findmnt -T "$PARENT" -no TARGET)"
[ "$MNT" != "/" ] || die "$TARGET is on the main disk. Choose a folder on the other disk (it must be mounted, e.g. /mnt/nvme-main/pager)."
say "  new place:  $TARGET   (on $MNT, $(df -h --output=avail "$PARENT" | tail -1 | tr -d ' ') free)"
[ ! -e "$TARGET/data" ] && [ ! -e "$TARGET/pager-vault.img" ] || die "$TARGET already has data in it. Use an empty folder."
NEED=$(( $(du -sk --apparent-size "$SERVER_DIR/data" 2>/dev/null | cut -f1) + $( [ -f "$IMG" ] && du -sk --apparent-size "$IMG" | cut -f1 || echo 0) ))
HAVE=$(df -k --output=avail "$PARENT" | tail -1)
[ "$HAVE" -gt $(( NEED * 12 / 10 )) ] || die "Not enough room: needs about $((NEED/1048576)) GB, only $((HAVE/1048576)) GB free."
say "  to copy:    about $((NEED/1048576)) GB (data folder$( [ -f "$IMG" ] && echo " and the vault file"))"
VAULT=0; [ -f "$IMG" ] && [ -f "$HELPER" ] && grep -q "$IMG" "$HELPER" && VAULT=1
[ "$VAULT" = 1 ] && say "  vault file: $IMG will move too" || say "  vault file: none in use here (skipping)"

if [ "$DRY" = 1 ]; then
  step "Dry run: nothing changes. These are the steps"
  say "  1. stop Pager (docker compose down) and close the vault"
  say "  2. copy $SERVER_DIR/data -> $TARGET/data$( [ "$VAULT" = 1 ] && echo " and $IMG -> $TARGET/pager-vault.img")"
  say "  3. check the copies are identical"
  say "  4. rename the old ones to *-moved-old, point Pager (and the vault helper) at the new place"
  say "  5. make Docker and the vault wait for $MNT at boot, start everything, check it answers"
  exit 0
fi

say; read -r -p "Pager will be OFFLINE for a few minutes. Type move to continue: " ok; [ "${ok,,}" = "move" ] || { say "Cancelled. Nothing changed."; exit 0; }

# ---- 1. stop ----------------------------------------------------------------------------------------------------------------
step "1/5 Stopping Pager"
if [ "$SKIP_SERVICES" = 0 ]; then
  (cd "$SERVER_DIR" && as_owner docker compose down --remove-orphans >/dev/null 2>&1) || true
  # Close the vault with its helper, not "systemctl stop": that unit is a dependency of Docker, so stopping it would stop every container
  # on this machine (Jellyfin and the rest), not just Pager's.
  [ "$VAULT" = 1 ] && { "$HELPER" stop || true; }
fi

# ---- 2. copy ---------------------------------------------------------------------------------------------------------------
step "2/5 Copying (this is the slow part)"
mkdir -p "$TARGET"; chown "$OWNER:$(id -gn "$OWNER")" "$TARGET"
rsync -aHAX --sparse --info=progress2 "$SERVER_DIR/data/" "$TARGET/data/"
[ "$VAULT" = 1 ] && rsync -a --sparse --info=progress2 "$IMG" "$TARGET/pager-vault.img"

# ---- 3. check --------------------------------------------------------------------------------------------------------------
step "3/5 Checking the copy is identical"
CHANGES="$(rsync -aHAXn --itemize-changes "$SERVER_DIR/data/" "$TARGET/data/" | grep -v '^\.' | head -5 || true)"
[ -z "$CHANGES" ] || { say "$CHANGES"; die "The copy differs from the original. Nothing was switched; Pager is still on the old place. Start it with: cd $SERVER_DIR && docker compose up -d"; }
if [ "$VAULT" = 1 ]; then cmp -s "$IMG" "$TARGET/pager-vault.img" || die "The copied vault file differs from the original. Nothing was switched."; fi
say "  identical"

# ---- 4. switch -------------------------------------------------------------------------------------------------------------
step "4/5 Pointing Pager at the new place"
mv "$SERVER_DIR/data" "$SERVER_DIR/data-moved-old"
ln -s "$TARGET/data" "$SERVER_DIR/data"; chown -h "$OWNER:$(id -gn "$OWNER")" "$SERVER_DIR/data"
if [ "$VAULT" = 1 ]; then
  cp "$HELPER" "$HELPER.before-move"
  sed -i "s#$IMG#$TARGET/pager-vault.img#g" "$HELPER"
  mv "$IMG" "$IMG-moved-old"
fi
if [ "$SKIP_SERVICES" = 0 ]; then
  # If the new disk is missing at boot, Docker must not start (a missing data folder would make Postgres start an empty database).
  mkdir -p "$SYSTEMD_DIR/docker.service.d" "$SYSTEMD_DIR/pager-vault.service.d"
  printf '[Unit]\nRequiresMountsFor=%s\n' "$MNT" > "$SYSTEMD_DIR/docker.service.d/pager-data-disk.conf"
  printf '[Unit]\nRequiresMountsFor=%s\n' "$MNT" > "$SYSTEMD_DIR/pager-vault.service.d/pager-data-disk.conf"
  systemctl daemon-reload
fi

# ---- 5. start --------------------------------------------------------------------------------------------------------------
step "5/5 Starting Pager"
if [ "$SKIP_SERVICES" = 0 ]; then
  [ "$VAULT" = 1 ] && "$HELPER" start
  (cd "$SERVER_DIR" && as_owner docker compose up -d >/dev/null 2>&1) || true
  ready=0; for _ in $(seq 1 90); do
    (cd "$SERVER_DIR" && as_owner docker compose exec -T api node -e 'fetch("http://synapse:8008/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1) && { ready=1; break; }
    sleep 2
  done
  [ "$ready" = 1 ] || die "Pager did not come back. To go back to the old place: see 'Going back' below. Details: cd $SERVER_DIR && ./pager doctor"
fi

cat <<DONE

Done. Pager now runs from $TARGET.
  Check it:       cd $SERVER_DIR && ./pager status
  Then test a reboot (sudo reboot): the vault and Pager should come back by themselves. Give it two minutes, then run ./pager doctor.
  When you are happy (a few days), free the old space:
      sudo rm -rf $SERVER_DIR/data-moved-old$( [ "$VAULT" = 1 ] && echo " $IMG-moved-old")

Going back (if anything looks wrong), as root:
      cd $SERVER_DIR && docker compose down; $HELPER stop
      rm $SERVER_DIR/data && mv $SERVER_DIR/data-moved-old $SERVER_DIR/data$( [ "$VAULT" = 1 ] && printf '\n      mv %s %s && cp %s.before-move %s' "$IMG-moved-old" "$IMG" "$HELPER" "$HELPER")
      rm -f $SYSTEMD_DIR/docker.service.d/pager-data-disk.conf $SYSTEMD_DIR/pager-vault.service.d/pager-data-disk.conf; systemctl daemon-reload
      $HELPER start; docker compose up -d
DONE
