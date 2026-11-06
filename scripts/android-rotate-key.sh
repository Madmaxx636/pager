#!/usr/bin/env bash
# Moves the phone app from the Android debug key (what every release so far is signed with) to the real release key WITHOUT making anyone reinstall.
# Android 9 and up accept an update signed with a new key if the APK carries a "lineage": proof, signed by the old key, that the new key is its successor.
# Android 8 phones cannot read a lineage but still update in place, because the old key also signs the APK (see --sign).
#   scripts/android-rotate-key.sh --make-lineage          once: makes ~/.config/pager/signing-lineage and signer-history (needs the old and the new keystore)
#   scripts/android-rotate-key.sh --sign IN.apk OUT.apk   signs an APK with the release key and the lineage (release.sh does this when the lineage file exists)
#   scripts/android-rotate-key.sh --check APK             shows which key(s) an APK is signed with
# The apps must already know how to accept a rotation (phone app 0.6.15 or newer) BEFORE the first rotated release goes out, or they refuse it.
set -euo pipefail
KEYS="${PAGER_KEYS_DIR:-$HOME/.config/pager}"
OLD_KS="${PAGER_DEBUG_KEYSTORE:-$HOME/.android/debug.keystore}"; OLD_ALIAS="${PAGER_DEBUG_ALIAS:-androiddebugkey}"; OLD_PASS="${PAGER_DEBUG_PASS:-android}"
LINEAGE="$KEYS/signing-lineage"; HISTORY="$KEYS/signer-history"
APKSIGNER="${APKSIGNER:-$(ls -d "$HOME"/android-sdk/build-tools/*/ | sort -V | tail -1)apksigner}"
aps() { "$APKSIGNER" "$@" 2> >(grep -v "^WARNING: " >&2); }   # (the Java tool prints warnings about its own libraries)
prop() { grep -E "^$1=" "$KEYS/android-signing.properties" | head -1 | cut -d= -f2-; }
new_ks() { NEW_KS="$(prop storeFile)"; NEW_ALIAS="$(prop keyAlias)"; case "$NEW_KS" in /*) ;; *) NEW_KS="$KEYS/$NEW_KS";; esac; [ -f "$NEW_KS" ] || { echo "No release keystore at $NEW_KS" >&2; exit 1; }; }
fp() { aps verify --print-certs "$1" 2>/dev/null | awk '/certificate SHA-256 digest/ {print $NF; exit}'; }

case "${1:-}" in
  --make-lineage)
    new_ks; [ -f "$OLD_KS" ] || { echo "No old (debug) keystore at $OLD_KS" >&2; exit 1; }
    [ -f "$LINEAGE" ] && { echo "$LINEAGE already exists. Delete it first if you really want a new one." >&2; exit 1; }
    PASS_NEW="$(prop storePassword)"; KPASS_NEW="$(prop keyPassword)"
    aps rotate --out "$LINEAGE" \
      --old-signer --ks "$OLD_KS" --ks-key-alias "$OLD_ALIAS" --ks-pass "pass:$OLD_PASS" \
      --new-signer --ks "$NEW_KS" --ks-key-alias "$NEW_ALIAS" --ks-pass "pass:$PASS_NEW" --key-pass "pass:${KPASS_NEW:-$PASS_NEW}"
    # The apps check the old key's fingerprint against this list in the update information (latest.json "signerHistory").
    keytool -list -v -keystore "$OLD_KS" -storepass "$OLD_PASS" -alias "$OLD_ALIAS" 2>/dev/null | awk '/SHA256:/ {gsub(":","",$2); print tolower($2); exit}' > "$HISTORY"
    chmod 600 "$LINEAGE"; echo "Made $LINEAGE and $HISTORY ($(cat "$HISTORY"))."
    echo "From now release.sh signs the phone app with the release key and this lineage. Release 0.6.15+ must already be on the phones."
    ;;
  --sign)
    in="${2:?usage: $0 --sign IN.apk OUT.apk}"; out="${3:?usage: $0 --sign IN.apk OUT.apk}"; new_ks; [ -f "$LINEAGE" ] || { echo "No lineage: run --make-lineage first." >&2; exit 1; }
    PASS_NEW="$(prop storePassword)"; KPASS_NEW="$(prop keyPassword)"
    # The OLD key signs the v2 block (Android 8 only reads that one, and so keeps updating in place); the NEW key signs v3 together with the lineage, which Android 9 and up
    # use. Android 9+ refuse an update signed only with the old key, because the lineage does not give it the right to roll back.
    aps sign --v1-signing-enabled false --v2-signing-enabled true --v3-signing-enabled true --rotation-min-sdk-version 28 \
      --ks "$OLD_KS" --ks-key-alias "$OLD_ALIAS" --ks-pass "pass:$OLD_PASS" \
      --next-signer --ks "$NEW_KS" --ks-key-alias "$NEW_ALIAS" --ks-pass "pass:$PASS_NEW" --key-pass "pass:${KPASS_NEW:-$PASS_NEW}" \
      --lineage "$LINEAGE" --in "$in" --out "$out"
    aps verify "$out" >/dev/null && echo "Signed $out (v3 key: the release key, with the lineage; v2 key: the old key)."
    ;;
  --check) aps verify --print-certs -v "${2:?usage: $0 --check APK}" 2>&1 | grep -E "Verifies|v1|v2|v3|v4|SHA-256 digest|rotat" ;;
  *) echo "Usage: $0 --make-lineage | --sign IN.apk OUT.apk | --check APK" >&2; exit 1;;
esac
