# Pager

An open-source, self-hostable unified messenger. One account, all your chats (WhatsApp, Signal, Telegram,
Instagram, Messenger, Discord, SMS/RCS…), running on your own Matrix server with bridges. Think Beeper, but yours.

**Status:** early. The API, web app, desktop app and Android app are tested against mocks and unit tests.
The Docker stack in `server/` has **not** been run against real bridges yet, so expect config fixes on first run.

## What's here
| Folder | What it is |
|---|---|
| `server/` | Synapse + Postgres + Caddy + mautrix bridges (docker compose) and a setup script |
| `api/` | Signup (invite codes) and in-app bridge login/contacts, proxied to the bridges' provisioning API |
| `app/` | The web client (React + TypeScript). Also the UI of the desktop app |
| `desktop/` | Linux desktop app (Electron around the web client). macOS/Windows builds are configured, not yet tested |
| `android/` | Native Android app (Kotlin + Jetpack Compose) |

## Features
Both clients share the same sync engine design (the web one is a port of the Android one, with matching tests).

- **Inbox:** unified list with network badges; filters (Unread, Groups, DMs, Favorites, per network); pin, mute (1h/8h/1 week/forever), archive,
  mark unread, "remind me", drafts; archived chats return on a new message; bridge-health banner when a login needs attention.
- **Conversation:** replies, edits, delete, **reactions with a full emoji picker and customizable quick reactions**, who-reacted, forward, copy,
  star, @mentions, read ticks, typing indicators, "new messages" divider, date separators, infinite history, link previews,
  photos/video/files, **voice messages**, location sharing, stickers, search (all chats or one), scheduled send (Synapse delayed events).
- **Accounts:** sign-up and bridge login (QR codes, codes, forms) happen inside the app: no bot chats, no console. Start new chats by contact
  search or phone number.
- **Settings:** theme (light/dark/AMOLED, 7 accents + Material You on Android), text size, bubble style, wallpapers, time format, density,
  swipe actions (Android), what the chat list shows, sending and privacy options (read receipts, typing), auto-download, notification
  previews/sound/quiet hours/per-network/mentions-only, per-network visibility, app lock + hide-in-recents (Android), storage and reset.
- **Android extras:** conversation-style notifications with Reply / Mark-read buttons, share-to-Pager, camera, biometric lock,
  boot-safe reminders, foreground sync service.
- **Desktop extras:** tray icon, native notifications, unread badge, close-to-tray, launch at login.

Not possible through bridges (the networks don't expose them): voice/video calls, stories/status, disappearing-message timers.
Not built yet: iOS, push through Google/UnifiedPush, encrypted rooms (bridged rooms are plain), polls.

## Run your own server
Requires Docker and a domain pointing at the host.
```bash
(cd app && npm ci && npm run build)
cd server
./scripts/setup.sh
docker compose up -d --build
```
Open `https://your-domain/`, sign up with the invite code printed by setup, then connect accounts from the app.

- Bridges: WhatsApp, Signal, Discord, Google Messages, Instagram and Messenger are on by default. Telegram needs an API key from
  https://my.telegram.org: add `TELEGRAM_API_ID` and `TELEGRAM_API_HASH` to `server/.env` and re-run `setup.sh`.
  Instagram, Messenger, Google Messages and Telegram setups are written from the docs but never run.
- `setup.sh` also turns on link previews and scheduled messages in Synapse. On an existing install, add these to `homeserver.yaml` yourself
  (`url_preview_enabled`, `url_preview_ip_range_blacklist`, `max_event_delay_duration`, `experimental_features.msc4140_enabled`).
- WhatsApp, Instagram and similar networks don't officially support third-party clients; use at your own risk.

## Get the apps
**Web:** served by your server at `https://your-domain/` (installable on phones: Add to Home Screen).

**Linux desktop:**
```bash
cd desktop && npm ci && npm run dist      # → release/Pager-0.2.0.AppImage and pager-desktop_0.2.0_amd64.deb
```
Enter your server address on the sign-in screen. (`npm start` runs it from source after `npm run web`.)

**Android** (JDK 17+ with `javac`, Android SDK in `android/local.properties`):
```bash
cd android
./gradlew :app:testDebugUnitTest :app:assembleDebug       # debug build is slow: Compose debug builds always are
./gradlew :app:assembleRelease -PdebugSign                # fast local trial build (signed with the debug key, allows http://)
```
Use a release build for any real use: it is ~4× smoother. Real releases need your own signing key and require HTTPS.

## Develop without Docker
```bash
cd app && npm ci
node dev/mock-server.mjs &                 # fake Matrix + bridges on :8008 (also reachable from a phone on your Wi-Fi)
PAGER_SERVER=http://localhost:8008 npm run dev
npm test                                   # sync-engine tests
cd ../api && npm ci && npm test            # API tests
cd ../android && ./gradlew :app:testDebugUnitTest
```
The mock accepts any username and password.

## Notes
- The login token is kept in app-private storage on Android and in the browser's localStorage on web/desktop (not encrypted at rest).
- Scheduled send needs a Synapse with delayed events (MSC4140); if it isn't available the app says so.
- Pager does not copy anyone's branding or assets; the name, logo and UI are original.
