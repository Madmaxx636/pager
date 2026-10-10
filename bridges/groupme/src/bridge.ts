import { randomUUID } from "node:crypto";
import type { Config } from "./config.ts";
import type { Login, Portal, Store } from "./store.ts";
import type { MatrixAS } from "./matrix.ts";
import { MatrixError } from "./matrix.ts";
import { GroupMeError, type GmAttachment, type GmChat, type GmGroup, type GmMessage, type GroupMe } from "./groupme.ts";
import type { PushClient, PushEvent } from "./push.ts";

type J = Record<string, any>;
export interface Contact { id: string; name: string }
interface Spec { key: string; kind: "group" | "dm"; remoteId: string; name: string; avatar?: string; topic?: string }

/** Set on every message the bridge copies into Matrix, so it is never sent back to GroupMe. */
export const BRIDGED = "app.pager.bridged";
const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

/** The conversation id GroupMe uses for a direct chat: both user ids, smaller first. */
export function dmConversationId(a: string, b: string) { return BigInt(a) < BigInt(b) ? `${a}+${b}` : `${b}+${a}`; }

/** Matrix reply fallbacks ("> <@who> text" lines before a blank line) are for clients that cannot show replies; GroupMe has real replies. */
export function stripReplyFallback(body: string) {
  if (!body.startsWith("> ")) return body;
  const i = body.indexOf("\n\n");
  return i >= 0 ? body.slice(i + 2) : body;
}

export function geoParts(uri: string): { lat: string; lng: string } | null {
  const m = /^geo:(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/.exec(uri);
  return m ? { lat: m[1], lng: m[2] } : null;
}

/** What links Matrix and GroupMe: copies messages both ways and keeps one Matrix room per GroupMe chat. */
export class Bridge {
  private sessions = new Map<string, { gm: GroupMe; push: PushClient }>();
  private state = new Map<string, string>();
  private queues = new Map<string, Promise<unknown>>();
  /** Messages we sent from Matrix, waiting for GroupMe to echo them back: source_guid -> Matrix event id. */
  private pending = new Map<string, string>();
  private ghostNames = new Map<string, string>();
  private inRoom = new Set<string>();
  private timer?: NodeJS.Timeout;

  constructor(private cfg: Config, private store: Store, private mx: MatrixAS, private makeGm: (token: string) => GroupMe, private makePush: (login: Login, onEvent: (e: PushEvent) => void, onState: (c: boolean) => void) => PushClient) {}

  // ---- Accounts -----------------------------------------------------------------------------------------------------

  start() {
    for (const l of this.store.logins()) this.open(l);
    this.timer = setInterval(() => { for (const l of this.store.logins()) void this.catchUp(l).catch((e) => log("catch-up failed", l.id, String(e?.message ?? e))); }, 120_000);
  }
  stop() { clearInterval(this.timer); for (const s of this.sessions.values()) s.push.stop(); this.store.flush(); }

  stateOf(loginId: string) { return this.state.get(loginId) ?? (this.sessions.has(loginId) ? "CONNECTED" : "LOGGED_OUT"); }

  /** Links a GroupMe account to a Matrix user from the person's own access token. */
  async link(mxid: string, token: string): Promise<Login> {
    const gm = this.makeGm(token);
    let me;
    try { me = await gm.me(); } catch (e) { throw new GroupMeError(e instanceof GroupMeError ? e.status : 502, e instanceof GroupMeError && e.unauthorized ? "GroupMe did not accept that access token" : "Could not reach GroupMe"); }
    const existing = this.store.login(me.id);
    if (existing && existing.mxid !== mxid) throw new GroupMeError(409, "That GroupMe account is already linked to someone else here");
    const login: Login = { id: me.id, mxid, name: me.name, token };
    this.sessions.get(login.id)?.push.stop();
    this.store.setLogin(login);
    this.open(login);
    return login;
  }

  async unlink(mxid: string, loginId: string) {
    const l = this.store.login(loginId);
    if (!l || l.mxid !== mxid) throw new GroupMeError(404, "No such login");
    this.sessions.get(loginId)?.push.stop(); this.sessions.delete(loginId); this.state.delete(loginId);
    this.store.removeLogin(loginId);
  }

  private open(login: Login) {
    const gm = this.makeGm(login.token);
    const push = this.makePush(login, (e) => void this.onPush(login, e).catch((err) => log("push event failed", String(err?.message ?? err))), (up) => {
      if (this.state.get(login.id) === "BAD_CREDENTIALS") return;
      this.state.set(login.id, up ? "CONNECTED" : "TRANSIENT_DISCONNECT");
      if (up) void this.catchUp(login).catch((e) => log("catch-up failed", String(e?.message ?? e)));
    });
    this.sessions.set(login.id, { gm, push });
    this.state.set(login.id, "CONNECTING");
    push.start();
  }

  private gmFor(login: Login) { const s = this.sessions.get(login.id); if (!s) throw new GroupMeError(401, "Not connected"); return s.gm; }

  private async guard<T>(login: Login, fn: () => Promise<T>): Promise<T> {
    try { return await fn(); }
    catch (e) {
      if (e instanceof GroupMeError && e.unauthorized) { this.state.set(login.id, "BAD_CREDENTIALS"); this.sessions.get(login.id)?.push.stop(); }
      throw e;
    }
  }

  // ---- Chats --------------------------------------------------------------------------------------------------------

  private groupSpec(g: GmGroup): Spec { return { key: `g:${g.id}`, kind: "group", remoteId: g.id, name: g.name, avatar: g.image_url || undefined, topic: g.description || undefined }; }
  private dmSpec(c: GmChat): Spec { return { key: `d:${c.other_user.id}`, kind: "dm", remoteId: c.other_user.id, name: c.other_user.name, avatar: c.other_user.avatar_url || undefined }; }

  /** Makes sure every GroupMe group and conversation has a room. New rooms are filled with a few recent messages. */
  async syncChats(login: Login): Promise<{ groups: number; chats: number }> {
    const gm = this.gmFor(login);
    const groups = await this.guard(login, () => gm.groups());
    const chats = await this.guard(login, () => gm.chats());
    for (const g of groups) await this.ensurePortal(login, this.groupSpec(g), g.messages?.last_message_id);
    for (const c of chats) await this.ensurePortal(login, this.dmSpec(c), c.last_message?.id);
    return { groups: groups.length, chats: chats.length };
  }

  async ensurePortal(login: Login, spec: Spec, newestId?: string, backfill = true): Promise<Portal> {
    const known = this.store.portal(login.id, spec.key);
    if (known) return known;
    return this.serial(`create|${login.id}|${spec.key}`, async () => {
      const again = this.store.portal(login.id, spec.key);
      if (again) return again;
      const avatarMxc = spec.avatar ? await this.mxcFor(login, spec.avatar) : undefined;
      const bridgeInfo = {
        bridgebot: this.mx.botId, creator: this.mx.botId,
        protocol: { id: "groupme", displayname: "GroupMe" }, network: { id: "groupme", displayname: "GroupMe" },
        channel: { id: spec.remoteId, displayname: spec.name },
        "com.beeper.room_type": spec.kind === "dm" ? "dm" : "group",
      };
      const key = `${this.cfg.domain}/groupme/${login.id}/${spec.key}`;
      const roomId = await this.mx.createRoom({
        name: spec.name, topic: spec.topic, direct: spec.kind === "dm", invite: [login.mxid], avatarMxc,
        state: [{ type: "m.bridge", state_key: key, content: bridgeInfo }, { type: "uk.half-shot.bridge", state_key: key, content: bridgeInfo }],
      });
      // Join the person at once (when the server lets us act as them) so the chat is there when they next look.
      await this.mx.join(roomId, login.mxid).catch(() => { /* they will accept the invitation themselves */ });
      if (spec.kind === "dm") await this.seat(roomId, spec.remoteId, spec.name, spec.avatar, login);
      const portal: Portal = { key: spec.key, login: login.id, roomId, name: spec.name };
      this.store.setPortal(portal);
      if (backfill && this.cfg.backfill > 0) await this.backfill(login, portal, spec).catch((e) => log("backfill failed", spec.key, String(e?.message ?? e)));
      else if (newestId) { portal.lastMessageId = newestId; this.store.setPortal(portal); }
      log("created chat", spec.key, "for", login.mxid);
      return portal;
    });
  }

  private async backfill(login: Login, portal: Portal, spec: Spec) {
    const gm = this.gmFor(login);
    const list = spec.kind === "group" ? await gm.groupMessages(spec.remoteId, this.cfg.backfill) : await gm.directMessages(spec.remoteId, this.cfg.backfill);
    for (const m of list) await this.deliver(login, portal, m, true);
  }

  /** Fetches whatever arrived while the live connection was down. */
  async catchUp(login: Login) {
    const gm = this.gmFor(login);
    const groups = await this.guard(login, () => gm.groups());
    for (const g of groups) {
      const p = await this.ensurePortal(login, this.groupSpec(g), g.messages?.last_message_id);
      if (g.messages?.last_message_id && p.lastMessageId && g.messages.last_message_id !== p.lastMessageId) {
        for (const m of await gm.groupMessages(g.id, 100, p.lastMessageId)) await this.deliver(login, p, m, false);
      }
    }
    const chats = await this.guard(login, () => gm.chats());
    for (const c of chats) {
      const p = await this.ensurePortal(login, this.dmSpec(c), c.last_message?.id);
      if (c.last_message?.id && p.lastMessageId && c.last_message.id !== p.lastMessageId) {
        for (const m of await gm.directMessages(c.other_user.id, 100, p.lastMessageId)) await this.deliver(login, p, m, false);
      }
    }
  }

  // ---- GroupMe -> Matrix --------------------------------------------------------------------------------------------

  private async onPush(login: Login, e: PushEvent) {
    const m = e.subject as GmMessage | undefined;
    if (!m || !m.id) return;
    if (e.type === "line.create" && m.group_id) {
      let portal = this.store.portal(login.id, `g:${m.group_id}`);
      if (!portal) { const g = await this.guard(login, () => this.gmFor(login).group(m.group_id!)); portal = await this.ensurePortal(login, this.groupSpec(g), undefined, false); }
      await this.deliver(login, portal, m, false);
    } else if (e.type === "direct_message.create") {
      const other = (m.sender_id ?? m.user_id) === login.id ? m.recipient_id : (m.sender_id ?? m.user_id);
      if (!other) return;
      let portal = this.store.portal(login.id, `d:${other}`);
      if (!portal) {
        const chats = await this.guard(login, () => this.gmFor(login).chats());
        const c = chats.find((x) => x.other_user.id === other);
        portal = await this.ensurePortal(login, c ? this.dmSpec(c) : { key: `d:${other}`, kind: "dm", remoteId: other, name: m.name ?? other }, undefined, false);
      }
      await this.deliver(login, portal, m, false);
    }
  }

  private async mxcFor(login: Login, url: string): Promise<string | undefined> {
    const cached = this.store.avatar(url);
    if (cached) return cached;
    try {
      const f = await this.gmFor(login).download(url);
      const mxc = await this.mx.upload(f.bytes, f.contentType, "picture");
      this.store.setAvatar(url, mxc);
      return mxc;
    } catch { return undefined; }
  }

  /** A GroupMe person, as a Matrix user who is in the room. */
  private async seat(roomId: string, remoteId: string, name: string | undefined, avatar: string | undefined, login: Login): Promise<string> {
    const ghost = this.mx.ghostId(remoteId);
    const cacheKey = `${roomId}|${ghost}`;
    if (this.ghostNames.get(ghost) !== (name ?? "") || !this.inRoom.has(cacheKey)) {
      await this.mx.ensureGhost(ghost, name, avatar ? await this.mxcFor(login, avatar) : undefined);
      this.ghostNames.set(ghost, name ?? "");
      if (!this.inRoom.has(cacheKey)) {
        await this.mx.invite(roomId, ghost).catch(() => {});
        await this.mx.join(roomId, ghost).catch((e) => { if (!(e instanceof MatrixError)) throw e; });
        this.inRoom.add(cacheKey);
      }
    }
    return ghost;
  }

  /** Copies one GroupMe message into the room. Safe to call twice for the same message. */
  async deliver(login: Login, portal: Portal, m: GmMessage, old: boolean) {
    await this.serial(portal.roomId, async () => {
      if (this.store.eventFor(m.id)) return;
      if (m.source_guid && this.pending.has(m.source_guid)) { this.store.link(m.id, this.pending.get(m.source_guid)!); this.pending.delete(m.source_guid); this.advance(portal, m.id); return; }
      const sender = m.sender_id ?? m.user_id ?? "";
      const mine = sender === login.id;
      const ts = old ? m.created_at * 1000 : undefined;
      const contents = await this.contentsOf(login, portal, m);
      if (!contents.length) { this.advance(portal, m.id); return; }
      let as: string;
      if (m.system || sender === "system" || sender === "0") as = this.mx.botId;
      else if (mine) as = login.mxid;
      else as = await this.seat(portal.roomId, sender, m.name, m.avatar_url, login);
      let first: string | undefined;
      for (const c of contents) {
        // The marker lets us recognise our own copies when Synapse reports them back (messages posted as the person look like theirs).
        const body = { ...(m.system ? { ...c, msgtype: "m.notice" } : c), [BRIDGED]: true };
        let id: string;
        try { id = await this.mx.send(portal.roomId, body, as, ts); }
        catch (e) {
          if (mine && as === login.mxid) { as = await this.seat(portal.roomId, sender, login.name, undefined, login); id = await this.mx.send(portal.roomId, body, as, ts); }
          else throw e;
        }
        first ??= id;
      }
      if (first) this.store.link(m.id, first);
      this.advance(portal, m.id);
    });
  }

  private advance(portal: Portal, id: string) {
    const p = this.store.portal(portal.login, portal.key);
    if (p && (!p.lastMessageId || BigInt(id) > BigInt(p.lastMessageId))) { p.lastMessageId = id; this.store.setPortal(p); portal.lastMessageId = id; }
  }

  /** The Matrix message contents that one GroupMe message becomes (text, then each picture or place). */
  private async contentsOf(login: Login, portal: Portal, m: GmMessage): Promise<J[]> {
    const out: J[] = [];
    const reply = m.attachments?.find((a) => a.type === "reply");
    const replyTo = reply?.reply_id ? this.store.eventFor(reply.reply_id) : undefined;
    const text = (m.text ?? "").trim();
    if (text) out.push({ msgtype: "m.text", body: text });
    for (const a of m.attachments ?? []) {
      if (a.type === "image" && a.url) {
        const mxc = await this.mxcFor(login, a.url);
        if (mxc) { const mime = /\.(png|gif|webp)\b/i.exec(a.url)?.[1]; out.push({ msgtype: "m.image", body: "picture." + (mime ?? "jpeg"), url: mxc, info: { mimetype: "image/" + (mime ?? "jpeg") } }); }
        else out.push({ msgtype: "m.text", body: `🖼 ${a.url}` });
      } else if (a.type === "location" && a.lat && a.lng) {
        out.push({ msgtype: "m.location", body: a.name || "Location", geo_uri: `geo:${a.lat},${a.lng}` });
      } else if ((a.type === "video" || a.type === "file") && a.url) {
        out.push({ msgtype: "m.text", body: `${a.type === "video" ? "🎥" : "📎"} ${a.url}` });
      }
    }
    if (replyTo && out.length) out[0] = { ...out[0], "m.relates_to": { "m.in_reply_to": { event_id: replyTo } } };
    return out;
  }

  // ---- Matrix -> GroupMe --------------------------------------------------------------------------------------------

  /** Called with each batch of events Synapse sends. Only messages from linked people, in chats we made, are forwarded. */
  async handleEvents(events: J[]) {
    for (const ev of events) {
      try { await this.handleEvent(ev); } catch (e) { log("could not handle an event", ev?.type, String((e as Error)?.message ?? e)); }
    }
  }

  private async handleEvent(ev: J) {
    if (!ev || typeof ev.sender !== "string" || this.mx.isOurs(ev.sender) || ev.content?.[BRIDGED]) return;
    const portal = this.store.portalByRoom(ev.room_id);
    if (!portal) return;
    const login = this.store.login(portal.login);
    if (!login || login.mxid !== ev.sender) return;
    if (ev.type === "m.room.message") await this.sendToGroupMe(login, portal, ev);
    else if (ev.type === "m.room.redaction" && ev.redacts) {
      const gmId = this.store.messageFor(ev.redacts);
      if (gmId) await this.guard(login, () => this.gmFor(login).deleteMessage(portal.key.startsWith("g:") ? portal.key.slice(2) : dmConversationId(login.id, portal.key.slice(2)), gmId)).catch(() => {});
    }
  }

  private async notice(portal: Portal, text: string, eventId?: string) {
    await this.mx.send(portal.roomId, { msgtype: "m.notice", body: text, ...(eventId ? { "m.relates_to": { "m.in_reply_to": { event_id: eventId } } } : {}) }, this.mx.botId).catch(() => {});
  }

  private async sendToGroupMe(login: Login, portal: Portal, ev: J) {
    const c: J = ev.content ?? {};
    if (c["m.relates_to"]?.rel_type === "m.replace") return void (await this.notice(portal, "GroupMe messages can't be edited, so the change stayed here only.", ev.event_id));
    const gm = this.gmFor(login);
    const attachments: GmAttachment[] = [];
    let text = "";
    try {
      switch (c.msgtype) {
        case "m.text": case "m.notice": text = stripReplyFallback(String(c.body ?? "")); break;
        case "m.emote": text = `* ${login.name} ${stripReplyFallback(String(c.body ?? ""))}`; break;
        case "m.image": {
          if (!c.url) return;
          const f = await this.mx.download(c.url);
          attachments.push({ type: "image", url: await gm.uploadImage(f.bytes, (c.info?.mimetype as string) || f.contentType) });
          if (c.filename && c.body && c.body !== c.filename) text = String(c.body);
          break;
        }
        case "m.location": {
          const g = geoParts(String(c.geo_uri ?? ""));
          if (!g) return;
          attachments.push({ type: "location", lat: g.lat, lng: g.lng, name: String(c.body ?? "Location") });
          break;
        }
        default: return void (await this.notice(portal, "GroupMe can't carry this kind of message, so it was not sent.", ev.event_id));
      }
      const replyId = c["m.relates_to"]?.["m.in_reply_to"]?.event_id ? this.store.messageFor(c["m.relates_to"]["m.in_reply_to"].event_id) : undefined;
      if (replyId) attachments.push({ type: "reply", reply_id: replyId, base_reply_id: replyId });
      if (!text && !attachments.length) return;
      const guid = `pager-${randomUUID()}`;
      this.pending.set(guid, ev.event_id);
      try {
        const sent = await this.guard(login, () => portal.key.startsWith("g:") ? gm.sendGroup(portal.key.slice(2), text, guid, attachments) : gm.sendDirect(portal.key.slice(2), text, guid, attachments));
        if (sent?.id) { this.store.link(sent.id, ev.event_id); this.advance(portal, sent.id); }
      } finally { this.pending.delete(guid); }
    } catch (e) {
      await this.notice(portal, `⚠️ GroupMe didn't take that message: ${(e as Error).message}`, ev.event_id);
    }
  }

  // ---- Lists for the app --------------------------------------------------------------------------------------------

  async contacts(login: Login): Promise<Contact[]> {
    const gm = this.gmFor(login);
    const byId = new Map<string, Contact>();
    for (const c of await this.guard(login, () => gm.chats())) byId.set(c.other_user.id, { id: c.other_user.id, name: c.other_user.name });
    for (const g of await this.guard(login, () => gm.groups())) for (const m of g.members ?? []) if (m.user_id !== login.id && !byId.has(m.user_id)) byId.set(m.user_id, { id: m.user_id, name: m.nickname ?? m.user_id });
    return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  async openChat(login: Login, otherId: string): Promise<string> {
    const known = (await this.contacts(login)).find((c) => c.id === otherId);
    if (!known) throw new GroupMeError(404, "GroupMe doesn't know that person. Chats can start with people you share a group with, or have messaged before");
    const p = await this.ensurePortal(login, { key: `d:${otherId}`, kind: "dm", remoteId: otherId, name: known.name });
    return p.roomId;
  }

  // ---- Helpers ------------------------------------------------------------------------------------------------------

  /** Runs jobs with the same key one after another, so messages arrive in order. */
  private serial<T>(key: string, fn: () => Promise<T>): Promise<T> {
    const prev = this.queues.get(key) ?? Promise.resolve();
    const next = prev.then(fn, fn);
    this.queues.set(key, next.catch(() => {}));
    return next;
  }
}
