# Security

## Reporting a problem
Please report security problems privately, using GitHub's "Report a vulnerability" button on the repository's Security tab, not in a public
issue. Include what you did, what happened, and the version (Settings → About). This is a spare-time project: I will answer as soon as I can.

## How Pager protects your messages
- **Between your devices:** Pager uses Matrix's end-to-end encryption (Olm and Megolm, from the matrix-rust-sdk). Each device has its own
  keys, made on that device. Your server stores only encrypted text for encrypted pages.
- **Recovery key:** your message keys are backed up to your server, encrypted so that only your recovery key opens them. Pager cannot
  recover a lost key. Without it, a new device cannot read older encrypted messages. Save it somewhere safe when the app first asks.
- **Bridges:** to pass a message to WhatsApp, Signal and the rest, a bridge on your server must read it. Bridged pages are encrypted
  between your devices and the bridge, and the bridge's own data (logins, keys, its database) can live in an encrypted vault on your
  server's disk (`server/scripts/vault-setup.sh`). GroupMe pages are not encrypted end to end.
- **Your server:** whoever controls your server and its disk can read what the bridges can read, and can read account details and who
  talks to whom (Synapse's database is not in the vault). Protect the machine, keep it updated, and keep `/etc/pager/vault.key` backed up.
- **Updates:** the desktop app only installs updates whose version information is signed with the project's release key. Android only
  installs updates signed with the same key as the installed app, and checks each download against its checksum.

## What is not protected or not done yet
- No device verification or cross-signing: a new device is trusted through the recovery key, not by comparing codes.
- No protection against a compromised device, malware, or someone who knows your recovery key.
- Unofficial bridges can break or leak if the other service changes how it works.
- This has not had an independent security review.
