import { useMemo, useRef, useSyncExternalStore } from "react";
import { http, matrix, pager, ApiError, LinkPreview, Network, SearchHit, url } from "./api";
import { applyHistory, applySync } from "./reducer";
import { getSettings, inQuietHours, updateSettings, useSettings, AppSettings } from "./settings";
import {
  ChatState, ChatSummary, Incoming, Msg, STATUS_FAILED, STATUS_SENDING, STATUS_SENT, displayName, isArchived, isBotRoom, isGroup, isPinned,
  lastPreview, lastTs, nameOf, previewOf,
} from "./types";

export interface Session { baseUrl: string; token: string; userId: string; deviceId: string }
export interface Star { roomId: string; eventId: string; chat: string; sender: string; text: string; ts: number }
export interface Scheduled { delayId: string; roomId: string; chat: string; text: string; whenMs: number }
export interface Reminder { id: string; roomId: string; chat: string; whenMs: number }

interface State {
  session?: Session;
  chats: Record<string, ChatState>;
  synced: boolean;
  muted: string[];
  drafts: Record<string, string>;
  stars: Star[];
  scheduled: Scheduled[];
  reminders: Reminder[];
  bridges: Network[];
}

const SESSION_KEY = "pager.session";
const lsGet = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

let state: State = {
  chats: {}, synced: false, muted: [],
  drafts: lsGet("pager.drafts", {}), stars: lsGet("pager.stars", []), scheduled: lsGet("pager.scheduled", []),
  reminders: lsGet("pager.reminders", []), bridges: [],
};
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); }
export const getState = () => state;
export const me = () => state.session?.userId ?? "";

export function useStore<T>(select: (s: State) => T): T {
  const cache = useRef<{ s: State; v: T } | undefined>(undefined);
  const get = () => {
    if (cache.current?.s === state) return cache.current.v;
    const v = select(state);
    cache.current = { s: state, v };
    return v;
  };
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, get);
}

// ---- Derived data --------------------------------------------------------------------

export function buildInbox(s: State, st: AppSettings): ChatSummary[] {
  const user = s.session?.userId ?? "";
  return Object.values(s.chats)
    .filter((c) => !isBotRoom(c, user) && !st.hiddenNetworks.includes(c.network))
    .map((c): ChatSummary => ({
      id: c.id, name: displayName(c, user), network: c.network, avatarMxc: c.avatarMxc, preview: lastPreview(c), ts: lastTs(c), unread: c.unread,
      markedUnread: c.markedUnread, pinned: isPinned(c), archived: isArchived(c), muted: s.muted.includes(c.id), isGroup: isGroup(c), draft: s.drafts[c.id]?.trim() || undefined,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.ts - a.ts);
}

export function useInbox(): ChatSummary[] {
  const st = useSettings();
  const chats = useStore((s) => s.chats), muted = useStore((s) => s.muted), drafts = useStore((s) => s.drafts), session = useStore((s) => s.session);
  return useMemo(() => buildInbox({ ...state, chats, muted, drafts, session }, st), [chats, muted, drafts, session, st.hiddenNetworks]); // eslint-disable-line react-hooks/exhaustive-deps
}

// ---- Session & cache -------------------------------------------------------------------

let syncAbort: AbortController | undefined;
let since: string | undefined;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open("pager", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("kv");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function dbGet<T>(key: string): Promise<T | undefined> {
  try { const db = await openDb(); return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(key); q.onsuccess = () => res(q.result); q.onerror = () => res(undefined); }); } catch { return undefined; }
}
async function dbSet(key: string, value: unknown) {
  try { const db = await openDb(); db.transaction("kv", "readwrite").objectStore("kv").put(value, key); } catch { /* private mode */ }
}
async function dbDel(key: string) { try { const db = await openDb(); db.transaction("kv", "readwrite").objectStore("kv").delete(key); } catch { /* ignore */ } }

let saveTimer: number | undefined;
function scheduleSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    const s = state.session; if (!s) return;
    const chats = Object.fromEntries(Object.entries(state.chats).map(([id, c]) => {
      const sent = c.messages.filter((m) => m.status === STATUS_SENT);
      return [id, sent.length <= 120 ? { ...c, messages: sent, typing: [] } : { ...c, messages: sent.slice(-60), prevBatch: null, typing: [] }];
    }));
    void dbSet("cache", { userId: s.userId, since, chats });
  }, 3000);
}

export async function restoreSession(): Promise<boolean> {
  const s = lsGet<Session | null>(SESSION_KEY, null);
  // Sessions saved by older versions had a different shape; make the user sign in again rather than crash.
  if (!s || typeof s.token !== "string" || typeof s.userId !== "string" || typeof s.baseUrl !== "string") { localStorage.removeItem(SESSION_KEY); return false; }
  begin(s, await dbGet<{ userId: string; since?: string; chats: Record<string, ChatState> }>("cache"));
  return true;
}

export async function signIn(server: string, username: string, password: string) {
  http.base = normalizeServer(server); http.token = "";
  const r = await matrix.login(username, password);
  const s: Session = { baseUrl: http.base, token: r.access_token, userId: r.user_id, deviceId: r.device_id };
  lsSet(SESSION_KEY, s);
  begin(s, undefined);
}

export function normalizeServer(input: string): string {
  const t = input.trim().replace(/\/+$/, "");
  if (!t) return "";
  return /^https?:\/\//.test(t) ? t : `https://${t}`;
}

function begin(s: Session, cache?: { userId: string; since?: string; chats: Record<string, ChatState> }) {
  http.base = s.baseUrl; http.token = s.token;
  since = undefined;
  let chats: Record<string, ChatState> = {}, synced = false;
  if (cache && cache.userId === s.userId) { chats = cache.chats; since = cache.since; synced = true; }
  set({ session: s, chats, synced });
  syncAbort?.abort();
  syncAbort = new AbortController();
  void syncLoop(s, syncAbort.signal);
  void refreshBridges();
  armReminders();
}

async function syncLoop(s: Session, signal: AbortSignal) {
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const res = await matrix.sync(since, signal);
      const initial = since === undefined;
      const r = applySync(state.chats, res, s.userId, initial);
      set({ chats: r.chats, synced: true, ...(r.muted ? { muted: r.muted } : {}) });
      r.invites.forEach((id) => void matrix.join(id).catch(() => {}));
      const muted = state.muted;
      r.incoming.filter((m) => !muted.includes(m.roomId)).forEach(notify);
      if (getSettings().unarchiveOnMessage) {
        for (const id of new Set(r.incoming.map((m) => m.roomId))) if (!muted.includes(id) && state.chats[id] && isArchived(state.chats[id])) setTag(id, "u.archived", false);
      }
      expireMutes();
      since = typeof res.next_batch === "string" ? res.next_batch : since;
      scheduleSave(); updateBadge();
      backoff = 1000;
    } catch (e) {
      if (signal.aborted) return;
      if (e instanceof ApiError && e.status === 401) { void signOutLocal(); return; }
      if (e instanceof ApiError && e.status === 400 && since) { since = undefined; set({ chats: {} }); continue; }
      await new Promise((r) => setTimeout(r, backoff)); backoff = Math.min(backoff * 2, 30000);
    }
  }
}

export async function signOut() { try { await matrix.logout(); } catch { /* token may already be invalid */ } await signOutLocal(); }
async function signOutLocal() {
  syncAbort?.abort();
  localStorage.removeItem(SESSION_KEY);
  await dbDel("cache");
  http.token = ""; since = undefined;
  blobCache.forEach((u) => URL.revokeObjectURL(u)); blobCache.clear();
  set({ session: undefined, chats: {}, synced: false, muted: [], bridges: [] });
}

// ---- Notifications ----------------------------------------------------------------------

function notify(m: Incoming) {
  const st = getSettings();
  if (!st.notifEnabled || st.notifMutedNetworks.includes(m.network)) return;
  if (m.isGroup && st.notifGroupMentionsOnly && !m.mentioned) return;
  if (document.hasFocus() && document.visibilityState === "visible") return;
  const now = new Date();
  const quiet = inQuietHours(st, now.getHours() * 60 + now.getMinutes());
  const body = st.notifPreview === "full" ? (m.isGroup ? `${m.sender}: ${m.text}` : m.text) : st.notifPreview === "sender" ? m.sender : "New message";
  const desktop = window.pagerDesktop;
  if (desktop) { desktop.notify({ title: m.chat, body, roomId: m.roomId, silent: quiet || !st.notifSound }); return; }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = new Notification(m.chat, { body, tag: m.roomId, silent: quiet || !st.notifSound });
  n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent("pager:open", { detail: m.roomId })); };
}

export function requestNotifications() { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission(); }

function updateBadge() {
  const st = getSettings();
  const n = Object.values(state.chats).filter((c) => !isArchived(c) && !state.muted.includes(c.id) && !st.hiddenNetworks.includes(c.network) && (c.unread > 0 || c.markedUnread)).length;
  document.title = n ? `(${n}) Pager` : "Pager";
  window.pagerDesktop?.setBadge(n);
}

// ---- Chat mutations ------------------------------------------------------------------------

function patchChat(roomId: string, f: (c: ChatState) => ChatState) {
  const c = state.chats[roomId]; if (!c) return;
  set({ chats: { ...state.chats, [roomId]: f(c) } });
}
const addLocal = (roomId: string, m: Msg) => patchChat(roomId, (c) => ({ ...c, messages: [...c.messages, m] }));
const setStatus = (roomId: string, id: string, status: number, newId?: string) =>
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, status, id: newId ?? m.id } : m)) }));
const uuid = () => crypto.randomUUID();
const localMsg = (id: string, type: string, body: string, extra: Partial<Msg> = {}): Msg => ({ id, sender: me(), ts: Date.now(), type, body, status: STATUS_SENDING, mentions: [], ...extra });

export function send(roomId: string, text: string, replyTo?: string, mentions: string[] = []) {
  const txn = uuid(), localId = `local-${txn}`;
  addLocal(roomId, localMsg(localId, "m.text", text, { replyTo, txn, mentions }));
  setDraft(roomId, "");
  matrix.send(roomId, "m.room.message", txn, textContent(text, replyTo, mentions))
    .then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}
const textContent = (text: string, replyTo?: string, mentions: string[] = []) => ({
  msgtype: "m.text", body: text,
  ...(replyTo ? { "m.relates_to": { "m.in_reply_to": { event_id: replyTo } } } : {}),
  ...(mentions.length ? { "m.mentions": { user_ids: mentions } } : {}),
});

export function retry(roomId: string, m: Msg) { patchChat(roomId, (c) => ({ ...c, messages: c.messages.filter((x) => x.id !== m.id) })); send(roomId, m.body, m.replyTo, m.mentions); }

export function edit(roomId: string, eventId: string, text: string) {
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === eventId ? { ...m, body: text, edited: true } : m)) }));
  void matrix.send(roomId, "m.room.message", uuid(), { msgtype: "m.text", body: `* ${text}`, "m.new_content": { msgtype: "m.text", body: text }, "m.relates_to": { rel_type: "m.replace", event_id: eventId } }).catch(() => {});
}

export function remove(roomId: string, eventId: string) {
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== eventId) }));
  set({ stars: state.stars.filter((s) => s.eventId !== eventId) }); lsSet("pager.stars", state.stars);
  void matrix.redact(roomId, eventId, uuid()).catch(() => {});
}

/** Adds your reaction, or removes it if you already used that emoji. */
export function react(roomId: string, eventId: string, key: string) {
  const c = state.chats[roomId]; if (!c) return; const user = me();
  updateSettings({ recentEmoji: [key, ...getSettings().recentEmoji.filter((e) => e !== key)].slice(0, 24) });
  const existing = Object.entries(c.reactionRefs).find(([, r]) => r.target === eventId && r.key === key && r.sender === user);
  if (existing) {
    const [refId] = existing;
    patchChat(roomId, (x) => {
      const { [refId]: _drop, ...refs } = x.reactionRefs;
      const byKey = { ...(x.reactions[eventId] ?? {}) };
      byKey[key] = (byKey[key] ?? []).filter((u) => u !== user); if (!byKey[key].length) delete byKey[key];
      const reactions = { ...x.reactions, [eventId]: byKey }; if (!Object.keys(byKey).length) delete reactions[eventId];
      return { ...x, reactionRefs: refs, reactions };
    });
    void matrix.redact(roomId, refId, uuid()).catch(() => {});
  } else {
    const localRef = `local-react-${uuid()}`;
    patchChat(roomId, (x) => {
      const byKey = { ...(x.reactions[eventId] ?? {}) }; byKey[key] = [...(byKey[key] ?? []), user];
      return { ...x, reactions: { ...x.reactions, [eventId]: byKey }, reactionRefs: { ...x.reactionRefs, [localRef]: { target: eventId, key, sender: user } } };
    });
    matrix.send(roomId, "m.reaction", uuid(), { "m.relates_to": { rel_type: "m.annotation", event_id: eventId, key } })
      .then((id) => patchChat(roomId, (x) => { const { [localRef]: ref, ...rest } = x.reactionRefs; return ref ? { ...x, reactionRefs: { ...rest, [id]: ref } } : x; })).catch(() => {});
  }
}

export function forward(m: Msg, toRoom: string) {
  const txn = uuid(), localId = `local-${txn}`;
  addLocal(toRoom, { ...m, id: localId, sender: me(), ts: Date.now(), txn, status: STATUS_SENDING, replyTo: undefined, edited: false });
  matrix.send(toRoom, "m.room.message", txn, {
    msgtype: m.type, body: m.body, ...(m.mxc ? { url: m.mxc } : {}), ...(m.geo ? { geo_uri: m.geo } : {}),
    ...(m.mime || m.size || m.w ? { info: { mimetype: m.mime, size: m.size, w: m.w, h: m.h } } : {}),
  }).then((id) => setStatus(toRoom, localId, STATUS_SENT, id)).catch(() => setStatus(toRoom, localId, STATUS_FAILED));
}

let lastTyping = 0;
export function typing(roomId: string, on: boolean) {
  if (!getSettings().sendTyping) return;
  const now = Date.now();
  if (on && now - lastTyping < 4000) return;
  lastTyping = on ? now : 0;
  void matrix.typing(me(), roomId, on).catch(() => {});
}

export function markRead(roomId: string) {
  const c = state.chats[roomId]; if (!c) return;
  const last = [...c.messages].reverse().find((m) => m.status === STATUS_SENT);
  if (!last || (c.unread === 0 && !c.markedUnread)) return;
  patchChat(roomId, (x) => ({ ...x, unread: 0, markedUnread: false }));
  void matrix.receipt(roomId, last.id, !getSettings().sendReadReceipts).catch(() => {});
  if (c.markedUnread) void matrix.setMarkedUnread(me(), roomId, false).catch(() => {});
  updateBadge();
}
export function markUnread(roomId: string, unread: boolean) { patchChat(roomId, (c) => ({ ...c, markedUnread: unread })); void matrix.setMarkedUnread(me(), roomId, unread).catch(() => {}); updateBadge(); }
export function markAllRead() { Object.values(state.chats).filter((c) => c.unread > 0 || c.markedUnread).forEach((c) => markRead(c.id)); }

export function sendFile(roomId: string, file: File | Blob, name = (file as File).name || "file", extra: Partial<Msg> = {}) {
  const mime = file.type || "application/octet-stream";
  const type = mime.startsWith("image/") ? "m.image" : mime.startsWith("video/") ? "m.video" : mime.startsWith("audio/") ? "m.audio" : "m.file";
  const txn = uuid(), localId = `local-${txn}`;
  addLocal(roomId, localMsg(localId, type, name, { mime, size: file.size, txn, ...extra }));
  void (async () => {
    try {
      let w = extra.w, h = extra.h;
      if (type === "m.image" && !w) { const d = await imageSize(file); w = d?.w; h = d?.h; }
      const mxc = await matrix.upload(file, name);
      const info: Record<string, unknown> = { mimetype: mime, size: file.size, ...(w ? { w, h } : {}), ...(extra.durationMs ? { duration: extra.durationMs } : {}) };
      const id = await matrix.send(roomId, "m.room.message", txn, {
        msgtype: type, body: name, url: mxc, info,
        ...(extra.voice ? { "org.matrix.msc3245.voice": {}, "org.matrix.msc1767.audio": { duration: extra.durationMs ?? 0 } } : {}),
      });
      setStatus(roomId, localId, STATUS_SENT, id);
    } catch { setStatus(roomId, localId, STATUS_FAILED); }
  })();
}
const imageSize = (f: Blob) => new Promise<{ w: number; h: number } | undefined>((res) => { const u = URL.createObjectURL(f); const i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => { res(undefined); URL.revokeObjectURL(u); }; i.src = u; });

export function sendLocation(roomId: string, lat: number, lon: number) {
  const geo = `geo:${lat.toFixed(6)},${lon.toFixed(6)}`, txn = uuid(), localId = `local-${txn}`;
  addLocal(roomId, localMsg(localId, "m.location", "Location", { geo, txn }));
  matrix.send(roomId, "m.room.message", txn, { msgtype: "m.location", body: "Location", geo_uri: geo }).then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}

/** Returns null on success, or a user-facing reason it failed. */
export async function schedule(roomId: string, text: string, delayMs: number): Promise<string | null> {
  try {
    const id = await matrix.sendDelayed(roomId, uuid(), textContent(text), delayMs);
    const c = state.chats[roomId];
    set({ scheduled: [...state.scheduled, { delayId: id, roomId, chat: c ? displayName(c, me()) : "chat", text, whenMs: Date.now() + delayMs }] }); lsSet("pager.scheduled", state.scheduled);
    setDraft(roomId, "");
    return null;
  } catch (e) {
    if (e instanceof ApiError && [400, 404, 405].includes(e.status)) return "Your server doesn't support scheduled messages yet (it needs Synapse with delayed events enabled).";
    return `Couldn't schedule: ${(e as Error).message}`;
  }
}
export function cancelScheduled(s: Scheduled) { set({ scheduled: state.scheduled.filter((x) => x.delayId !== s.delayId) }); lsSet("pager.scheduled", state.scheduled); void matrix.cancelDelayed(s.delayId).catch(() => {}); }

// ---- Drafts, stars, reminders --------------------------------------------------------------

export function setDraft(roomId: string, text: string) {
  const drafts = { ...state.drafts };
  if (text.trim()) drafts[roomId] = text; else delete drafts[roomId];
  set({ drafts }); lsSet("pager.drafts", drafts);
}
export function toggleStar(roomId: string, m: Msg) {
  const c = state.chats[roomId];
  const stars = state.stars.some((s) => s.eventId === m.id) ? state.stars.filter((s) => s.eventId !== m.id)
    : [...state.stars, { roomId, eventId: m.id, chat: c ? displayName(c, me()) : "", sender: c ? nameOf(c, m.sender) : m.sender, text: previewOf(m), ts: m.ts }];
  set({ stars }); lsSet("pager.stars", stars);
}

const timers = new Map<string, number>();
function armReminders() {
  const now = Date.now();
  for (const r of state.reminders) {
    if (timers.has(r.id)) continue;
    const fire = () => {
      timers.delete(r.id);
      set({ reminders: state.reminders.filter((x) => x.id !== r.id) }); lsSet("pager.reminders", state.reminders);
      if (window.pagerDesktop) window.pagerDesktop.notify({ title: `Reminder: ${r.chat}`, body: "You asked to be reminded about this chat.", roomId: r.roomId });
      else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`Reminder: ${r.chat}`, { body: "You asked to be reminded about this chat." });
    };
    timers.set(r.id, window.setTimeout(fire, Math.max(0, Math.min(r.whenMs - now, 2 ** 31 - 1))));
  }
}
export function remind(roomId: string, whenMs: number) {
  const c = state.chats[roomId];
  set({ reminders: [...state.reminders, { id: uuid(), roomId, chat: c ? displayName(c, me()) : "a chat", whenMs }] }); lsSet("pager.reminders", state.reminders);
  armReminders();
}
export function cancelReminder(r: Reminder) { window.clearTimeout(timers.get(r.id)); timers.delete(r.id); set({ reminders: state.reminders.filter((x) => x.id !== r.id) }); lsSet("pager.reminders", state.reminders); }

// ---- Search & link previews ---------------------------------------------------------------

export const search = (term: string, roomId?: string): Promise<SearchHit[]> => matrix.search(term, roomId).catch(() => []);
const previews = new Map<string, Promise<LinkPreview | undefined>>();
export const preview = (u: string) => { if (!previews.has(u)) previews.set(u, matrix.previewUrl(u).catch(() => undefined)); return previews.get(u)!; };

// ---- History & chat management ---------------------------------------------------------------

const loading = new Set<string>();
export function loadOlder(roomId: string) {
  const c = state.chats[roomId];
  if (!c || c.reachedStart || loading.has(roomId)) return;
  const token = c.prevBatch ?? since; if (!token) return;
  loading.add(roomId);
  matrix.messages(roomId, token).then(({ chunk, end }) => patchChat(roomId, (x) => applyHistory(x, chunk, end))).catch(() => {}).finally(() => loading.delete(roomId));
}
export function setTag(roomId: string, tag: string, on: boolean) {
  patchChat(roomId, (c) => ({ ...c, tags: on ? [...new Set([...c.tags, tag])] : c.tags.filter((t) => t !== tag) }));
  void matrix.setTag(me(), roomId, tag, on).catch(() => {});
}

const muteUntil: Record<string, number> = lsGet("pager.muteUntil", {});
export function setMuted(roomId: string, muted: boolean, forMs?: number) {
  set({ muted: muted ? [...new Set([...state.muted, roomId])] : state.muted.filter((r) => r !== roomId) });
  if (muted && forMs) muteUntil[roomId] = Date.now() + forMs; else delete muteUntil[roomId];
  lsSet("pager.muteUntil", muteUntil);
  void matrix.setMuted(roomId, muted).catch(() => {});
}
function expireMutes() { const now = Date.now(); Object.entries(muteUntil).filter(([, t]) => t <= now).forEach(([r]) => setMuted(r, false)); }
export const muteLeft = (roomId: string) => (muteUntil[roomId] ? muteUntil[roomId] - Date.now() : undefined);

export const members = (roomId: string) => matrix.joinedMembers(roomId).catch(() => ({} as Record<string, string>));
export function rename(roomId: string, name: string) { patchChat(roomId, (c) => ({ ...c, name })); void matrix.rename(roomId, name).catch(() => {}); }
export function leave(roomId: string) { const { [roomId]: _gone, ...rest } = state.chats; set({ chats: rest }); void matrix.leave(roomId).catch(() => {}); }

export async function refreshBridges() { if (!state.session) return; try { set({ bridges: await pager.networks() }); } catch { /* bridge API may be down */ } }
window.setInterval(() => { if (document.visibilityState === "visible") void refreshBridges(); }, 120_000);

// ---- Media (Synapse requires auth for downloads) ------------------------------------------------

const blobCache = new Map<string, string>();
const inflight = new Map<string, Promise<string | undefined>>();
export function mediaUrl(mxc: string, thumb = 0): Promise<string | undefined> {
  const key = `${mxc}|${thumb}`;
  const hit = blobCache.get(key); if (hit) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key)!;
  const m = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
  if (!m) return Promise.resolve(undefined);
  const path = thumb ? `thumbnail/${m[1]}/${m[2]}?width=${thumb}&height=${thumb}&method=scale` : `download/${m[1]}/${m[2]}`;
  const p = fetch(url(`/_matrix/client/v1/media/${path}`), { headers: { authorization: `Bearer ${http.token}` } })
    .then(async (r) => { if (!r.ok) return undefined; const u = URL.createObjectURL(await r.blob()); blobCache.set(key, u); return u; })
    .catch(() => undefined).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

declare global {
  interface Window {
    pagerDesktop?: {
      notify(o: { title: string; body: string; roomId?: string; silent?: boolean }): void;
      setBadge(n: number): void;
      getAutostart(): Promise<boolean>; setAutostart(on: boolean): void; setCloseToTray(on: boolean): void;
      onOpenRoom(cb: (roomId: string) => void): void;
      platform: string;
    };
  }
}
