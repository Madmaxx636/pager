export const STATUS_SENT = 0;
export const STATUS_SENDING = 1;
export const STATUS_FAILED = 2;

export interface Msg {
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
  tags: string[];
  markedUnread: boolean;
  memberCount: number;
  typing: string[];
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
}

export const emptyChat = (id: string): ChatState => ({
  id, name: "", network: "matrix", unread: 0, messages: [], members: {}, joined: [], heroes: [], reachedStart: false,
  reactions: {}, reactionRefs: {}, receipts: {}, tags: [], markedUnread: false, memberCount: 0, typing: [],
});

export const isGroup = (c: ChatState) => c.memberCount > 2;
export const isPinned = (c: ChatState) => c.tags.includes("m.favourite");
export const isArchived = (c: ChatState) => c.tags.includes("u.archived");
export const nameOf = (c: ChatState, userId: string) => c.members[userId] ?? userId.replace(/^@/, "").split(":")[0];

export function previewOf(m: Msg): string {
  switch (m.type) {
    case "m.image": return m.sticker ? "Sticker" : "📷 Photo";
    case "m.location": return "📍 Location";
    case "m.emote": return `* ${m.body}`;
    case "m.video": return "🎬 Video";
    case "m.audio": return m.voice ? "🎤 Voice message" : `🎵 ${m.body}`;
    case "m.file": return `📎 ${m.body}`;
    default: return m.body;
  }
}

/** Bridge bots keep a management DM for login commands; users never need to see it. */
export function isBotRoom(c: ChatState, me: string): boolean {
  const others = c.joined.filter((u) => u !== me);
  return others.length === 1 && /^@[a-z]*bot:/.test(others[0]);
}

export function displayName(c: ChatState, me: string): string {
  if (c.name.trim()) return c.name;
  const other = [...c.heroes, ...c.joined].find((u) => u !== me);
  return other ? c.members[other] ?? nameOf(c, other) : "Unnamed chat";
}

export function lastTs(c: ChatState) { return c.messages.length ? c.messages[c.messages.length - 1].ts : 0; }
export const lastPreview = (c: ChatState) => (c.messages.length ? previewOf(c.messages[c.messages.length - 1]) : "");
