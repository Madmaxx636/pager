# Pager's GroupMe bridge

A Matrix bridge for [GroupMe](https://groupme.com), written for Pager from scratch. It uses only GroupMe's public developer API
(dev.groupme.com) and the Matrix appservice specification. No code from other bridges is used.

**What works:** your groups and direct chats appear as pages; history (the latest 20 messages by default) is copied in; live messages
both ways; pictures both ways; places; replies; deleting a message you sent; people show with their GroupMe names and pictures.
If the live connection drops, the bridge catches up by itself every two minutes and when it reconnects.

**Limits, plainly:**
- Pages from this bridge are **not end-to-end encrypted** (unlike WhatsApp, Signal and the other bridges). The bridge can read them,
  as it must to forward them. They are still stored on your own server, in the encrypted vault if you use one.
- GroupMe has no edits, so editing in Pager is not sent. It tells you so.
- Videos and files from GroupMe arrive as links. Only pictures and places are sent from Pager to GroupMe.
- Chats can start with people you share a group with or have messaged before. GroupMe has no address book to search.
- It was tested against a stand-in for GroupMe (and a real Synapse server), not against the live GroupMe service. Live checks need
  someone's own GroupMe account: please report anything that behaves differently.

**Linking:** Settings → Bridges & accounts → GroupMe, then paste your own access token (sign in at dev.groupme.com, choose
*Access Token*). The token is kept in the bridge's data folder, which is inside the encrypted vault when the vault is on.

**Development:** `npm install && npm test` (19 tests with stand-in GroupMe and Matrix servers).
