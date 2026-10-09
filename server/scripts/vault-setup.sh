#!/usr/bin/env bash
# Makes the encrypted vault that holds the bridges' data (their configs, logins and databases). Run once, as root, on the server:
#
#   sudo ./scripts/vault-setup.sh [--size 10G] [--owner USER]
#
# What you get: a disk image (/var/lib/pager-vault.img) encrypted with LUKS. Its key lives in /etc/pager/vault.key (root only), and a
# systemd service opens and mounts the vault at boot BEFORE Docker starts, so after a reboot or power cut everything comes back by
# itself, with nobody typing a passphrase. If the vault ever fails to open, Docker does not start, so nothing runs against an empty folder.
#
# Honest limits: the key is on the same machine. This protects a copy of the image, a stolen or reused data disk, and backups of the
# data folder. It does not protect against someone who has the whole running machine, or root on it.
set -euo pipefail
[ "$(id -u)" = 0 ] || { echo "Run this with sudo." >&2; exit 1; }

SIZE=10G; OWNER="${SUDO_USER:-}"
while [ $# -gt 0 ]; do case "$1" in --size) SIZE="$2"; shift 2;; --owner) OWNER="$2"; shift 2;; *) echo "Unknown option $1" >&2; exit 1;; esac; done
[ -n "$OWNER" ] || { echo "Say who runs Pager with --owner USER" >&2; exit 1; }
OWNER_UID="$(id -u "$OWNER")"; OWNER_GID="$(id -g "$OWNER")"

IMG=/var/lib/pager-vault.img; KEY=/etc/pager/vault.key; MAP=pager-vault; MNT=/srv/pager-vault; HELPER=/usr/local/sbin/pager-vault
command -v cryptsetup >/dev/null || { echo "Installing cryptsetup…"; apt-get update -qq && apt-get install -y -qq cryptsetup; }

if [ -f "$IMG" ] && cryptsetup isLuks "$IMG" 2>/dev/null; then
  echo "A vault already exists at $IMG. Re-installing the boot service only."
else
  [ ! -e "$IMG" ] || { echo "$IMG exists but is not a vault. Not touching it." >&2; exit 1; }
  echo "Creating a $SIZE encrypted vault (it only uses disk space as it fills up)…"
  install -d -m 0700 /etc/pager
  [ -f "$KEY" ] || { head -c 512 /dev/urandom > "$KEY"; chmod 0400 "$KEY"; }
  truncate -s "$SIZE" "$IMG"; chmod 0600 "$IMG"
  cryptsetup luksFormat --batch-mode --type luks2 --key-file "$KEY" "$IMG"
  cryptsetup open --key-file "$KEY" "$IMG" "$MAP"
  mkfs.ext4 -q -L pager-vault "/dev/mapper/$MAP"
  install -d -m 0755 "$MNT"; mount "/dev/mapper/$MAP" "$MNT"
  install -d -m 0700 -o "$OWNER_UID" -g "$OWNER_GID" "$MNT/bridges"
  install -d -m 0700 -o 70 -g 70 "$MNT/bridgedb"   # 70 is the postgres user inside the postgres:alpine image
  umount "$MNT"; cryptsetup close "$MAP"
fi

cat > "$HELPER" <<H
#!/bin/sh
# Opens or closes the Pager vault. Called by pager-vault.service.
case "\$1" in
  start)
    [ -e /dev/mapper/$MAP ] || cryptsetup open --key-file $KEY $IMG $MAP
    mountpoint -q $MNT || mount /dev/mapper/$MAP $MNT ;;
  stop)
    mountpoint -q $MNT && umount $MNT
    [ -e /dev/mapper/$MAP ] && cryptsetup close $MAP; true ;;
esac
H
chmod 0755 "$HELPER"

cat > /etc/systemd/system/pager-vault.service <<U
[Unit]
Description=Pager encrypted vault (bridge data)
DefaultDependencies=no
After=local-fs.target
Before=docker.service podman.service

[Service]
Type=oneshot
RemainAfterExit=yes
ExecStart=$HELPER start
ExecStop=$HELPER stop

[Install]
WantedBy=multi-user.target
RequiredBy=docker.service
U
systemctl daemon-reload
systemctl enable pager-vault.service >/dev/null
systemctl start pager-vault.service
mountpoint -q "$MNT" && echo "Vault is open at $MNT and will open itself at every boot."
echo "Back up $KEY somewhere safe (a password manager is fine): without it, a copy of the vault cannot be opened."
echo "Next, as $OWNER, in the server folder: ./scripts/vault-migrate.sh"
