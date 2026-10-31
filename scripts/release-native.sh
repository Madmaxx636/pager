#!/usr/bin/env bash
# Publishes the native (Qt) Pager app: adds it to the signed update information on your server without touching the other apps' entries.
# Usage: scripts/release-native.sh [--build-only] <version like 0.2.0> "notes"      Needs the files made by desktop-native/package.sh in desktop-native/dist/.
set -euo pipefail
cd "$(dirname "$0")/.."
BUILD_ONLY=0; [ "${1:-}" = --build-only ] && { BUILD_ONLY=1; shift; }
V="${1:?Usage: $0 [--build-only] <version like 0.2.0> \"notes\"}"; NOTES="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 0.2.0" >&2; exit 1; }
[ -f "$HOME/.config/pager/release.env" ] && . "$HOME/.config/pager/release.env"
SERVER="${SERVER:-}"; SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"; REMOTE_DIR="${REMOTE_DIR:-pager/server/updates}"
# SERVER is optional: GitHub is where the apps look first, and your server is added when it can be reached.
KEY="$HOME/.config/pager/update-signing.pem"; [ -f "$KEY" ] || { echo "No release key at $KEY" >&2; exit 1; }
cmp -s <(openssl pkey -in "$KEY" -pubout) desktop/update-pubkey.pem || { echo "The release key doesn't match desktop/update-pubkey.pem" >&2; exit 1; }
DIST=desktop-native/dist; LINUX="pager-native-$V-linux-x64.tar.gz"; WINDOWS="pager-native-setup-$V.exe"
[ -f "$DIST/$LINUX" ] || [ -f "$DIST/$WINDOWS" ] || { echo "Nothing to publish: build $DIST/$LINUX (desktop-native/package.sh) first" >&2; exit 1; }
ssh_() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" "$@"; }
ssh_ok() { [ -n "$SERVER" ] && ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=8 -o BatchMode=yes "$SERVER" true 2>/dev/null; }
GH_REPO="$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
OUT=release-out-native; rm -rf "$OUT"; mkdir -p "$OUT"
PREV="$(curl -fsSL --max-time 20 "https://github.com/$GH_REPO/releases/download/updates/latest.json" 2>/dev/null || true)"
[ -n "$PREV" ] || { ssh_ok && PREV="$(ssh_ "cat ~/$REMOTE_DIR/latest.json" 2>/dev/null || true)"; } || true
[ -n "$PREV" ] || PREV="{}"       # nothing published yet
COMMIT="$(git rev-parse HEAD)" PREV="$PREV" DIST="$DIST" LINUX="$LINUX" WINDOWS="$WINDOWS" node -e '
const fs=require("fs"),c=require("crypto");const [v,notes]=process.argv.slice(1);
const prev=JSON.parse(process.env.PREV);const d=process.env.DIST;
const sha=f=>c.createHash("sha256").update(fs.readFileSync(d+"/"+f)).digest("hex");
const out={...prev,released:new Date().toISOString()};
if(fs.existsSync(d+"/"+process.env.LINUX))out.native={version:v,file:process.env.LINUX,sha256:sha(process.env.LINUX),notes,commit:process.env.COMMIT};
if(fs.existsSync(d+"/"+process.env.WINDOWS))out.nativeWindows={version:v,file:process.env.WINDOWS,sha256:sha(process.env.WINDOWS),notes,commit:process.env.COMMIT};
fs.writeFileSync("release-out-native/latest.json",JSON.stringify(out,null,2));' "$V" "$NOTES"
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$OUT/latest.json" -out "$OUT/latest.json.sig"
[ "$BUILD_ONLY" = 1 ] && { echo "Signed in $OUT/ (not uploaded)."; exit 0; }
FILES=(); for f in "$LINUX" "$WINDOWS"; do [ -f "$DIST/$f" ] && FILES+=("$DIST/$f"); done
echo "== Publishing to GitHub"
scripts/publish-github.sh "${FILES[@]}" "$OUT/latest.json" "$OUT/latest.json.sig"        # files first, the signed information last
if ssh_ok; then
  echo "== Publishing to $SERVER"
  ssh_ "mkdir -p ~/$REMOTE_DIR"
  scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "${FILES[@]}" "$SERVER:$REMOTE_DIR/"
  scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "$OUT/latest.json" "$OUT/latest.json.sig" "$SERVER:$REMOTE_DIR/"
  ssh_ "cd ~/$REMOTE_DIR && ls -t pager-native-*-linux-x64.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm -f; ls -t pager-native-setup-*.exe 2>/dev/null | tail -n +4 | xargs -r rm -f"
else
  echo "== Your server can't be reached from here, so this went to GitHub only."
fi
rm -rf "$OUT"
echo "Published native $V."
