#!/usr/bin/env bash
# Builds the Android and desktop apps at a new version, signs the update information and publishes everything to your server.
# After this, installed apps offer the update by themselves (Android on opening, desktop within the hour).
# Usage: scripts/release.sh [--build-only | --publish-only] [--all] [--keep-android] 0.5.5 "What changed, in a sentence"
# Only what changed is built and offered: an app whose files are the same as in its last release (phone: android/; desktop: desktop/ and app/) keeps its
# last entry, so a desktop app is not offered an update for a phone-only change. --all builds everything anyway.
# It publishes to GitHub (the release tagged "updates": works from any network, and is where the apps look first) and, when it can be reached, to your server too.
# Needs: JDK 21 (JAVA_HOME), Node, openssl, and ssh access to the server (SERVER, SSH_KEY below). The release key lives in
# ~/.config/pager/update-signing.pem: back it up. Without it, installed desktop apps will refuse your updates.
set -euo pipefail
cd "$(dirname "$0")/.."
PUBLISH_ONLY=0; BUILD_ONLY=0; KEEP_ANDROID=0; KEEP_WINDOWS=0; KEEP_DEB=0; ALL=0
# --build-only: build and sign everything but do not upload.  --publish-only: re-send what a previous run built.
# --keep-windows: don't build the Windows installer (it needs Wine) and leave the Windows entry in the update list as it is on the server.
# WIN_BUILD: a command to build the Windows installer instead of running Wine here (for example inside Docker).
# --keep-android: leave the Android entry in the update list as it is on the server (while phones still carry an older signing key).
while [[ "${1:-}" == --* ]]; do case "$1" in --publish-only) PUBLISH_ONLY=1;; --build-only) BUILD_ONLY=1;; --keep-android) KEEP_ANDROID=1;; --keep-windows) KEEP_WINDOWS=1;; --all) ALL=1;; *) echo "Unknown option $1" >&2; exit 1;; esac; shift; done
V="${1:?Usage: $0 [--publish-only] <version like 0.4.1> \"notes\"}"; NOTES="${2:-}"
[[ "$V" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]] || { echo "Version must look like 0.4.1" >&2; exit 1; }
# Where to publish: SERVER (user@host), SSH_KEY and REMOTE_DIR come from the environment or from ~/.config/pager/release.env (kept out of the repo).
[ -f "$HOME/.config/pager/release.env" ] && . "$HOME/.config/pager/release.env"
SERVER="${SERVER:-}"; SSH_KEY="${SSH_KEY:-$HOME/.ssh/id_ed25519}"; REMOTE_DIR="${REMOTE_DIR:-pager/server/updates}"
# SERVER is optional now: GitHub is where the apps look first, and your server is added when it can be reached.
# Electron 44 no longer has a 32-bit Windows build, so the 32-bit installer uses the newest version that does (43.8.3, a major that still gets security fixes). Move this when 43 is retired.
ELECTRON32="${ELECTRON32:-43.8.3}"
KEY="$HOME/.config/pager/update-signing.pem"
[ -f "$KEY" ] || { echo "No release key at $KEY" >&2; exit 1; }
cmp -s <(openssl pkey -in "$KEY" -pubout) desktop/update-pubkey.pem || { echo "The release key doesn't match desktop/update-pubkey.pem, installed apps would reject this release" >&2; exit 1; }
ssh_() { ssh -i "$SSH_KEY" -o IdentitiesOnly=yes "$SERVER" "$@"; }

OUT=release-out
GH_REPO="$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
GITHUB_BASE="https://github.com/$GH_REPO/releases/download/updates"
ssh_ok() { [ -n "$SERVER" ] && ssh -i "$SSH_KEY" -o IdentitiesOnly=yes -o ConnectTimeout=8 -o BatchMode=yes "$SERVER" true 2>/dev/null; }
if [ "$PUBLISH_ONLY" = 0 ]; then
# What was released last (the apps' update list), so only what changed is built and offered.
PREV="$(curl -fsSL --max-time 20 "$GITHUB_BASE/latest.json" 2>/dev/null || true)"
[ -n "$PREV" ] || { ssh_ok && PREV="$(ssh_ "cat ~/$REMOTE_DIR/latest.json" 2>/dev/null || true)"; } || true
export PREV
commit_of() { node -e 'const p=JSON.parse(process.env.PREV||"{}");console.log((p[process.argv[1]]||{}).commit||"")' "$1"; }
# True (0) when the files in [paths] differ from how they were at commit [c]; an unknown commit counts as changed.
changed_since() { local c="$1"; shift; if [ -z "$c" ] || ! git cat-file -e "$c^{commit}" 2>/dev/null; then return 0; fi; git diff --quiet "$c" -- "$@"; [ $? -ne 0 ]; }
if [ "$ALL" = 0 ] && [ -n "${PREV:-}" ]; then
  changed_since "$(commit_of android)" android ':(exclude)android/build' ':(exclude)android/app/build' || { KEEP_ANDROID=1; echo "== Phone: nothing changed since its last release, keeping that one"; }
  changed_since "$(commit_of desktop)" desktop app ':(exclude)desktop/package.json' ':(exclude)desktop/package-lock.json' || { KEEP_DEB=1; KEEP_WINDOWS=1; echo "== Desktop: nothing changed since its last release, keeping that one"; }
  if [ "$KEEP_ANDROID" = 1 ] && [ "$KEEP_DEB" = 1 ]; then echo "Nothing changed in the phone or desktop apps since the last release. (--all builds them anyway.)"; exit 0; fi
fi
COMMIT="$(git rev-parse HEAD)"; export COMMIT
echo "$V" > VERSION
[ "$KEEP_DEB" = 1 ] && [ "$KEEP_WINDOWS" = 1 ] || (cd desktop && node -e 'const f="package.json",p=JSON.parse(require("fs").readFileSync(f));p.version=process.argv[1];require("fs").writeFileSync(f,JSON.stringify(p,null,2)+"\n")' "$V")
OUT=release-out; rm -rf "$OUT"; mkdir -p "$OUT"

if [ "$KEEP_ANDROID" = 0 ]; then
echo "== Android"
# Signed with the release key (~/.config/pager/android-signing.properties). DEBUG_SIGN=1 makes a trial build with the development key instead.
[ -n "${DEBUG_SIGN:-}" ] || [ -f "${PAGER_ANDROID_SIGNING:-$HOME/.config/pager/android-signing.properties}" ] || { echo "No Android release key. Make one first (see SECURITY.md) or use DEBUG_SIGN=1 for a trial build." >&2; exit 1; }
(cd android && ./gradlew :app:testDebugUnitTest :app:assembleRelease ${DEBUG_SIGN:+-PdebugSign} -q)
cp android/app/build/outputs/apk/release/*.apk "$OUT/pager-android-$V.apk"
# The same app for phones that cannot run 64-bit code (small Android Go phones and the like): only the 32-bit native code, so about half the size.
(cd android && ./gradlew :app:assembleRelease ${DEBUG_SIGN:+-PdebugSign} -Pabis=armeabi-v7a -q)
cp android/app/build/outputs/apk/release/*.apk "$OUT/pager-android-$V-32bit.apk"
# Check what is really inside: the normal file carries both kinds of native code, the 32-bit one only the 32-bit kind.
libs() { unzip -l "$1" | awk '/lib\/[a-z0-9_-]+\//{split($4,a,"/"); print a[2]}' | sort -u | tr '\n' ' '; }
echo "   normal APK native code: $(libs "$OUT/pager-android-$V.apk")"; echo "   32-bit APK native code: $(libs "$OUT/pager-android-$V-32bit.apk")"
libs "$OUT/pager-android-$V-32bit.apk" | grep -q "arm64" && { echo "The 32-bit APK contains 64-bit code" >&2; exit 1; }
libs "$OUT/pager-android-$V-32bit.apk" | grep -q "armeabi-v7a" || { echo "The 32-bit APK has no 32-bit code" >&2; exit 1; }
fi
if [ "$KEEP_DEB" = 0 ]; then echo "== Desktop"; (cd desktop && npm test --silent && npm run dist >/dev/null)
cp "desktop/release/pager-desktop_${V}_amd64.deb" "$OUT/"
fi
if [ "$KEEP_WINDOWS" = 1 ]; then echo "== Windows (kept as it is on the server)"; else echo "== Windows"; if [ -n "${WIN_BUILD:-}" ]; then (cd desktop && eval "$WIN_BUILD" >/dev/null); else (cd desktop && npx electron-builder --win --x64 >/dev/null); fi; cp "desktop/release/pager-desktop-setup-${V}.exe" "$OUT/"
  # And for 32-bit Windows 10 or newer (older and smaller PCs). Same file name as above, so it is copied out before the next build and renamed.
  echo "== Windows 32-bit"; if [ -n "${WIN_BUILD:-}" ]; then (cd desktop && eval "${WIN_BUILD/--x64/--ia32 --config.electronVersion=$ELECTRON32}" >/dev/null); else (cd desktop && npx electron-builder --win --ia32 --config.electronVersion=$ELECTRON32 >/dev/null); fi
  cp "desktop/release/pager-desktop-setup-${V}.exe" "$OUT/pager-desktop-setup-${V}-32bit.exe"
  file "$OUT/pager-desktop-setup-${V}-32bit.exe" | grep -q "PE32 executable" || { echo "The 32-bit Windows installer is not a 32-bit program" >&2; exit 1; }
fi

CODE=$(awk -F. '{print $1*10000+$2*100+$3}' <<<"$V")
# The key the Android app is signed with: phones refuse an update signed by any other key, so the apps compare this before downloading.
SIGNER=""; [ "$KEEP_ANDROID" = 1 ] || SIGNER=$("$(ls -d $HOME/android-sdk/build-tools/*/ | sort -V | tail -1)apksigner" verify --print-certs "$OUT/pager-android-$V.apk" 2>/dev/null | awk '/certificate SHA-256 digest/ {print $NF; exit}')
# PREV (read above) also carries the native apps' entries, which are released separately (release-native.sh) and must survive this one.
KEEPA="$KEEP_ANDROID" KEEPD="$KEEP_DEB" KEEPW="$KEEP_WINDOWS" SIGNER="$SIGNER" node -e '
const fs=require("fs"),c=require("crypto");const [v,code,notes]=process.argv.slice(1);
const has=f=>fs.existsSync("release-out/"+f);
const sha=f=>c.createHash("sha256").update(fs.readFileSync("release-out/"+f)).digest("hex");
const prev=process.env.PREV?JSON.parse(process.env.PREV):{};const commit=process.env.COMMIT;
const E=(f,more={})=>({version:v,...more,file:f,sha256:sha(f),notes,commit});
const out={released:new Date().toISOString()};
// What was not rebuilt keeps its last entry as it was (its own version and commit): those apps are not offered an update.
if(process.env.KEEPA==="1"){for(const k of ["android","android32"])if(prev[k])out[k]=prev[k];}
else{const a=`pager-android-${v}.apk`,a32=`pager-android-${v}-32bit.apk`;out.android=E(a,{code:+code,signer:process.env.SIGNER});if(has(a32))out.android32=E(a32,{code:+code,signer:process.env.SIGNER});}
if(process.env.KEEPD==="1"){if(prev.desktop)out.desktop=prev.desktop;}else out.desktop=E(`pager-desktop_${v}_amd64.deb`);
if(process.env.KEEPW==="1"){for(const k of ["windows","windows32"])if(prev[k])out[k]=prev[k];}
else{out.windows=E(`pager-desktop-setup-${v}.exe`);const w32=`pager-desktop-setup-${v}-32bit.exe`;if(has(w32))out.windows32=E(w32);}
for(const k of ["native","nativeWindows"])if(prev[k])out[k]=prev[k];
fs.writeFileSync("release-out/latest.json",JSON.stringify(out,null,2));
' "$V" "$CODE" "$NOTES"
openssl pkeyutl -sign -inkey "$KEY" -rawin -in "$OUT/latest.json" -out "$OUT/latest.json.sig"
fi

[ "$BUILD_ONLY" = 1 ] && { echo "Built and signed in $OUT/. Upload later with: scripts/release.sh --publish-only $V \"$NOTES\""; exit 0; }
# Files first, the signed information last: an app never sees a version whose files are not there yet.
FILES=(); for f in "$OUT"/pager-*; do [ -f "$f" ] && FILES+=("$f"); done
echo "== Publishing to GitHub"
scripts/publish-github.sh "${FILES[@]}" "$OUT/latest.json" "$OUT/latest.json.sig"
if ssh_ok; then
  echo "== Publishing to $SERVER"
  ssh_ "mkdir -p ~/$REMOTE_DIR"
  [ ${#FILES[@]} -eq 0 ] || scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "${FILES[@]}" "$SERVER:$REMOTE_DIR/"
  scp -q -i "$SSH_KEY" -o IdentitiesOnly=yes "$OUT/latest.json" "$OUT/latest.json.sig" "$SERVER:$REMOTE_DIR/"
  ssh_ "cd ~/$REMOTE_DIR && ls -t pager-android-*.apk | grep -v 32bit | tail -n +4 | xargs -r rm -f; ls -t pager-android-*-32bit.apk | tail -n +4 | xargs -r rm -f; ls -t pager-desktop_*.deb | tail -n +4 | xargs -r rm -f; ls -t pager-desktop-setup-*.exe | grep -v 32bit | tail -n +4 | xargs -r rm -f; ls -t pager-desktop-setup-*-32bit.exe | tail -n +4 | xargs -r rm -f"
else
  echo "== Your server can't be reached from here, so this went to GitHub only. Apps that look at GitHub have it now; run '--publish-only' again at home to put it on the server too."
fi
echo "Published $V. Remember to commit VERSION and desktop/package.json."
