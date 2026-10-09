// HTTP clients: the Pager API (signup + bridge login) and the Matrix client-server API subset Pager needs.
export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export const http = {
  base: "",
  token: "",
};

/** Same-origin by default; the desktop app talks to whichever server the user entered. */
export const url = (path: string) => http.base.replace(/\/$/, "") + path;
const enc = encodeURIComponent;

/** Lets the encryption layer change an event just before it is sent (it becomes m.room.encrypted in encrypted rooms). */
export const sendHook: { fn?: (roomId: string, type: string, content: any) => Promise<{ type: string; content: any }> } = {};
export const matrixCall = (method: string, path: string, body?: unknown) => call(method, path, body);

async function call<T = any>(method: string, path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const res = await fetch(url(path), {
    method, signal,
    headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(http.token ? { authorization: `Bearer ${http.token}` } : {}) },
    body: body === undefined ? (method === "GET" || method === "DELETE" ? undefined : "{}") : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as any).error ?? `Request failed (${res.status})`);
  return data as T;
}

// ---- Pager API --------------------------------------------------------------
export interface ServerConfig { domain: string; signup: "invite" | "open" | "closed"; inviteRequired: boolean }
export interface Login { id: string; name?: string; state_event?: string; profile?: { name?: string } }
export interface Network { id: string; name: string; logins: Login[]; error?: string }
export interface Contact { id: string; name: string; detail?: string }
export interface LoginFlow { id: string; name: string; description?: string }
export interface LoginField { id: string; type: string; name: string; description?: string }
export interface LoginStep {
  login_id: string; step_id: string; type: "display_and_wait" | "user_input" | "cookies" | "complete";
  instructions?: string;
  display_and_wait?: { type: "qr" | "emoji" | "code" | "nothing"; data?: string };
  user_input?: { fields: LoginField[] };
  cookies?: { url: string; user_agent?: string; fields: { id: string; required?: boolean; sources?: { type: string; name?: string; cookie_domain?: string }[] }[] };
}

/** Turns pasted text into cookie values: a JSON object, a "Cookie: a=1; b=2" header, or a copied cURL command. */
export function parseCookies(text: string): Record<string, string> {
  const t = text.trim();
  if (t.startsWith("{")) { try { const o = JSON.parse(t); return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v)])); } catch { /* fall through */ } }
  const m = /(?:-b|--cookie)\s+(['"])([\s\S]*?)\1/.exec(t) ?? /cookie:\s*([^\n'"]+)/i.exec(t);
  const raw = m ? (m[2] ?? m[1]) : t;
  const out: Record<string, string> = {};
  for (const part of raw.split(/;\s*/)) { const i = part.indexOf("="); if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim(); }
  return out;
}

export interface AdminInfo { id: string; displayname: string; admin: boolean; deactivated: boolean; locked: boolean; created?: number; devices: { id: string; name: string; lastSeen: number; ip: string }[] }
export interface AdminBridge { id: string; name: string; up: boolean; container?: { state: string; status: string; image: string } }
export interface AdminSetting { key: string; label: string; hint: string; kind: "bool" | "number"; value: boolean | number }
export interface AdminPerson extends AdminUser { networks: (Network & { error?: string })[] }
export interface AdminUser { id: string; displayname: string; admin: boolean; deactivated: boolean; created?: number; you: boolean }

export const pager = {
  me: () => call<{ user_id: string; admin: boolean }>("GET", "/api/me"),
  admin: {
    info: (id: string) => call<AdminInfo>("GET", `/api/admin/users/${enc(id)}/info`),
    rename: (id: string, displayname: string) => call("POST", `/api/admin/users/${enc(id)}/rename`, { displayname }),
    lock: (id: string, locked: boolean) => call("POST", `/api/admin/users/${enc(id)}/lock`, { locked }),
    logoutAll: (id: string) => call<{ signedOut: number }>("POST", `/api/admin/users/${enc(id)}/logout-all`, {}),
    control: () => call<{ docker: boolean; settings: boolean }>("GET", "/api/admin/control"),
    bridgeList: () => call<{ bridges: AdminBridge[]; docker: boolean }>("GET", "/api/admin/bridges"),
    bridgeAction: (id: string, action: "restart" | "stop" | "start") => call("POST", `/api/admin/bridges/${enc(id)}/${action}`, {}),
    bridgeLogs: (id: string, tail = 300) => call<{ log: string }>("GET", `/api/admin/bridges/${enc(id)}/logs?tail=${tail}`).then((r) => r.log),
    bridgeSettings: (id: string) => call<{ settings: AdminSetting[] }>("GET", `/api/admin/bridges/${enc(id)}/settings`).then((r) => r.settings),
    saveBridgeSettings: (id: string, values: Record<string, boolean | number>, restart: boolean) => call<{ changed: string[] }>("PUT", `/api/admin/bridges/${enc(id)}/settings`, { values, restart }),
    overview: () => call<{ users: AdminPerson[] }>("GET", "/api/admin/overview").then((r) => r.users),
    users: () => call<{ users: AdminUser[] }>("GET", "/api/admin/users").then((r) => r.users),
    logins: (id: string) => call<{ networks: Network[] }>("GET", `/api/admin/users/${enc(id)}/logins`).then((r) => r.networks),
    logout: (id: string, net: string, login: string) => call("POST", `/api/admin/users/${enc(id)}/logout/${enc(net)}/${enc(login)}`, {}),
    setAdmin: (id: string, admin: boolean) => call("POST", `/api/admin/users/${enc(id)}/admin`, { admin }),
    /** Recover an account: needs the admin's own password. Without a new password, a temporary one comes back. */
    recover: (id: string, adminPassword: string, newPassword?: string) => call<{ ok: boolean; backupRemoved: boolean; temporaryPassword?: string }>("POST", `/api/admin/users/${enc(id)}/recover`, { adminPassword, ...(newPassword ? { newPassword } : {}) }),
    resetPassword: (id: string, password: string) => call("POST", `/api/admin/users/${enc(id)}/password`, { password }),
    remove: (id: string) => call("POST", `/api/admin/users/${enc(id)}/delete`, {}),
    server: () => call<{ domain: string; signup: "invite" | "open" | "closed"; inviteCode: string }>("GET", "/api/admin/server"),
    setServer: (body: { signup?: string; regenerateInvite?: boolean }) => call<{ domain: string; signup: "invite" | "open" | "closed"; inviteCode: string }>("POST", "/api/admin/server", body),
    bridges: () => call<{ bridges: { id: string; name: string; up: boolean }[] }>("GET", "/api/admin/bridges").then((r) => r.bridges),
  },
  config: () => call<ServerConfig>("GET", "/api/config"),
  signup: (username: string, password: string, invite: string) => call("POST", "/api/signup", { username, password, invite }),
  networks: () => call<{ networks: Network[] }>("GET", "/api/bridges").then((r) => r.networks),
  flows: (net: string) => call<{ flows: LoginFlow[] }>("GET", `/api/bridges/${net}/login/flows`).then((r) => r.flows),
  start: (net: string, flow: string) => call<LoginStep>("POST", `/api/bridges/${net}/login/start/${flow}`, {}),
  step: (net: string, s: LoginStep, body: unknown = {}) => call<LoginStep>("POST", `/api/bridges/${net}/login/step/${s.login_id}/${s.step_id}/${s.type}`, body),
  logout: (net: string, id: string) => call("POST", `/api/bridges/${net}/logout/${enc(id)}`, {}),
  contacts: async (net: string, login?: string): Promise<Contact[]> => parseContacts(await call("GET", `/api/bridges/${net}/contacts${loginQ(login)}`)),
  searchUsers: async (net: string, login: string | undefined, query: string): Promise<Contact[]> => parseContacts(await call("POST", `/api/bridges/${net}/search_users${loginQ(login)}`, { query })),
  createDm: async (net: string, login: string | undefined, identifier: string): Promise<string | undefined> =>
    (await call("POST", `/api/bridges/${net}/create_dm/${enc(identifier)}${loginQ(login)}`, {})).dm_room_mxid,
  /** Create a chat for every contact the bridge knows. Networks like Signal never send old chats to a new device. */
  syncChats: async (net: string, login?: string, onProgress?: (done: number, total: number) => void): Promise<number> => {
    const list = await pager.contacts(net, login);
    let made = 0;
    for (let i = 0; i < list.length; i++) {
      try { if (await pager.createDm(net, login, list[i].id)) made++; } catch { /* skip contacts that can't be reached */ }
      onProgress?.(i + 1, list.length);
    }
    return made;
  },
};
const loginQ = (l?: string) => (l ? `?login_id=${enc(l)}` : "");
const parseContacts = (o: any): Contact[] =>
  ((o.contacts ?? o.results ?? []) as any[]).map((c) => ({ id: c.id ?? "", name: c.name ?? c.identifiers?.[0] ?? c.id, detail: (c.identifiers?.[0] as string | undefined)?.replace(/^tel:/, "") })).filter((c) => c.id);

// ---- Matrix -----------------------------------------------------------------
export interface SearchHit { roomId: string; eventId: string; sender: string; text: string; ts: number }
export interface LinkPreview { url: string; title?: string; description?: string; imageMxc?: string; site?: string }

export const matrix = {
  login: (user: string, password: string) =>
    call<{ access_token: string; user_id: string; device_id: string }>("POST", "/_matrix/client/v3/login", {
      type: "m.login.password", identifier: { type: "m.id.user", user }, password, initial_device_display_name: "Pager Web",
    }),
  logout: () => call("POST", "/_matrix/client/v3/logout", {}),
  sync: (since: string | undefined, signal?: AbortSignal) => {
    const filter = enc(JSON.stringify({ presence: { types: [] }, room: { timeline: { limit: 20 }, state: { lazy_load_members: true }, ephemeral: { types: ["m.receipt", "m.typing"] } } }));
    return call("GET", `/_matrix/client/v3/sync?set_presence=offline&filter=${filter}${since ? `&since=${enc(since)}&timeout=30000` : "&timeout=0"}`, undefined, signal);
  },
  messages: async (roomId: string, from: string): Promise<{ chunk: any[]; end?: string; state?: any[] }> =>
    call("GET", `/_matrix/client/v3/rooms/${enc(roomId)}/messages?dir=b&limit=40&from=${enc(from)}&filter=${enc('{"lazy_load_members":true}')}`),
  join: (roomId: string) => call("POST", `/_matrix/client/v3/join/${enc(roomId)}`, {}),
  leave: async (roomId: string) => { await call("POST", `/_matrix/client/v3/rooms/${enc(roomId)}/leave`, {}); await call("POST", `/_matrix/client/v3/rooms/${enc(roomId)}/forget`, {}).catch(() => {}); },
  send: async (roomId: string, type: string, txn: string, content: unknown) => {
    const out = (await sendHook.fn?.(roomId, type, content)) ?? { type, content };
    return call<{ event_id: string }>("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/send/${out.type}/${enc(txn)}`, out.content).then((r) => r.event_id);
  },
  sendDelayed: (roomId: string, txn: string, content: unknown, delayMs: number) =>
    call<{ delay_id: string }>("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/send/m.room.message/${enc(txn)}?org.matrix.msc4140.delay=${delayMs}`, content).then((r) => r.delay_id),
  cancelDelayed: (id: string) => call("POST", `/_matrix/client/unstable/org.matrix.msc4140/delayed_events/${enc(id)}`, { action: "cancel" }),
  redact: (roomId: string, eventId: string, txn: string) => call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/redact/${enc(eventId)}/${enc(txn)}`, {}),
  receipt: (roomId: string, eventId: string, priv: boolean) => call("POST", `/_matrix/client/v3/rooms/${enc(roomId)}/receipt/${priv ? "m.read.private" : "m.read"}/${enc(eventId)}`, {}),
  typing: (me: string, roomId: string, on: boolean) => call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/typing/${enc(me)}`, on ? { typing: true, timeout: 6000 } : { typing: false }),
  setTag: (me: string, roomId: string, tag: string, on: boolean, order?: number) => {
    const p = `/_matrix/client/v3/user/${enc(me)}/rooms/${enc(roomId)}/tags/${enc(tag)}`;
    return on ? call("PUT", p, order !== undefined ? { order } : {}) : call("DELETE", p);
  },
  /** Deletes your account for good (Synapse asks for your password again). */
  deactivate: (userId: string, password: string) => call("POST", "/_matrix/client/v3/account/deactivate", {
    auth: { type: "m.login.password", identifier: { type: "m.id.user", user: userId }, password }, erase: true,
  }),
  putAccountData: (me: string, type: string, content: unknown) => call("PUT", `/_matrix/client/v3/user/${enc(me)}/account_data/${enc(type)}`, content),
  setMarkedUnread: (me: string, roomId: string, unread: boolean) => call("PUT", `/_matrix/client/v3/user/${enc(me)}/rooms/${enc(roomId)}/account_data/m.marked_unread`, { unread }),
  setMuted: (roomId: string, muted: boolean) => {
    const p = `/_matrix/client/v3/pushrules/global/override/${enc(roomId)}`;
    return muted ? call("PUT", p, { actions: [], conditions: [{ kind: "event_match", key: "room_id", pattern: roomId }] }) : call("DELETE", p);
  },
  setState: (roomId: string, type: string, content: unknown, key = "") => call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/state/${enc(type)}/${enc(key)}`, content),
  rename: (roomId: string, name: string) => call("PUT", `/_matrix/client/v3/rooms/${enc(roomId)}/state/m.room.name`, { name }),
  joinedMembers: async (roomId: string): Promise<Record<string, string>> => {
    const r = await call("GET", `/_matrix/client/v3/rooms/${enc(roomId)}/joined_members`);
    return Object.fromEntries(Object.entries(r.joined ?? {}).map(([k, v]: [string, any]) => [k, v.display_name ?? k.replace(/^@/, "").split(":")[0]]));
  },
  search: async (term: string, roomId?: string): Promise<SearchHit[]> => {
    const r = await call("POST", "/_matrix/client/v3/search", { search_categories: { room_events: { search_term: term, keys: ["content.body"], order_by: "recent", ...(roomId ? { filter: { rooms: [roomId] } } : {}) } } });
    return ((r.search_categories?.room_events?.results ?? []) as any[]).flatMap((x) => {
      const e = x.result ?? {};
      return typeof e.content?.body === "string" && e.room_id ? [{ roomId: e.room_id, eventId: e.event_id ?? "", sender: e.sender ?? "", text: e.content.body, ts: e.origin_server_ts ?? 0 }] : [];
    });
  },
  previewUrl: async (u: string): Promise<LinkPreview | undefined> => {
    const r = await call("GET", `/_matrix/client/v1/media/preview_url?url=${enc(u)}`);
    if (!r["og:title"] && !r["og:description"] && !r["og:image"]) return undefined;
    return { url: u, title: r["og:title"], description: r["og:description"], imageMxc: r["og:image"], site: r["og:site_name"] };
  },
  upload: async (file: Blob, name: string): Promise<string> => {
    const res = await fetch(url(`/_matrix/media/v3/upload?filename=${enc(name)}`), { method: "POST", headers: { authorization: `Bearer ${http.token}`, "content-type": file.type || "application/octet-stream" }, body: file });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new ApiError(res.status, data.error ?? "Upload failed");
    return data.content_uri;
  },
};
