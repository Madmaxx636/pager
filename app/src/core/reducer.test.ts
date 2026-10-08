import { describe, expect, it } from "vitest";
import { applyHistory, applySync, parseMuted, stripReplyFallback } from "./reducer";
import { ChatState, STATUS_SENDING, displayName, isBotRoom, previewOf } from "./types";
import { inQuietHours, DEFAULTS } from "./settings";

const me = "@me:pager.test";
const mom = "@wa_mom:pager.test";
const first = {
  rooms: {
    join: {
      "!a:x": {
        state: { events: [
          { type: "m.room.name", state_key: "", content: { name: "Mom" } },
          { type: "m.bridge", state_key: "bridge-whatsapp", content: { protocol: { id: "whatsapp" } } },
          { type: "m.room.member", state_key: me, content: { membership: "join", displayname: "Me" } },
          { type: "m.room.member", state_key: mom, content: { membership: "join", displayname: "Mom" } },
        ] },
        timeline: { events: [
          { type: "m.room.message", event_id: "$1", sender: mom, origin_server_ts: 1000, content: { msgtype: "m.text", body: "Coming Sunday?" } },
          { type: "m.room.message", event_id: "$2", sender: me, origin_server_ts: 2000, content: { msgtype: "m.text", body: "Yes!" } },
        ] },
        unread_notifications: { notification_count: 1 },
        summary: { "m.joined_member_count": 2 },
      },
      "!bot:x": { state: { events: [
        { type: "m.room.member", state_key: me, content: { membership: "join" } },
        { type: "m.room.member", state_key: "@whatsappbot:pager.test", content: { membership: "join" } },
      ] }, timeline: { events: [] } },
    },
    invite: { "!inv:x": {} },
  },
};
const base = () => applySync({}, first, me, true).chats;
const join = (events: unknown[], extra: object = {}) => ({ rooms: { join: { "!a:x": { timeline: { events, ...extra } } } } });
const text = (id: string, who: string, ts: number, body: string) => ({ type: "m.room.message", event_id: id, sender: who, origin_server_ts: ts, content: { msgtype: "m.text", body } });

describe("applySync", () => {
  it("parses names, networks, messages, unread and invites", () => {
    const r = applySync({}, first, me, true);
    const c = r.chats["!a:x"];
    expect(c.name).toBe("Mom"); expect(c.network).toBe("whatsapp"); expect(c.unread).toBe(1);
    expect(c.messages.map((m) => m.body)).toEqual(["Coming Sunday?", "Yes!"]);
    expect(r.invites).toEqual(["!inv:x"]); expect(r.incoming).toEqual([]);
  });
  it("hides bridge bot rooms", () => {
    const c = base();
    expect(isBotRoom(c["!bot:x"], me)).toBe(true); expect(isBotRoom(c["!a:x"], me)).toBe(false);
  });
  it("notifies only for others' new messages and dedupes", () => {
    const r = applySync(base(), join([text("$2", me, 2000, "Yes!"), text("$3", mom, 3000, "Great")]), me, false);
    expect(r.chats["!a:x"].messages).toHaveLength(3);
    expect(r.incoming.map((i) => i.text)).toEqual(["Great"]);
    expect(r.incoming[0]).toMatchObject({ chat: "Mom", sender: "Mom", network: "whatsapp", isGroup: false });
  });
  it("aggregates and removes reactions", () => {
    const withR = applySync(base(), join([
      { type: "m.reaction", event_id: "$r1", sender: mom, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$1", key: "👍" } } },
      { type: "m.reaction", event_id: "$r2", sender: me, content: { "m.relates_to": { rel_type: "m.annotation", event_id: "$1", key: "👍" } } },
    ]), me, false).chats;
    expect(withR["!a:x"].reactions["$1"]["👍"]).toEqual([mom, me]);
    const removed = applySync(withR, join([{ type: "m.room.redaction", event_id: "$x", sender: me, redacts: "$r2", content: {} }]), me, false).chats;
    expect(removed["!a:x"].reactions["$1"]["👍"]).toEqual([mom]);
  });
  it("applies edits only from the original sender", () => {
    const msgs = applySync(base(), join([
      { type: "m.room.message", event_id: "$e1", sender: mom, origin_server_ts: 5000, content: { msgtype: "m.text", body: "* Saturday?", "m.new_content": { msgtype: "m.text", body: "Saturday?" }, "m.relates_to": { rel_type: "m.replace", event_id: "$1" } } },
      { type: "m.room.message", event_id: "$e2", sender: me, origin_server_ts: 6000, content: { msgtype: "m.text", body: "* hacked", "m.new_content": { msgtype: "m.text", body: "hacked" }, "m.relates_to": { rel_type: "m.replace", event_id: "$1" } } },
    ]), me, false).chats["!a:x"].messages;
    expect(msgs.find((m) => m.id === "$1")).toMatchObject({ body: "Saturday?", edited: true });
  });
  it("removes redacted messages and skips empty-content events", () => {
    const c = applySync(base(), join([{ type: "m.room.redaction", event_id: "$x", sender: mom, redacts: "$1", content: {} }, { type: "m.room.message", event_id: "$g", sender: mom, origin_server_ts: 9, content: {} }]), me, false).chats["!a:x"];
    expect(c.messages.map((m) => m.id)).toEqual(["$2"]);
  });
  it("links replies and strips quoted fallbacks", () => {
    const m = applySync(base(), join([{ type: "m.room.message", event_id: "$re", sender: mom, origin_server_ts: 7000, content: { msgtype: "m.text", body: `> <${me}> Yes!\n\nGreat`, "m.relates_to": { "m.in_reply_to": { event_id: "$2" } } } }]), me, false).chats["!a:x"].messages.at(-1)!;
    expect(m.replyTo).toBe("$2"); expect(m.body).toBe("Great");
    expect(stripReplyFallback("plain")).toBe("plain");
  });
  it("replaces the local echo with the server event", () => {
    const b = base();
    const withLocal = { "!a:x": { ...b["!a:x"], messages: [...b["!a:x"].messages, { id: "local-t1", sender: me, ts: 3000, type: "m.text", body: "hi", txn: "t1", status: STATUS_SENDING, mentions: [] }] } } as Record<string, ChatState>;
    const r = applySync(withLocal, join([{ type: "m.room.message", event_id: "$real", sender: me, origin_server_ts: 3001, unsigned: { transaction_id: "t1" }, content: { msgtype: "m.text", body: "hi" } }]), me, false);
    expect(r.chats["!a:x"].messages.map((m) => m.id)).toEqual(["$1", "$2", "$real"]);
  });
  it("starts the timeline over on a gap", () => {
    const c = applySync(base(), join([text("$9", mom, 9000, "after gap")], { limited: true, prev_batch: "gap1" }), me, false).chats["!a:x"];
    expect(c.messages.map((m) => m.body)).toEqual(["after gap"]); expect(c.prevBatch).toBe("gap1");
  });
  it("reads tags, marked-unread, receipts, typing and muted rooms", () => {
    const sync = { rooms: { join: { "!a:x": {
      ephemeral: { events: [{ type: "m.typing", content: { user_ids: [mom, me] } }, { type: "m.receipt", content: { "$2": { "m.read": { [mom]: { ts: 1 } } } } }] },
      account_data: { events: [{ type: "m.tag", content: { tags: { "m.favourite": {}, "u.archived": {} } } }, { type: "m.marked_unread", content: { unread: true } }] },
    } } }, account_data: { events: [{ type: "m.push_rules", content: { global: { override: [{ rule_id: "!a:x", enabled: true, actions: [], conditions: [{ kind: "event_match", key: "room_id", pattern: "!a:x" }] }] } } }] } };
    const r = applySync(base(), sync, me, false);
    const c = r.chats["!a:x"];
    expect(c.typing).toEqual([mom]); expect(c.receipts[mom]).toBe("$2"); expect(c.tags).toEqual(["m.favourite", "u.archived"]); expect(c.markedUnread).toBe(true);
    expect(r.muted).toEqual(["!a:x"]);
    expect(parseMuted({ content: { global: { override: [{ rule_id: ".m.rule.master", enabled: false, actions: [], conditions: [] }] } } })).toEqual([]);
  });
  it("parses stickers, locations, emotes and voice messages", () => {
    const msgs = applySync(base(), join([
      { type: "m.sticker", event_id: "$s", sender: mom, origin_server_ts: 1, content: { body: "wave", url: "mxc://x/s", info: { w: 128, h: 128 } } },
      { type: "m.room.message", event_id: "$l", sender: mom, origin_server_ts: 2, content: { msgtype: "m.location", body: "Here", geo_uri: "geo:51.5,-0.12" } },
      { type: "m.room.message", event_id: "$v", sender: mom, origin_server_ts: 4, content: { msgtype: "m.audio", body: "v", url: "mxc://x/v", info: { duration: 9000 }, "org.matrix.msc3245.voice": {} } },
    ]), me, false).chats["!a:x"].messages;
    expect(msgs[0]).toMatchObject({ sticker: true, type: "m.image" }); expect(previewOf(msgs[1])).toBe("Location");
    expect(msgs[2]).toMatchObject({ voice: true, durationMs: 9000 }); expect(previewOf(msgs[2])).toBe("Voice message");
  });
  it("flags mentions and group chats for notifications", () => {
    const g = applySync({}, { rooms: { join: { "!g:x": { state: { events: [{ type: "m.room.name", state_key: "", content: { name: "Trip" } }] }, summary: { "m.joined_member_count": 4 }, timeline: { events: [] } } } } }, me, true).chats;
    const r = applySync(g, { rooms: { join: { "!g:x": { timeline: { events: [
      { type: "m.room.message", event_id: "$1", sender: "@a:x", origin_server_ts: 1, content: { msgtype: "m.text", body: "hey", "m.mentions": { user_ids: [me] } } },
      { type: "m.room.message", event_id: "$2", sender: "@a:x", origin_server_ts: 2, content: { msgtype: "m.text", body: "unrelated" } },
    ] } } } } }, me, false);
    expect(r.incoming.map((i) => i.mentioned)).toEqual([true, false]); expect(r.incoming.every((i) => i.isGroup)).toBe(true);
  });
});

describe("history and helpers", () => {
  it("prepends older messages and tracks the start of the room", () => {
    const chunk = [text("$0b", mom, 400, "second oldest"), text("$0a", mom, 300, "oldest")];
    const more = applyHistory(base()["!a:x"], chunk, "tok2");
    expect(more.messages.map((m) => m.body)).toEqual(["oldest", "second oldest", "Coming Sunday?", "Yes!"]);
    expect(more.prevBatch).toBe("tok2"); expect(more.reachedStart).toBe(false);
    expect(applyHistory(more, [], undefined).reachedStart).toBe(true);
  });
  it("falls back to the other person for unnamed DMs", () => {
    const c = applySync({}, { rooms: { join: { "!d:x": { state: { events: [{ type: "m.room.member", state_key: me, content: { membership: "join" } }, { type: "m.room.member", state_key: "@sg_alex:x", content: { membership: "join", displayname: "Alex Rivera" } }] } } } } }, me, true).chats["!d:x"];
    expect(displayName(c, me)).toBe("Alex Rivera");
  });
  it("handles quiet hours that wrap midnight", () => {
    const s = { ...DEFAULTS, quietHoursEnabled: true, quietStartMin: 22 * 60, quietEndMin: 7 * 60 };
    expect(inQuietHours(s, 23 * 60)).toBe(true); expect(inQuietHours(s, 3 * 60)).toBe(true); expect(inQuietHours(s, 12 * 60)).toBe(false);
    expect(inQuietHours({ ...s, quietHoursEnabled: false }, 23 * 60)).toBe(false);
  });
});
