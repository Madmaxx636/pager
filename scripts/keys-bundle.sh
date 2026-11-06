#!/usr/bin/env bash
# Puts every private key the project depends on into ONE file locked with a passphrase you choose, so it can be copied somewhere that is not this computer.
# Losing the update-signing key means no installed app can ever be updated again; losing the Android release key means the same for the phone app.
#   scripts/keys-bundle.sh [--out DIR]       make the bundle (asks for a passphrase twice; DIR defaults to the current folder)
#   scripts/keys-bundle.sh --verify FILE     asks for the passphrase, lists what is inside and checks it still matches the keys on this computer
# What goes in (from ~/.config/pager unless PAGER_KEYS_DIR says otherwise): the backup private key (opens the server's nightly backups), the update-signing
# key, the Android release keystore and its password file, release.env; and ~/.android/debug.keystore (the key today's phone apps are signed with, needed to
# switch phones to the release key). NOT included, because only the server's root can read it: /etc/pager/vault.key (copy it by hand: sudo cat on the server).
# Copy the finished file to at least two places (a USB stick, a password manager's attachment, a cloud drive): it is useless without the passphrase, so that is safe.
set -euo pipefail
SRC="${PAGER_KEYS_DIR:-$HOME/.config/pager}"
DEBUG_KEYSTORE="${PAGER_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"
FILES=(backup-private.pem backup-public.pem update-signing.pem android-release.keystore android-signing.properties release.env)
ITER=600000

ask() { # ask the passphrase (twice when making); PAGER_KEYS_PASSPHRASE is for tests only
  if [ -n "${PAGER_KEYS_PASSPHRASE:-}" ]; then PASS="$PAGER_KEYS_PASSPHRASE"; return; fi
  read -r -s -p "Passphrase: " PASS; echo
  [ "$1" = twice ] && { read -r -s -p "Again: " again; echo; [ "$PASS" = "$again" ] || { echo "The passphrases do not match." >&2; exit 1; }; }
  [ ${#PASS} -ge 12 ] || { echo "Use at least 12 characters (a few words in a row is fine)." >&2; exit 1; }
}
sha() { sha256sum "$1" | cut -d' ' -f1; }

case "${1:-}" in
  --verify)
    f="${2:?usage: $0 --verify FILE}"; [ -f "$f" ] || { echo "No such file: $f" >&2; exit 1; }
    ask once; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    PAGER_PASS="$PASS" openssl enc -d -aes-256-cbc -pbkdf2 -iter $ITER -pass env:PAGER_PASS -in "$f" 2>/dev/null | tar -xz -C "$tmp" 2>/dev/null || { echo "Wrong passphrase, or the file is damaged." >&2; exit 1; }
    echo "Inside:"; (cd "$tmp" && ls -l --time-style=long-iso | tail -n +2 | awk '{print "  " $5 "\t" $8}')
    bad=0
    for n in "${FILES[@]}" debug.keystore; do
      [ -f "$tmp/$n" ] || { echo "  MISSING from the bundle: $n"; bad=1; continue; }
      live="$SRC/$n"; [ "$n" = debug.keystore ] && live="$DEBUG_KEYSTORE"
      if [ -f "$live" ]; then [ "$(sha "$tmp/$n")" = "$(sha "$live")" ] && echo "  same as this computer: $n" || { echo "  DIFFERENT from this computer: $n (make a new bundle)"; bad=1; }
      else echo "  (not on this computer any more: $n)"; fi
    done
    for k in backup-private.pem update-signing.pem; do [ -f "$tmp/$k" ] && ! openssl pkey -in "$tmp/$k" -noout 2>/dev/null && { echo "  NOT A WORKING KEY: $k"; bad=1; }; done
    [ $bad = 0 ] && echo "Bundle is good." || { echo "Check the lines above."; exit 1; }
    ;;
  ""|--out)
    out="${2:-.}"; mkdir -p "$out"
    tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
    for n in "${FILES[@]}"; do if [ -f "$SRC/$n" ]; then cp "$SRC/$n" "$tmp/$n"; else echo "(not found, left out: $SRC/$n)" >&2; fi; done
    [ -f "$DEBUG_KEYSTORE" ] && cp "$DEBUG_KEYSTORE" "$tmp/debug.keystore"
    [ "$(ls "$tmp" | wc -l)" -gt 0 ] || { echo "No keys found in $SRC" >&2; exit 1; }
    cat > "$tmp/README.txt" <<README
Pager keys, bundled $(date -u +%FT%TZ) on $(hostname).
  backup-private.pem / backup-public.pem   open the server's nightly backups:  PAGER_BACKUP_KEY=backup-private.pem ./pager restore FILE
  update-signing.pem                       signs the update information every app checks. Lose it and no installed app can be updated.
  android-release.keystore + android-signing.properties   the phone app's release key and its passwords. Lose it and no phone can be updated.
  debug.keystore                           the key today's phone apps are signed with (needed to switch phones to the release key).
  release.env                              server address and ssh key path used by the release scripts.
Also keep, by hand: /etc/pager/vault.key on the server (root only), which opens the bridges' encrypted vault.
Put the files back in ~/.config/pager (debug.keystore in ~/.android) and check with: scripts/keys-bundle.sh --verify THIS-FILE
README
    ask twice
    file="$out/pager-keys-$(date +%Y%m%d).enc"
    tar -C "$tmp" -cz . | PAGER_PASS="$PASS" openssl enc -aes-256-cbc -pbkdf2 -iter $ITER -salt -pass env:PAGER_PASS -out "$file"
    chmod 600 "$file"
    echo "Saved $file ($(du -h "$file" | cut -f1)). Now copy it to two places that are not this computer, and keep the passphrase somewhere else."
    echo "Check it any time with: $0 --verify $file"
    ;;
  *) echo "Usage: $0 [--out DIR] | --verify FILE" >&2; exit 1;;
esac
