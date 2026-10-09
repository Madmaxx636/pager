import { describe, expect, it } from "vitest";
import { applySync } from "./reducer";

const me = "@me:x";
const amy = "@amy:x";
const sync = (events: unknown[]) => ({ rooms: { join: { "!r:x": { timeline: { events } } } } });
const base = { type: "m.room.message", sender: amy, origin_server_ts: 1 };

describe("edits that bring a picture", () => {
  it("turns an earlier message into the picture (Google Messages sends photos this way)", () => {
    const events = [
      { ...base, event_id: "$1", content: { msgtype: "m.text", body: "Photo" } },
      { ...base, event_id: "$2", origin_server_ts: 2, content: { msgtype: "m.image", body: "* pic.jpg", "m.new_content": { msgtype: "m.image", body: "pic.jpg", url: "mxc://s/abc", info: { mimetype: "image/jpeg", w: 640, h: 480, size: 1000 } }, "m.relates_to": { rel_type: "m.replace", event_id: "$1" } } },
    ];
    const m = applySync({}, sync(events), me, true).chats["!r:x"].messages;
    expect(m).toHaveLength(1);
    expect(m[0]).toMatchObject({ type: "m.image", mxc: "mxc://s/abc", mime: "image/jpeg", w: 640, h: 480, body: "pic.jpg" });
    expect(m[0].edited).toBeFalsy();
  });
  it("still treats a text edit as an edit", () => {
    const events = [
      { ...base, event_id: "$1", content: { msgtype: "m.text", body: "hi" } },
      { ...base, event_id: "$2", content: { msgtype: "m.text", body: "* hello", "m.new_content": { msgtype: "m.text", body: "hello" }, "m.relates_to": { rel_type: "m.replace", event_id: "$1" } } },
    ];
    const m = applySync({}, sync(events), me, true).chats["!r:x"].messages;
    expect(m[0]).toMatchObject({ type: "m.text", body: "hello", edited: true });
  });
});
