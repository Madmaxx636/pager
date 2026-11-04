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
