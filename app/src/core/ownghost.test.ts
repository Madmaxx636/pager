import { afterEach, describe, expect, it } from "vitest";
import { applyHistory, applySync, setOwnIdentity } from "./reducer";

const me = "@me:pager.test";
const ghost = "@whatsapp_lid-111:pager.test";
const other = "@whatsapp_222:pager.test";
const member = (id: string, name: string) => ({ type: "m.room.member", state_key: id, sender: id, content: { membership: "join", displayname: name } });
const text = (id: string, sender: string, body: string, ts: number) => ({ type: "m.room.message", event_id: id, sender, origin_server_ts: ts, content: { msgtype: "m.text", body } });

afterEach(() => setOwnIdentity([], []));

describe("your own accounts on other networks", () => {
  it("shows messages from your own ghost as sent by you (matched by profile name)", () => {
    setOwnIdentity(["Lane McDonald"], []);
    const sync = { rooms: { join: { "!r:x": {
      state: { events: [member(ghost, "Lane McDonald (WA)"), member(other, "Amy")] },
      timeline: { events: [text("$1", ghost, "hi", 1), text("$2", other, "hello", 2)] },
    } } } };
    const msgs = applySync({}, sync, me, true).chats["!r:x"].messages;
    expect(msgs.map((m) => m.sender)).toEqual([me, other]);
  });

  it("does the same for history pages", () => {
    setOwnIdentity(["Lane McDonald"], []);
    const chat = applySync({}, { rooms: { join: { "!r:x": { state: { events: [] }, timeline: { events: [], prev_batch: "p" } } } } }, me, true).chats["!r:x"];
    const next = applyHistory(chat, [text("$2", other, "hello", 2), text("$1", ghost, "hi", 1)], undefined, [member(ghost, "lane mcdonald")], me);
    expect(next.messages.map((m) => m.sender)).toEqual([me, other]);
  });

  it("counts your own account's read receipts as yours, not as someone reading your message", () => {
    setOwnIdentity(["Lane McDonald"], []);
    const sync = { rooms: { join: { "!r:x": {
      state: { events: [member(ghost, "Lane McDonald (WA)"), member(other, "Amy")] },
      timeline: { events: [text("$1", me, 1)] },
      ephemeral: { events: [{ type: "m.receipt", content: { $1: { "m.read": { [ghost]: { ts: 5 } } } } }] },
    } } } };
    const chat = applySync({}, sync, me, true).chats["!r:x"];
    expect(chat.receipts[me]).toBe("$1");
    expect(chat.receipts[ghost]).toBeUndefined();
  });

  it("leaves everyone alone when you have no accounts", () => {
    const sync = { rooms: { join: { "!r:x": { state: { events: [member(ghost, "Lane McDonald")] }, timeline: { events: [text("$1", ghost, "hi", 1)] } } } } };
    expect(applySync({}, sync, me, true).chats["!r:x"].messages[0].sender).toBe(ghost);
  });
});
