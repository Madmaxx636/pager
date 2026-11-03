# Changelog

What changed for the people using Pager, newest first. The phone, desktop and native apps are released separately and only when something in them changed, so their version numbers differ; each entry says which apps it is for. Checksums (SHA-256) for every file are listed in the GitHub release called "updates", next to the files.

Versions before 0.5.84 are in the git history.

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
