#!/usr/bin/env bash
# Pager installer: one command sets up your own server with every bridge included.
#
#   curl -fsSL https://raw.githubusercontent.com/Madmaxx636/pager/master/install.sh | bash
#   or, from a copy of the repository:   ./install.sh
#
# It asks a few questions (how people will reach the server, an admin name and password), then does the rest. Safe to run again:
# it keeps your settings and updates what is there. Everything it runs is in this repository; nothing is downloaded from anywhere else
# except the container images for the bridges, the web app's build tools, and the code from GitHub.
set -euo pipefail

REPO_URL="${PAGER_REPO:-https://github.com/Madmaxx636/pager.git}"
DIR="${PAGER_DIR:-$HOME/pager}"
MODE="" DOMAIN="" DUCK_SUB="" DUCK_TOKEN="" ADMIN="" ADMIN_PW_FILE="" NO_ADMIN=0 YES=0 SKIP_START=0

bold() { printf '\033[1m%s\033[0m\n' "$*"; }
say() { printf '%s\n' "$*"; }
warn() { printf '\033[33m%s\033[0m\n' "$*" >&2; }
die() { printf '\033[31mProblem: %s\033[0m\n' "$*" >&2; exit 1; }
ask() { # ask "question" default -> answer
  local a; if [ "$YES" = 1 ]; then echo "$2"; return; fi
  read -r -p "$1 " a </dev/tty || a=""; echo "${a:-$2}"
}
secret() { local a; read -r -s -p "$1 " a </dev/tty; echo >&2; echo "$a"; }

while [ $# -gt 0 ]; do case "$1" in
  --local) MODE=local; shift;;
  --domain) MODE=domain; DOMAIN="$2"; shift 2;;
  --duckdns) MODE=duckdns; DUCK_SUB="${2%%:*}"; DUCK_TOKEN="${2#*:}"; shift 2;;
  --admin) ADMIN="$2"; shift 2;;
  --admin-password-file) ADMIN_PW_FILE="$2"; shift 2;;
  --no-admin) NO_ADMIN=1; shift;;
  --dir) DIR="$2"; shift 2;;
  --yes|-y) YES=1; shift;;
  --no-start) SKIP_START=1; shift;;
  -h|--help) sed -n '2,10p' "$0" | sed 's/^# \{0,1\}//'; exit 0;;
  *) die "Unknown option $1 (try --help)";;
esac; done

bold "Pager installer"
echo

# ---- 1. What this computer needs ------------------------------------------------------------------------------------------
[ "$(uname -s)" = "Linux" ] || warn "Only Linux has been tested. macOS may work with Docker Desktop; Windows: use WSL 2 with Docker."
command -v git >/dev/null || die "git is needed. Install it first (for example: sudo apt install git)."
command -v curl >/dev/null || die "curl is needed. Install it first (for example: sudo apt install curl)."
command -v docker >/dev/null || die "Docker is needed. Install it from https://docs.docker.com/engine/install/ (Podman with a docker command also works), then run this again."
docker compose version >/dev/null 2>&1 || die "Docker Compose is needed (the 'docker compose' command). See https://docs.docker.com/compose/install/"
docker info >/dev/null 2>&1 || die "Docker is installed but this user can't use it. Try: sudo usermod -aG docker \$USER, then log out and in again."
if [ -r /proc/meminfo ]; then
  mem_mb=$(( $(awk '/MemTotal/ {print $2}' /proc/meminfo) / 1024 ))
  [ "$mem_mb" -ge 3500 ] || warn "This machine has $((mem_mb/1024)) GB of memory. Pager runs about a dozen services and wants 4 GB or more; it may be slow."
fi
free_gb=$(( $(df -Pk "$(dirname "$DIR")" 2>/dev/null | awk 'NR==2 {print $4}' || echo 0) / 1048576 ))
[ "$free_gb" -ge 10 ] || warn "Only ${free_gb} GB of disk is free here. Pager wants about 15 GB to start (more as chats and pictures grow)."

# ---- 2. The code ----------------------------------------------------------------------------------------------------------
HERE="$(cd "$(dirname "${BASH_SOURCE[0]:-$0}")" 2>/dev/null && pwd || true)"
if [ -n "$HERE" ] && [ -f "$HERE/server/scripts/setup.sh" ]; then DIR="$HERE"
elif [ -d "$DIR/.git" ]; then say "Updating the code in $DIR…"; git -C "$DIR" pull --ff-only -q
else say "Getting Pager into $DIR…"; git clone -q --depth 1 "$REPO_URL" "$DIR"; fi
cd "$DIR/server"

# ---- 3. How people will reach it ------------------------------------------------------------------------------------------
if [ -f .env ] && grep -q '^PAGER_DOMAIN=.' .env; then
  say "Found your existing settings (server/.env): keeping them."
  set -a; . ./.env; set +a; DOMAIN="$PAGER_DOMAIN"; MODE=keep
else
  if [ -z "$MODE" ]; then
    echo "How will you and your people connect to this server?"
    echo "  1) Only from this home network (simplest: no domain, no certificate; the trial Android app only)"
    echo "  2) Through my own domain name (secure HTTPS, set up automatically)"
    echo "  3) Through a free DuckDNS name (secure HTTPS; a free name like myfamily.duckdns.org)"
    case "$(ask 'Choose 1, 2 or 3 [3]:' 3)" in 1) MODE=local;; 2) MODE=domain;; *) MODE=duckdns;; esac
  fi
  case "$MODE" in
    local)
      ip="$(ip route get 1.1.1.1 2>/dev/null | awk '{for(i=1;i<NF;i++) if($i=="src") print $(i+1)}' | head -1 || true)"
      DOMAIN="$(ask "Address of this computer on your network [${ip:-192.168.1.10}]:" "${ip:-192.168.1.10}")";;
    domain)
      [ -n "$DOMAIN" ] || DOMAIN="$(ask 'Your domain name (for example chat.example.com):' '')"
      [ -n "$DOMAIN" ] || die "A domain name is needed."
      say "Before it can get a certificate: the domain must point at this machine's public address, and ports 80 and 443 must reach it.";;
    duckdns)
      [ -n "$DUCK_SUB" ] || DUCK_SUB="$(ask 'Your DuckDNS name (the part before .duckdns.org):' '')"
      [ -n "$DUCK_TOKEN" ] || { say "Your token is on https://www.duckdns.org after you sign in. It stays in server/.env on this machine."; DUCK_TOKEN="$(secret 'DuckDNS token:')"; }
      [ -n "$DUCK_SUB" ] && [ -n "$DUCK_TOKEN" ] || die "The DuckDNS name and token are both needed."
      [ "$(curl -fsS "https://www.duckdns.org/update?domains=$DUCK_SUB&token=$DUCK_TOKEN&ip=" || true)" = "OK" ] || die "DuckDNS didn't accept that name and token. Check them at https://www.duckdns.org"
      DOMAIN="$DUCK_SUB.duckdns.org"
      say "Your name now points at this network. On your router, forward ports 80 and 443 to this computer.";;
  esac
  umask 077
  { echo "PAGER_DOMAIN=$DOMAIN"
    [ "$MODE" = duckdns ] && printf 'DUCKDNS_SUBDOMAIN=%s\nDUCKDNS_TOKEN=%s\n' "$DUCK_SUB" "$DUCK_TOKEN"
    true; } > .env
  umask 022
fi

# ---- 4. Build and start everything -----------------------------------------------------------------------------------------
echo; bold "Setting up (this takes a few minutes the first time)…"
./scripts/build-web.sh >/dev/null
./scripts/setup.sh | grep -E 'Skipping|Bridges enabled' || true
set -a; . ./.env; set +a
[ "$SKIP_START" = 1 ] && { say "Stopped before starting, as asked. Start with: docker compose up -d --build"; exit 0; }
docker compose up -d --build 2>&1 | grep -vE '^\s*$' | tail -3 || true

say "Waiting for the server to be ready…"
ready=0; for _ in $(seq 1 120); do
  # Ask Synapse directly, from inside the network (works the same with Docker and Podman, and before any certificate exists).
  docker compose exec -T api node -e 'fetch("http://synapse:8008/health").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' >/dev/null 2>&1 && { ready=1; break; }
  sleep 2
done
[ "$ready" = 1 ] || die "The server didn't become ready. Look with:  cd $DIR/server && ./pager doctor   and   ./pager logs synapse"

# ---- 5. The first account (the administrator) -----------------------------------------------------------------------------
make_admin() { # name password
  docker compose exec -T -e U="$1" -e PW="$2" -e CODE="$ADMIN_INVITE_CODE" api node -e '
    fetch("http://localhost:8080/api/signup",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({username:process.env.U,password:process.env.PW,invite:process.env.CODE})})
      .then(async r=>{ if(r.status===201) process.exit(0); const b=await r.json().catch(()=>({})); console.error(b.error||("status "+r.status)); process.exit(1); })
      .catch(e=>{console.error(e.message);process.exit(1)})'
}
URL="$(case "${PAGER_ADDRESS:-}" in http://*) echo "http://$PAGER_DOMAIN:${HTTP_PORT:-80}";; *) echo "https://$PAGER_DOMAIN";; esac)"
made=""
if [ "$NO_ADMIN" = 0 ] && ! docker compose exec -T postgres psql -U pager -d synapse -Atc "select 1 from users where admin=1 limit 1" 2>/dev/null | grep -q 1; then
  echo; bold "Create your account (it will be the administrator)"
  [ -n "$ADMIN" ] || ADMIN="$(ask 'Username (letters and numbers, 3 or more):' '')"
  if [ -n "$ADMIN" ]; then
    if [ -n "$ADMIN_PW_FILE" ]; then pw="$(cat "$ADMIN_PW_FILE")"
    else pw="$(secret 'Password (8 or more characters):')"; pw2="$(secret 'Again:')"; [ "$pw" = "${pw2:-}" ] || die "The passwords don't match. Run the installer again to retry."; fi
    if make_admin "$ADMIN" "$pw"; then made="$ADMIN"; else warn "Couldn't make that account. You can sign up yourself at $URL with the admin code below."; fi
  fi
fi

# ---- 6. A handy command ----------------------------------------------------------------------------------------------------
mkdir -p "$HOME/.local/bin" && ln -sf "$DIR/server/pager" "$HOME/.local/bin/pager" 2>/dev/null || true

echo; bold "Pager is running."
say "  Open:      $URL"
[ -n "$made" ] && say "  Sign in:   $made   (the first screen walks you through everything)"
[ -z "$made" ] && say "  Sign up:   with the admin code: $ADMIN_INVITE_CODE   (makes you the administrator; keep it private)"
say "  People you invite use:  $INVITE_CODE"
say "  Included:  WhatsApp, Signal, Google Messages, Messenger, Slack, X, Bluesky, LinkedIn and GroupMe."
say "             Telegram needs your own key from my.telegram.org: add TELEGRAM_API_ID and TELEGRAM_API_HASH to server/.env, run ./scripts/setup.sh, then 'docker compose up -d'."
echo
say "  Everyday:  pager status | pager logs | pager update | pager backup | pager doctor    (if 'pager' isn't found, use $DIR/server/pager)"
case "$MODE" in local) warn "  Plain HTTP works on this network only. For phones away from home, run this again with a domain.";; esac
say "  Next: make a backup of the encryption key and the server (pager backup), and install the apps from $URL."
