#!/usr/bin/env bash
# Publishes release files to GitHub (the release tagged "updates"), which is where the apps look for updates. It works from any network, so a release
# no longer needs you at home. The files go first and the signed latest.json last: an app never sees a version whose files are not there yet.
# Usage: scripts/publish-github.sh FILE...        (latest.json and latest.json.sig among them; they are sent last)
# Needs the GitHub command line (gh), signed in with access to the repository.
set -euo pipefail
REPO="${PAGER_REPO:-$(git -C "$(dirname "$0")/.." remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}"
TAG="${PAGER_UPDATES_TAG:-updates}"
[ $# -gt 0 ] || { echo "Usage: $0 FILE..." >&2; exit 1; }
command -v gh >/dev/null || { echo "The GitHub command line (gh) is not installed" >&2; exit 1; }

gh release view "$TAG" -R "$REPO" >/dev/null 2>&1 || gh release create "$TAG" -R "$REPO" --latest=false --title "App updates" \
  --notes "The update files the apps check for new versions. Replaced with each release; do not edit by hand."

files=(); manifest=()
for f in "$@"; do case "$(basename "$f")" in latest.json|latest.json.sig) manifest+=("$f");; *) files+=("$f");; esac; done
[ ${#files[@]} -eq 0 ] || gh release upload "$TAG" -R "$REPO" --clobber "${files[@]}"
# The signature before the manifest does not matter to an app (it needs both), but both after every file.
[ ${#manifest[@]} -eq 0 ] || gh release upload "$TAG" -R "$REPO" --clobber "${manifest[@]}"

# Keep the newest two versions of each kind of file, so the release does not grow forever.
prune() {  # $1 = a pattern with VERSION where the number goes, e.g. pager-android-VERSION.apk
  local pat="$1" rx; rx="^$(sed -E 's/[.]/\\./g; s/VERSION/([0-9]+\\.[0-9]+\\.[0-9]+)/' <<<"$pat")\$"
  gh release view "$TAG" -R "$REPO" --json assets -q '.assets[].name' | grep -E "$rx" | sort -V | head -n -2 | while read -r old; do
    gh release delete-asset "$TAG" "$old" -R "$REPO" -y >/dev/null && echo "   removed old $old"
  done || true
}
prune 'pager-android-VERSION.apk'
prune 'pager-android-VERSION-32bit.apk'
prune 'pager-desktop_VERSION_amd64.deb'
prune 'pager-desktop-setup-VERSION.exe'
prune 'pager-desktop-setup-VERSION-32bit.exe'
prune 'pager-native-VERSION-linux-x64.tar.gz'
prune 'pager-native-setup-VERSION.exe'
echo "Published to https://github.com/$REPO/releases/tag/$TAG"
