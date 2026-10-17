#!/usr/bin/env bash
# Builds the Android and desktop apps at a new version, signs the update information and publishes everything to your server.
# After this, installed apps offer the update by themselves (Android on opening, desktop within the hour).
# Usage: scripts/release.sh [--build-only | --publish-only] [--keep-android] 0.5.5 "What changed, in a sentence"
# Needs: JDK 21 (JAVA_HOME), Node, openssl, and ssh access to the server (SERVER, SSH_KEY below). The release key lives in
# ~/.config/pager/update-signing.pem: back it up. Without it, installed desktop apps will refuse your updates.
set -euo pipefail
cd "$(dirname "$0")/.."
PUBLISH_ONLY=0; BUILD_ONLY=0; KEEP_ANDROID=0; KEEP_WINDOWS=0
# --build-only: build and sign everything but do not upload.  --publish-only: re-send what a previous run built.
# --keep-windows: don't build the Windows installer (it needs Wine) and leave the Windows entry in the update list as it is on the server.
# --keep-android: leave the Android entry in the update list as it is on the server (while phones still carry an older signing key).
while [[ "${1:-}" == --* ]]; do case "$1" in --publish-only) PUBLISH_ONLY=1;; --build-only) BUILD_ONLY=1;; --keep-android) KEEP_ANDROID=1;; --keep-windows) KEEP_WINDOWS=1;; *) echo "Unknown option $1" >&2; exit 1;; esac; shift; done
V="${1:?Usage: $0 [--publish-only] <version like 0.4.1> \"notes\"}"; NOTES="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 0.4.1" >&2; exit 1; }
SERVER="${SERVER:-lane@192.168.1.126}"; SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_pager_server}"; REMOTE_DIR="${REMOTE_DIR:-pager/server/updates}"
KEY="$HOME/.config/pager/update-signing.pem"
[ -f "$KEY" ] || { echo "No release key at $KEY" >&2; exit 1; }
cmp -s <(openssl pkey -in "$KEY" -pubout) desktop/update-pubkey.pem || { echo "The release key doesn't match desktop/update-pubkey.pem, installed apps would reject this release" >&2; exit 1; }
ssh_() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" "$@"; }

if [ "$PUBLISH_ONLY" = 0 ]; then
echo "$V" > VERSION
(cd desktop && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$V")
OUT=release-out; rm -rf "$OUT"; mkdir -p "$OUT"

echo "== Android"
# Signed with the release key (~/.config/pager/android-signing.properties). DEBUG_SIGN=1 makes a trial build with the development key instead.
[ -n "${DEBUG_SIGN:-}" ] || [ -f "${PAGER_ANDROID_SIGNING:-$HOME/.config/pager/android-signing.properties}" ] || { echo "No Android release key. Make one first (see SECURITY.md) or use DEBUG_SIGN=1 for a trial build." >&2; exit 1; }
(cd android && ./gradlew :app:testDebugUnitTest :app:assembleRelease ${DEBUG_SIGN:+-PdebugSign} -q)
cp android/app/build/outputs/apk/release/*.apk "$OUT/pager-android-$V.apk"
echo "== Desktop"; (cd desktop && npm test --silent && npm run dist >/dev/null)
cp "desktop/release/pager-desktop_${V}_amd64.deb" "$OUT/"
if [ "$KEEP_WINDOWS" = 1 ]; then echo "== Windows (kept as it is on the server)"; else echo "== Windows"; (cd desktop && npx electron-builder --win --x64 >/dev/null); cp "desktop/release/pager-desktop-setup-${V}.exe" "$OUT/"; fi

CODE=$(awk -F. '{print $1*10000+$2*100+$3}' <<<"$V")
# The key the Android app is signed with: phones refuse an update signed by any other key, so the apps compare this before downloading.
SIGNER=$("$(ls -d $HOME/android-sdk/build-tools/*/ | sort -V | tail -1)apksigner" verify --print-certs "$OUT/pager-android-$V.apk" 2>/dev/null | awk '/certificate SHA-256 digest/ {print $NF; exit}')
PREV=""; { [ "$KEEP_ANDROID" = 1 ] || [ "$KEEP_WINDOWS" = 1 ]; } && PREV="$(ssh_ "cat ~/$REMOTE_DIR/latest.json")"
PREV="$PREV" KEEPA="$KEEP_ANDROID" KEEPW="$KEEP_WINDOWS" SIGNER="$SIGNER" node -e '
const fs=require("fs"),c=require("crypto");const [v,code,notes]=process.argv.slice(1);
const sha=f=>c.createHash("sha256").update(fs.readFileSync("release-out/"+f)).digest("hex");
const a=`pager-android-${v}.apk`,d=`pager-desktop_${v}_amd64.deb`,w=`pager-desktop-setup-${v}.exe`;
const prev=process.env.PREV?JSON.parse(process.env.PREV):null;const keep=prev&&process.env.KEEPA==="1"?prev.android:null,keepW=prev&&process.env.KEEPW==="1"?prev.windows:null;
fs.writeFileSync("release-out/latest.json",JSON.stringify({released:new Date().toISOString(),android:keep??{version:v,code:+code,file:a,sha256:sha(a),notes,signer:process.env.SIGNER},desktop:{version:v,file:d,sha256:sha(d),notes},windows:keepW??{version:v,file:w,sha256:sha(w),notes}},null,2));
' "$V" "$CODE" "$NOTES"
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$OUT/latest.json" -out "$OUT/latest.json.sig"
fi

[ "$BUILD_ONLY" = 1 ] && { echo "Built and signed in $OUT/. Upload later with: scripts/release.sh --publish-only $V \"$NOTES\""; exit 0; }
echo "== Publishing to $SERVER"
ssh_ "mkdir -p ~/$REMOTE_DIR"
# Files first, the signed information last: an app never sees a version whose files are not there yet.
FILES=("$OUT/pager-desktop_${V}_amd64.deb"); [ "$KEEP_WINDOWS" = 1 ] || FILES+=("$OUT/pager-desktop-setup-${V}.exe"); [ "$KEEP_ANDROID" = 1 ] || FILES+=("$OUT/pager-android-$V.apk")
scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "${FILES[@]}" "$SERVER:$REMOTE_DIR/"
scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "$OUT/latest.json" "$OUT/latest.json.sig" "$SERVER:$REMOTE_DIR/"
ssh_ "cd ~/$REMOTE_DIR && ls -t pager-android-*.apk | tail -n +4 | xargs -r rm -f; ls -t pager-desktop_*.deb | tail -n +4 | xargs -r rm -f; ls -t pager-desktop-setup-*.exe | tail -n +4 | xargs -r rm -f"
echo "Published $V. Remember to commit VERSION and desktop/package.json."
