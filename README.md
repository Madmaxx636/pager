# Pager

An open-source, self-hostable unified messenger. One account, all your chats, running on your own
Matrix server with bridges. Think Beeper, but yours.

**Status:** early. The API and web app are tested against mocks (`api` has a test suite, `app` has a mock backend).
The Docker stack in `server/` has **not** been run against real bridges yet, so expect config fixes on first run.

## Layout
- `server/` – Synapse + Postgres + Caddy + mautrix bridges (docker compose)
- `api/` – signup (invite codes) and in-app bridge login, proxied to the bridges' provisioning API
- `app/` – the Pager web client (React + matrix-js-sdk)

## Run your own
Requires Docker and a domain pointing at the host.
```bash
(cd app && npm ci && npm run build)
cd server
./scripts/setup.sh
docker compose up -d --build
```
Open `https://your-domain/`, sign up with the invite code printed by setup, then tap **＋** to connect accounts.

## Develop without Docker
```bash
cd app && npm ci
node dev/mock-server.mjs &                 # fake Matrix + bridges on :8008
PAGER_SERVER=http://localhost:8008 npm run dev
cd ../api && npm ci && npm test
```

## Notes
- WhatsApp, Instagram and similar networks don't officially support third-party clients.
- Bridges: WhatsApp, Signal, Discord, Google Messages, Instagram and Messenger are on by default. Telegram needs an API key
  from https://my.telegram.org: add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` to `server/.env` and re-run `setup.sh`.
  Instagram, Messenger, Google Messages and Telegram bridge setups are written from the docs but never run.
- The web app is installable on phones (Add to Home Screen) and shows browser notifications while open.
- Not yet built: true background push (needs Sygnal/UnifiedPush plus a native app), native Android/iOS apps, reactions and replies.
