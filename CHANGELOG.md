# Changelog

What changed for the people using Pager, newest first. The phone, desktop and native apps are released separately and only when something in them changed, so their version numbers differ; each entry says which apps it is for. Checksums (SHA-256) for every file are listed in the GitHub release called "updates", next to the files.

Versions before 0.5.84 are in the git history.

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
