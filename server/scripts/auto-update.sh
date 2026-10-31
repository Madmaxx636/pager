#!/usr/bin/env bash
# Keeps the server up to date by itself, so an update only has to be pushed to GitHub (from anywhere) and the server picks it up within minutes.
#
# What it does, every few minutes: looks for new commits on GitHub; if there are, brings them in (only if that is a plain fast-forward) and updates
# the parts that changed: the web app (app/) and the API (api/). If the API does not come back healthy, it goes back to the version that worked.
# What it never does by itself: touch Synapse, the bridges, the database, the vault or the Caddy settings. If an update changes those (docker-compose.yml,
# Caddyfile, scripts/setup.sh, postgres/…), it brings the files in and writes a note; you apply it with `pager update` when it suits you.
#
# Install:  ./scripts/auto-update.sh --install       Remove:  ./scripts/auto-update.sh --remove       Run once now:  ./scripts/auto-update.sh --now
# Log:      data/auto-update.log   (also: journalctl --user -u pager-auto-update)
set -uo pipefail
cd "$(dirname "$0")/.."
ROOT="$(cd .. && pwd)"; SERVER_DIR="$PWD"; LOG="$SERVER_DIR/data/auto-update.log"
UNIT_DIR="$HOME/.config/systemd/user"; BRANCH="${PAGER_BRANCH:-master}"
log() { mkdir -p "$(dirname "$LOG")"; echo "[$(date -Is)] $*" | tee -a "$LOG"; [ "$(wc -l < "$LOG")" -gt 400 ] && tail -n 200 "$LOG" > "$LOG.tmp" && mv "$LOG.tmp" "$LOG"; true; }

case "${1:-}" in
  --install)
    mkdir -p "$UNIT_DIR"
    cat > "$UNIT_DIR/pager-auto-update.service" <<EOF
[Unit]
Description=Brings the newest Pager web app and API from GitHub

[Service]
Type=oneshot
ExecStart=$SERVER_DIR/scripts/auto-update.sh --now
EOF
    cat > "$UNIT_DIR/pager-auto-update.timer" <<EOF
[Unit]
Description=Look for a new Pager version every few minutes

[Timer]
OnBootSec=3min
OnUnitActiveSec=5min
Persistent=true

[Install]
WantedBy=timers.target
EOF
    systemctl --user daemon-reload && systemctl --user enable --now pager-auto-update.timer
    loginctl enable-linger "$USER" 2>/dev/null || echo "(Couldn't turn on lingering: it then only runs while you are logged in.)"
    echo "Automatic updates are on: the server looks for a new version every 5 minutes. Log: $LOG"; exit 0;;
  --remove)
    systemctl --user disable --now pager-auto-update.timer 2>/dev/null; rm -f "$UNIT_DIR/pager-auto-update.service" "$UNIT_DIR/pager-auto-update.timer"
    systemctl --user daemon-reload; echo "Automatic updates are off."; exit 0;;
  --now|"") ;;
  *) echo "Usage: $0 [--install|--remove|--now]" >&2; exit 1;;
esac

exec 9>"$SERVER_DIR/data/.auto-update.lock"; flock -n 9 || exit 0      # one at a time

# ---- The apps' update files ---------------------------------------------------------------------------------------------------------------
# Releases are published to GitHub. Apps that still look at this server (older versions) are served from updates/, so copy what is new from GitHub
# into it: the signed list is checked with the release key first, and every file against its checksum from that list.
mirror_updates() {
  command -v python3 >/dev/null && command -v curl >/dev/null && command -v openssl >/dev/null || return 0
  local repo base upd tmp; repo="$(git -C "$ROOT" remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')"
  base="https://github.com/$repo/releases/download/updates"; upd="$SERVER_DIR/updates"; tmp="$(mktemp -d)"; trap 'rm -rf "$tmp"' RETURN
  mkdir -p "$upd"
  curl -fsSL --max-time 30 "$base/latest.json" -o "$tmp/latest.json" 2>/dev/null && curl -fsSL --max-time 30 "$base/latest.json.sig" -o "$tmp/latest.json.sig" 2>/dev/null || return 0
  cmp -s "$tmp/latest.json" "$upd/latest.json" && return 0                                # nothing new
  openssl pkeyutl -verify -pubin -inkey "$ROOT/desktop/update-pubkey.pem" -rawin -in "$tmp/latest.json" -sigfile "$tmp/latest.json.sig" >/dev/null 2>&1 \
    || { log "the update list on GitHub is not signed by the release key; ignoring it"; return 0; }
  local f sum
  while read -r f sum; do
    [ -f "$upd/$f" ] && continue
    log "copying update file $f"
    curl -fsSL --max-time 900 "$base/$f" -o "$tmp/$f" || { log "couldn't download $f; will try again"; return 0; }
    [ "$(sha256sum "$tmp/$f" | cut -d' ' -f1)" = "$sum" ] || { log "$f does not match its checksum; ignoring it"; return 0; }
    mv "$tmp/$f" "$upd/$f"
  done < <(python3 - "$tmp/latest.json" <<'PY'
import json, re, sys
for v in json.load(open(sys.argv[1])).values():
    if isinstance(v, dict) and re.fullmatch(r"[A-Za-z0-9._-]+", v.get("file", "") or "") and re.fullmatch(r"[0-9a-f]{64}", (v.get("sha256", "") or "").lower()):
        print(v["file"], v["sha256"].lower())
PY
)
  cp "$tmp/latest.json.sig" "$upd/latest.json.sig.new" && mv "$upd/latest.json.sig.new" "$upd/latest.json.sig"
  cp "$tmp/latest.json" "$upd/latest.json.new" && mv "$upd/latest.json.new" "$upd/latest.json"      # the list last: nobody sees a version whose files are not there yet
  # keep the newest three of each kind
  ( cd "$upd" && for pat in 'pager-android-[0-9]*.apk' 'pager-desktop_*.deb' 'pager-desktop-setup-*.exe' 'pager-native-*-linux-x64.tar.gz' 'pager-native-setup-*.exe'; do ls -t $pat 2>/dev/null | grep -v 32bit | tail -n +4 | xargs -r rm -f; done; ls -t pager-android-*-32bit.apk 2>/dev/null | tail -n +4 | xargs -r rm -f; ls -t pager-desktop-setup-*-32bit.exe 2>/dev/null | tail -n +4 | xargs -r rm -f )
  log "update files are up to date with GitHub"
}
mirror_updates || true

git -C "$ROOT" fetch -q origin "$BRANCH" 2>>"$LOG" || { log "can't reach GitHub right now"; exit 0; }
before="$(git -C "$ROOT" rev-parse HEAD)"; target="$(git -C "$ROOT" rev-parse "origin/$BRANCH")"
[ "$before" = "$target" ] && exit 0
[ "$(cat "$SERVER_DIR/data/.auto-update-bad" 2>/dev/null)" = "$target" ] && exit 0      # that version failed here before: wait for a newer one
if ! git -C "$ROOT" merge-base --is-ancestor "$before" "$target"; then log "GitHub's version is not a straight continuation of this one; leaving things as they are"; exit 0; fi
if [ -n "$(git -C "$ROOT" status --porcelain --untracked-files=no)" ]; then log "this server has changes of its own in the code; not updating over them"; exit 0; fi

changed="$(git -C "$ROOT" diff --name-only "$before" "$target")"
git -C "$ROOT" merge -q --ff-only "origin/$BRANCH" || { log "couldn't bring in the new version"; exit 0; }
log "new version $(cat "$ROOT/VERSION" 2>/dev/null) ($(git -C "$ROOT" rev-parse --short HEAD)): $(echo "$changed" | wc -l) files changed"

fail=0
if grep -q '^app/' <<<"$changed"; then
  log "updating the web app"
  rm -rf "$ROOT/app/dist.previous"; cp -a "$ROOT/app/dist" "$ROOT/app/dist.previous" 2>/dev/null || true
  if ./scripts/build-web.sh >>"$LOG" 2>&1 && [ -s "$ROOT/app/dist/index.html" ]; then rm -rf "$ROOT/app/dist.previous"
  else log "the web app did not build; putting the old one back"; rm -rf "$ROOT/app/dist"; mv "$ROOT/app/dist.previous" "$ROOT/app/dist" 2>/dev/null || true; fail=1; fi
fi
if grep -q '^api/' <<<"$changed"; then
  log "updating the API"
  if docker compose up -d --build api >>"$LOG" 2>&1; then
    ok=0; for _ in $(seq 1 30); do sleep 2; docker compose exec -T api wget -qO- http://127.0.0.1:8080/api/health 2>/dev/null | grep -q '"ok":true' && { ok=1; break; }; done
    if [ "$ok" = 1 ]; then log "the API is up"
    else
      log "the API did not come back healthy; going back to the version that worked"
      git -C "$ROOT" reset -q --hard "$before" && docker compose up -d --build api >>"$LOG" 2>&1; echo "$target" > "$SERVER_DIR/data/.auto-update-bad"; fail=1
    fi
  else log "the API did not build"; git -C "$ROOT" reset -q --hard "$before"; docker compose up -d --build api >>"$LOG" 2>&1; echo "$target" > "$SERVER_DIR/data/.auto-update-bad"; fail=1; fi
fi
if grep -qE '^server/(docker-compose|Caddyfile|scripts/setup|postgres/|synapse|whisper)' <<<"$changed"; then
  log "NOTE: this update also changes how the server itself is set up. It is not applied automatically: run 'pager update' when it suits you"
fi
[ "$fail" = 0 ] && log "done" || log "done, with a problem: the previous version of the failed part is back"
[ "$fail" = 0 ]
