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
- Not yet built: Telegram and Instagram/Messenger bridges, push notifications, native mobile apps, sending media.
