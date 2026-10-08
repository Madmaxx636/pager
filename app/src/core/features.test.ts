import { describe, expect, it } from "vitest";
import { applySync } from "./reducer";
import { isEmojiOnly, markdownToHtml } from "./format";
import { parseGifs } from "./gifs";
import { isLowPriority, labelsOf, previewOf } from "./types";

const me = "@me:x", alex = "@alex:x";
const room = (events: unknown[], extra: object = {}) => ({
  rooms: { join: { "!r:x": {
    state: { events: [
      { type: "m.room.member", state_key: me, content: { membership: "join", displayname: "Me" } },
      { type: "m.room.member", state_key: alex, content: { membership: "join", displayname: "Alex" } },
    ] },
    summary: { "m.joined_member_count": 4 }, timeline: { events }, ...extra,
  } } },
});
const poll = { type: "org.matrix.msc3381.poll.start", event_id: "$p", sender: alex, origin_server_ts: 10, content: { "org.matrix.msc3381.poll.start": {
  kind: "org.matrix.msc3381.poll.disclosed", max_selections: 1, question: { "org.matrix.msc1767.text": "Pizza or sushi?" },
  answers: [{ id: "a1", "org.matrix.msc1767.text": "Pizza" }, { id: "a2", "org.matrix.msc1767.text": "Sushi" }] } } };
const vote = (id: string, who: string, ts: number, ...answers: string[]) => ({ type: "org.matrix.msc3381.poll.response", event_id: id, sender: who, origin_server_ts: ts,
  content: { "m.relates_to": { rel_type: "m.reference", event_id: "$p" }, "org.matrix.msc3381.poll.response": { answers } } });
const end = (who: string) => ({ type: "org.matrix.msc3381.poll.end", event_id: "$end", sender: who, origin_server_ts: 50, content: { "m.relates_to": { rel_type: "m.reference", event_id: "$p" } } });
const chatOf = (sync: object, base = {}) => applySync(base, sync, me, true).chats["!r:x"];

describe("polls", () => {
  it("parse and aggregate votes with the latest response winning", () => {
    const c = chatOf(room([poll, vote("$v1", alex, 11, "a1"), vote("$v2", me, 12, "a2"), vote("$v3", alex, 13, "a2")]));
    const p = c.messages[0];
    expect(p.type).toBe("m.poll"); expect(p.poll!.answers.map((a) => a.text)).toEqual(["Pizza", "Sushi"]); expect(previewOf(p)).toBe("Poll: Pizza or sushi?");
    expect(c.pollVotes["$p"]).toEqual({ [alex]: ["a2"], [me]: ["a2"] });
  });
  it("can only be ended by the creator, and ended polls ignore later votes", () => {
    expect(chatOf(room([poll, end(me)])).pollEnded).toEqual([]);
    const ok = chatOf(room([poll, end(alex), vote("$late", me, 99, "a1")]));
    expect(ok.pollEnded).toEqual(["$p"]); expect(ok.pollVotes["$p"]?.[me]).toBeUndefined();
  });
});

describe("tags, stickers and replies", () => {
  it("reads pin order, low priority and labels", () => {
    const c = chatOf(room([], { account_data: { events: [{ type: "m.tag", content: { tags: { "m.favourite": { order: 2.5 }, "m.lowpriority": {}, "u.label.Work": {}, "u.label.Family": {} } } }] } }));
    expect(c.pinOrder).toBe(2.5); expect(isLowPriority(c)).toBe(true); expect(labelsOf(c)).toEqual(["Family", "Work"]);
  });
  it("reads sticker packs from room state and account data", () => {
    const sync = { rooms: { join: { "!r:x": { state: { events: [{ type: "im.ponies.room_emotes", state_key: "fun", content: { pack: { display_name: "Fun" },
      images: { wave: { url: "mxc://x/w", body: "wave", info: { w: 128, h: 128 } }, smile: { url: "mxc://x/s", usage: ["emoticon"] } } } }] } } } },
      account_data: { events: [{ type: "im.ponies.user_emotes", content: { images: { mine: { url: "mxc://x/m", usage: ["sticker"] } } } }] } };
    const r = applySync({}, sync, me, true);
    expect(r.chats["!r:x"].stickerPacks[0].stickers.map((s) => s.shortcode)).toEqual(["wave"]); expect(r.userStickers!.stickers.map((s) => s.shortcode)).toEqual(["mine"]);
  });
  it("flags replies to my messages and keeps formatted_body", () => {
    const base = applySync({}, room([{ type: "m.room.message", event_id: "$mine", sender: me, origin_server_ts: 1, content: { msgtype: "m.text", body: "hi" } }]), me, true).chats;
    const r = applySync(base, room([
      { type: "m.room.message", event_id: "$r1", sender: alex, origin_server_ts: 2, content: { msgtype: "m.text", body: "yes", format: "org.matrix.html", formatted_body: "<b>yes</b>", "m.relates_to": { "m.in_reply_to": { event_id: "$mine" } } } },
      { type: "m.room.message", event_id: "$r2", sender: alex, origin_server_ts: 3, content: { msgtype: "m.text", body: "other" } },
    ]), me, false);
    expect(r.incoming.map((i) => !!i.replyToMe)).toEqual([true, false]);
    expect(r.chats["!r:x"].messages.find((m) => m.id === "$r1")!.html).toBe("<b>yes</b>");
  });
});

describe("formatting", () => {
  it("turns markdown into html only when something is formatted", () => {
    expect(markdownToHtml("just text, 2 * 3 = 6")).toBeUndefined();
    expect(markdownToHtml("**hi** and _there_")).toBe("<b>hi</b> and <i>there</i>");
    expect(markdownToHtml("~~no~~ `a*b*c`")).toBe("<s>no</s> <code>a*b*c</code>");
    expect(markdownToHtml("1 < 2 **ok**")).toBe("1 &lt; 2 <b>ok</b>");
    expect(markdownToHtml("**a**\nb")).toBe("<b>a</b><br>b");
  });
  it("detects emoji-only messages", () => {
    expect(isEmojiOnly("😀")).toBe(true); expect(isEmojiOnly("😀 🎉 ❤️")).toBe(true); expect(isEmojiOnly("👍🏽")).toBe(true);
    expect(isEmojiOnly("hi 😀")).toBe(false); expect(isEmojiOnly("😀😀😀😀")).toBe(false); expect(isEmojiOnly("")).toBe(false); expect(isEmojiOnly("hello")).toBe(false);
  });
  it("parses Giphy and Tenor results", () => {
    expect(parseGifs("giphy", { data: [{ id: "1", title: "cat", images: { original: { url: "https://g/o.gif", width: "480", height: "270" }, fixed_height_small: { url: "https://g/s.gif" } } }] }))
      .toEqual([{ id: "1", title: "cat", previewUrl: "https://g/s.gif", url: "https://g/o.gif", w: 480, h: 270 }]);
    expect(parseGifs("tenor", { results: [{ id: "2", content_description: "dog", media_formats: { gif: { url: "https://t/g.gif", dims: [320, 240] }, tinygif: { url: "https://t/tiny.gif" } } }] }))
      .toEqual([{ id: "2", title: "dog", previewUrl: "https://t/tiny.gif", url: "https://t/g.gif", w: 320, h: 240 }]);
  });
});
