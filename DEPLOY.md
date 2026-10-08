# Deploying Pager on your own server

## You need
- A Linux machine with Docker (compose plugin) or rootless Podman + `docker-compose` (see README).
- A domain name pointing at it, with ports 80 and 443 open. Caddy gets the HTTPS certificate automatically.
- Node.js 20+ to build the web app, or just Docker: `server/scripts/build-web.sh` builds it in a container.

## Install
```bash
git clone <your-pager-repo> pager && cd pager
server/scripts/build-web.sh
cd server
./scripts/setup.sh              # asks for your domain, prints an invite code
docker compose up -d --build
```
Optional bridges: add `ENABLE_DISCORD=1`, `ENABLE_INSTAGRAM=1`, or `TELEGRAM_API_ID` + `TELEGRAM_API_HASH` to `server/.env`
**before** running `setup.sh` (they are untested).

## Home server with a free DuckDNS name
1. Make a name at https://www.duckdns.org (sign in, pick e.g. `myfamily` → `myfamily.duckdns.org`) and copy your token.
2. On your router, forward TCP ports **80** and **443** to the server's local IP (give the server a fixed LAN address first).
3. Create `server/.env` before setup so it doesn't prompt:
   ```bash
   cat > server/.env <<EOF
   PAGER_DOMAIN=myfamily.duckdns.org
   DUCKDNS_SUBDOMAIN=myfamily
   DUCKDNS_TOKEN=your-token-here
   EOF
   ```
   Then run `./scripts/setup.sh` and `docker compose up -d --build` as above. A `duckdns` container keeps the name pointed at your
   home IP even when your ISP changes it.
4. Check from your phone on mobile data (not Wi-Fi): open `https://myfamily.duckdns.org`.
   If the certificate fails, ports 80/443 aren't reaching the server (some ISPs block them; use Tailscale instead).

## First run
1. Open `https://your-domain/` and sign up with the invite code. Keep the code private: it lets anyone create an account.
2. Connect your apps from Settings → Bridges & accounts (WhatsApp and Signal by QR, Google Messages by QR, Messenger by login).
3. Tap **Sync chats** on Signal: it creates a chat per contact. Signal never sends old messages to a newly linked device.
   WhatsApp, Google Messages and Messenger backfill recent history on first link.
4. Install the app: Android APK (point it at your domain), the Linux AppImage/deb, or the web app (Add to Home Screen).

## Moving from a test server
Accounts and links don't carry over. Sign up again and relink. In Signal → Settings → Linked devices, remove the old
"mautrix-signal" device from the test server.

## Family
Share the invite code (or change `INVITE_CODE` in `server/.env` and run `docker compose up -d api`). Each person gets their own
account and links their own chat apps.

## Backups
Everything lives in `server/data` (Synapse, Postgres, bridge logins and keys). Back it up regularly, and keep it private.
```bash
cd server && docker compose stop && tar czf ~/pager-backup-$(date +%F).tgz data .env && docker compose start
```
(Rootless Podman: files are owned by sub-uids, so run the `tar` as `podman unshare tar czf …`.)

## Updating
```bash
git pull && (cd app && npm ci && npm run build)
cd server && docker compose pull && docker compose up -d --build
```

## Troubleshooting
- Bridge shows "needs attention": tap Sign in next to the account and relink.
- Logs: `docker compose logs -f synapse api whatsapp signal`.
- Your phone must be online occasionally for WhatsApp and Signal links to stay valid.
