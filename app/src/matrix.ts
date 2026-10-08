import * as sdk from "matrix-js-sdk";
import { useEffect, useSyncExternalStore } from "react";
import { setApiToken } from "./api";

const SESSION_KEY = "pager.session";
interface Session { accessToken: string; userId: string; deviceId: string }

let client: sdk.MatrixClient | null = null;
let version = 0;
const listeners = new Set<() => void>();
const bump = () => {
  version++;
  listeners.forEach((l) => l());
};

const baseUrl = () => window.location.origin;

export function getClient() {
  return client;
}

function loadSession(): Session | null {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? "null");
  } catch {
    return null;
  }
}

function start(session: Session) {
  setApiToken(session.accessToken);
  client = sdk.createClient({ baseUrl: baseUrl(), ...session });
  const c = client;
  // Bridges invite you to every chat they create; accept them quietly.
  c.on(sdk.RoomMemberEvent.Membership, (_e, member) => {
    if (member.userId === c.getUserId() && member.membership === "invite") c.joinRoom(member.roomId).catch(() => {});
  });
  c.on(sdk.ClientEvent.Sync, bump);
  c.on(sdk.RoomEvent.Timeline, bump);
  c.on(sdk.RoomEvent.Name, bump);
  c.on(sdk.RoomEvent.Receipt, bump);
  c.on(sdk.RoomEvent.MyMembership, bump);
  return c.startClient({ initialSyncLimit: 30 });
}

export async function restoreSession() {
  const s = loadSession();
  if (!s) return false;
  await start(s);
  return true;
}

export async function signIn(username: string, password: string) {
  const tmp = sdk.createClient({ baseUrl: baseUrl() });
  const res = await tmp.login("m.login.password", {
    identifier: { type: "m.id.user", user: username },
    password,
    initial_device_display_name: "Pager Web",
  });
  const session = { accessToken: res.access_token, userId: res.user_id, deviceId: res.device_id };
  localStorage.setItem(SESSION_KEY, JSON.stringify(session));
  await start(session);
}

export async function signOut() {
  try {
    await client?.logout(true);
  } catch {
    /* token may already be invalid */
  }
  client?.stopClient();
  client = null;
  setApiToken("");
  localStorage.removeItem(SESSION_KEY);
  bump();
}

// --- Rooms -----------------------------------------------------------------

export interface ChatSummary {
  id: string;
  name: string;
  network: string;
  avatarMxc?: string;
  preview: string;
  ts: number;
  unread: number;
}

function networkOf(room: sdk.Room): string {
  const events = [
    ...room.currentState.getStateEvents("m.bridge"),
    ...room.currentState.getStateEvents("uk.half-shot.bridge"),
  ];
  const id = events[0]?.getContent()?.protocol?.id;
  return typeof id === "string" ? id : "matrix";
}

/** Bridge bots keep a "management" DM for login commands; users never need to see it. */
function isBotRoom(room: sdk.Room, myId: string) {
  const others = room.getJoinedMembers().filter((m) => m.userId !== myId);
  return others.length === 1 && /^@[a-z]*bot:/.test(others[0].userId);
}

function previewOf(ev: sdk.MatrixEvent | undefined) {
  if (!ev) return "";
  const c = ev.getContent();
  switch (c.msgtype) {
    case "m.image": return "📷 Photo";
    case "m.video": return "🎬 Video";
    case "m.audio": return "🎤 Voice message";
    case "m.file": return "📎 " + (c.body ?? "File");
    default: return c.body ?? "";
  }
}

function lastMessage(room: sdk.Room) {
  const events = room.getLiveTimeline().getEvents();
  for (let i = events.length - 1; i >= 0; i--) if (events[i].getType() === "m.room.message") return events[i];
}

export function chatSummaries(): ChatSummary[] {
  if (!client) return [];
  const me = client.getUserId()!;
  return client
    .getRooms()
    .filter((r) => r.getMyMembership() === "join" && !isBotRoom(r, me))
    .map((r) => {
      const last = lastMessage(r);
      return {
        id: r.roomId,
        name: r.name || "Unnamed chat",
        network: networkOf(r),
        avatarMxc: r.getMxcAvatarUrl() ?? undefined,
        preview: previewOf(last),
        ts: last?.getTs() ?? 0,
        unread: r.getUnreadNotificationCount(sdk.NotificationCountType.Total) ?? 0,
      };
    })
    .sort((a, b) => b.ts - a.ts);
}

export interface Message {
  id: string;
  sender: string;
  senderName: string;
  mine: boolean;
  ts: number;
  msgtype: string;
  body: string;
  mxc?: string;
}

export function messagesOf(roomId: string): Message[] {
  const room = client?.getRoom(roomId);
  if (!room || !client) return [];
  const me = client.getUserId();
  return room
    .getLiveTimeline()
    .getEvents()
    .filter((e) => e.getType() === "m.room.message" && !e.isRedacted() && !e.getRelation())
    .map((e) => {
      const c = e.getContent();
      return {
        id: e.getId()!,
        sender: e.getSender()!,
        senderName: room.getMember(e.getSender()!)?.name ?? e.getSender()!,
        mine: e.getSender() === me,
        ts: e.getTs(),
        msgtype: c.msgtype ?? "m.text",
        body: c.body ?? "",
        mxc: typeof c.url === "string" ? c.url : undefined,
      };
    });
}

export async function sendMessage(roomId: string, text: string) {
  await client?.sendTextMessage(roomId, text);
}

export function markRead(roomId: string) {
  const room = client?.getRoom(roomId);
  const last = room?.getLiveTimeline().getEvents().at(-1);
  if (client && last && room!.getUnreadNotificationCount(sdk.NotificationCountType.Total)) {
    client.sendReadReceipt(last).catch(() => {});
  }
}

export function loadOlder(roomId: string) {
  const room = client?.getRoom(roomId);
  if (client && room) client.scrollback(room, 30).then(bump).catch(() => {});
}

// --- Media (Synapse requires auth for downloads) -----------------------------

const blobCache = new Map<string, string>();

export async function fetchMedia(mxc: string, thumb?: number): Promise<string> {
  const key = `${mxc}|${thumb ?? ""}`;
  const hit = blobCache.get(key);
  if (hit) return hit;
  const m = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
  if (!m || !client) throw new Error("bad mxc");
  const path = thumb
    ? `thumbnail/${m[1]}/${m[2]}?width=${thumb}&height=${thumb}&method=crop`
    : `download/${m[1]}/${m[2]}`;
  const res = await fetch(`${baseUrl()}/_matrix/client/v1/media/${path}`, {
    headers: { authorization: `Bearer ${client.getAccessToken()}` },
  });
  if (!res.ok) throw new Error("media fetch failed");
  const url = URL.createObjectURL(await res.blob());
  blobCache.set(key, url);
  return url;
}

// --- React hooks -------------------------------------------------------------

export function useMatrixVersion() {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => version,
  );
}

export function useSignedIn() {
  useMatrixVersion();
  return client !== null;
}

export function useSynced() {
  useMatrixVersion();
  const s = client?.getSyncState();
  return s === "PREPARED" || s === "SYNCING";
}

/** Run an effect when a chat opens. */
export function useOnOpen(roomId: string | null, fn: (id: string) => void) {
  useEffect(() => {
    if (roomId) fn(roomId);
  }, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps
}
