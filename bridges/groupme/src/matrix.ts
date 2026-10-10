import type { Config } from "./config.ts";

export class MatrixError extends Error {
  constructor(public status: number, public errcode: string, message: string) { super(message); }
}

interface Opts { as?: string; ts?: number; body?: Uint8Array; contentType?: string }

/** The few Matrix client-server calls a bridge needs, made with the appservice token (optionally acting as one of our users). */
export class MatrixAS {
  constructor(private cfg: Config, private doFetch: typeof fetch = fetch) {}

  get botId() { return `@${this.cfg.botLocalpart}:${this.cfg.domain}`; }
  ghostId(groupmeUserId: string) { return `@${this.cfg.ghostPrefix}${groupmeUserId}:${this.cfg.domain}`; }
  isGhost(mxid: string) { return mxid.startsWith(`@${this.cfg.ghostPrefix}`) && mxid.endsWith(`:${this.cfg.domain}`); }
  isOurs(mxid: string) { return mxid === this.botId || this.isGhost(mxid); }

  async req(method: string, path: string, json?: unknown, o: Opts = {}): Promise<any> {
    const url = new URL(this.cfg.homeserverUrl + path);
    if (o.as) url.searchParams.set("user_id", o.as);
    if (o.ts) url.searchParams.set("ts", String(o.ts));
    const raw = o.body !== undefined;
    const res = await this.doFetch(url, {
      method,
      headers: { authorization: `Bearer ${this.cfg.asToken}`, ...(raw ? { "content-type": o.contentType ?? "application/octet-stream" } : json !== undefined ? { "content-type": "application/json" } : {}) },
      body: raw ? (o.body as unknown as BodyInit) : json === undefined ? undefined : JSON.stringify(json),
    });
    const text = await res.text();
    let data: any = {};
    try { data = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    if (!res.ok) throw new MatrixError(res.status, data.errcode ?? "", data.error ?? `Matrix error ${res.status}`);
    return data;
  }

  private enc = encodeURIComponent;

  /** Makes sure a ghost exists and shows the right name and picture. */
  async ensureGhost(mxid: string, displayname?: string, avatarMxc?: string) {
    const localpart = mxid.slice(1, mxid.indexOf(":"));
    try { await this.req("POST", "/_matrix/client/v3/register", { type: "m.login.application_service", username: localpart }); }
    catch (e) { if (!(e instanceof MatrixError && e.errcode === "M_USER_IN_USE")) throw e; }
    if (displayname) await this.req("PUT", `/_matrix/client/v3/profile/${this.enc(mxid)}/displayname`, { displayname }, { as: mxid });
    if (avatarMxc) await this.req("PUT", `/_matrix/client/v3/profile/${this.enc(mxid)}/avatar_url`, { avatar_url: avatarMxc }, { as: mxid });
  }

  async createRoom(opts: { name: string; topic?: string; direct: boolean; invite: string[]; avatarMxc?: string; state: { type: string; state_key: string; content: unknown }[] }): Promise<string> {
    const initial = [...opts.state];
    if (opts.avatarMxc) initial.push({ type: "m.room.avatar", state_key: "", content: { url: opts.avatarMxc } });
    const r = await this.req("POST", "/_matrix/client/v3/createRoom", {
      name: opts.name, topic: opts.topic, preset: "private_chat", is_direct: opts.direct, invite: opts.invite, initial_state: initial,
    });
    return r.room_id;
  }

  async invite(room: string, user: string) {
    try { await this.req("POST", `/_matrix/client/v3/rooms/${this.enc(room)}/invite`, { user_id: user }); }
    catch (e) { if (!(e instanceof MatrixError && /already in the room|already joined/i.test(e.message))) throw e; }
  }
  async join(room: string, as: string) { await this.req("POST", `/_matrix/client/v3/rooms/${this.enc(room)}/join`, {}, { as }); }

  private txn = 0;
  async send(room: string, content: unknown, as: string, ts?: number, type = "m.room.message"): Promise<string> {
    const id = `pgbr${Date.now().toString(36)}${(this.txn++).toString(36)}`;
    const r = await this.req("PUT", `/_matrix/client/v3/rooms/${this.enc(room)}/send/${this.enc(type)}/${id}`, content, { as, ts });
    return r.event_id;
  }
  async redact(room: string, eventId: string, as: string) {
    await this.req("PUT", `/_matrix/client/v3/rooms/${this.enc(room)}/redact/${this.enc(eventId)}/pgbr${Date.now().toString(36)}`, {}, { as });
  }

  async upload(bytes: Uint8Array, contentType: string, filename: string): Promise<string> {
    const r = await this.req("POST", `/_matrix/media/v3/upload?filename=${this.enc(filename)}`, undefined, { body: bytes, contentType });
    return r.content_uri;
  }
  async download(mxc: string): Promise<{ bytes: Uint8Array; contentType: string }> {
    const m = /^mxc:\/\/([^/]+)\/(.+)$/.exec(mxc);
    if (!m) throw new Error("not an mxc address");
    for (const path of [`/_matrix/client/v1/media/download/${m[1]}/${m[2]}`, `/_matrix/media/v3/download/${m[1]}/${m[2]}`]) {
      const res = await this.doFetch(this.cfg.homeserverUrl + path, { headers: { authorization: `Bearer ${this.cfg.asToken}` } });
      if (res.ok) return { bytes: new Uint8Array(await res.arrayBuffer()), contentType: res.headers.get("content-type") ?? "application/octet-stream" };
    }
    throw new Error("could not download the file from the Matrix server");
  }
}
