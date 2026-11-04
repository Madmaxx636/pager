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

## Encryption
Three layers, each optional and independent of the others.

1. **End-to-end encrypted chats.** Update the apps first (web, desktop, Android), then on the server:
   ```bash
   cd server && ./scripts/enable-encryption.sh signal     # try one network first
   ./scripts/enable-encryption.sh                         # then all of them
   ```
   New chats on those networks are created encrypted; existing chats stay as they are. The message text is then ciphertext in Synapse's
   database, and attachments are encrypted before they are uploaded. The bridge itself must read messages to pass them to WhatsApp/Signal,
   so it holds the keys it needs (this is how every Matrix bridge works). Turn it off for new chats with `--off`.
2. **A recovery key** (Settings → Privacy → Encryption, on any device). It backs up your message keys, encrypted, to your server, so a new
   device or a reinstall can read your history. Save the key somewhere safe: Pager cannot recover it.
3. **An encrypted vault for the bridges' data** (their configs, WhatsApp/Signal logins and keys, and bridge databases). It opens itself at
   boot, so a reboot needs nobody to type anything:
   ```bash
   sudo ./scripts/vault-setup.sh --size 10G --owner $USER   # once: creates the LUKS image, the key and the boot service
   ./scripts/vault-migrate.sh                               # moves the bridges in; keeps plain copies until you finish
   ./scripts/vault-finish.sh                                # after checking your chats work: deletes the plain copies
   ```
   The key is on the same machine (`/etc/pager/vault.key`, root only), so this protects a copied vault image, a reused data disk and
   backups of `server/data`, not someone who has the whole running machine. Back the key file up separately. The vault also holds
   Postgres for the bridges only; Synapse's own data (accounts, rooms, and the appservice tokens in `data/synapse`) is not in it.

## Backups
Everything lives in `server/data` (Synapse, Postgres, bridge logins and keys). `pager backup` saves all of it in one file, locked with a **public key**: the server can make backups but cannot read them, so a stolen backup is useless without the private key.
```bash
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:4096 -out backup-private.pem   # on your own computer; keep this file safe, NOT on the server
openssl pkey -in backup-private.pem -pubout -out backup-public.pem                     # copy this one to server/data/backup-public.pem
cd server && ./scripts/backup-schedule.sh --install        # a backup every night around 04:30; the newest two are kept in data/backups
./pager backup                                             # one now (to your home folder, locked with the same key)
./pager verify FILE backup-private.pem                     # check that a backup can be opened
PAGER_BACKUP_KEY=backup-private.pem ./pager restore FILE   # put one back
```
`pager backup --passphrase` locks one with a passphrase instead; `--no-encrypt` leaves it unlocked (it holds your server's keys, so only do that on purpose). Copy backups off the machine now and then.

## Updating and upkeep
Three jobs keep the server current by themselves; each is installed once and logs to `server/data/`:
```bash
cd server
./scripts/auto-update.sh --install     # every 5 minutes: new web app and API from GitHub (never touches Synapse, bridges or the database)
./scripts/maintenance.sh --install     # every night ~05:15: restarts a stopped Pager service, backs up if the last backup is old, installs newer bridge
                                       # versions (rolled back if one won't start) and Synapse patch releases, cleans old images and logs
./scripts/logwatch.sh --install        # watches the logs; Admin > Logs shows errors, crashes and warnings from maintenance
```
Bridges and Synapse are pinned to exact versions (`data/versions.lock`, and `SYNAPSE_IMAGE` in `.env`), so nothing changes by surprise. `./pager upgrade` installs newer bridge versions on demand; a new Synapse series (1.x to 1.y) is left for you, so read its release notes, then change the version in `docker-compose.yml` and remove `SYNAPSE_IMAGE` from `.env`. Anything else in an update (a changed `docker-compose.yml` or Caddyfile) is applied with `./pager update` when it suits you.

## Troubleshooting
- Bridge shows "needs attention": tap Sign in next to the account and relink.
- Logs: `docker compose logs -f synapse api whatsapp signal`.
- Your phone must be online occasionally for WhatsApp and Signal links to stay valid.
