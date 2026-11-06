# Changelog

What changed for the people using Pager, newest first. The phone, desktop and native apps are released separately and only when something in them changed, so their version numbers differ; each entry says which apps it is for. Checksums (SHA-256) for every file are listed in the GitHub release called "updates", next to the files.

Versions before 0.5.84 are in the git history.

## 0.6.17 (desktop, web)

- **Typing a long message (desktop, web):** as the message box grew with what you typed, the page above it was left behind and the newest message ended up under the box. The page took the resize for you scrolling up, and stopped following the bottom. Now only a scroll you cause (wheel, touch, keys, dragging the scroll bar) can turn that off, so growing the box, pictures loading and similar changes keep you at the bottom. The same reason made the page jump when you scrolled down and began typing.
- **For developers:** two end-to-end tests: a nine-line message typed at the bottom keeps the newest message in view (it failed before this fix, by 108 pixels), and typing after scrolling down does not move the page.

## 0.6.16 (phone, desktop, web)

- **Missing stretches of a conversation (desktop, web, phone):** scrolling up could reach a gap where half a day, or several days, were simply not there. When you scrolled up while the app was catching up after being away, or while it was letting go of old messages to save memory, a page of older messages that was already on its way was attached to the wrong end of the conversation, leaving a hole that nothing ever filled. A page that no longer fits is now dropped and asked for again.
- **Snap-scrolling (desktop, web):** when your own message was the newest in a conversation, any update to it (a delivery mark, a reaction, a sync) pulled the page back down to the bottom while you were reading above. And when older messages loaded, the page could be moved twice, once by the browser and once by Pager, so it jumped. Now the page follows only when you are at the bottom or have just sent something, and only Pager adjusts the position when older messages are added.
- **For developers:** an end-to-end test for reading above while your message is newest and for sending taking you to it (`e2e/tests/scroll.spec.mjs`). It passed before the fix too, because the test server doesn't send the delivery marks that trigger the snap, so it guards against regressions rather than proving this fix.

## 0.6.15 (phone, desktop, web)

- **Master password (phone, web, desktop):** lock a copy of your recovery key with a password you choose (Settings, Privacy, Encryption, Master password). From then on any device can get the key back with that password. On a new device the sign-in screen asks for the master password instead of the key, and your history comes back. A signed-in device can also show the key to copy or save (Settings, Privacy, Encryption, Show recovery key), asking for the master password first when one is set. Only a locked copy is stored on your server; the password must be at least 10 characters, and a long one (four or more random words) keeps it safe if someone ever copies that data. Making a new recovery key removes the master password, since it opened the old key.
- **Restoring from a file on a new device (phone, web, desktop):** the screen that asks for the recovery key now accepts the text file Pager saved the key in (pasted whole or picked as a file), and a key file made with "save keys to a file" plus its passphrase. Before, a key file restored the older messages but left this screen asking for the key without saying why: a key file switches the recovery backup on for nothing, so new messages never reach the device. The screen now says that, and tells you where to enter the key.
- **For developers:** the master password has the same format on every platform (PBKDF2-SHA256, 600,000 rounds, AES-256-GCM); a test checks that the phone opens a copy made by the web app. End-to-end tests for setting it, showing the key, a wrong password and a new device.

## Server (no app update needed), 6 November

- **Updates every night, by themselves:** the nightly maintenance now looks for newer bridge builds every night (it was weekly), so a fix from a bridge project is installed the next night. It also updates the web server (Caddy) and the database (Postgres, same major version) when their image has a newer build, each put back if it does not come up healthy, the database only after a backup less than 24 hours old. A new Synapse series (1.164 to 1.165) is installed once its build is 3 days old; a new major version is still left for you. `./scripts/maintenance.sh --dry-run` shows what it would do without changing anything.
- **The computer's own security updates were not running:** the updater was installed but its setting was 0, so 67 security updates had piled up. The nightly report now reads the real setting and warns in Admin > Logs when it is off. Switch it on with `sudo ./scripts/system-updates.sh --on` (on the server; it needs your password).
- **Signal photos:** Signal changed what its servers require when a bridge uploads an attachment (4 November), which made every photo fail with a 400. The Signal bridge was updated to the build with the fix.
- **Scripts for keeping your keys safe:** `scripts/keys-bundle.sh` puts the project's private keys in one passphrase-locked file to copy somewhere else; `scripts/pull-backups.sh` copies the server's newest backups to your computer (daily with `--install-timer`).

## 0.6.14 (phone, desktop, web)

- **Call button on merged pages (phone, web, desktop):** on a page that shows one person's chats on two networks together, the call button appeared or not depending on which of the chats was open (the one that spoke last decided, and a text-message chat has no way to call on its own). It now offers what all of the person's chats offer together. A contact with two numbers gets a dial option for each. On the phone, the contacts are read as they are now instead of as they were when the page first drew, and the phone's address book is asked for the chat's name directly.
- **Small windows (desktop, web):** at the smallest window size (360 wide) the page list was wider than the window, so the menu button, the times and the unread counts were cut off. Fixed.
- **Logs:** Chrome's harmless "ResizeObserver loop" notice was recorded as a problem in every session, in Settings > Advanced > Logs and in the desktop app's log file. It is now ignored.
- **Send later (desktop, web):** it is for text only, so it is greyed out while files are attached; the tooltip now says so. Sending files always puts the message box back to normal, even if something goes wrong while sending, and the picture previews are let go of. (Reported once on Linux: it stayed off after sending media with text. I could not reproduce it; if it happens again, tell me what was attached.)
- **For developers:** end-to-end tests for window sizes (every main screen at five sizes, in the browser and as the Linux desktop shell), the message box, and merged pages (`e2e/`).

## 0.6.13 (phone, desktop, web)

- **Entering your recovery key on a new device (phone, web, desktop):** the "Restored N message keys" confirmation disappeared the moment the restore finished (the restore itself worked). The screen now stays until you close it.
- **Reminder bar:** it now says "Enter your recovery key to read older messages and save this device's keys", since reading your history is what you want at that moment.
- **For developers:** end-to-end tests for the key flows: a message read live, its key backed up, a second device that shows it locked, a wrong key refused, the right key unlocking it, and signing out and back in as a new device (`e2e/tests/keys.spec.mjs`).

## 0.6.12 (phone, desktop, web)

- **Recovery key of a new account (phone, web, desktop):** the first-run screen made the account's recovery key and then closed itself at once, so the key was never shown. Making the key counts as "backed up", and that closed the screen. A new phone or computer could then not read the history, because nobody had the key. The screen now stays up, shows the key, and cannot be closed until you tick that you saved it; the welcome tour waits for it. **If you made your account on a version before this one and never saw a key, make a new one: Settings, Privacy, Encryption, Recovery key.** It replaces the hidden one, and from then on you hold the key.
- **Signing out warning:** it now says what to do when a backup already exists but this device has not entered its key (enter the key), instead of always saying to set one up.
- **For developers:** `e2e/` has end-to-end tests that run the real web app against a throwaway server with fake chats (see `e2e/README.md`).

## 0.6.11 (phone, desktop, web)

- **Signing out asks first (phone, web, desktop):** it says that signing out removes this device's message keys. If those keys are not backed up with a recovery key, it says so loudly: the messages in your encrypted pages would stay locked for good, even after you sign in again. Before, one tap signed you out and deleted the keys, with no warning.
- **Keys kept when the server ends a sign-in (phone):** when the server stops accepting the phone's sign-in (the device was removed, say), the phone signs out but no longer deletes its encryption keys. They are the only copy for messages that were never backed up. Signing out yourself still removes them, after the warning above.
- **A reminder about the recovery key (phone, web, desktop):** while this device's keys are not backed up, a bar at the top of the page list says so and takes you to the recovery key (or, when a backup already exists, asks you to enter it).

## 0.6.10 (phone, desktop, web)

- **Starting up (phone):** the saved copy of your chats was read on the main thread while the app started. On a slow phone with a lot of chats that could hold the start up long enough for Android to stop the background service ("did not start in time") and close Pager. It is now read in the background, and syncing and saving wait for it.
- **Plain HTTP (phone):** the phone builds allowed unencrypted HTTP to any address. Pager now accepts plain HTTP only for an address on your own network (a home server by its LAN address) and never over the internet, and no longer follows a redirect from HTTPS to HTTP. Servers reached over HTTPS, as yours is, are not affected.
- **Encryption requests (phone, web, desktop):** two of the library's pending requests (a key upload, say) could run at once, send the same request twice and have the server refuse the second ("already exists"). They now run one at a time.
- **Screen readers (phone):** the round icon buttons are announced as buttons.

## 0.6.9 (phone, desktop, web)

- **Call button:** a phone icon in the top bar of a one-to-one chat starts a call with that person in the app that has them. Bridges carry messages, not calls, so Pager hands over to the right app and you do not have to find the person again.
  - WhatsApp and Signal: on the phone, a voice or video call starts at once when the person is in your phone's contacts (those apps add a call entry to the contact; this needs the permission to read your contacts that Pager asks for when you use your phone's contacts on the New page screen). Otherwise it opens their chat in the app, one tap from the call button. On the web and desktop it opens WhatsApp or Signal on their number.
  - Messenger: opens their conversation in Messenger.
  - SMS, Google Voice and any chat with a known number: on a phone, "Call with your phone" opens the dialler.
  - Needs a number Pager can tell: from the bridge's id for the person, a chat named with a number, or one of your own contacts with the same name. Groups get no button.
- **Media cache (phone):** downloaded pictures and files are cleaned every hour while Pager runs and kept under 300 MB, oldest first. Before, they were cleaned only when the app started, and the background service keeps it running for days, so the folder (decrypted copies of encrypted attachments included) only grew.

## 0.6.8 (phone, desktop)

- **Background sync (phone):** every restart of the background service (the watchdog does one every 5 minutes) started another copy of its two checking loops without stopping the old ones, so after a day there were hundreds, each asking the server. A restart now replaces them. This also saves battery and stops the server being asked over and over.
- **Saving your chats (phone):** the saved copy of your chats on the phone was written only after 8 quiet seconds, which a busy chat never gives, so nothing was saved while you were using it. It is now saved at most every 20 seconds.
- **Updates (phone):** after pressing Later, the update question came back each time you returned to the app. The same version is now offered again after a day (Settings > Check for updates always asks).
- **Closed to other apps (phone):** the boot and update receivers can no longer be started by other apps.
- **Uninstalling (Windows):** the uninstaller removes the launch-at-login entry, so Windows no longer tries to start a program that is gone at every login. It stays when Pager is only being updated.

## 0.6.7 (phone, desktop, web)

- **Dropping a file (desktop, web):** a file dropped anywhere except an open chat (the page list, settings) made Pager open that file in place of the app. It is now ignored there. In a chat, the "drop to add" hint no longer sticks after you drag out of the window, and no longer appears when you drag text or reorder pins.
- **Location (desktop):** the Linux app has no location service, so it now says so and points to the phone, instead of "couldn't get your location". Elsewhere the message says where to allow location.
- **Window (desktop):** the window only ever shows Pager's own page; nothing else can replace it.
- **Phone:** no visible change; unused code removed.

## 0.6.6 (desktop, web)

- **Window (desktop):** Windows could save a minimised window's position as off-screen and then open Pager where you could not see it; the window now reopens where it was, on a screen that is still connected, and remembers when it was maximised.
- **Launch at login (Windows):** the switch showed "off" after Pager restarted even though it was on.
- **Unread count (Windows):** the unread number now shows on Pager's taskbar icon.
- **Updates (desktop):** after pressing Later, the automatic check asked again every hour. It now asks about a version once a day (Check for updates in the menu or tray always asks). A full disk or a lost connection during the download is reported instead of leaving the update stuck.
- **Page that keeps crashing (desktop):** Pager reloads a crashed page at most three times a minute instead of for ever.
- **Menu (desktop):** a Pager menu with the version, Check for updates, Show the problem log and Quit.
- **Logs:** on the desktop, Settings > Advanced > Logs also shows the app shell's own log (a page or graphics process that died, a page that stopped answering).
- **Shutdown (Windows):** closing to the tray no longer holds up logging off or shutting down.
- **Notifications (desktop):** clicking one always opens its chat; Electron could drop the notification before the click on some systems.
- **Colours (Linux):** the KDE theme was followed only until the first change, because KDE replaces its colour file instead of editing it; the GNOME accent colour and light or dark choice are now followed live too.
- **Security:** the desktop app moves to Electron 44.10.2, which distrusts the compromised eMudhra certificate authorities (the same change Synapse 1.164 made).

## Server (no app update needed)

- **Nightly maintenance:** `./scripts/maintenance.sh --install` sets up a job that runs every night around 05:15. It restarts a Pager timer or service that stopped, reports a container that is not running, makes a backup if the newest is more than 30 hours old, installs newer bridge versions (one at a time, after a backup less than 36 hours old; a bridge that does not start is put back), installs newer Synapse patch releases (after a backup less than 24 hours old; it goes back if Synapse does not become healthy; bigger steps are left for you), and cleans up old images, build cache and logs. Admin > Logs warns when a job failed or nothing has run for three days.
- **Manual backups are locked:** `pager backup` now uses the same backup key as the nightly backups. A passphrase only with `--passphrase`, an unlocked file only with `--no-encrypt`. Before, a backup started without a terminal (over SSH) was silently left unlocked.
- **Cleaned up:** three scripts that no longer apply are gone (`speed-up-bridges.sh` and `skip-bridge-backlog.sh`, made unnecessary by the shared bridge registration, and `create-bridge-dbs.sh`, which `setup.sh` and `pager restore` replaced); unused phone code and style rules removed; DEPLOY.md now describes the real backup, update and maintenance setup.
- **Log watcher:** no longer makes the database log an error each time it checks a bridge that keeps no encryption data (Discord, Telegram).

## 0.6.5 (phone, desktop, web)

- **Logs:** Settings > Advanced > Logs shows the problems this device ran into (crashes, sync that kept failing, encryption trouble), each with what the app was doing just before and just after, and the latest activity. A repeat is counted, not listed again. It can be copied or saved to a file. It stays on the device, nothing is sent anywhere, and message text, names, keys and tokens are never in it.

## 0.6.4 (phone, desktop, web)

- **Encryption details:** when this device cannot send something its encryption needs (for example the server refusing the device's keys), the problem log now says so. Before, these failures were silent, so "waiting for the keys" had no reason to show.
- **Server (no app update needed):** Admin > Logs now warns when a bridge remembers different keys for one of your devices than the device uploaded (that device would see everything from that bridge as locked), or when a device you use has no keys left to hand out. Checked every 15 minutes.

## 0.6.3 (phone)

- **Contacts (phone):** two of your phones could keep undoing each other's contact names, rewriting the contacts saved in your account every few seconds, all day. A phone now saves its address book only when that address book really changed, and never more than once in ten minutes. This also cuts the database write conflicts the server was logging.

## 0.6.2 (phone, desktop, web)

- **Admin > Logs:** what goes wrong on the server, live. Errors, crashes and things needing attention (a service that stopped or is unhealthy, a full disk, no recent backup) with the lines just before and after each one. Repeats are counted, not listed again; warnings are counted and hidden unless asked for; passwords and tokens are removed before anything is kept. You can copy an entry or dismiss it (it comes back only if it happens again). Needs the log watcher on the server: `./scripts/logwatch.sh --install`.

## 0.6.1 (phone, desktop, web)

- **Older Android phones (8 and 9):** the background sync service could fail to start, and on 8.0 and 8.1 the update check could not read the app's own version. Both are fixed.
- **Nudges and rings (phone):** the vibration was being refused because the app never asked for the permission; it now has it.
- **Android Auto (phone):** only the real Android Auto may connect to Pager's car screen (a test build still accepts any).
- **Maps (web, desktop):** a location message with a broken position no longer opens a map page.
- **Cleaned up:** unused code, imports and resources removed; Android lint now runs in the automatic checks, so new problems of that kind are caught before a release.
- **Server (no app update needed):** the Discord bridge no longer tries to post "can't decrypt" notices into rooms that are not its own (hundreds of refused attempts a day).

## 0.6.0 (phone, desktop, web; native 0.5.15)

- **One contact, one set of notification settings:** a contact's Notifications settings, mute, Low priority and snooze are the same on all of their chats: a second number, the same person on another network, merged or not. The chat's Notifications sheet says when they are shared.
- **Pinned pages show a glance:** when a message arrives on a pinned page while you are in the app, a short look at it appears over the pin's picture for a few seconds (it follows the page's preview setting: the words, only the sender, or "New message").
- **Alert sound in the app (phone):** a message on another page always sounds its alert while you are in Pager, whatever the "Sounds inside a page" switch says. It comes out of the same speaker or Bluetooth as your music and lowers the music for a moment.
- **No more "waiting for the key" alerts:** a message that cannot be read yet makes no alert. It waits for its key and then alerts with its own words; if the key does not come within a minute and a half it alerts as "New message".
- **Never missing a message:**
  - phone: alerts are posted by the app itself instead of being handed to the sync service (a message that came in while the service was restarting could be lost); a short wake lock while an alert is made; sync restarts the moment the network returns, and is checked every 45 seconds; if nothing has come in for 10 minutes while you are online, an alert says so; if the full alert cannot be made, a plain one is shown;
  - web and desktop: sync starts again by itself after sleep, a network change or a stuck connection;
  - native: a stuck sync connection is dropped and started again after 100 seconds instead of five minutes.

## 0.5.99 (phone, desktop, web; native 0.5.14)

- **Pins (web, desktop, phone, native):** a chat you had merged with another one could not be moved in the pin row. The merged row took its place from whichever of the two chats spoke last, even when that one was not pinned. It now takes the place of the pinned chat.

## 0.5.98 (desktop, web)

- **Pins:** you can drag a pin by its picture as well as its name. The browser's own picture drag used to cancel the move.

## 0.5.97 (phone, desktop, native 0.5.13)

- **Pins:** every pin gets its own place in the row when you move one. Before, pins that shared a number (the bridges can set them that way) could not be moved, and archived pins threw the positions off.
- **Updates:** the apps now look for updates on GitHub as well as on your server and take the newer one. A release no longer needs you at home.
- **Updates:** a change that only touches the phone no longer offers an update to the desktop apps, and the other way round.
- **Native 0.5.13:** same pin fix and update source.

## 0.5.95 (phone)

- **Android Auto:** the driving auto-reply and the quick replies work only while the phone is connected to Android Auto.

## 0.5.94 (phone)

- **Android Auto:** a driving auto-reply (one answer per chat every three hours, one-to-one chats only unless you choose otherwise, never muted chats) and ready-made quick replies. Both are set in Settings, Notifications, Android Auto, and in the car under More.

## 0.5.93 (phone)

- **Android Auto:** your chats as a list in the car. Each shows its latest messages, can be read aloud, answered by voice and marked read, and a menu starts a new conversation. Needs "Unknown sources" turned on in Android Auto's developer settings, because this beta feature is not open to the Play Store yet.

## 0.5.92 (phone)

- **Android Auto:** new messages come to the car as notifications that can be read aloud and answered by voice.

## 0.5.91 (phone, desktop, web)

- **Voice messages:** recorded as m4a (AAC) on the phone, and in browsers that can, so every bridge accepts them. The waveform is still sent.

## 0.5.90 (desktop, web, phone)

- **Voice messages:** recordings made in Chrome and the desktop app (WebM) are converted to Ogg/Opus before they are sent, which is what WhatsApp plays. The phone and the web app also send the volume waveform that WhatsApp shows.

## 0.5.89 (phone, desktop, web; native 0.5.12)

- **Encryption:** Settings, Encryption, Encryption details shows the device, the recovery backup, every message that is still locked with the reason, and a log of recent problems. It can be copied or saved to a file.

## 0.5.88 (phone)

- **E-ink:** the clock end of the Send button is shown at full strength while the message box is empty.

## 0.5.86 and 0.5.87 (phone, desktop, web; native 0.5.11)

- **Send and Send later** are one oval that is always shown, with a clock at the smaller end. The clock waits until there is something to send.

## 0.5.85 (phone, desktop, web; native 0.5.10)

- **Send later** has a visible button in every look and every app.
- **Web and desktop:** the + button, the emoji button and the other round buttons next to the message box no longer send what you have typed.

## 0.5.84 (phone, desktop, web)

- **Encryption:** Settings, Encryption says why some messages are locked.

## Native app

- **0.5.12:** Encryption details, as above.
- **0.5.9:** voice messages and files can be sent as replies; a message you sent before one the other side wrote counts as delivered; a page that has just opened stays at the newest message while pictures load.
- **0.5.8:** the Admin page can restart the Pager server.
