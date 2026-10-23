# Pager, native (Qt + Rust)

A native Pager app that uses no web page and no Chromium: the screens are Qt 6 / QML, and the chat engine is Rust (matrix-sdk, with end-to-end encryption) behind a small C interface.

| Part | Where |
|---|---|
| Engine (sign-in, sync, encryption, sending, key restore, files, polls, server calls, updates) | `core/` (`src/lib.rs`, header `include/pager_core.h`) |
| What the app knows about chats | `src/store.*`, `src/models.*` |
| Glue between engine and screens | `src/engine.*` |
| Screens | `qml/*.qml` |
| Looks, emoji, settings, tray, self-update | `src/appearance.*`, `src/emoji.*`, `src/prefs.h`, `src/main.cpp`, `src/selfupdate.*` |

## Build and run on Linux
```bash
desktop-native/build-core.sh                                  # the engine, built inside a Rust container (nothing to install)
cmake -S desktop-native -B desktop-native/build -G Ninja && cmake --build desktop-native/build
desktop-native/build/pager-native --demo                      # made-up chats, no server needed
desktop-native/install-local.sh                               # installs for your user (no sudo)
```
Needs Qt 6.4+ (Quick, Controls, Widgets) and cmake/ninja.

## Tests
`desktop-native/tests/run-all.sh` runs everything. The engine tests that sign in need a throwaway homeserver (a plain Synapse in a container with rate limits off); they never touch your real server.

## Release
* Linux: `desktop-native/package.sh` makes `dist/pager-native-<version>-linux-x64.tar.gz`. Installed copies update themselves from it.
* Windows (built on Linux with MinGW inside throwaway containers): `windows/build-core.sh`, `windows/build-app.sh`(which also stages the files), `windows/package.sh` -> `dist/pager-native-setup-<version>.exe`. `windows/smoke.sh` starts it under Wine for a screenshot and `windows/installer-test.sh` checks install and uninstall under Wine.
* Publish with `scripts/release-native.sh <version> "notes"` (adds a `native` / `nativeWindows` entry to the signed update list without touching the other apps).

Remove the build containers when you are done: `docker rmi pager-native-win pager-native-winwine pager-native-wincore rust:1-bookworm`.
