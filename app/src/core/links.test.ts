import { describe, expect, it } from "vitest";
import { addLink, buildMerged, groupOf, linkKey, mergeSummaries, suggestLinks, unlink } from "./links";
import type { ChatSummary } from "./types";

const sum = (id: string, network: string, ts: number, unread = 0, extra: Partial<ChatSummary> = {}): ChatSummary => ({
  id, name: "Sam", network, preview: "hi", ts, unread, markedUnread: false, pinned: false, archived: false, muted: false, isGroup: false,
  lowPriority: false, labels: [], pinOrder: 0, unanswered: false, lastFromMe: false, typing: false, ...extra,
});

describe("one person on two networks", () => {
  it("knows the same person by phone number or by name", () => {
    expect(linkKey("+1 (555) 010-2030")).toBe(linkKey("5550102030"));
    expect(linkKey("Sam  Lee (WA)")).toBe(linkKey("sam lee"));
    expect(linkKey("")).toBe("");
  });
  it("joins and splits groups", () => {
    let l = addLink([], "a", "b"); l = addLink(l, "b", "c");
    expect(groupOf(l, "a")?.sort()).toEqual(["a", "b", "c"]);
    expect(l).toHaveLength(1);
    expect(groupOf(unlink(l, "c"), "a")?.sort()).toEqual(["a", "b"]);
    expect(unlink(addLink([], "a", "b"), "a")).toEqual([]);
  });
  it("suggests only one-to-one chats on different networks", () => {
    const chats = [
      { id: "s", name: "Sam", network: "signal", isGroup: false }, { id: "g", name: "sam", network: "gmessages", isGroup: false },
      { id: "s2", name: "Sam", network: "signal", isGroup: false }, { id: "grp", name: "Sam", network: "gmessages", isGroup: true },
    ];
    const got = suggestLinks(chats, []).map((p) => p.join("+")).sort();
    expect(got).toEqual(["g+s2", "s+g"].sort());
    expect(suggestLinks(chats, [["s", "g"]]).map((p) => p.join("+"))).toEqual(["g+s2"]);
  });
  it("shows one row: the newest chat, with unread added up", () => {
    const rows = mergeSummaries([sum("a", "signal", 100, 2), sum("x", "whatsapp", 90), sum("b", "gmessages", 200, 3, { pinned: true })], [["a", "b"]]);
    expect(rows.map((r) => r.id)).toEqual(["b", "x"]);
    expect(rows[0]).toMatchObject({ unread: 5, pinned: true });
    expect(rows[0].linked?.map((l) => l.network).sort()).toEqual(["gmessages", "signal"]);
  });
  it("leaves a group alone when only one of its chats is on screen", () => {
    const rows = mergeSummaries([sum("a", "signal", 100)], [["a", "b"]]);
    expect(rows).toHaveLength(1); expect(rows[0].linked).toBeUndefined();
  });
});

import { emptyChat, type Msg } from "./types";
describe("one chat made of several", () => {
  const msg = (id: string, ts: number, extra: Partial<Msg> = {}): Msg => ({ id, sender: "@a:x", ts, type: "m.text", body: id, status: 0, mentions: [], ...extra } as Msg);
  const mk = (id: string, network: string, msgs: Msg[], unread = 0) => ({ ...emptyChat(id), network, messages: msgs, unread });
  it("puts every message in time order, remembers where each belongs, and adds up what is unread", () => {
    const chats = { s: mk("s", "signal", [msg("1", 10), msg("3", 30)], 1), g: mk("g", "gmessages", [msg("2", 20), msg("3", 30)], 2) };
    const m = buildMerged(chats, [["s", "g"]], "s")!;
    expect(m.messages.map((x) => x.id)).toEqual(["1", "2", "3"]);
    expect(m.messages.map((x) => x.room)).toEqual(["s", "g", "s"]);
    expect(m.unread).toBe(3); expect(m.id).toBe("s");
  });
  it("has nothing to merge for a chat on its own", () => {
    expect(buildMerged({ s: mk("s", "signal", []) }, [], "s")).toBeUndefined();
    expect(buildMerged({ s: mk("s", "signal", []) }, [["s", "g"]], "s")).toBeUndefined();
  });
});
