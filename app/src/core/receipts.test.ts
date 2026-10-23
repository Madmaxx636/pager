import { describe, expect, it } from "vitest";
import { applySync } from "./reducer";
import { isBridgeBot, readersOf } from "./types";

const me = "@me:x";
const amy = "@amy:x";
const text = (id: string, sender: string, ts: number) => ({ type: "m.room.message", event_id: id, sender, origin_server_ts: ts, content: { msgtype: "m.text", body: id } });

describe("read receipts", () => {
  const sync = { rooms: { join: { "!r:x": {
    timeline: { events: [text("$1", me, 1000), text("$2", me, 2000), text("$3", amy, 3000)] },
    ephemeral: { events: [{ type: "m.receipt", content: { $2: { "m.read": { [amy]: { ts: 5000 } } } } }] },
  } } } };
  const chat = applySync({}, sync, me, true).chats["!r:x"];

  it("reports who read a message and when", () => {
    expect(readersOf(chat, "$1", me)).toEqual([{ user: amy, ts: 5000 }]);
    expect(readersOf(chat, "$2", me)).toEqual([{ user: amy, ts: 5000 }]);
  });
  it("does not count messages after the receipt", () => {
    expect(readersOf(chat, "$3", amy)).toEqual([]);
    expect(readersOf(chat, "$3", me)).toEqual([]);
  });
});

describe("bridge bot receipts", () => {
  it("are delivery, not read", () => {
    expect(isBridgeBot("@signalbot:x")).toBe(true);
    expect(isBridgeBot("@whatsapp_123:x")).toBe(false);
    expect(isBridgeBot("@abbot:x")).toBe(false);
    const sync = { rooms: { join: { "!r:x": { timeline: { events: [text("$1", me, 1000)] },
      ephemeral: { events: [{ type: "m.receipt", content: { $1: { "m.read": { "@signalbot:x": { ts: 5000 } } } } }] } } } } };
    expect(readersOf(applySync({}, sync, me, true).chats["!r:x"], "$1", me)).toEqual([]);
  });
});


describe("delivery reports from the bridge", () => {
  const sync = (events: unknown[]) => ({ rooms: { join: { "!r:s": { timeline: { events } } } } });
  const ev = (type: string, id: string, content: unknown) => ({ type, event_id: id, sender: "@gmessagesbot:s", origin_server_ts: 1, content });
  it("remembers who a message was delivered to, and that the bridge reports deliveries", () => {
    const r = applySync({}, sync([
      { type: "m.room.message", event_id: "$m", sender: "@me:s", origin_server_ts: 1, content: { msgtype: "m.text", body: "hi" } },
      ev("com.beeper.message_send_status", "$s", { "m.relates_to": { rel_type: "m.reference", event_id: "$m" }, status: "SUCCESS", delivered_to: ["@them:s"] }),
    ]), "@me:s", true);
    const chat = r.chats["!r:s"];
    expect(chat.statusSeen).toBe(true);
    expect(chat.deliveredTo).toEqual({ "$m": ["@them:s"] });
  });
  it("a success without delivered_to still marks the chat as reporting", () => {
    const r = applySync({}, sync([ev("com.beeper.message_send_status", "$s", { "m.relates_to": { event_id: "$m" }, status: "SUCCESS" })]), "@me:s", true);
    expect(r.chats["!r:s"].statusSeen).toBe(true); expect(r.chats["!r:s"].deliveredTo).toEqual({});
  });
});
