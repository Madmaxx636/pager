#!/usr/bin/env bash
# Builds the Android and desktop apps at a new version, signs the update information and publishes everything to your server.
# After this, installed apps offer the update by themselves (Android on opening, desktop within the hour).
# Usage: scripts/release.sh 0.4.1 "What changed, in a sentence"
# Needs: JDK 21 (JAVA_HOME), Node, openssl, and ssh access to the server (SERVER, SSH_KEY below). The release key lives in
# ~/.config/pager/update-signing.pem: back it up. Without it, installed desktop apps will refuse your updates.
set -euo pipefail
cd "$(dirname "$0")/.."
V="${1:?Usage: $0 <version like 0.4.1> \"notes\"}"; NOTES="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 0.4.1" >&2; exit 1; }
SERVER="${SERVER:-lane@192.168.1.126}"; SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519_pager_server}"; REMOTE_DIR="${REMOTE_DIR:-pager/server/updates}"
KEY="$HOME/.config/pager/update-signing.pem"
[ -f "$KEY" ] || { echo "No release key at $KEY" >&2; exit 1; }
cmp -s <(openssl pkey -in "$KEY" -pubout) desktop/update-pubkey.pem || { echo "The release key doesn't match desktop/update-pubkey.pem, installed apps would reject this release" >&2; exit 1; }
ssh_() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" "$@"; }

echo "$V" > VERSION
(cd desktop && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$V")
OUT=release-out; rm -rf "$OUT"; mkdir -p "$OUT"

echo "== Android"; (cd android && ./gradlew :app:testDebugUnitTest :app:assembleRelease -PdebugSign -q)
cp android/app/build/outputs/apk/release/*.apk "$OUT/pager-android-$V.apk"
echo "== Desktop"; (cd desktop && npm test --silent && npm run dist >/dev/null)
cp "desktop/release/pager-desktop_${V}_amd64.deb" "$OUT/"

CODE=$(awk -F. '{print $1*10000+$2*100+$3}' <<<"$V")
node -e '
const fs=require("fs"),c=require("crypto");const [v,code,notes]=process.argv.slice(1);
const sha=f=>c.createHash("sha256").update(fs.readFileSync("release-out/"+f)).digest("hex");
const a=`pager-android-${v}.apk`,d=`pager-desktop_${v}_amd64.deb`;
fs.writeFileSync("release-out/latest.json",JSON.stringify({released:new Date().toISOString(),android:{version:v,code:+code,file:a,sha256:sha(a),notes},desktop:{version:v,file:d,sha256:sha(d),notes}},null,2));
' "$V" "$CODE" "$NOTES"
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$OUT/latest.json" -out "$OUT/latest.json.sig"

echo "== Publishing to $SERVER"
ssh_ "mkdir -p ~/$REMOTE_DIR"
# Files first, the signed information last: an app never sees a version whose files are not there yet.
scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "$OUT/pager-android-$V.apk" "$OUT/pager-desktop_${V}_amd64.deb" "$SERVER:$REMOTE_DIR/"
scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "$OUT/latest.json" "$OUT/latest.json.sig" "$SERVER:$REMOTE_DIR/"
ssh_ "cd ~/$REMOTE_DIR && ls -t pager-android-*.apk | tail -n +4 | xargs -r rm -f; ls -t pager-desktop_*.deb | tail -n +4 | xargs -r rm -f"
echo "Published $V. Remember to commit VERSION and desktop/package.json."
