# End-to-end tests

The real web app (`app/dist`, the same files the desktop app bundles) against a throwaway Synapse in a container and the real Pager API, with fake chats that look
like what the bridges make (WhatsApp, Signal, SMS, Messenger, a group, a Pager team room). Nothing here touches a real Pager server.

```bash
cd app && npm ci && npm run build          # the web app, once and after changes
cd ../e2e && npm install                   # Playwright
npx playwright install chromium            # the headless browser (on a Linux release Playwright does not list yet, the config picks the Ubuntu 24.04 build)
npm test                                   # fresh data, start the stack, seed, run the tests (about a minute)
```

- `npm run up` / `seed` / `down` / `reset` run the stack by hand: sign in at http://127.0.0.1:18081 as `alice` / `pw-alice` (everyone's password is `pw-<name>`).
  `E2E_KEEP=1 npm test` keeps the data from the last run instead of starting fresh.
- Screenshots of the screens the tests pass through are saved in `e2e/shots/` (full size, so a layout can be looked at).
- Needs docker or podman (the Synapse image is the pinned one from `server/docker-compose.yml`), and Node 22.
- A test that opens a chat marks it read, so each run starts from fresh data; tests that count unread use chats no other test opens.
- Not covered yet: the phone app (no emulator here), bridges themselves, calls, and the desktop shell (Electron).

## The test bench (the real desktop app)

`bench.mjs` runs the actual Electron app (a separate profile; a Pager window opens on this desktop for a few minutes) against a test server that has months of chats,
while `bridge-sim.mjs` sends into the open chat what a bridge sends: every kind of message, replies, edits, deletions, reactions, typing, read receipts, delivery
reports, connection drops and the window going to the tray. Every painted frame of the message list is recorded together with what the page changed in that frame, and a
frame in which a message you can see slides down (the page "snaps up") is reported with its cause.

```
node stack.mjs up && HISTORY_SCALE=0.3 node stack.mjs history      # once: the test server with history (about a minute)
node bench.mjs                                                     # everything; or a few: node bench.mjs basics,media,reconnect
```

Phases: `basics` (text), `media` (pictures, videos, voice, music, files, location), `extras` (reactions, edits, deletions, typing, receipts, replies), `window` (tray,
minimised, behind another window), `reconnect` (connection drops while messages wait), `mixed` (bursts), `reading` (nothing may move while you read higher up),
`probe` (dumps one video message's structure). Needs the Electron binary (`node desktop/node_modules/electron/install.js`) and a display.

**An encrypted chat:** `BENCH_ENCRYPTED=1 node --import ../api/node_modules/tsx/dist/loader.mjs bench.mjs` makes a chat whose other side is a real encrypting device (`encrypted-sim.mjs`, using the app's own encryption code), so the app has to decrypt what arrives, with the keys delivered separately.

