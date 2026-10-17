import { freshUpdates, lostText, newlyLost, updateText } from "./accountalerts";
import { ATTENTION_FIELD, attentionText, isFresh, raise, type AttentionKind } from "./attention";
import { attended } from "./presence";
import { KEEP_MESSAGES, LOW_END_KEEP, poolClearMs } from "./memory";
import { useMemo, useRef, useSyncExternalStore } from "react";
import { http, matrix, matrixCall, pager, sendHook, ApiError, LinkPreview, Network, SearchHit, url } from "./api";
import { BlobCache } from "./lru";
import { groupFaces } from "./faces";
import { Links, buildMerged, groupOf, mergeSummaries } from "./links";
import { shrinkImage } from "./shrink";
import { forgetTranscripts } from "./transcribe";
import { WAITING_TEXT, applyHistory, applySync, relabelUnreadable, replaceDecrypted, setOwnIdentity } from "./reducer";
import { Crypto, isEncryptedType } from "./crypto";
import { decryptAttachment, encryptAttachment, encryptedInfo, registerAllEncrypted } from "./mediacrypt";
import { Decision, decide } from "./notifypolicy";
import { playSound } from "./sounds";
import { getSettings, updateSettings, useSettings, AppSettings, SYNC_TYPE, SavedSettings, deviceLabel, mergeSaved } from "./settings";
import {
  ChatState, ChatSummary, Incoming, LABEL_PREFIX, Msg, STATUS_FAILED, STATUS_SENDING, STATUS_SENT, StickerPack, Sticker, displayName, isStoriesRoom, isArchived, isBotRoom, isGroup, isLowPriority, isPinned,
  labelsOf, lastPreview, lastTs, nameOf, previewOf,
  setAliases,
} from "./types";
import { markdownToHtml } from "./format";
import { addToPhonebook, onPhonebookChange, ownContacts } from "./names";
import type { Gif } from "./gifs";

export interface Session { baseUrl: string; token: string; userId: string; deviceId: string }
export interface Star { roomId: string; eventId: string; chat: string; sender: string; text: string; ts: number }
export interface Scheduled { delayId: string; roomId: string; chat: string; text: string; whenMs: number }
export interface Reminder { id: string; roomId: string; chat: string; whenMs: number; snooze?: boolean }

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
  /** This account is an administrator of the server. */
  isAdmin: boolean;
  userStickers?: StickerPack;
  /** GIFs you starred, saved in your account so every device has them. */
  favoriteGifs: Gif[];
  /** Chats shown as one (see links.ts). */
  links: Links;
  /** Names you gave chats, for yourself only (desktop app). */
  aliases: Record<string, string>;
  /** Linked chats you chose to look at one network at a time (not saved): the rest show merged. */
  solo: string[];
}

const SESSION_KEY = "pager.session";
const lsGet = <T,>(k: string, d: T): T => { try { return JSON.parse(localStorage.getItem(k) ?? "") as T; } catch { return d; } };
const lsSet = (k: string, v: unknown) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* quota */ } };

let state: State = {
  chats: {}, synced: false, muted: [],
  drafts: lsGet("pager.drafts", {}), stars: lsGet("pager.stars", []), scheduled: lsGet("pager.scheduled", []),
  reminders: lsGet("pager.reminders", []), bridges: [], isAdmin: false, favoriteGifs: lsGet<Gif[]>("pager.favoriteGifs", []), links: lsGet<Links>("pager.links", []), aliases: lsGet<Record<string, string>>("pager.aliases", {}), solo: [], userStickers: lsGet<StickerPack | undefined>("pager.userStickers", undefined),
};
setAliases(state.aliases);
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());
function set(patch: Partial<State>) { state = { ...state, ...patch }; emit(); }
export const getState = () => state;
export const me = () => state.session?.userId ?? "";

function shallowSame(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a), kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
}

export function useStore<T>(select: (s: State) => T): T {
  const cache = useRef<{ s: State; v: T } | undefined>(undefined);
  const get = () => {
    if (cache.current?.s === state) return cache.current.v;
    let v = select(state);
    // A selector that builds a new array or object each time (say, a few chats picked out) would redraw on every update even when nothing it
    // picked changed. Keep the old one when every item is the same.
    if (cache.current && shallowSame(cache.current.v, v)) v = cache.current.v;
    cache.current = { s: state, v };
    return v;
  };
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, get);
}

// ---- Derived data --------------------------------------------------------------------

export function buildInbox(s: State, st: AppSettings): ChatSummary[] {
  const user = s.session?.userId ?? "";
  return mergeSummaries(buildRows(s, st, user), s.links);
}
function buildRows(s: State, st: AppSettings, user: string): ChatSummary[] {
  return Object.values(s.chats)
    .filter((c) => !isBotRoom(c, user) && !st.hiddenNetworks.includes(c.network))
    .map((c): ChatSummary => {
      const last = c.messages[c.messages.length - 1];
      return {
        id: c.id, name: displayName(c, user), network: c.network, avatarMxc: c.avatarMxc, preview: lastPreview(c), ts: lastTs(c), unread: c.unread,
        faces: isGroup(c) && !c.avatarMxc ? groupFaces(c, user) : undefined, markedUnread: c.markedUnread, pinned: isPinned(c), archived: isArchived(c), muted: s.muted.includes(c.id), isGroup: isGroup(c), draft: s.drafts[c.id]?.trim() || undefined,
        lowPriority: isLowPriority(c), stories: isStoriesRoom(c) || undefined, labels: labelsOf(c), pinOrder: c.pinOrder ?? Number.MAX_VALUE,
        unanswered: !!last && last.sender !== user, lastFromMe: last?.sender === user, typing: c.typing.length > 0,
      };
    })
    .sort((a, b) => Number(b.pinned) - Number(a.pinned) || (a.pinned ? a.pinOrder - b.pinOrder : 0)
      || (st.sortUnreadFirst ? Number(b.unread > 0 || b.markedUnread) - Number(a.unread > 0 || a.markedUnread) : 0) || b.ts - a.ts);
}

export function useChatsRaw(): Record<string, ChatState> { return useStore((s) => s.chats); }

export function useInbox(): ChatSummary[] {
  const st = useSettings();
  const chats = useStore((s) => s.chats), muted = useStore((s) => s.muted), drafts = useStore((s) => s.drafts), session = useStore((s) => s.session), links = useStore((s) => s.links), aliases = useStore((s) => s.aliases);
  return useMemo(() => buildInbox({ ...state, chats, muted, drafts, session, links, aliases }, st), [chats, muted, drafts, session, links, aliases, st.hiddenNetworks]); // eslint-disable-line react-hooks/exhaustive-deps
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
      return [id, sent.length <= keepMessages() ? { ...c, messages: sent, typing: [] } : { ...c, messages: sent.slice(-keepMessages()), prevBatch: null, reachedStart: false, typing: [] }];
    }));
    void dbSet("cache", { userId: s.userId, since, chats });
  }, 3000);
}

export async function restoreSession(): Promise<boolean> {
  const s = lsGet<Session | null>(SESSION_KEY, null);
  // Sessions saved by older versions had a different shape; make the user sign in again rather than crash.
  if (!s || typeof s.token !== "string" || typeof s.userId !== "string" || typeof s.baseUrl !== "string") { localStorage.removeItem(SESSION_KEY); return false; }
  let cached = await dbGet<{ userId: string; since?: string; chats: Record<string, ChatState> }>("cache");
  // Caches from before room types were tracked can't tell DMs from groups: resync from scratch.
  if (cached && Object.values(cached.chats).some((c) => c.network !== "matrix" && !c.roomType)) cached = undefined;
  // Bump when the way messages are read changes (e.g. pictures that arrive as edits), so old saved chats are read again.
  const CACHE_VERSION = 3;
  if (lsGet<number>("pager.cacheV", 0) !== CACHE_VERSION) { cached = undefined; lsSet("pager.cacheV", CACHE_VERSION); }
  begin(s, cached);
  return true;
}

/** A recovery key typed on the sign-in page: used as soon as encryption is ready, so the history opens without another step. */
let pendingKey = "";
export async function signIn(server: string, username: string, password: string, recoveryKey = "") {
  pendingKey = recoveryKey.trim();
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
  if (cache && cache.userId === s.userId) { chats = cache.chats; since = cache.since; synced = true; registerAllEncrypted(chats); }
  set({ session: s, chats, synced });
  syncAbort?.abort();
  syncAbort = new AbortController();
  const signal = syncAbort.signal;
  // Messages wait a moment for encryption to be ready (so encrypted ones can be read), but never for long.
  void withTimeout(startCrypto(s), 90_000, "Encryption").catch(() => {}).finally(() => { if (!signal.aborted) void syncLoop(s, signal); });
  void refreshBridges();
  void pager.me().then((m) => set({ isAdmin: m.admin })).catch(() => {});
  armReminders();
}

// ---- End-to-end encryption --------------------------------------------------------------------------------------------
let e2ee: Crypto | undefined;
/** Messages we could not read yet (their key has not arrived), by event id. */
const waiting = new Map<string, { roomId: string; event: any }>();
const memberCache = new Map<string, { at: number; ids: string[] }>();

let startError: string | undefined;
let keyMismatch = false;
let retryTimer: number | undefined;
const withTimeout = <T,>(p: Promise<T>, ms: number, what: string) => Promise.race([p, new Promise<never>((_, rej) => setTimeout(() => rej(new Error(`${what} took too long`)), ms))]);

async function startCrypto(s: Session) {
  e2ee?.close(); e2ee = undefined; waiting.clear(); startError = undefined;
  try {
    // Older sign-ins did not save which device this is; the server knows.
    let deviceId = s.deviceId;
    if (!deviceId) {
      deviceId = (await matrixCall("GET", "/_matrix/client/v3/account/whoami")).device_id ?? "";
      if (!deviceId) throw new Error("the server did not say which device this is. Sign out and in again");
      const saved = { ...s, deviceId }; lsSet(SESSION_KEY, saved); set({ session: saved });
    }
    const c = await withTimeout(Crypto.create((method, path, body) => matrixCall(method, path, body), s.userId, deviceId, `pager-e2ee-${s.userId}-${deviceId}`), 20000, "Starting encryption");
    c.onKeys = (rooms) => void retryWaiting(rooms);
    e2ee = c;
    await withTimeout(c.pump(), 15000, "Uploading encryption keys").catch(() => { /* it keeps trying in the background */ });
    if (pendingKey) {
      const key = pendingKey; pendingKey = "";
      try { await c.restoreBackup(key); }
      catch { /* a wrong key: the key step opens and asks again */ }
    }
    keyMismatch = (await serverKeyMatches(s.userId, deviceId, c.machine.identityKeys.ed25519.toBase64())) === false;
    void retryWaiting(); // messages saved while waiting for a key may have their key now
    window.clearInterval(retryTimer); retryTimer = window.setInterval(() => { void c.pump().catch(() => {}); void retryWaiting(); }, 45_000); // and keys can turn up later, from the backup
  } catch (e) { startError = (e as Error).message || String(e); console.warn("encryption could not start", e); }
  void refreshEncryptionStatus();
}

/** Does the server hold the same device key we do? If not, bridges encrypt to a key this device no longer has. Undefined when we could not ask. */
async function serverKeyMatches(userId: string, deviceId: string, ours: string): Promise<boolean | undefined> {
  try {
    const r = await matrixCall("POST", "/_matrix/client/v3/keys/query", { timeout: 10000, device_keys: { [userId]: [deviceId] } });
    const theirs = r.device_keys?.[userId]?.[deviceId]?.keys?.[`ed25519:${deviceId}`];
    return theirs ? theirs === ours : undefined;
  } catch { return undefined; }
}

/** Tries again (from the settings screen) after a failed start. */
export async function retryEncryptionStart() { if (state.session) await startCrypto(state.session); }

const unreadable = (e: any) => ({ ...e, type: "m.room.message", content: { msgtype: "m.text", body: WAITING_TEXT, pagerWaiting: true, pagerRaw: e } });

/** Replaces m.room.encrypted events with what they say. Unreadable ones become a placeholder and are tried again when keys arrive. */
async function decryptEvents(roomId: string, events: any[]): Promise<any[]> {
  if (!events.some((e) => isEncryptedType(e?.type))) return events;
  const out: any[] = [];
  for (const e of events) {
    if (!isEncryptedType(e?.type)) { out.push(e); continue; }
    // Encryption may not have finished starting yet. The message must NOT be passed on as it is: the app would drop it, and the sync has
    // already moved past it. Keep it as a locked placeholder; it opens once encryption is ready.
    const clear = e2ee ? await e2ee.decrypt(roomId, e) : undefined;
    if (clear) out.push(clear);
    else { out.push(unreadable(e)); if (e2ee) window.setTimeout(() => void retryWaiting([roomId]), 4000); }
  }
  return out;
}

async function decryptSync(res: any) {
  if (e2ee) try { await e2ee.receiveSync(res); } catch { await new Promise((r) => setTimeout(r, 500)); await e2ee.receiveSync(res); } // keys in this update must not be dropped
  for (const [roomId, room] of Object.entries<any>(res.rooms?.join ?? {})) {
    const ev = room.timeline?.events;
    if (Array.isArray(ev)) room.timeline.events = await decryptEvents(roomId, ev);
  }
}

/** Opens messages that were waiting for a key, in the pages whose keys just arrived (or everywhere with no list). They are kept on the message itself, so this also works after a restart. */
const askedBackup = new Map<string, number>();
async function retryWaiting(rooms?: string[]) {
  if (!e2ee) return;
  for (const [roomId, chat] of Object.entries(state.chats)) {
    if (rooms && !rooms.includes(roomId)) continue;
    for (const m of chat.messages) {
      if (!m.sealed) continue;
      // The recovery backup may hold this message's key (another device of yours saved it there): ask, at most once a minute per key.
      const sid = (m.sealed as any)?.content?.session_id as string | undefined;
      if (sid && Date.now() - (askedBackup.get(roomId + sid) ?? 0) > 60_000) { askedBackup.set(roomId + sid, Date.now()); await e2ee.fetchKeyFromBackup(roomId, sid); }
      const clear = await e2ee.decrypt(roomId, m.sealed as any);
      if (clear) patchChat(roomId, (c) => replaceDecrypted(c, clear));
    }
    patchChat(roomId, (c) => relabelUnreadable(c, Date.now()));
  }
}

async function roomMembers(roomId: string): Promise<string[]> {
  const hit = memberCache.get(roomId);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit.ids;
  const ids = Object.keys(await matrix.joinedMembers(roomId));
  memberCache.set(roomId, { at: Date.now(), ids });
  return ids;
}

// What the settings screen shows about encryption on this device.
export interface EncryptionStatus { ready: boolean; backupHere: boolean; backupOnServer: boolean; deviceId: string; fingerprint: string; /** The server holds a different key for this device than we do. */ mismatch?: boolean; /** Why encryption could not start, if it could not. */ error?: string }
let encStatus: EncryptionStatus = { ready: false, backupHere: false, backupOnServer: false, deviceId: "", fingerprint: "" };
const encListeners = new Set<() => void>();
function setEncStatus(s: EncryptionStatus) {
  if (JSON.stringify(s) === JSON.stringify(encStatus)) return; // nothing new: do not wake the screen (and so do not ask the server again)
  encStatus = s; encListeners.forEach((l) => l());
}
export async function refreshEncryptionStatus() {
  if (!e2ee) { setEncStatus({ ready: false, backupHere: false, backupOnServer: false, deviceId: "", fingerprint: "", error: startError }); return; }
  const [backupHere, ver] = await Promise.all([e2ee.backupOn(), e2ee.backupVersion()]);
  setEncStatus({ ready: true, backupHere, backupOnServer: !!ver, deviceId: e2ee.deviceId, fingerprint: e2ee.machine.identityKeys.ed25519.toBase64(), mismatch: keyMismatch });
}
// One fixed function: a new one on every render would make React subscribe again each time, and each subscribe asks the server.
const subscribeEncryption = (l: () => void) => { encListeners.add(l); void refreshEncryptionStatus(); return () => { encListeners.delete(l); }; };
export function useEncryption(): EncryptionStatus {
  return useSyncExternalStore(subscribeEncryption, () => encStatus);
}
/** Starts the recovery backup and returns the recovery key to show once. */
export async function createRecoveryKey(): Promise<string> {
  if (!e2ee) throw new Error("Encryption is not ready yet");
  const key = await e2ee.createBackup(); await refreshEncryptionStatus(); return key;
}
/** Reads the backup with a recovery key; returns how many message keys were restored. */
export async function restoreWithRecoveryKey(key: string): Promise<number> {
  if (!e2ee) throw new Error("Encryption is not ready yet");
  const n = await e2ee.restoreBackup(key); await refreshEncryptionStatus(); void retryWaiting(); return n;
}

/**
 * Turns on end-to-end encryption for a page. From then on its messages are encrypted. Older messages stay as they were on the server,
 * and encryption can't be turned off again. Refuses when the page's app (bridge) can't read encrypted messages, which would break the page.
 */
export async function enableEncryption(roomId: string): Promise<void> {
  if (!e2ee) throw new Error("Encryption is not ready yet. Try again in a moment.");
  const chat = state.chats[roomId];
  if (chat?.encrypted) return;
  const ids = Object.keys(await matrix.joinedMembers(roomId));
  const bots = ids.filter((u) => /^@[a-z]*bot:/.test(u));
  if (!(await e2ee.botsCanEncrypt(bots))) throw new Error("This page's app isn't set up for encryption on your server yet (the server admin turns it on)");
  try { await matrix.setState(roomId, "m.room.encryption", { algorithm: "m.megolm.v1.aes-sha2", rotation_period_ms: 604_800_000, rotation_period_msgs: 100 }); }
  catch (e) {
    if (!(e instanceof ApiError && e.status === 403)) throw new Error((e as Error).message);
    // Pages from connected apps belong to the app's bot, so you can't change them yourself: the server does it for you.
    try { await pager.encryptRoom(roomId); }
    catch (x) { throw new Error(x instanceof ApiError && x.status === 409 ? "The server isn't set up to turn encryption on for you (the admin turns on server control)" : (x as Error).message); }
  }
  patchChat(roomId, (c) => ({ ...c, encrypted: true }));
}

/** Turns encryption on for every page that can take it. Returns how many were turned on and the names of those that could not. */
export async function enableEncryptionForAll(onProgress?: (done: number, total: number) => void): Promise<{ done: number; failed: { name: string; why: string }[] }> {
  const todo = Object.values(state.chats).filter((c) => !c.encrypted && !isBotRoom(c, me()) && !isStoriesRoom(c));
  let done = 0; const failed: { name: string; why: string }[] = [];
  for (const [i, c] of todo.entries()) {
    try { await enableEncryption(c.id); done++; } catch (e) { failed.push({ name: displayName(c, me()), why: (e as Error).message }); }
    onProgress?.(i + 1, todo.length);
  }
  return { done, failed };
}

/** Every message key on this device, scrambled with a passphrase, as text for a file. */
export async function exportKeyFile(passphrase: string): Promise<string> {
  if (!e2ee) throw new Error("Encryption is not ready yet");
  return e2ee.exportKeys(passphrase);
}
/** Reads a key file; returns how many keys were new here. */
export async function importKeyFile(text: string, passphrase: string): Promise<number> {
  if (!e2ee) throw new Error("Encryption is not ready yet");
  const n = await e2ee.importKeys(text, passphrase); void retryWaiting(); return n;
}

// Messages to one page go through encryption one after another. The first message in a page is slow (it has to share keys), and a quick
// second one used to overtake it, so they arrived in the wrong order.
const sendQueues = new Map<string, Promise<unknown>>();
sendHook.fn = (roomId, type, content) => {
  const run = async () => {
    const chat = state.chats[roomId];
    if (!chat?.encrypted) return { type, content };
    if (!e2ee) throw new Error("Encryption is not ready yet. Try again in a moment.");
    const encrypted = await e2ee.encrypt(roomId, type, content, await roomMembers(roomId));
    // Relations (edits, replies, reactions) stay visible outside the encryption so the server can group them.
    return { type: "m.room.encrypted", content: content?.["m.relates_to"] ? { ...encrypted, "m.relates_to": content["m.relates_to"] } : encrypted };
  };
  const next = (sendQueues.get(roomId) ?? Promise.resolve()).then(run, run);
  sendQueues.set(roomId, next.catch(() => {}));
  return next;
};

/**
 * A brand-new device gets no chats until its keys are entered: while the key step is open it receives only what it needs to finish it
 * (keys and account data), then everything. Devices that already have their keys, or have saved chats, start as usual.
 */
/** Paused while a new account's phone could not read its messages: switch on once the cause is found. */
const HOLD_NEW_DEVICES = false;
async function holdUntilKeys(s: Session, signal: AbortSignal) {
  if (!HOLD_NEW_DEVICES || since !== undefined || !e2ee) return;
  const flagKey = `pager.keysetup.${s.userId}.${e2ee.deviceId}`;
  const seenKey = () => { try { return localStorage.getItem(flagKey) === "1"; } catch { return true; } };
  let token: string | undefined;
  while (!signal.aborted && e2ee && !seenKey() && !(await e2ee.backupOn())) {
    try {
      const res = await matrix.syncKeysOnly(token, signal); token = res.next_batch;
      try { await e2ee.receiveSync(res); } catch { await new Promise((r) => setTimeout(r, 500)); await e2ee.receiveSync(res); } // the keys in this update will not be sent again
    } catch { await new Promise((r) => setTimeout(r, 2000)); }
    if (token) await new Promise((r) => setTimeout(r, 800));
  }
}

async function syncLoop(s: Session, signal: AbortSignal) {
  await holdUntilKeys(s, signal).catch(() => {});
  let backoff = 1000;
  while (!signal.aborted) {
    try {
      const res = await matrix.sync(since, signal);
      // If reading the encrypted parts goes wrong, show the update with those messages still locked rather than never moving on.
      try { await decryptSync(res); } catch (e) { console.warn("problem decrypting an update", e); }
      const initial = since === undefined;
      const r = applySync(state.chats, res, s.userId, initial);
      set({ chats: r.chats, synced: true, ...(r.muted ? { muted: r.muted } : {}), ...(r.userStickers ? { userStickers: r.userStickers } : {}) });
      // The update is in: move on to the next one now, whatever the notifications and bookkeeping below do. One failure there must never make
      // this device read the same update again forever (that left it out of step with your other devices).
      since = typeof res.next_batch === "string" ? res.next_batch : since;
      try {
        // Pages whose newest events were all bookkeeping arrive with no messages: fetch a few older messages for the first of them now, so
        // the list shows something to read instead of "No messages yet" until each one is opened.
        if (initial) { const empty = Object.values(r.chats).filter((c) => !c.messages.length && !c.reachedStart).slice(0, 25); empty.forEach((c, i) => window.setTimeout(() => loadOlder(c.id), 150 * i)); }
        if (r.userStickers) lsSet("pager.userStickers", r.userStickers);
        for (const [type, c] of Object.entries(r.accountData ?? {})) if (type.startsWith("app.pager.contacts.")) {
          const rows = Array.isArray(c.rows) ? (c.rows as unknown[]).filter((x): x is [string, string] => Array.isArray(x) && typeof x[0] === "string" && typeof x[1] === "string") : [];
          addToPhonebook(rows.map(([number, name]) => ({ number, name })), true, true);
          if (typeof c.chunks === "number") contactChunks = Math.max(contactChunks, c.chunks);
        }
        const al = r.accountData?.["app.pager.aliases"]?.names;
        if (al && typeof al === "object" && !Array.isArray(al)) { const names = Object.fromEntries(Object.entries(al as Record<string, unknown>).filter(([, v]) => typeof v === "string")) as Record<string, string>; set({ aliases: names }); lsSet("pager.aliases", names); setAliases(names); }
        const lk = r.accountData?.["app.pager.links"]?.groups;
        if (Array.isArray(lk)) { const groups = (lk as unknown[]).filter((g): g is string[] => Array.isArray(g) && g.every((x) => typeof x === "string")); set({ links: groups }); lsSet("pager.links", groups); }
        const fav = r.accountData?.["app.pager.favorite_gifs"]?.gifs;
        if (Array.isArray(fav)) { set({ favoriteGifs: fav as Gif[] }); lsSet("pager.favoriteGifs", fav); }
        r.invites.forEach((id) => void matrix.join(id).catch(() => {}));
        const muted = state.muted, st = getSettings();
        const when = new Date();
        for (const m of r.incoming) {
          const c = r.chats[m.roomId];
          if (m.attention && !initial && m.id && isFresh(m.ts) && !muted.includes(m.roomId)) raise({ id: m.id, roomId: m.roomId, chat: m.chat, sender: m.sender, kind: m.attention, mxc: m.attention === "image" ? m.mxc : undefined });
          if (st.convoSounds && looking(m.roomId) && attended()) { playSound(m.reaction ? st.reactionSound : st.receiveSound, st.convoSoundVolume); continue; }
          const d = decide({ roomId: m.roomId, network: m.network, isGroup: m.isGroup, mentioned: m.mentioned, replyToMe: m.replyToMe, text: m.text,
            quiet: muted.includes(m.roomId) || (c ? isLowPriority(c) : false), pinned: c ? isPinned(c) : false, nowMin: when.getHours() * 60 + when.getMinutes(), day: when.getDay() }, st);
          if (!d.show) continue;
          notify(m, d);
        }
        if (getSettings().unarchiveOnMessage) {
          for (const id of new Set(r.incoming.map((m) => m.roomId))) if (!muted.includes(id) && state.chats[id] && isArchived(state.chats[id])) setTag(id, "u.archived", false);
        }
        expireMutes();
      } catch (e) { console.warn("problem after an update", e); }
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

/** Signs out right away; telling the server (so the token stops working) is best effort and never blocks you. */
/** Disconnects every connected app, deletes the account and clears this device. Throws if the password is wrong. */
export async function deleteProfile(password: string) {
  const s = state.session; if (!s) return;
  await matrix.deactivate(s.userId, password);
  await signOutLocal();
}

export async function signOut() {
  const logout = matrix.logout().catch(() => { /* token may already be invalid, or the server is unreachable */ });
  await Promise.race([logout, new Promise((r) => setTimeout(r, 2500))]);
  await signOutLocal();
}
async function signOutLocal() {
  syncAbort?.abort();
  window.clearInterval(retryTimer); e2ee?.close(); e2ee = undefined; waiting.clear(); memberCache.clear();
  localStorage.removeItem(SESSION_KEY);
  try { localStorage.removeItem("pager.identity2"); } catch { /* ignore */ }
  await dbDel("cache");
  http.token = ""; since = undefined;
  blobCache.clear(); void diskSweep(true); forgetTranscripts();
  set({ session: undefined, chats: {}, synced: false, muted: [], bridges: [], isAdmin: false });
}

// ---- Notifications ----------------------------------------------------------------------

function notify(m: Incoming, d: Decision) {
  const inApp = attended();
  // The alert sound plays for a page you are not looking at even while you are in Pager; the pop-up only appears when you are not.
  if (inApp) { if (!d.silent) playSound(m.reaction ? getSettings().reactionSound : d.sound, getSettings().notifSoundVolume); return; }
  const body = d.preview === "full" ? (m.isGroup ? `${m.sender}: ${m.text}` : m.text) : d.preview === "sender" ? m.sender : "New message";
  const desktop = window.pagerDesktop;
  // We play the sound ourselves (so it can differ per app and per contact) and keep the system notification quiet.
  if (!d.silent) playSound(m.reaction ? getSettings().reactionSound : d.sound, getSettings().notifSoundVolume);
  if (desktop) { desktop.notify({ title: m.chat, body, roomId: m.roomId, silent: true }); return; }
  if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
  const n = new Notification(m.chat, { body, tag: m.roomId, silent: true });
  n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent("pager:open", { detail: m.roomId })); };
}

export function requestNotifications() { if (typeof Notification !== "undefined" && Notification.permission === "default") void Notification.requestPermission(); }

function updateBadge() {
  const st = getSettings();
  const n = st.notifBadge === "off" ? 0 : Object.values(state.chats).filter((c) => !isArchived(c) && (st.notifBadge === "all" || (!state.muted.includes(c.id) && !isLowPriority(c))) && !st.hiddenNetworks.includes(c.network) && (c.unread > 0 || c.markedUnread)).length;
  document.title = n ? `(${n}) Pager` : "Pager";
  window.pagerDesktop?.setBadge(n);
}

// ---- Chat mutations ------------------------------------------------------------------------

function patchChat(roomId: string, f: (c: ChatState) => ChatState) {
  const c = state.chats[roomId]; if (!c) return;
  const next = f(c); if (next === c) return;
  set({ chats: { ...state.chats, [roomId]: next } });
}
// The page you are looking at: sending and receiving make a little sound there (and only there).
let openRoom: string | null = null;
export const setOpenRoom = (id: string | null) => { openRoom = id; };
const looking = (roomId: string) => roomId === openRoom && document.visibilityState === "visible";
const addLocal = (roomId: string, m: Msg) => {
  const st = getSettings();
  if (st.convoSounds && looking(roomId)) playSound(st.sendSound, st.convoSoundVolume);
  patchChat(roomId, (c) => ({ ...c, messages: [...c.messages, m] }));
};
const setStatus = (roomId: string, id: string, status: number, newId?: string) =>
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === id ? { ...m, status, id: newId ?? m.id } : m)) }));
const uuid = () => crypto.randomUUID();
const localMsg = (id: string, type: string, body: string, extra: Partial<Msg> = {}): Msg => ({ id, sender: me(), ts: Date.now(), type, body, status: STATUS_SENDING, mentions: [], ...extra });

export function send(roomId: string, text: string, replyTo?: string, mentions: string[] = []) {
  const txn = uuid(), localId = `local-${txn}`;
  const html = getSettings().markdown ? markdownToHtml(text) : undefined;
  addLocal(roomId, localMsg(localId, "m.text", text, { replyTo, txn, mentions, html }));
  setDraft(roomId, "");
  matrix.send(roomId, "m.room.message", txn, textContent(text, replyTo, mentions, html))
    .then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}
const textContent = (text: string, replyTo?: string, mentions: string[] = [], html?: string) => ({
  msgtype: "m.text", body: text,
  ...(html ? { format: "org.matrix.html", formatted_body: html } : {}),
  ...(replyTo ? { "m.relates_to": { "m.in_reply_to": { event_id: replyTo } } } : {}),
  ...(mentions.length ? { "m.mentions": { user_ids: mentions } } : {}),
});

/** In a merged view a message may belong to another chat of the same person: find the chat that has it. */
export function roomFor(roomId: string, eventId: string): string {
  if (state.chats[roomId]?.messages.some((m) => m.id === eventId)) return roomId;
  for (const id of groupOf(state.links, roomId) ?? []) if (state.chats[id]?.messages.some((m) => m.id === eventId)) return id;
  return roomId;
}
/** Look at one network of a linked person on its own (true), or all of them together again (false). */
export function setSolo(roomId: string, on: boolean) {
  const group = groupOf(state.links, roomId) ?? [roomId];
  set({ solo: on ? [...new Set([...state.solo, roomId])] : state.solo.filter((id) => !group.includes(id)) });
}

export function retry(roomId: string, m: Msg) {
  roomId = roomFor(roomId, m.id); patchChat(roomId, (c) => ({ ...c, messages: c.messages.filter((x) => x.id !== m.id) })); send(roomId, m.body, m.replyTo, m.mentions); }

export function edit(roomId: string, eventId: string, text: string) {
  roomId = roomFor(roomId, eventId);
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.map((m) => (m.id === eventId ? { ...m, body: text, edited: true } : m)) }));
  void matrix.send(roomId, "m.room.message", uuid(), { msgtype: "m.text", body: `* ${text}`, "m.new_content": { msgtype: "m.text", body: text }, "m.relates_to": { rel_type: "m.replace", event_id: eventId } }).catch(() => {});
}

export function remove(roomId: string, eventId: string) {
  roomId = roomFor(roomId, eventId);
  patchChat(roomId, (c) => ({ ...c, messages: c.messages.filter((m) => m.id !== eventId) }));
  set({ stars: state.stars.filter((s) => s.eventId !== eventId) }); lsSet("pager.stars", state.stars);
  void matrix.redact(roomId, eventId, uuid()).catch(() => {});
}

/** Adds your reaction, or removes it if you already used that emoji. */
export function react(roomId: string, eventId: string, key: string) {
  roomId = roomFor(roomId, eventId);
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

export async function forward(m: Msg, toRoom: string) {
  if (m.enc && m.mxc) { // an encrypted attachment: read it, and send it again as the destination page wants it (encrypted or not)
    const u = await mediaUrl(m.mxc); if (!u) return;
    sendFile(toRoom, await (await fetch(u)).blob(), m.body, { w: m.w, h: m.h, durationMs: m.durationMs, voice: m.voice });
    return;
  }
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

/** Marks a chat read; chats shown merged with it are marked read together. */
export function markRead(roomId: string) {
  const ids = !state.solo.includes(roomId) ? groupOf(state.links, roomId) ?? [roomId] : [roomId];
  for (const id of ids) markReadOne(id);
}
function markReadOne(roomId: string) {
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

/** [viewOnce]: Signal shows the picture or video once and then it is gone (the bridge turns this into Signal's own view-once). */
export function sendAttention(roomId: string, kind: AttentionKind) {
  const txn = uuid(), localId = `local-${txn}`, text = attentionText(kind);
  addLocal(roomId, localMsg(localId, "m.text", text, { txn, attention: kind }));
  matrix.send(roomId, "m.room.message", txn, { msgtype: "m.text", body: text, [ATTENTION_FIELD]: { kind } })
    .then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}
export function sendFile(roomId: string, file: File | Blob, name = (file as File).name || "file", extra: Partial<Msg> & { viewOnce?: boolean; caption?: string } = {}) {
  const mime = file.type || "application/octet-stream";
  const type = mime.startsWith("image/") ? "m.image" : mime.startsWith("video/") ? "m.video" : mime.startsWith("audio/") ? "m.audio" : "m.file";
  const txn = uuid(), localId = `local-${txn}`;
  addLocal(roomId, localMsg(localId, type, name, { mime, size: file.size, txn, ...extra, viewOnce: undefined, caption: extra.caption?.trim() || undefined } as Partial<Msg>));
  void (async () => {
    try {
      let w = extra.w, h = extra.h;
      if (type === "m.image" && !w) { const d = await imageSize(file); w = d?.w; h = d?.h; }
      // In an encrypted room the file is scrambled first; the key goes inside the (encrypted) message.
      const sealed = state.chats[roomId]?.encrypted ? await encryptAttachment(file) : undefined;
      const mxc = await matrix.upload(sealed ? sealed.data : file, sealed ? "encrypted" : name);
      const info: Record<string, unknown> = { mimetype: mime, size: file.size, ...(w ? { w, h } : {}), ...(extra.durationMs ? { duration: extra.durationMs } : {}) };
      const id = await matrix.send(roomId, "m.room.message", txn, {
        msgtype: type, body: extra.caption?.trim() || name, ...(extra.caption?.trim() ? { filename: name } : {}), ...(sealed ? { file: { url: mxc, ...sealed.file } } : { url: mxc }), info,
        ...(extra.viewOnce && (type === "m.image" || type === "m.video") ? { "com.beeper.view_limited": { type: "count", count: 1 } } : {}),
        ...(extra.attention ? { [ATTENTION_FIELD]: { kind: extra.attention } } : {}),
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
  roomId = roomFor(roomId, m.id);
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
      if (r.snooze) { setTag(r.roomId, "u.archived", false); markUnread(r.roomId, true); }
      if (window.pagerDesktop) window.pagerDesktop.notify({ title: r.snooze ? r.chat : `Reminder: ${r.chat}`, body: "You asked to be reminded about this chat.", roomId: r.roomId });
      else if (typeof Notification !== "undefined" && Notification.permission === "granted") new Notification(`Reminder: ${r.chat}`, { body: "You asked to be reminded about this chat." });
    };
    timers.set(r.id, window.setTimeout(fire, Math.max(0, Math.min(r.whenMs - now, 2 ** 31 - 1))));
  }
}
export function remind(roomId: string, whenMs: number, snoozed = false) {
  const c = state.chats[roomId];
  set({ reminders: [...state.reminders, { id: uuid(), roomId, chat: c ? displayName(c, me()) : "a page", whenMs, snooze: snoozed }] }); lsSet("pager.reminders", state.reminders);
  armReminders();
}
export function cancelReminder(r: Reminder) { window.clearTimeout(timers.get(r.id)); timers.delete(r.id); set({ reminders: state.reminders.filter((x) => x.id !== r.id) }); lsSet("pager.reminders", state.reminders); }

// ---- Search & link previews ---------------------------------------------------------------

export const search = (term: string, roomId?: string): Promise<SearchHit[]> => matrix.search(term, roomId).catch(() => []);

/** Searches everything already on this device. kind narrows by media type: all, images, videos, links, files. */
export function searchLocal(term: string, roomId: string | undefined, kind: string): SearchHit[] {
  const t = term.trim().toLowerCase(), url = /https?:\/\/\S+|www\.\S+/;
  return Object.values(state.chats).filter((c) => !roomId || c.id === roomId).flatMap((c) =>
    c.messages.filter((m) => m.status === STATUS_SENT && (kind === "images" ? m.type === "m.image" && !m.sticker : kind === "videos" ? m.type === "m.video" : kind === "files" ? m.type === "m.file" : kind === "links" ? url.test(m.body) : true) && (!t || m.body.toLowerCase().includes(t)))
      .map((m) => ({ roomId: c.id, eventId: m.id, sender: m.sender, text: m.type === "m.text" || m.type === "m.notice" ? m.body : previewOf(m), ts: m.ts })),
  ).sort((a, b) => b.ts - a.ts).slice(0, 200);
}

const previews = new Map<string, Promise<LinkPreview | undefined>>();
export const preview = (u: string) => { if (!previews.has(u)) previews.set(u, matrix.previewUrl(u).catch(() => undefined)); return previews.get(u)!; };

// ---- History & chat management ---------------------------------------------------------------

const loading = new Set<string>();
/** How many messages a page should have before we stop fetching older ones by ourselves. */
const FILL_MESSAGES = 30;
/** Low data fetches less history by itself; you can still scroll for more. */
const fillTarget = () => (getSettings().lowData ? 15 : FILL_MESSAGES);
/** When each chat was last being read above its newest messages, and whether it is right now. */
const deepAt = new Map<string, number>();
const deepNow = new Set<string>();
/** Chat.tsx reports whether the reader is scrolled up. Scrolling back down starts the clock for dropping the extra history. */
export function readingOlder(roomId: string, up: boolean) { if (up) { deepNow.add(roomId); deepAt.set(roomId, Date.now()); } else deepNow.delete(roomId); }
/** Drops the history pulled in by scrolling up once it has been left alone for a while, keeping only the newest messages. */
export function trimPulledHistory(now = Date.now()) {
  let chats: typeof state.chats | undefined;
  for (const c of Object.values(state.chats)) {
    if (c.messages.length <= keepMessages() || deepNow.has(c.id) || now - (deepAt.get(c.id) ?? 0) < poolClearMs(c.messages.length)) continue;
    chats ??= { ...state.chats };
    chats[c.id] = { ...c, messages: c.messages.slice(-keepMessages()), prevBatch: null, reachedStart: false };
  }
  if (chats) set({ chats });
}
const keepMessages = () => (getSettings().lowEnd ? LOW_END_KEEP : KEEP_MESSAGES);
window.setInterval(() => trimPulledHistory(), 30_000);

/** The desktop app watches its own memory and says how tight it is: "high" over 300 MB, "critical" over 400, "hidden" while it sits in the tray. */
export type MemoryLevel = "ok" | "high" | "critical" | "hidden";
const KEEP_IDLE = 40, KEEP_TIGHT = 20;
export function squeezeMemory(level: MemoryLevel) {
  if (level === "ok") return;
  const idleKeep = level === "high" ? KEEP_IDLE : KEEP_TIGHT;
  // The chat on screen keeps its messages unless memory is critical; someone scrolled up in it keeps up to 500 so the page doesn't jump.
  const openKeep = level === "critical" ? (deepNow.has(openRoom ?? "") ? 500 : 150) : level === "hidden" ? idleKeep : KEEP_MESSAGES;
  let chats: typeof state.chats | undefined;
  for (const c of Object.values(state.chats)) {
    const keep = c.id === openRoom ? openKeep : idleKeep;
    if (c.messages.length <= keep) continue;
    chats ??= { ...state.chats };
    chats[c.id] = { ...c, messages: c.messages.slice(-keep), prevBatch: null, reachedStart: false };
    deepAt.delete(c.id);
  }
  if (chats) set({ chats });
}
window.pagerDesktop?.onMemory?.((level) => squeezeMemory(level as MemoryLevel));
export function loadOlder(roomId: string, pages = 0) {
  const c = state.chats[roomId];
  if (!c || c.reachedStart || loading.has(roomId)) return;
  const token = c.prevBatch ?? since; if (!token) return;
  loading.add(roomId);
  matrix.messages(roomId, token).then(async ({ chunk, end, state: st }) => { const clear = await decryptEvents(roomId, chunk); deepAt.set(roomId, Date.now()); patchChat(roomId, (x) => applyHistory(x, clear, end, st ?? [], state.session?.userId ?? "")); }).catch(() => {}).finally(() => {
    loading.delete(roomId);
    // A page can be all bookkeeping (people joining, send statuses) and add nothing to show. The list then doesn't change, so nothing
    // would ask for the next page and the history would sit there until something else (like sending a message) woke it up.
    const n = state.chats[roomId];
    if (n && !n.reachedStart && pages < 8 && n.messages.length < fillTarget() && (n.prevBatch ?? since) !== token) loadOlder(roomId, pages + 1);
  });
}
export function setTag(roomId: string, tag: string, on: boolean, order?: number) {
  patchChat(roomId, (c) => ({
    ...c, tags: on ? [...new Set([...c.tags, tag])] : c.tags.filter((t) => t !== tag),
    ...(tag === "m.favourite" ? { pinOrder: on ? order ?? c.pinOrder : undefined } : {}),
  }));
  void matrix.setTag(me(), roomId, tag, on, order).catch(() => {});
}

const pinnedChats = () => Object.values(state.chats).filter(isPinned).sort((a, b) => (a.pinOrder ?? Number.MAX_VALUE) - (b.pinOrder ?? Number.MAX_VALUE));
/** Pins a chat at the end of the pin row, or unpins it. */
export function pin(roomId: string, on: boolean) {
  if (!on) return setTag(roomId, "m.favourite", false);
  const last = Math.max(0, ...pinnedChats().filter((c) => c.id !== roomId).map((c) => c.pinOrder ?? 0));
  setTag(roomId, "m.favourite", true, last + 1);
}
/** Moves a pinned chat to [toIndex] within the pin row. */
export function movePin(roomId: string, toIndex: number) {
  const others = pinnedChats().filter((c) => c.id !== roomId);
  const i = Math.max(0, Math.min(toIndex, others.length));
  const before = others[i - 1]?.pinOrder, after = others[i]?.pinOrder;
  const order = before === undefined && after === undefined ? 1 : before === undefined ? after! - 1 : after === undefined ? before + 1 : (before + after) / 2;
  setTag(roomId, "m.favourite", true, order);
}
export const setLowPriority = (roomId: string, on: boolean) => setTag(roomId, "m.lowpriority", on);
export const addLabel = (roomId: string, name: string) => setTag(roomId, LABEL_PREFIX + name.trim(), true);
export const removeLabel = (roomId: string, name: string) => setTag(roomId, LABEL_PREFIX + name, false);
export function renameLabel(old: string, next: string) {
  if (!next.trim() || next === old) return;
  Object.values(state.chats).filter((c) => labelsOf(c).includes(old)).forEach((c) => { removeLabel(c.id, old); addLabel(c.id, next); });
}
export const deleteLabel = (name: string) => Object.values(state.chats).filter((c) => labelsOf(c).includes(name)).forEach((c) => removeLabel(c.id, name));
export function useLabels(): string[] {
  const chats = useStore((s) => s.chats);
  return useMemo(() => [...new Set(Object.values(chats).flatMap(labelsOf))].sort(), [chats]);
}

/** Beeper-style snooze: tuck the chat into the archive and bring it back, unread, at [whenMs]. */
export function snooze(roomId: string, whenMs: number) {
  setTag(roomId, "u.archived", true);
  remind(roomId, whenMs, true);
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
/** Takes a page out of Pager. With [atSource], the bridge is first asked to delete the conversation on its own network too (Signal, WhatsApp, Google Messages). */
export function leave(roomId: string, atSource = false) {
  const { [roomId]: _gone, ...rest } = state.chats; set({ chats: rest });
  void (async () => {
    if (atSource) {
      try { await matrix.send(roomId, "com.beeper.delete_chat", uuid(), { delete_for_everyone: false }); await new Promise((r) => setTimeout(r, 2500)); } catch { /* still leave the room below */ }
    }
    await matrix.leave(roomId).catch(() => {});
  })();
}

/** Loads the whole history of every page onto this device, one page at a time. [onProgress] gets (pages finished, pages in all). */
export async function loadEveryHistory(onProgress: (done: number, total: number) => void, signal?: AbortSignal) {
  const ids = Object.values(state.chats).filter((c) => !c.reachedStart).sort((a, b) => lastTs(b) - lastTs(a)).map((c) => c.id);
  for (let i = 0; i < ids.length && !signal?.aborted; i++) { onProgress(i, ids.length); await loadWholeHistory(ids[i], undefined, signal); }
  onProgress(ids.length, ids.length);
}

/** Loads every older message of a page onto this device (as far back as the server has them). Resolves true when the start was reached. */
export async function loadWholeHistory(roomId: string, onProgress?: (loaded: number) => void, signal?: AbortSignal): Promise<boolean> {
  for (let i = 0; i < 600 && !signal?.aborted; i++) {
    const c = state.chats[roomId]; if (!c || c.reachedStart) break;
    const token = c.prevBatch ?? since; if (!token) break;
    try {
      const { chunk, end, state: st } = await matrix.messages(roomId, token);
      const clear = await decryptEvents(roomId, chunk);
      patchChat(roomId, (x) => applyHistory(x, clear, end, st ?? [], state.session?.userId ?? ""));
    } catch { break; }
    const n = state.chats[roomId]; onProgress?.(n?.messages.length ?? 0);
    if (n && (n.prevBatch ?? since) === token) break;
  }
  return !!state.chats[roomId]?.reachedStart;
}

/** localpart escaping used by the bridges for ghost user ids (uppercase and odd characters are escaped). */
const escLocalpart = (s: string) => [...s].map((c) => (/[a-z0-9\-./=]/.test(c) ? c : c === "_" ? "__" : /[A-Z]/.test(c) ? "_" + c.toLowerCase() : "=" + c.charCodeAt(0).toString(16).padStart(2, "0"))).join("");
const savedIdentity = lsGet<{ key: string; names: string[]; ids: string[] } | null>("pager.identity2", null);
let identityKey = savedIdentity?.key ?? "";
if (savedIdentity) setOwnIdentity(savedIdentity.names, savedIdentity.ids);
function applyIdentity(nets: Network[]) {
  const domain = state.session?.userId.split(":").slice(1).join(":") ?? "";
  const names: string[] = [], ids: string[] = [];
  for (const n of nets) for (const l of n.logins) {
    ids.push(`@${n.id}_${escLocalpart(l.id)}:${domain}`);
    for (const nm of [l.name, l.profile?.name]) if (nm) names.push(nm);
  }
  const key = JSON.stringify([names.sort(), ids.sort()]);
  if (key === identityKey) return;
  identityKey = key; lsSet("pager.identity2", { key, names, ids });
  setOwnIdentity(names, ids);
  // Messages already loaded were attributed before we knew who you are on each network: start over once.
  if (state.session) { since = undefined; set({ chats: {}, synced: false }); syncAbort?.abort(); syncAbort = new AbortController(); void syncLoop(state.session, syncAbort.signal); }
}
export async function refreshBridges() {
  if (!state.session) return;
  try { const nets = await pager.networks(); applyIdentity(nets); set({ bridges: nets }); void loadPhonebook(nets); warnLost(nets); void warnUpdates(nets); } catch { /* bridge API may be down */ }
}
/** Admins: the weekly bridge update changed something, so say so (once per update). */
async function warnUpdates(nets: Network[]) {
  if (!state.isAdmin || !getSettings().updateAlerts || !getSettings().notifEnabled) return;
  try {
    const entries = await pager.admin.bridgeUpdates();
    const fresh = freshUpdates(lsGet<string | undefined>("pager.updatesSeen", undefined), entries);
    if (entries.length) lsSet("pager.updatesSeen", entries[entries.length - 1].at);
    for (const u of fresh) {
      const { title, body } = updateText(u, (id) => nets.find((n) => n.id === id)?.name ?? id);
      if (window.pagerDesktop) { window.pagerDesktop.notify({ title, body }); continue; }
      if (typeof Notification === "undefined" || Notification.permission !== "granted") continue;
      const n = new Notification(title, { body, tag: `update-${u.at}` });
      n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent("pager:nav", { detail: "settings/admin" })); };
    }
  } catch { /* not an admin, or the server is busy */ }
}
/** A login that just broke (Google ended the pairing, say) raises a notification, once, wherever Pager is running. */
function warnLost(nets: Network[]) {
  const { remembered, fresh } = newlyLost(lsGet<string[]>("pager.lostLogins", []), nets);
  lsSet("pager.lostLogins", remembered);
  if (!fresh.length || !getSettings().accountAlerts || !getSettings().notifEnabled) return;
  for (const l of fresh) {
    const { title, body } = lostText(l);
    if (window.pagerDesktop) { window.pagerDesktop.notify({ title, body }); continue; }
    if (typeof Notification === "undefined" || Notification.permission !== "granted") continue;
    const n = new Notification(title, { body, tag: `lost-${l.key}` });
    n.onclick = () => { window.focus(); window.dispatchEvent(new CustomEvent("pager:nav", { detail: "settings/bridges" })); };
  }
}
// Contacts you import sync to your account (Matrix account data, in chunks to stay under its size limit) so every device shows the same names.
let contactChunks = 0;
export async function syncContacts() {
  const u = me(); if (!u) return;
  const rows = ownContacts(), size = 500, count = Math.max(1, Math.ceil(rows.length / size));
  for (let i = 0; i < Math.max(count, contactChunks); i++) {
    try { await matrix.putAccountData(u, `app.pager.contacts.${i}`, { rows: rows.slice(i * size, (i + 1) * size), chunks: count }); } catch { /* try again on the next import */ }
  }
  contactChunks = count;
}
// Names for bare phone numbers come from your bridges' contact lists (WhatsApp, Signal and Google Messages know your address book).
onPhonebookChange(() => set({ chats: { ...state.chats } }));
let bookAt = 0;
async function loadPhonebook(nets: Network[]) {
  if (Date.now() - bookAt < 30 * 60_000) return;
  bookAt = Date.now();
  for (const n of nets) for (const l of n.logins) {
    try { addToPhonebook((await pager.contacts(n.id, l.id)).filter((c) => c.detail).map((c) => ({ number: c.detail!, name: c.name }))); } catch { /* this network has no contact list */ }
  }
}
let bridgeTick = 0;
// Also while the window is hidden: that is when a lost login most needs to reach you.
window.setInterval(() => { if (!getSettings().lowData || ++bridgeTick % 5 === 0) void refreshBridges(); }, 120_000);

/** Gives a chat a name only you see (empty puts the real name back). Saved in your account. */
export function setAlias(roomId: string, name: string) {
  const next = { ...state.aliases }; if (name.trim()) next[roomId] = name.trim(); else delete next[roomId];
  setAliases(next); set({ aliases: next }); lsSet("pager.aliases", next);
  void matrix.putAccountData(me(), "app.pager.aliases", { names: next }).catch(() => {});
}

/** Show chats with the same person on different networks as one row, or split them again. Saved in your account. */
export function setLinks(next: Links) {
  set({ links: next }); lsSet("pager.links", next);
  void matrix.putAccountData(me(), "app.pager.links", { groups: next }).catch(() => {});
}

// ---- Media (Synapse requires auth for downloads) ------------------------------------------------

// Only about 40 MB of downloaded pictures stay in memory; older ones are let go and fetched again if needed (see lru.ts).
const blobCache = new BlobCache(12 * 1024 * 1024);
// Pictures wait on disk (the browser's Cache Storage) instead, and are cleared after a few hours, so they do not sit in memory.
const DISK_NAME = "pager-media", DISK_HOURS = 6;
const diskKey = (key: string) => `https://media.pager.invalid/${encodeURIComponent(key)}`;
const diskOpen = () => (typeof caches === "undefined" ? Promise.resolve(undefined) : caches.open(DISK_NAME).catch(() => undefined));
async function diskGet(key: string): Promise<Blob | undefined> { try { const r = await (await diskOpen())?.match(diskKey(key)); return r ? await r.blob() : undefined; } catch { return undefined; } }
async function diskPut(key: string, blob: Blob) { try { await (await diskOpen())?.put(diskKey(key), new Response(blob, { headers: { "x-saved": String(Date.now()), "content-type": blob.type } })); } catch { /* disk full or private mode: memory only */ } }
async function diskSweep(all = false) {
  try {
    const c = await diskOpen(); if (!c) return;
    for (const req of await c.keys()) {
      const saved = Number((await c.match(req))?.headers.get("x-saved") ?? 0);
      if (all || Date.now() - saved > DISK_HOURS * 3600_000) await c.delete(req);
    }
  } catch { /* ignore */ }
}
void diskSweep(); window.setInterval(() => void diskSweep(), 30 * 60_000);
const inflight = new Map<string, Promise<string | undefined>>();
/** Already-downloaded media, available synchronously (avoids flashing placeholders). */
export const cachedMedia = (mxc: string, thumb = 0) => blobCache.get(`${mxc}|${thumb}`);
export function mediaUrl(mxc: string, thumb = 0): Promise<string | undefined> {
  // Low data: pictures come in at about half the size (originals, thumb 0, are only fetched when you open one).
  if (thumb > 0 && getSettings().lowData) thumb = Math.max(48, Math.round(thumb / 2));
  const key = `${mxc}|${thumb}`;
  const hit = blobCache.get(key); if (hit) return Promise.resolve(hit);
  if (inflight.has(key)) return inflight.get(key)!;
  const m = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
  if (!m) return Promise.resolve(undefined);
  const secret = encryptedInfo(mxc); // end-to-end encrypted attachment: the server holds only scrambled bytes, so no thumbnails
  const path = thumb && !secret ? `thumbnail/${m[1]}/${m[2]}?width=${thumb}&height=${thumb}&method=scale` : `download/${m[1]}/${m[2]}`;
  const p = diskGet(key).then((saved) => saved ? URL.createObjectURL(saved) : undefined).then((u) => u ? (blobCache.set(key, u, 1), u) : undefined).then((u) => u ? u : fetch(url(`/_matrix/client/v1/media/${path}`), { headers: { authorization: `Bearer ${http.token}` } })
    .then(async (r) => {
      if (!r.ok) return undefined;
      const blob = secret ? new Blob([await decryptAttachment(await r.arrayBuffer(), secret)], { type: secret.mime ?? "application/octet-stream" }) : await r.blob();
      // A preview of a big picture is scaled down once and only that small copy is kept (see shrink.ts).
      const shown = thumb > 0 ? await shrinkImage(blob, thumb) : blob;
      void diskPut(key, shown);
      const u = URL.createObjectURL(shown); blobCache.set(key, u, shown.size); return u;
    }))
    .catch(() => undefined).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

import type { SystemTheme } from "./settings";

declare global {
  interface Window {
    pagerDesktop?: {
      notify(o: { title: string; body: string; roomId?: string; silent?: boolean }): void;
      setBadge(n: number): void;
      getAutostart(): Promise<boolean>; setAutostart(on: boolean): void; setPrefs(p: { closeToTray?: boolean; startMinimized?: boolean; smoothGraphics?: boolean; lowEnd?: boolean }): void; setZoom(z: number): void;
      onOpenRoom(cb: (roomId: string) => void): void;
      onWindowActive?(cb: (active: boolean) => void): void;
      onMemory?(cb: (level: string) => void): void;
      setTitleBar?(o: { color: string; symbolColor: string }): void;
      setIcon?(png: string): void;
      memory?(): Promise<{ total: number; parts: { type: string; mb: number }[] }>;
      cookieLogin(spec: unknown): Promise<Record<string, string> | null>;
      platform: string;
      hostname?: string;
      /** The encryption library's WebAssembly file, read by the desktop shell (the app is loaded from disk, where the browser can't fetch it). */
      readCryptoWasm?(): Promise<Uint8Array>;
      getSystemTheme(): Promise<SystemTheme>;
      onSystemTheme(cb: (t: SystemTheme) => void): void;
      getSpell(): Promise<{ enabled: boolean; languages: string[]; available: string[] }>;
      setSpell(o: { enabled?: boolean; languages?: string[] }): void;
    };
  }
}


// ---- Polls, GIFs, stickers, contacts ---------------------------------------------------------------

export function sendPoll(roomId: string, question: string, answers: string[], maxSelections: number, disclosed: boolean) {
  const txn = uuid(), localId = `local-${txn}`;
  const list = answers.map((text, i) => ({ id: `a${i + 1}`, text }));
  addLocal(roomId, localMsg(localId, "m.poll", question, { txn, poll: { question, answers: list, maxSelections, disclosed } }));
  matrix.send(roomId, "org.matrix.msc3381.poll.start", txn, {
    "org.matrix.msc3381.poll.start": {
      kind: disclosed ? "org.matrix.msc3381.poll.disclosed" : "org.matrix.msc3381.poll.undisclosed", max_selections: maxSelections,
      question: { "org.matrix.msc1767.text": question, body: question, msgtype: "m.text" },
      answers: list.map((a) => ({ id: a.id, "org.matrix.msc1767.text": a.text })),
    },
    "org.matrix.msc1767.text": `${question}\n${list.map((a, i) => `${i + 1}. ${a.text}`).join("\n")}`,
  }).then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}

export function votePoll(roomId: string, pollId: string, answerIds: string[]) {
  roomId = roomFor(roomId, pollId);
  patchChat(roomId, (c) => ({ ...c, pollVotes: { ...c.pollVotes, [pollId]: { ...(c.pollVotes[pollId] ?? {}), [me()]: answerIds } } }));
  void matrix.send(roomId, "org.matrix.msc3381.poll.response", uuid(), { "m.relates_to": { rel_type: "m.reference", event_id: pollId }, "org.matrix.msc3381.poll.response": { answers: answerIds } }).catch(() => {});
}

export function endPoll(roomId: string, pollId: string) {
  roomId = roomFor(roomId, pollId);
  patchChat(roomId, (c) => ({ ...c, pollEnded: [...c.pollEnded, pollId] }));
  void matrix.send(roomId, "org.matrix.msc3381.poll.end", uuid(), { "m.relates_to": { rel_type: "m.reference", event_id: pollId }, "org.matrix.msc1767.text": "The poll has ended." }).catch(() => {});
}

/** Stars or un-stars a GIF; the list lives in your Matrix account. */
export function toggleFavoriteGif(g: Gif) {
  const have = state.favoriteGifs.some((x) => x.url === g.url);
  const next = have ? state.favoriteGifs.filter((x) => x.url !== g.url) : [g, ...state.favoriteGifs].slice(0, 200);
  set({ favoriteGifs: next }); lsSet("pager.favoriteGifs", next);
  void matrix.putAccountData(me(), "app.pager.favorite_gifs", { gifs: next }).catch(() => {});
}

/** Adds a picture from a chat to your own stickers: no re-upload, it just points at the same file. */
export async function saveAsSticker(m: Msg) {
  if (!m.mxc) return;
  const existing = state.userStickers?.stickers ?? [];
  if (existing.some((s) => s.url === m.mxc)) return;
  const base = (m.body || "sticker").replace(/\.[^.]+$/, "").slice(0, 40) || "sticker";
  const added: Sticker = { shortcode: `${base.replace(/[^A-Za-z0-9_-]/g, "_")}_${Date.now() % 100000}`, url: m.mxc, body: base, w: m.w, h: m.h, mime: m.mime };
  const all = [...existing, added];
  const pack: StickerPack = { key: "user", name: "My stickers", stickers: all };
  set({ userStickers: pack }); lsSet("pager.userStickers", pack);
  await matrix.putAccountData(me(), "im.ponies.user_emotes", {
    pack: { display_name: "My stickers" },
    images: Object.fromEntries(all.map((s) => [s.shortcode, { url: s.url, body: s.body, usage: ["sticker"], info: { mimetype: s.mime, w: s.w, h: s.h } }])),
  }).catch(() => {});
}

/** Downloads a GIF so it can wait in the message box. */
export async function gifFile(gif: Gif): Promise<File> {
  const res = await fetch(gif.url);
  if (!res.ok) throw new Error("Couldn't download that GIF");
  const blob = await res.blob();
  return new File([blob], `${(gif.title || "gif").replace(/[^\w .-]/g, "").slice(0, 40) || "gif"}.gif`, { type: "image/gif" });
}
export async function sendGif(roomId: string, gif: Gif) { sendFile(roomId, await gifFile(gif), undefined, { w: gif.w || undefined, h: gif.h || undefined }); }

export function sendContact(roomId: string, name: string, phone: string) {
  const vcard = `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL;TYPE=CELL:${phone}\nEND:VCARD\n`;
  sendFile(roomId, new Blob([vcard], { type: "text/vcard" }), `${name.replace(/[^A-Za-z0-9 ._-]/g, "")}.vcf`);
}

export function stickerPacks(roomId?: string): StickerPack[] {
  return [...(state.userStickers?.stickers.length ? [state.userStickers] : []), ...(roomId ? state.chats[roomId]?.stickerPacks ?? [] : []).filter((p) => p.stickers.length)];
}

export function sendSticker(roomId: string, s: Sticker) {
  const txn = uuid(), localId = `local-${txn}`;
  addLocal(roomId, localMsg(localId, "m.image", s.body, { mxc: s.url, mime: s.mime, w: s.w, h: s.h, sticker: true, txn }));
  matrix.send(roomId, "m.sticker", txn, { body: s.body, url: s.url, info: { mimetype: s.mime, w: s.w, h: s.h } })
    .then((id) => setStatus(roomId, localId, STATUS_SENT, id)).catch(() => setStatus(roomId, localId, STATUS_FAILED));
}

/** Uploads images and adds them to your personal sticker pack (saved in your Matrix account). */
export async function addStickers(files: File[]) {
  const existing = state.userStickers?.stickers ?? [];
  const added: Sticker[] = [];
  for (const f of files) {
    try {
      const mxc = await matrix.upload(f, f.name);
      const dims = await new Promise<{ w: number; h: number } | undefined>((res) => { const u = URL.createObjectURL(f), i = new Image(); i.onload = () => { res({ w: i.naturalWidth, h: i.naturalHeight }); URL.revokeObjectURL(u); }; i.onerror = () => res(undefined); i.src = u; });
      const base = f.name.replace(/\.[^.]+$/, "");
      added.push({ shortcode: `${base.replace(/[^A-Za-z0-9_-]/g, "_") || "sticker"}_${Date.now() % 100000}`, url: mxc, body: base, w: dims?.w, h: dims?.h, mime: f.type });
    } catch { /* skip files that fail to upload */ }
  }
  if (!added.length) return;
  const all = [...existing, ...added];
  const pack: StickerPack = { key: "user", name: "My stickers", stickers: all };
  set({ userStickers: pack }); lsSet("pager.userStickers", pack);
  await matrix.putAccountData(me(), "im.ponies.user_emotes", {
    pack: { display_name: "My stickers" },
    images: Object.fromEntries(all.map((s) => [s.shortcode, { url: s.url, body: s.body, usage: ["sticker"], info: { mimetype: s.mime, w: s.w, h: s.h } }])),
  }).catch(() => {});
}

export { buildMerged };

/** What you last saved with "Sync settings" for computers and browsers, or nothing yet. */
export async function loadSavedSettings(): Promise<SavedSettings | undefined> {
  try { const c = await matrix.getAccountData(me(), SYNC_TYPE) as SavedSettings; return c && c.v === 3 && c.settings ? c : undefined; } catch { return undefined; }
}
/** Saves the chosen groups of this device's settings to your account, keeping what was saved for the other groups. */
export async function saveSettingsToAccount(groupIds: string[]): Promise<void> {
  const previous = await loadSavedSettings();
  await matrix.putAccountData(me(), SYNC_TYPE, mergeSaved(previous, groupIds, deviceLabel()));
}
