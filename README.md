# Pager

An open-source, self-hostable unified messenger. One account, all your chats (WhatsApp, Signal, Telegram,
Instagram, Messenger, Discord, SMS/RCS…), running on your own Matrix server with bridges. Think Beeper, but yours.

**Status:** early but working end to end. The server stack has been run against the real Synapse and mautrix images (rootless
Podman): setup, signup, bridge login flows for WhatsApp / Signal / Google Messages / Messenger, link previews and scheduled send all
pass. No real chat account has been linked yet, and the apps are tested against a mock backend plus unit tests.

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

- **Inbox (modelled on Beeper's):** Inbox / Unread / Low priority / Archive tabs; pinned chats as a reorderable circle row; labels as folders;
  filters (Groups, DMs, Drafts, Unanswered, network); multi-select; snooze, remind me, mute (1h/8h/1 week/forever), drafts; swipe actions
  (Android); Minimal or Pro list style; archived chats return on a new message; muted and low-priority chats still notify for @mentions and
  replies; bridge-health banner when a login needs attention; Ctrl/Cmd+K command bar with searchable settings (web/desktop).
- **Conversation:** replies, edits, delete, **reactions with a full emoji picker and customizable quick reactions**, who-reacted, forward, copy,
  star, @mentions, read ticks, typing indicators, "new messages" divider, date separators, infinite history, link previews,
  photos/video/files, **voice messages**, location, **polls**, **GIF search** (your own Giphy/Tenor key), **stickers** (your pack, room packs),
  **contact cards**, formatted text (markdown out, HTML in), large emoji, search with photo/video/link/file filters, scheduled send
  (Synapse delayed events). The + menu offers Photos, Camera, GIF, Stickers, Emoji, File, Poll, Contact and Location.
- **Accounts:** sign-up and bridge login (QR codes, codes, forms) happen inside the app: no bot chats, no console. Start new chats by contact
  search or phone number.
- **Settings (searchable):** theme (light/dark/AMOLED, 7 accents + Material You on Android), text size, bubble style, wallpapers, avatar
  shape, time format, density, inbox style, default tab, sort order, swipe actions (Android), message grouping, mark-read behavior, enter-to-send,
  markdown, reading and privacy options, auto-download, notification scope/previews/sound/quiet hours/per-network, per-network visibility,
  labels, stickers and GIF key, app lock + hide-in-recents (Android), rebindable keyboard shortcuts (web/desktop), settings backup/restore,
  developer mode.
- **Android extras:** conversation-style notifications with Reply / Mark-read buttons, share-to-Pager, camera, biometric lock,
  boot-safe reminders, foreground sync service.
- **Desktop extras:** tray icon, native notifications, unread badge, close-to-tray, launch at login.

Not possible through bridges (the networks don't expose them): voice/video calls, stories/status, disappearing-message timers. Contact
merging across networks and pinned messages are not built.
Not built yet: iOS, push through Google/UnifiedPush, encrypted rooms (bridged rooms are plain), polls.

See [DEPLOY.md](DEPLOY.md) for a full server walkthrough.

## Run your own server
Requires Docker (or rootless Podman with `docker-compose`) and, for a real deployment, a domain pointing at the host.
```bash
(cd app && npm ci && npm run build)
cd server
./scripts/setup.sh
docker compose up -d --build
```
Open `https://your-domain/`, sign up with the invite code printed by setup, then connect accounts from the app.

- Bridges on by default: WhatsApp, Signal, Google Messages and Messenger. Opt-in (add to `server/.env`, then re-run `setup.sh`):
  Telegram (`TELEGRAM_API_ID` + `TELEGRAM_API_HASH` from https://my.telegram.org; untested), Discord (`ENABLE_DISCORD=1`; it is a legacy bridge
  whose login API doesn't match, so log in through its bot chat) and Instagram (`ENABLE_INSTAGRAM=1`; no published bridge image was
  available when tested).
- For a local test with a hostname like `localhost` (or an IP), `setup.sh` serves plain HTTP on port 8080 (set `PAGER_ADDRESS` /
  `HTTP_PORT` to change it). Rootless Podman: `ln -s $(which podman) ~/.local/bin/docker`, `systemctl --user enable --now podman.socket`,
  and `export DOCKER_HOST=unix://$XDG_RUNTIME_DIR/podman/podman.sock`. To wipe data, use `podman unshare rm -rf server/data`.
- `setup.sh` also turns on link previews and scheduled messages in Synapse. On an existing install, add these to `homeserver.yaml` yourself
  (`url_preview_enabled`, `url_preview_ip_range_blacklist`, `max_event_delay_duration`, `experimental_features.msc4140_enabled`).
- WhatsApp, Instagram and similar networks don't officially support third-party clients; use at your own risk.

## Get the apps
**Web:** served by your server at `https://your-domain/` (installable on phones: Add to Home Screen).

**Linux desktop:**
```bash
cd desktop && npm ci && npm run dist      # → release/Pager-0.3.0.AppImage and pager-desktop_0.3.0_amd64.deb
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
