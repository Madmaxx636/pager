import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { BRIDGED, Bridge, dmConversationId, geoParts, stripReplyFallback } from "../src/bridge.ts";
import { Store } from "../src/store.ts";
import { MatrixAS } from "../src/matrix.ts";
import { GroupMe } from "../src/groupme.ts";
import { PushClient } from "../src/push.ts";
import { createBridgeServer } from "../src/server.ts";
import { FakeGroupMe, FakeMatrix, testConfig } from "./fakes.ts";

const ME = "@me:test.local";
let gm: FakeGroupMe, mx: FakeMatrix, store: Store, bridge: Bridge, cfg: ReturnType<typeof testConfig>, matrix: MatrixAS;

before(async () => { gm = new FakeGroupMe(); mx = new FakeMatrix(); await gm.start(); await mx.start(); });
after(() => { gm.stop(); mx.stop(); });
beforeEach(() => {
  mx.rooms.length = 0; mx.registered.clear(); mx.profiles = {}; mx.redactions.length = 0; mx.failImpersonating = false;
  gm.sent.length = 0; gm.deleted.length = 0; gm.unauthorized = false; gm.pushQueue.length = 0;
  gm.groupMessages.splice(3); gm.directMessages.splice(2); gm.groups.splice(1); gm.groups[0].messages.last_message_id = "1003";
  cfg = testConfig(gm, mx);
  store = new Store(null); matrix = new MatrixAS(cfg);
  bridge = new Bridge(cfg, store, matrix, (t) => new GroupMe(cfg, t), (l, onEvent, onState) => new PushClient(cfg.groupmePush, l.token, l.id, onEvent, onState));
});
const wait = async (cond: () => boolean, ms = 4000) => { const t = Date.now(); while (!cond()) { if (Date.now() - t > ms) throw new Error("timed out waiting"); await new Promise((r) => setTimeout(r, 25)); } };
const room = (n: number) => mx.rooms[n];
const texts = (n: number) => room(n).events.map((e) => e.content.body);

test("small helpers", () => {
  assert.equal(dmConversationId("200", "100"), "100+200");
  assert.equal(dmConversationId("9", "10"), "9+10");
  assert.deepEqual(geoParts("geo:40.7,-74.0"), { lat: "40.7", lng: "-74.0" });
  assert.equal(geoParts("nonsense"), null);
  assert.equal(stripReplyFallback("> <@a:x> old\n\nnew text"), "new text");
  assert.equal(stripReplyFallback("plain"), "plain");
});

test("linking needs a token GroupMe accepts", async () => {
  await assert.rejects(bridge.link(ME, "bad-token"), /did not accept/);
  const l = await bridge.link(ME, "good-token");
  assert.equal(l.id, "100"); assert.equal(store.loginsOf(ME).length, 1);
  await assert.rejects(bridge.link("@other:test.local", "good-token"), /already linked/);
  bridge.stop();
});

test("a new account gets a room per group and chat, with recent messages and the right senders", async () => {
  const l = await bridge.link(ME, "good-token");
  const r = await bridge.syncChats(l);
  assert.deepEqual(r, { groups: 1, chats: 1 });
  assert.equal(mx.rooms.length, 2);
  const g = room(0);
  assert.equal(g.opts.name, "Book club"); assert.equal(g.opts.is_direct, false); assert.deepEqual(g.opts.invite, [ME]);
  const bridgeState = g.opts.initial_state.find((s: any) => s.type === "m.bridge");
  assert.equal(bridgeState.content.protocol.id, "groupme"); assert.equal(bridgeState.content.channel.displayname, "Book club");
  // text, my own text as me, a location from Ann
  assert.deepEqual(texts(0), ["Welcome everyone", "Thanks!", "Cafe"]);
  assert.equal(g.events[0].as, "@groupme_200:test.local"); assert.equal(g.events[1].as, ME);
  assert.equal(g.events[2].content.msgtype, "m.location"); assert.equal(g.events[2].content.geo_uri, "geo:40.7,-74.0");
  assert.equal(g.events[0].ts, "1700000001000"); // old messages keep their real time
  assert.equal(mx.profiles["@groupme_200:test.local"].displayname, "Ann");
  assert.equal(room(1).opts.is_direct, true); assert.deepEqual(texts(1), ["hi there", "hello"]);
  assert.ok(room(1).members.has("@groupme_200:test.local"));
  assert.equal(store.portal("100", "g:7")?.lastMessageId, "1003");
  bridge.stop();
});

test("messages the bridge copied in as the person are never sent back to GroupMe", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const mineCopy = room(0).events.find((e) => e.as === ME)!;
  assert.equal(mineCopy.content[BRIDGED], true);
  // Synapse reports the bridge's own post (made as the person) back to the bridge
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(0).id, event_id: mineCopy.id, content: mineCopy.content }]);
  assert.equal(gm.sent.length, 0);
  bridge.stop();
});

test("syncing twice does not copy anything twice", async () => {
  const l = await bridge.link(ME, "good-token");
  await bridge.syncChats(l); await bridge.syncChats(l);
  assert.equal(mx.rooms.length, 2); assert.equal(room(0).events.length, 3);
  bridge.stop();
});

test("a live message arrives in the right room, once", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const live = { type: "line.create", subject: { id: "1004", created_at: 1_700_000_050, user_id: "200", name: "Ann", text: "live one", group_id: "7", attachments: [] } };
  gm.push(live); gm.push(live);
  await wait(() => texts(0).includes("live one"));
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(texts(0).filter((t) => t === "live one").length, 1);
  assert.equal(room(0).events.at(-1)!.ts, undefined); // live messages are stamped by the server
  bridge.stop();
});

test("a message in a group we have no room for yet creates the room first", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  gm.groups.push({ id: "8", name: "New crew", members: [], messages: { last_message_id: "1100" } });
  gm.push({ type: "line.create", subject: { id: "1100", created_at: 1_700_000_060, user_id: "200", name: "Ann", text: "first!", group_id: "8", attachments: [] } });
  await wait(() => mx.rooms.length === 3 && texts(2).includes("first!"));
  assert.equal(room(2).opts.name, "New crew");
  bridge.stop();
});

test("pictures are copied into Matrix", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  gm.push({ type: "line.create", subject: { id: "1005", created_at: 1_700_000_070, user_id: "200", name: "Ann", text: "look", group_id: "7", attachments: [{ type: "image", url: gm.url("/img/photo.png") }] } });
  await wait(() => room(0).events.some((e) => e.content.msgtype === "m.image"));
  const img = room(0).events.find((e) => e.content.msgtype === "m.image")!;
  assert.match(img.content.url, /^mxc:\/\/test\.local\/up/); assert.equal(img.content.info.mimetype, "image/png");
  bridge.stop();
});

test("a message sent from Matrix goes to GroupMe, and its echo is not copied back", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const before = room(0).events.length;
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(0).id, event_id: "$mine1", content: { msgtype: "m.text", body: "hello from pager" } }]);
  assert.equal(gm.sent.length, 1); assert.equal(gm.sent[0].group, "7"); assert.equal(gm.sent[0].text, "hello from pager"); assert.match(gm.sent[0].source_guid, /^pager-/);
  // GroupMe pushes the same message back with our source_guid: nothing new may appear in the room
  gm.push({ type: "line.create", subject: { id: "5000", created_at: 1_700_000_100, user_id: "100", name: "Me Myself", text: "hello from pager", group_id: "7", source_guid: gm.sent[0].source_guid, attachments: [] } });
  await new Promise((r) => setTimeout(r, 800));
  assert.equal(room(0).events.length, before);
  assert.equal(store.messageFor("$mine1"), "5000");
  bridge.stop();
});

test("direct chats send direct messages, and replies keep their target", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const evOfHi = store.eventFor("2001")!;
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(1).id, event_id: "$r1", content: { msgtype: "m.text", body: "> <@groupme_200:test.local> hi there\n\nyes!", "m.relates_to": { "m.in_reply_to": { event_id: evOfHi } } } }]);
  assert.equal(gm.sent[0].dm, "200"); assert.equal(gm.sent[0].text, "yes!");
  assert.deepEqual(gm.sent[0].attachments, [{ type: "reply", reply_id: "2001", base_reply_id: "2001" }]);
  bridge.stop();
});

test("a Matrix picture is uploaded to GroupMe and attached", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const mxc = await matrix.upload(new Uint8Array([1, 2, 3, 4]), "image/png", "p.png");
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(0).id, event_id: "$img", content: { msgtype: "m.image", body: "p.png", url: mxc, info: { mimetype: "image/png" } } }]);
  assert.equal(gm.uploads.at(-1)!.type, "image/png"); assert.equal(gm.uploads.at(-1)!.size, 4);
  assert.equal(gm.sent[0].attachments[0].type, "image");
  bridge.stop();
});

test("deleting a message in Matrix deletes it in GroupMe", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(0).id, event_id: "$del", content: { msgtype: "m.text", body: "oops" } }]);
  await bridge.handleEvents([{ type: "m.room.redaction", sender: ME, room_id: room(0).id, redacts: "$del", event_id: "$red" }]);
  assert.deepEqual(gm.deleted, ["7/5000"]);
  bridge.stop();
});

test("other people's events, our own events and unknown rooms are ignored", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  await bridge.handleEvents([
    { type: "m.room.message", sender: "@stranger:test.local", room_id: room(0).id, event_id: "$a", content: { msgtype: "m.text", body: "no" } },
    { type: "m.room.message", sender: "@groupme_200:test.local", room_id: room(0).id, event_id: "$b", content: { msgtype: "m.text", body: "no" } },
    { type: "m.room.message", sender: ME, room_id: "!elsewhere:test.local", event_id: "$c", content: { msgtype: "m.text", body: "no" } },
  ]);
  assert.equal(gm.sent.length, 0);
  bridge.stop();
});

test("an edit is not sent, and the person is told", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  const n = room(0).events.length;
  await bridge.handleEvents([{ type: "m.room.message", sender: ME, room_id: room(0).id, event_id: "$e", content: { msgtype: "m.text", body: "* fixed", "m.relates_to": { rel_type: "m.replace", event_id: "$x" } } }]);
  assert.equal(gm.sent.length, 0); assert.match(room(0).events[n].content.body, /can't be edited/);
  bridge.stop();
});

test("if the server won't let us speak as the person, their own messages still arrive", async () => {
  mx.failImpersonating = true;
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  assert.deepEqual(texts(0), ["Welcome everyone", "Thanks!", "Cafe"]);
  assert.equal(room(0).events[1].as, "@groupme_100:test.local");
  bridge.stop();
});

test("catching up fetches only what was missed", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  gm.groupMessages.push({ id: "1010", created_at: 1_700_000_300, user_id: "200", name: "Ann", text: "while you were away", attachments: [] });
  gm.groups[0].messages.last_message_id = "1010";
  await bridge.catchUp(l);
  assert.equal(texts(0).filter((t) => t === "while you were away").length, 1);
  await bridge.catchUp(l);
  assert.equal(texts(0).filter((t) => t === "while you were away").length, 1);
  bridge.stop();
});

test("a rejected token marks the account as needing a new login", async () => {
  const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
  gm.unauthorized = true;
  await assert.rejects(bridge.catchUp(l));
  assert.equal(bridge.stateOf(l.id), "BAD_CREDENTIALS");
  bridge.stop();
});

// ---- The two doors ------------------------------------------------------------------------------------------------

async function withServer(fn: (call: (method: string, path: string, opts?: { token?: string; body?: unknown }) => Promise<{ status: number; data: any }>) => Promise<void>) {
  const server = createBridgeServer(cfg, bridge, store, matrix);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  const port = (server.address() as AddressInfo).port;
  const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, { method, headers: { authorization: `Bearer ${opts.token ?? "prov-secret"}`, "content-type": "application/json" }, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    return { status: res.status, data: await res.json().catch(() => ({})) };
  };
  try { await fn(call); } finally { server.closeAllConnections(); server.close(); bridge.stop(); }
}
const P = (path: string, extra = "") => `/_matrix/provision/v3${path}?user_id=${encodeURIComponent(ME)}${extra}`;

test("provisioning: the same steps Pager's apps already use for every other network", async () => {
  await withServer(async (call) => {
    assert.equal((await call("GET", P("/whoami"), { token: "wrong" })).status, 401);
    assert.deepEqual((await call("GET", P("/whoami"))).data.logins, []);
    const flows = (await call("GET", P("/login/flows"))).data.flows; assert.equal(flows[0].id, "token");
    const start = (await call("POST", P("/login/start/token"), { body: {} })).data;
    assert.equal(start.type, "user_input"); assert.equal(start.user_input.fields[0].id, "token"); assert.equal(start.user_input.fields[0].type, "password");
    const bad = await call("POST", P(`/login/step/${start.login_id}/token/user_input`), { body: { token: "bad-token" } });
    assert.equal(bad.status, 401); assert.match(bad.data.error, /did not accept/);
    const ok = (await call("POST", P(`/login/step/${start.login_id}/token/user_input`), { body: { token: "good-token" } })).data;
    assert.equal(ok.type, "complete"); assert.equal(ok.complete.user_login_id, "100");
    await wait(() => mx.rooms.length === 2);
    const who = (await call("GET", P("/whoami"))).data.logins[0]; assert.equal(who.id, "100"); assert.equal(who.name, "Me Myself");
    const contacts = (await call("GET", P("/contacts"))).data.contacts; assert.deepEqual(contacts.map((c: any) => c.name), ["Ann"]);
    assert.equal((await call("POST", P("/search_users"), { body: { query: "an" } })).data.results.length, 1);
    assert.equal((await call("POST", P("/search_users"), { body: { query: "zzz" } })).data.results.length, 0);
    const dm = (await call("POST", P("/create_dm/200"), { body: {} })).data; assert.equal(dm.dm_room_mxid, room(1).id);
    assert.equal((await call("POST", P("/create_dm/999"), { body: {} })).status, 404);
    assert.equal((await call("POST", P("/logout/100"), { body: {} })).status, 200);
    assert.deepEqual((await call("GET", P("/whoami"))).data.logins, []);
  });
});

test("appservice door: needs Synapse's token, answers fast, and only vouches for our own users", async () => {
  await withServer(async () => {
    const server = createBridgeServer(cfg, bridge, store, matrix);
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
    const port = (server.address() as AddressInfo).port;
    const l = await bridge.link(ME, "good-token"); await bridge.syncChats(l);
    const put = (token: string, txn: string, events: unknown[]) => fetch(`http://127.0.0.1:${port}/_matrix/app/v1/transactions/${txn}`, { method: "PUT", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify({ events }) });
    assert.equal((await put("nope", "t1", [])).status, 403);
    const ev = { type: "m.room.message", sender: ME, room_id: room(0).id, event_id: "$viaAS", content: { msgtype: "m.text", body: "through the door" } };
    assert.equal((await put("hs-secret", "t2", [ev])).status, 200);
    await wait(() => gm.sent.some((s) => s.text === "through the door"));
    assert.equal((await put("hs-secret", "t2", [ev])).status, 200); // Synapse retrying the same transaction
    await new Promise((r) => setTimeout(r, 300));
    assert.equal(gm.sent.filter((s) => s.text === "through the door").length, 1);
    const user = (id: string) => fetch(`http://127.0.0.1:${port}/_matrix/app/v1/users/${encodeURIComponent(id)}`, { headers: { authorization: "Bearer hs-secret" } });
    assert.equal((await user("@groupme_555:test.local")).status, 200);
    assert.equal((await user("@someone:test.local")).status, 404);
    server.closeAllConnections(); server.close();
  });
});
