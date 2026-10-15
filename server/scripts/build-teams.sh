#!/usr/bin/env bash
# Builds the Microsoft Teams bridge image. There is no published image for it, so it is built from source (about 5 minutes the first time).
# It is experimental: consumer Teams accounts (teams.live.com) only, and it checks for new messages by polling.
# Pinned to one reviewed commit so a change upstream cannot slip in. To move to a newer one, change TEAMS_COMMIT and run this again.
set -euo pipefail
TEAMS_COMMIT="${TEAMS_COMMIT:-f6007a4acb116030b8bc6426983822ff52b273a7}"
IMAGE="pager/mautrix-teams:local"
if [ "${1:-}" != "--force" ] && docker image inspect "$IMAGE" >/dev/null 2>&1; then echo "$IMAGE is already built"; exit 0; fi
tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' EXIT
git clone -q https://github.com/beeper/teams.git "$tmp/src"
git -C "$tmp/src" checkout -q "$TEAMS_COMMIT"
docker build -t "$IMAGE" "$tmp/src"
echo "Built $IMAGE from $TEAMS_COMMIT"
