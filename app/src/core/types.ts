import { prettyName } from "./names";
import type { EncFile } from "./mediacrypt";
export const STATUS_SENT = 0;
export const STATUS_SENDING = 1;
export const STATUS_FAILED = 2;

export interface PollAnswer { id: string; text: string }
export interface PollInfo { question: string; answers: PollAnswer[]; maxSelections: number; disclosed: boolean }
export interface Sticker { shortcode: string; url: string; body: string; w?: number; h?: number; mime?: string }
export interface StickerPack { key: string; name: string; stickers: Sticker[] }

export interface Msg {
  /** A message we could not read yet: the encrypted original, kept so it can be opened when its key arrives (even after a restart). */
  sealed?: unknown;
  /** Set when the attachment is end-to-end encrypted: how to unscramble it. */
  enc?: EncFile;
  id: string;
  sender: string;
  ts: number;
  type: string;
  body: string;
  mxc?: string;
  mime?: string;
  size?: number;
  w?: number;
  h?: number;
  durationMs?: number;
  replyTo?: string;
  edited?: boolean;
  txn?: string;
  status: number;
  geo?: string;
  sticker?: boolean;
  voice?: boolean;
  mentions: string[];
  /** HTML from formatted_body (bridges send bold/italic/links this way). */
  html?: string;
  poll?: PollInfo;
}

export interface ReactionRef { target: string; key: string; sender: string }

export interface ChatState {
  id: string;
  name: string;
  network: string;
  avatarMxc?: string;
  unread: number;
  messages: Msg[];
  members: Record<string, string>;
  joined: string[];
  heroes: string[];
  prevBatch?: string | null;
  reachedStart: boolean;
  /** target event id -> reaction key -> senders */
  reactions: Record<string, Record<string, string[]>>;
  reactionRefs: Record<string, ReactionRef>;
  /** user id -> latest event they have read */
  receipts: Record<string, string>;
  /** When each user's read receipt was sent (ms). */
  receiptTs?: Record<string, number>;
  tags: string[];
  markedUnread: boolean;
  memberCount: number;
  roomType?: string;
  /** The room uses end-to-end encryption (m.room.encryption). */
  encrypted?: boolean;
  typing: string[];
  /** Order among pinned chats (the m.favourite tag's order). */
  pinOrder?: number;
  /** poll event id -> user id -> chosen answer ids */
  pollVotes: Record<string, Record<string, string[]>>;
  pollEnded: string[];
  stickerPacks: StickerPack[];
}

export interface Incoming {
  roomId: string;
  chat: string;
  sender: string;
  text: string;
  network: string;
  isGroup: boolean;
  mentioned: boolean;
  ts: number;
  /** The message replies to something you wrote. */
  replyToMe?: boolean;
}

export interface ChatSummary {
  id: string;
  name: string;
  network: string;
  avatarMxc?: string;
  preview: string;
  ts: number;
  unread: number;
  markedUnread: boolean;
  pinned: boolean;
  archived: boolean;
  muted: boolean;
  isGroup: boolean;
  draft?: string;
  lowPriority: boolean;
  /** The WhatsApp stories room. */
  stories?: boolean;
  labels: string[];
  pinOrder: number;
  unanswered: boolean;
  lastFromMe: boolean;
  typing: boolean;
}

export const emptyChat = (id: string): ChatState => ({
  id, name: "", network: "matrix", unread: 0, messages: [], members: {}, joined: [], heroes: [], reachedStart: false,
  reactions: {}, reactionRefs: {}, receipts: {}, tags: [], markedUnread: false, memberCount: 0, typing: [],
  pollVotes: {}, pollEnded: [], stickerPacks: [],
});

/** Bridged rooms always hold the bridge bot and your own puppet, so raw member counts overstate. */
export const isGroup = (c: ChatState) => (c.roomType ? c.roomType !== "dm" : c.memberCount > 2);
export const peopleCount = (c: ChatState) => (c.roomType ? Math.max(2, c.memberCount - 2) : c.memberCount);
export const isPinned = (c: ChatState) => c.tags.includes("m.favourite");
export const isArchived = (c: ChatState) => c.tags.includes("u.archived");
export const isLowPriority = (c: ChatState) => c.tags.includes("m.lowpriority");
export const LABEL_PREFIX = "u.label.";
export const labelsOf = (c: ChatState) => c.tags.filter((t) => t.startsWith(LABEL_PREFIX)).map((t) => t.slice(LABEL_PREFIX.length)).sort();
export const nameOf = (c: ChatState, userId: string) => prettyName(c.members[userId] ?? userId.replace(/^@/, "").split(":")[0]);

export function previewOf(m: Msg): string {
  switch (m.type) {
    case "m.image": return m.sticker ? "Sticker" : m.mime === "image/gif" ? "GIF" : "Photo";
    case "m.location": return "Location";
    case "m.poll": return `Poll: ${m.poll?.question ?? m.body}`;
    case "m.emote": return `* ${m.body}`;
    case "m.video": return "Video";
    case "m.audio": return m.voice ? "Voice message" : m.body;
    case "m.file": return m.mime?.includes("vcard") || m.body.endsWith(".vcf") ? `Contact: ${m.body.replace(/\.vcf$/, "")}` : m.body;
    default: return m.body;
  }
}

/** Bridge bots keep a management DM for login commands; users never need to see it. */
export function isBotRoom(c: ChatState, me: string): boolean {
  const others = c.joined.filter((u) => u !== me);
  // Only some members are loaded at a time: a room with more people than that (like Signal's Note to Self: you, the bot and your own account) is not a bot room.
  return others.length === 1 && /^@[a-z]*bot:/.test(others[0]) && (!c.memberCount || c.memberCount <= 2);
}

export function displayName(c: ChatState, me: string): string {
  if (isStoriesRoom(c)) return "Stories";
  if (c.name.trim()) return prettyName(c.name);
  const other = [...c.heroes, ...c.joined].find((u) => u !== me);
  return other ? nameOf(c, other) : "Unnamed chat";
}

export function lastTs(c: ChatState) { return c.messages.length ? c.messages[c.messages.length - 1].ts : 0; }
export const lastPreview = (c: ChatState) => (c.messages.length ? previewOf(c.messages[c.messages.length - 1]) : "");

/** Who has read a message, and when: anyone whose read receipt is at or after it. The time is when they read up to that point. */
export function readersOf(chat: ChatState, msgId: string, sender: string): { user: string; ts?: number }[] {
  const idx = chat.messages.findIndex((m) => m.id === msgId);
  if (idx < 0) return [];
  const out: { user: string; ts?: number }[] = [];
  for (const [user, ev] of Object.entries(chat.receipts)) {
    if (user === sender || isBridgeBot(user)) continue;
    const at = chat.messages.findIndex((m) => m.id === ev);
    if (at >= idx) out.push({ user, ts: chat.receiptTs?.[user] });
  }
  return out;
}

/** The bridge's own bot account (e.g. @signalbot:server). It sends a receipt when a message reaches the other network: that means "delivered", not "read". */
export const isBridgeBot = (userId: string) => /^@(whatsapp|signal|gmessages|messenger|instagram|slack|twitter|bluesky|linkedin|telegram|discord|googlechat|imessage)bot:/.test(userId);

/** WhatsApp stories (status updates) arrive in one bridge room; we show it as "Stories". */
export const isStoriesRoom = (c: ChatState) => /^whatsapp status broadcast$/i.test(c.name.trim()) || (c.network === "whatsapp" && /status.?broadcast/i.test(c.name));
