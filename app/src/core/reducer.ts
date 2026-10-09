// Folds Matrix /sync and /messages responses into chat state. A direct port of the Android SyncReducer so both clients behave alike.
import { ChatState, Incoming, Msg, PollAnswer, STATUS_SENT, StickerPack, displayName, emptyChat, isGroup, nameOf, previewOf } from "./types";

type J = Record<string, any>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (v: unknown): any[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);
const num = (v: unknown): number | undefined => (typeof v === "number" ? v : undefined);

export interface SyncResult {
  chats: Record<string, ChatState>;
  incoming: Incoming[];
  invites: string[];
  /** Rooms with notifications switched off; undefined when this sync carried no push-rule change. */
  muted?: string[];
  /** The user's own sticker pack when this sync carried it. */
  userStickers?: StickerPack;
}

// ---- Your own accounts on other networks ------------------------------------------------------
// A bridge without double puppeting sends the messages you wrote on your phone (and your history) as your own "ghost"
// user on that network, not as you. Treat those ghosts as you, so they show as sent instead of received.
let ownNames = new Set<string>();
let ownIds = new Set<string>();
export function setOwnIdentity(names: string[], ids: string[]) {
  ownNames = new Set(names.map((n) => n.trim().toLowerCase()).filter((n) => n.length >= 2));
  ownIds = new Set(ids);
}
/** Bridges decorate ghost names, e.g. "Lane McDonald (WA)": compare without that suffix. */
const baseName = (n: string) => n.trim().toLowerCase().replace(/\s*\([^)]{1,12}\)$/, "");
function ownGhosts(chat: ChatState, me: string): Set<string> {
  const out = new Set<string>();
  for (const [id, name] of Object.entries(chat.members)) if (id !== me && (ownIds.has(id) || ownNames.has(baseName(name)))) out.add(id);
  for (const id of ownIds) if (id !== me) out.add(id);
  return out;
}
function claimOwn(events: J[], ghosts: Set<string>, me: string): J[] {
  if (!ghosts.size) return events;
  return events.map((e) => (e.state_key == null && typeof e.sender === "string" && ghosts.has(e.sender) ? { ...e, sender: me } : e));
}

export function applySync(old: Record<string, ChatState>, sync: J, me: string, initial: boolean): SyncResult {
  const chats = { ...old };
  const incoming: Incoming[] = [];
  const rooms = obj(sync.rooms);
  const invites = Object.keys(obj(rooms.invite));

  for (const [roomId, roomEl] of Object.entries(obj(rooms.join))) {
    const room = obj(roomEl);
    let chat = chats[roomId] ?? emptyChat(roomId);
    for (const e of arr(obj(room.state).events)) chat = applyState(chat, obj(e));

    const tl = obj(room.timeline);
    const limited = tl.limited === true;
    const prev = str(tl.prev_batch);
    if (limited && chat.messages.length && !initial) chat = { ...chat, messages: [], prevBatch: prev, reachedStart: false };
    else if (chat.prevBatch == null && chat.messages.length === 0 && prev != null) chat = { ...chat, prevBatch: prev };

    const pre = chat;
    chat = process(chat, claimOwn(arr(tl.events).map(obj), ownGhosts(chat, me), me), true, (m, parentSender) => {
      if (!initial && m.sender !== me) {
        const mine = pre.members[me] ?? me.replace(/^@/, "").split(":")[0];
        const mentioned = m.mentions.includes(me) || m.body.toLowerCase().includes(`@${mine}`.toLowerCase());
        incoming.push({ roomId, chat: displayName(pre, me), sender: nameOf(pre, m.sender), text: previewOf(m), network: pre.network, isGroup: isGroup(pre), mentioned, ts: m.ts, replyToMe: parentSender === me });
      }
    });

    for (const e of arr(obj(room.ephemeral).events)) chat = applyEphemeral(chat, obj(e), me);
    for (const e of arr(obj(room.account_data).events)) chat = applyRoomAccountData(chat, obj(e));

    const heroes = arr(obj(room.summary)["m.heroes"]).filter((h) => typeof h === "string");
    if (heroes.length) chat = { ...chat, heroes };
    const joinedCount = num(obj(room.summary)["m.joined_member_count"]);
    if (joinedCount != null) chat = { ...chat, memberCount: joinedCount };
    const count = num(obj(room.unread_notifications).notification_count);
    chats[roomId] = { ...chat, unread: count ?? chat.unread };
  }

  for (const roomId of Object.keys(obj(rooms.leave))) delete chats[roomId];

  let muted: string[] | undefined;
  let userStickers: StickerPack | undefined;
  for (const e of arr(obj(sync.account_data).events)) {
    const ev = obj(e);
    if (ev.type === "m.push_rules") muted = parseMuted(ev);
    else if (ev.type === "im.ponies.user_emotes") userStickers = parseStickerPack("user", "My stickers", obj(ev.content));
  }
  return { chats, incoming, invites, muted, userStickers };
}

/** Merges a page of older events (as returned by /messages, newest first). */
export function applyHistory(chat: ChatState, chunk: J[], end: string | undefined, state: J[] = [], me = ""): ChatState {
  for (const s of state) if (obj(s).type === "m.room.member") chat = applyState(chat, obj(s));
  const next = process(chat, claimOwn([...chunk].reverse(), me ? ownGhosts(chat, me) : new Set(), me), false, undefined);
  return { ...next, prevBatch: end ?? null, reachedStart: end == null };
}

function process(start: ChatState, events: J[], applyStates: boolean, onNew?: (m: Msg, parentSender?: string) => void): ChatState {
  if (!events.length) return start;
  let chat = start;
  let msgs = [...start.messages];
  const ids = new Set(msgs.map((m) => m.id));
  const reactions: Record<string, Record<string, string[]>> = {};
  for (const [t, byKey] of Object.entries(start.reactions)) { reactions[t] = {}; for (const [k, v] of Object.entries(byKey)) reactions[t][k] = [...v]; }
  const refs = { ...start.reactionRefs };
  const votes: Record<string, Record<string, string[]>> = {};
  for (const [k, v] of Object.entries(start.pollVotes)) votes[k] = { ...v };
  const ended = new Set(start.pollEnded);

  for (const e of events) {
    if (e.state_key != null) { if (applyStates) chat = applyState(chat, e); continue; }
    const content = obj(e.content);
    switch (e.type) {
      case "m.room.message": {
        if (obj(content["m.relates_to"]).rel_type === "m.replace") { msgs = applyEdit(msgs, e); continue; }
        const msg = toMsg(e);
        if (!msg) continue;
        if (msg.txn) msgs = msgs.filter((m) => m.id !== `local-${msg.txn}`);
        if (ids.has(msg.id)) continue;
        ids.add(msg.id); msgs.push(msg);
        onNew?.(msg, msg.replyTo ? msgs.find((m) => m.id === msg.replyTo)?.sender : undefined);
        break;
      }
      case "m.sticker": {
        const s = stickerMsg(e);
        if (s && !ids.has(s.id)) { ids.add(s.id); msgs.push(s); onNew?.(s); }
        break;
      }
      case "org.matrix.msc3381.poll.start":
      case "m.poll.start": {
        const p = toPollMsg(e);
        if (p && !ids.has(p.id)) { ids.add(p.id); msgs.push(p); onNew?.(p); }
        break;
      }
      case "org.matrix.msc3381.poll.response":
      case "m.poll.response": {
        const target = str(obj(content["m.relates_to"]).event_id), sender = str(e.sender);
        if (!target || !sender || ended.has(target)) break;
        const answers = arr(obj(content["org.matrix.msc3381.poll.response"]).answers ?? content["m.selections"]).filter((a) => typeof a === "string");
        (votes[target] ??= {})[sender] = answers;
        break;
      }
      case "org.matrix.msc3381.poll.end":
      case "m.poll.end": {
        const target = str(obj(content["m.relates_to"]).event_id);
        if (!target) break;
        const owner = msgs.find((m) => m.id === target)?.sender;
        if (!owner || owner === e.sender) ended.add(target);
        break;
      }
      case "m.reaction": {
        const rel = obj(content["m.relates_to"]);
        const id = str(e.event_id), target = str(rel.event_id), key = str(rel.key), sender = str(e.sender);
        if (rel.rel_type === "m.annotation" && id && target && key && sender && !(id in refs)) {
          refs[id] = { target, key, sender };
          const list = ((reactions[target] ??= {})[key] ??= []);
          if (!list.includes(sender)) list.push(sender);
        }
        break;
      }
      case "m.room.redaction": {
        const target = str(e.redacts) ?? str(content.redacts);
        if (!target) break;
        const before = msgs.length;
        msgs = msgs.filter((m) => m.id !== target);
        if (msgs.length !== before) ids.delete(target);
        const ref = refs[target];
        if (ref) {
          delete refs[target];
          const list = reactions[ref.target]?.[ref.key];
          if (list) {
            const i = list.indexOf(ref.sender); if (i >= 0) list.splice(i, 1);
            if (!list.length) delete reactions[ref.target][ref.key];
          }
        }
        break;
      }
    }
  }
  msgs.sort((a, b) => a.ts - b.ts);
  const cleaned: Record<string, Record<string, string[]>> = {};
  for (const [t, byKey] of Object.entries(reactions)) if (Object.keys(byKey).length) cleaned[t] = byKey;
  return { ...chat, messages: msgs, reactions: cleaned, reactionRefs: refs, pollVotes: votes, pollEnded: [...ended] };
}

function applyEdit(msgs: Msg[], e: J): Msg[] {
  const content = obj(e.content);
  const target = str(obj(content["m.relates_to"]).event_id);
  const i = msgs.findIndex((m) => m.id === target);
  if (i < 0 || msgs[i].sender !== e.sender) return msgs;
  const body = str(obj(content["m.new_content"]).body) ?? str(content.body)?.replace(/^\* /, "");
  if (body == null) return msgs;
  const copy = [...msgs]; copy[i] = { ...copy[i], body, edited: true };
  return copy;
}

function applyState(chat: ChatState, e: J): ChatState {
  const content = obj(e.content);
  const key = str(e.state_key) ?? "";
  switch (e.type) {
    case "m.room.name": return { ...chat, name: str(content.name) ?? "" };
    case "m.room.avatar": return { ...chat, avatarMxc: str(content.url) };
    case "im.ponies.room_emotes": {
      const pack = parseStickerPack(key || "room", str(obj(content.pack).display_name) ?? "Room stickers", content);
      return { ...chat, stickerPacks: [...chat.stickerPacks.filter((p) => p.key !== pack.key), pack] };
    }
    case "m.bridge":
    case "uk.half-shot.bridge": {
      const id = str(obj(content.protocol).id);
      const type = str(content["com.beeper.room_type"]) ?? str(content["com.beeper.room_type.v2"]);
      return id ? { ...chat, network: id === "facebook" ? "messenger" : id, roomType: type ?? chat.roomType ?? "" } : chat;
    }
    case "m.room.member": {
      const joined = content.membership === "join";
      return {
        ...chat,
        members: joined ? { ...chat.members, [key]: str(content.displayname) ?? key.replace(/^@/, "").split(":")[0] } : chat.members,
        joined: joined ? (chat.joined.includes(key) ? chat.joined : [...chat.joined, key]) : chat.joined.filter((u) => u !== key),
      };
    }
    default: return chat;
  }
}

function applyEphemeral(chat: ChatState, e: J, me: string): ChatState {
  const content = obj(e.content);
  if (e.type === "m.typing") return { ...chat, typing: arr(content.user_ids).filter((u) => typeof u === "string" && u !== me) };
  if (e.type === "m.receipt") {
    const receipts = { ...chat.receipts };
    const receiptTs = { ...chat.receiptTs };
    const mine = ownGhosts(chat, me);
    for (const [eventId, kinds] of Object.entries(content)) {
      for (const [rawUser, info] of Object.entries(obj(obj(kinds)["m.read"]))) {
        const user = mine.has(rawUser) ? me : rawUser; // your own account on that network reading = you reading
        receipts[user] = eventId; const ts = num(obj(info).ts); if (ts) receiptTs[user] = ts; }
    }
    return { ...chat, receipts, receiptTs };
  }
  return chat;
}

function applyRoomAccountData(chat: ChatState, e: J): ChatState {
  const content = obj(e.content);
  if (e.type === "m.tag") { const tags = obj(content.tags); return { ...chat, tags: Object.keys(tags), pinOrder: num(obj(tags["m.favourite"]).order) }; }
  if (e.type === "m.marked_unread" || e.type === "com.famedly.marked_unread") return { ...chat, markedUnread: content.unread === true };
  return chat;
}

/** Sticker packs (MSC2545): images keyed by shortcode, usable as stickers unless marked emoji-only. */
export function parseStickerPack(key: string, fallbackName: string, content: J): StickerPack {
  const name = str(obj(content.pack).display_name) ?? fallbackName;
  const stickers = Object.entries(obj(content.images)).flatMap(([shortcode, el]) => {
    const o = obj(el), usage = arr(o.usage).filter((u) => typeof u === "string");
    if (usage.length && !usage.includes("sticker")) return [];
    const info = obj(o.info);
    return typeof o.url === "string" ? [{ shortcode, url: o.url, body: str(o.body) ?? shortcode, w: num(info.w), h: num(info.h), mime: str(info.mimetype) }] : [];
  });
  return { key, name, stickers };
}

function pollText(el: unknown): string | undefined {
  const o = obj(el);
  return str(o["org.matrix.msc1767.text"]) ?? str(o.body) ?? arr(o["m.text"]).map((x) => str(obj(x).body)).find(Boolean) ?? str(el);
}

export function toPollMsg(e: J): Msg | undefined {
  const content = obj(e.content);
  const p = obj(content["org.matrix.msc3381.poll.start"] ?? content["m.poll"]);
  const question = pollText(p.question);
  const id = str(e.event_id), sender = str(e.sender);
  if (!question || !id || !sender) return undefined;
  const answers: PollAnswer[] = arr(p.answers).flatMap((a) => { const o = obj(a); const t = pollText(o); return typeof o.id === "string" && t ? [{ id: o.id, text: t }] : []; });
  if (answers.length < 2) return undefined;
  return { id, sender, ts: num(e.origin_server_ts) ?? 0, type: "m.poll", body: question, status: STATUS_SENT, mentions: [], poll: { question, answers, maxSelections: num(p.max_selections) ?? 1, disclosed: !String(p.kind ?? "").endsWith("undisclosed") } };
}

export function parseMuted(ev: J): string[] {
  const global = obj(obj(ev.content).global);
  const muted = new Set<string>();
  const silent = (rule: J) => rule.enabled !== false && !arr(rule.actions).includes("notify");
  for (const r of arr(global.override)) {
    const rule = obj(r);
    if (!silent(rule)) continue;
    const cond = arr(rule.conditions).map(obj);
    const room = cond.find((c) => c.kind === "event_match" && c.key === "room_id")?.pattern;
    if (typeof room === "string" && cond.length === 1) muted.add(room);
  }
  for (const r of arr(global.room)) { const rule = obj(r); if (silent(rule) && typeof rule.rule_id === "string") muted.add(rule.rule_id); }
  return [...muted];
}

function stickerMsg(e: J): Msg | undefined {
  const c = obj(e.content), info = obj(c.info);
  const id = str(e.event_id), sender = str(e.sender), mxc = str(c.url);
  if (!id || !sender || !mxc) return undefined;
  return { id, sender, ts: num(e.origin_server_ts) ?? 0, type: "m.image", body: str(c.body) ?? "Sticker", mxc, mime: str(info.mimetype), w: num(info.w), h: num(info.h), sticker: true, status: STATUS_SENT, mentions: [] };
}

export function toMsg(e: J): Msg | undefined {
  if (e.type !== "m.room.message") return undefined;
  const content = obj(e.content);
  const type = str(content.msgtype);
  if (!type) return undefined; // redacted events have empty content
  const id = str(e.event_id), sender = str(e.sender);
  if (!id || !sender) return undefined;
  const info = obj(content.info);
  const reply = str(obj(obj(content["m.relates_to"])["m.in_reply_to"]).event_id);
  let body = str(content.body) ?? "";
  if (reply) body = stripReplyFallback(body);
  return {
    id, sender, ts: num(e.origin_server_ts) ?? 0, type, body,
    mxc: str(content.url), mime: str(info.mimetype), size: num(info.size), w: num(info.w), h: num(info.h),
    durationMs: num(info.duration) ?? num(obj(content["org.matrix.msc1767.audio"]).duration),
    replyTo: reply, txn: str(obj(e.unsigned).transaction_id), geo: str(content.geo_uri),
    voice: content["org.matrix.msc3245.voice"] != null || obj(content["org.matrix.msc1767.audio"]).waveform != null,
    mentions: arr(obj(content["m.mentions"]).user_ids).filter((u) => typeof u === "string"),
    status: STATUS_SENT,
    html: content.format === "org.matrix.html" ? str(content.formatted_body) : undefined,
  };
}

/** Older clients prefix replies with a quoted copy of the parent ("> <@user> text\n\nreply"). */
export function stripReplyFallback(body: string): string {
  if (!body.startsWith("> ")) return body;
  const lines = body.split("\n");
  const firstReal = lines.findIndex((l) => !l.startsWith(">"));
  if (firstReal < 0) return body;
  return lines.slice(firstReal).join("\n").replace(/^\s+/, "");
}
