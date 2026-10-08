# Pager

An open-source, self-hostable unified messenger. One account, all your chats, running on your own
Matrix server with bridges. Think Beeper, but yours.

**Status:** early. The API and web app are tested against mocks (`api` has a test suite, `app` has a mock backend).
The Docker stack in `server/` has **not** been run against real bridges yet, so expect config fixes on first run.

## Layout
- `server/` – Synapse + Postgres + Caddy + mautrix bridges (docker compose)
- `api/` – signup (invite codes) and in-app bridge login, proxied to the bridges' provisioning API
- `app/` – the Pager web client (React + matrix-js-sdk)
- `android/` – the native Android app (Kotlin + Jetpack Compose)

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

## Android app
Needs a JDK 17+ with `javac` and the Android SDK (`android/local.properties` with `sdk.dir=...`).
```bash
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug   # APK: app/build/outputs/apk/debug/
```
Sign in with your server's address, then use **＋ Add** to connect accounts (QR codes render natively).
A foreground service keeps syncing and posts message notifications while the app is closed.
Not yet in the Android app: photos/files inline (shown as placeholders), sending media, older-history paging.

## Notes
- WhatsApp, Instagram and similar networks don't officially support third-party clients.
- Bridges: WhatsApp, Signal, Discord, Google Messages, Instagram and Messenger are on by default. Telegram needs an API key
  from https://my.telegram.org: add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` to `server/.env` and re-run `setup.sh`.
  Instagram, Messenger, Google Messages and Telegram bridge setups are written from the docs but never run.
- The web app is installable on phones (Add to Home Screen) and shows browser notifications while open.
- Not yet built: push through Google/UnifiedPush (Android uses a foreground sync service instead), iOS, reactions and replies.
