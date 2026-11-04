// Fills the test server with fake chats that look like what the bridges make: bridge state events (so each chat has a network), "ghost" users for the
// other side, a few messages each way, some unread. Everyone's password is pw-<name>. Safe to run again: it does nothing if already seeded.
import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { DOMAIN, PORTS, register } from "./lib.mjs";

const base = `http://127.0.0.1:${PORTS.synapse}`;
const marker = resolve(import.meta.dirname, ".state/seeded");
const id = (u) => `@${u}:${DOMAIN}`;
const tokens = {};

async function api(token, method, path, body) {
  const res = await fetch(base + "/_matrix/client/v3" + path, { method, headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const json = await res.json();
  if (!res.ok) throw new Error(`${method} ${path}: ${JSON.stringify(json)}`);
  return json;
}
async function login(user) {
  if (tokens[user]) return tokens[user];
  return (tokens[user] = (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user }, password: `pw-${user.replace(/^(whatsapp|signal|gmessages|messenger)_.*$/, "$&")}` })).access_token);
}
let txn = 0;
const say = async (user, room, body, extra = {}) => (await api(await login(user), "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/seed${Date.now()}-${txn++}`, { msgtype: "m.text", body, ...extra })).event_id;
const react = async (user, room, event, key) => api(await login(user), "PUT", `/rooms/${encodeURIComponent(room)}/send/m.reaction/seed${Date.now()}-${txn++}`, { "m.relates_to": { rel_type: "m.annotation", event_id: event, key } });
const read = async (user, room, event) => api(await login(user), "POST", `/rooms/${encodeURIComponent(room)}/receipt/m.read/${encodeURIComponent(event)}`, {});

/** A chat the way a bridge makes it: a room for you and the other person's ghost, tagged with the network. */
async function chat({ network, name, ghosts, group = false, encrypted = false }) {
  const alice = await login("alice");
  const bridge = { type: "uk.half-shot.bridge", state_key: `org.matrix.test://${network}/${name}`, content: { protocol: { id: network, displayname: network }, channel: { id: name, displayname: name }, "com.beeper.room_type": group ? "group" : "dm" } };
  const initial = [bridge, ...(encrypted ? [{ type: "m.room.encryption", state_key: "", content: { algorithm: "m.megolm.v1.aes-sha2" } }] : [])];
  const { room_id } = await api(alice, "POST", "/createRoom", { name, is_direct: !group, preset: "private_chat", invite: ghosts.map(id), initial_state: initial });
  for (const g of ghosts) await api(await login(g), "POST", `/join/${encodeURIComponent(room_id)}`, {});
  return room_id;
}

async function ghost(user, displayname) {
  await register(user, `pw-${user}`, false, displayname);
  tokens[user] = (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user }, password: `pw-${user}` })).access_token;
}

export async function seed() {
  if (existsSync(marker)) { console.log("already seeded"); return; }
  for (const [u, n] of [["bob", "Bob"], ["carol", "Carol"]]) await register(u, `pw-${u}`, false, n);
  await register("alice", "pw-alice", true, "Alice");
  tokens.alice = (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user: "alice" }, password: "pw-alice" })).access_token;
  tokens.bob = (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user: "bob" }, password: "pw-bob" })).access_token;
  tokens.carol = (await api(null, "POST", "/login", { type: "m.login.password", identifier: { type: "m.id.user", user: "carol" }, password: "pw-carol" })).access_token;
  await ghost("whatsapp_15551234567", "Sam Carter (WA)");
  await ghost("whatsapp_15553334444", "Riley Park (WA)");
  await ghost("signal_8d1f2c4e-1111-2222-3333-444455556666", "Jordan Lee");
  await ghost("gmessages_15557778888", "+1 (555) 777-8888");
  await ghost("messenger_1000123456789", "Alex Kim");
  await ghost("whatsapp_15554440000", "Dana Brooks (WA)");
  await ghost("gmessages_15559990000", "Dana Brooks");

  // WhatsApp, one to one: a short back and forth, two unread.
  const wa = await chat({ network: "whatsapp", name: "Sam Carter", ghosts: ["whatsapp_15551234567"] });
  const m1 = await say("whatsapp_15551234567", wa, "Hey! Are you still coming on Saturday?");
  await say("alice", wa, "Yes, I'll bring the chairs");
  const m2 = await say("whatsapp_15551234567", wa, "Perfect. Can you also pick up ice?");
  await react("alice", wa, m2, "👍");
  await read("alice", wa, m2);
  await say("whatsapp_15551234567", wa, "Thanks!! See you at 4");
  await say("whatsapp_15551234567", wa, "Also, bring the speaker if you can 🎶");
  // Signal.
  const sg = await chat({ network: "signal", name: "Jordan Lee", ghosts: ["signal_8d1f2c4e-1111-2222-3333-444455556666"] });
  const s1 = await say("signal_8d1f2c4e-1111-2222-3333-444455556666", sg, "Did you get the documents I sent?");
  await read("alice", sg, s1);
  await say("alice", sg, "Got them, thanks. I'll sign tonight.");
  await say("signal_8d1f2c4e-1111-2222-3333-444455556666", sg, "Great, no rush.");
  // SMS from a number with no name.
  const sms = await chat({ network: "gmessages", name: "+1 (555) 777-8888", ghosts: ["gmessages_15557778888"] });
  await say("gmessages_15557778888", sms, "Your package was delivered to the front door.");
  // Messenger.
  const ms = await chat({ network: "messenger", name: "Alex Kim", ghosts: ["messenger_1000123456789"] });
  const a1 = await say("messenger_1000123456789", ms, "lol did you see this");
  await read("alice", ms, a1);
  // The same person on two networks (a contact with two numbers and two accounts): the app offers to show them as one page.
  const dwa = await chat({ network: "whatsapp", name: "Dana Brooks", ghosts: ["whatsapp_15554440000"] });
  await say("whatsapp_15554440000", dwa, "Dinner at 7?");
  const dsms = await chat({ network: "gmessages", name: "Dana Brooks", ghosts: ["gmessages_15559990000"] });
  await say("gmessages_15559990000", dsms, "Running a little late");
  // A WhatsApp group with two other people.
  const grp = await chat({ network: "whatsapp", name: "Weekend plans", group: true, ghosts: ["whatsapp_15551234567", "whatsapp_15553334444"] });
  await say("whatsapp_15551234567", grp, "Who's bringing what?");
  await say("whatsapp_15553334444", grp, "I can do drinks");
  const g3 = await say("alice", grp, "Chairs and a tent");
  await read("alice", grp, g3);
  await say("whatsapp_15551234567", grp, "Great. Weather looks good too");
  // A chat between Pager users (no bridge), encrypted off.
  const alice = tokens.alice;
  const { room_id: team } = await api(alice, "POST", "/createRoom", { name: "Pager team", preset: "private_chat", invite: [id("bob"), id("carol")] });
  for (const u of ["bob", "carol"]) await api(tokens[u], "POST", `/join/${encodeURIComponent(team)}`, {});
  await say("bob", team, "Release notes are up for review");
  const t2 = await say("carol", team, "Looks good to me");
  await read("alice", team, t2);
  writeFileSync(marker, new Date().toISOString());
  console.log("seeded: alice (pw-alice) has chats on WhatsApp, Signal, SMS, Messenger, one person on two networks, a group, and a Pager team room");
}
