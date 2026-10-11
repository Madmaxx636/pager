import { phoneKey, stripTag } from "./names";
import type { ChatState, ChatSummary, Msg } from "./types";

/** Chats with the same person on different networks (say Signal and Google Messages) that you chose to show as one. Saved in your account, so every device agrees. */
export type Links = string[][];

/** What identifies a person across networks: the last digits of a phone number, else the name. */
export function linkKey(name: string): string {
  const p = phoneKey(name);
  if (p) return "p" + p;
  const n = stripTag(name).trim().toLowerCase().replace(/\s+/g, " ");
  return n ? "n" + n : "";
}

export const groupOf = (links: Links, id: string) => links.find((g) => g.includes(id));

/** Joins two chats (and anything either was already joined with). */
export function addLink(links: Links, a: string, b: string): Links {
  if (a === b) return links;
  const ga = groupOf(links, a) ?? [a], gb = groupOf(links, b) ?? [b];
  const merged = [...new Set([...ga, ...gb])];
  return [...links.filter((g) => g !== groupOf(links, a) && g !== groupOf(links, b)), merged];
}

/** Takes one chat out of its group; a group of one is dropped. */
export function unlink(links: Links, id: string): Links {
  return links.map((g) => g.filter((x) => x !== id)).filter((g) => g.length > 1);
}

type Candidate = { id: string; name: string; network: string; isGroup: boolean };
/** Pairs of one-to-one chats on different networks that look like the same person and are not joined yet. */
export function suggestLinks(chats: Candidate[], links: Links): [string, string][] {
  const byKey = new Map<string, Candidate[]>();
  for (const c of chats) {
    if (c.isGroup || c.network === "matrix") continue;
    const k = linkKey(c.name); if (!k) continue;
    byKey.set(k, [...(byKey.get(k) ?? []), c]);
  }
  const out: [string, string][] = [];
  for (const list of byKey.values()) for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const a = list[i], b = list[j];
    if (a.network === b.network) continue;
    const g = groupOf(links, a.id);
    if (g && g.includes(b.id)) continue;
    out.push([a.id, b.id]);
  }
  return out;
}

/** One row per group: the chat that spoke last stands for all of them, with their unread counts added up. */
export function mergeSummaries(items: ChatSummary[], links: Links): ChatSummary[] {
  if (!links.length) return items;
  const byId = new Map(items.map((i) => [i.id, i]));
  const done = new Set<string>();
  const out: ChatSummary[] = [];
  for (const it of items) {
    if (done.has(it.id)) continue;
    const g = groupOf(links, it.id);
    const members = g ? g.map((id) => byId.get(id)).filter((x): x is ChatSummary => !!x) : [];
    if (!g || members.length < 2) { out.push(it); continue; }
    members.forEach((m) => done.add(m.id));
    const top = members.reduce((a, b) => (b.ts > a.ts ? b : a));
    out.push({
      ...top,
      unread: members.reduce((n, m) => n + m.unread, 0),
      markedUnread: members.some((m) => m.markedUnread),
      pinned: members.some((m) => m.pinned),
      muted: members.every((m) => m.muted),
      archived: members.every((m) => m.archived),
      linked: members.map((m) => ({ id: m.id, network: m.network })),
    });
  }
  return out;
}

/** One chat made of every chat in the person's linked group, oldest message first, for the desktop's merged view. Undefined when there is nothing to merge. */
export function buildMerged(chats: Record<string, ChatState>, links: Links, roomId: string): ChatState | undefined {
  const ids = (groupOf(links, roomId) ?? []).filter((id) => chats[id]);
  if (ids.length < 2 || !chats[roomId]) return undefined;
  const all = ids.map((id) => chats[id]);
  const seen = new Set<string>(); const messages: Msg[] = [];
  for (const c of all) for (const m of c.messages) if (!seen.has(m.id)) { seen.add(m.id); messages.push({ ...m, room: c.id }); }
  messages.sort((a, b) => a.ts - b.ts);
  const prim = chats[roomId];
  return {
    ...prim, messages, unread: all.reduce((n, c) => n + c.unread, 0), markedUnread: all.some((c) => c.markedUnread),
    reactions: Object.assign({}, ...all.map((c) => c.reactions)), reactionRefs: Object.assign({}, ...all.map((c) => c.reactionRefs)),
    pollVotes: Object.assign({}, ...all.map((c) => c.pollVotes)), pollEnded: all.flatMap((c) => c.pollEnded),
    receipts: Object.assign({}, ...all.map((c) => c.receipts)), members: Object.assign({}, ...all.map((c) => c.members)),
    typing: [...new Set(all.flatMap((c) => c.typing))], encrypted: all.every((c) => c.encrypted), reachedStart: all.every((c) => c.reachedStart),
  };
}
