import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { Config } from "../src/config.ts";

type J = Record<string, any>;
const body = async (req: IncomingMessage) => { const c: Buffer[] = []; for await (const x of req) c.push(x as Buffer); return Buffer.concat(c); };
const listen = (s: Server, port = 0, host = "127.0.0.1") => new Promise<number>((r) => s.listen(port, host, () => r((s.address() as AddressInfo).port)));

/** A stand-in for GroupMe's API, image service and live connection. */
export class FakeGroupMe {
  server!: Server; port = 0;
  me = { id: "100", name: "Me Myself" };
  groups: J[] = [{ id: "7", name: "Book club", description: "Monthly reads", image_url: "", members: [{ user_id: "100", nickname: "Me Myself" }, { user_id: "200", nickname: "Ann" }], messages: { last_message_id: "1003" } }];
  chats: J[] = [{ other_user: { id: "200", name: "Ann" }, last_message: { id: "2002" } }];
  groupMessages: J[] = [
    { id: "1001", created_at: 1_700_000_001, user_id: "200", name: "Ann", text: "Welcome everyone", attachments: [] },
    { id: "1002", created_at: 1_700_000_002, user_id: "100", name: "Me Myself", text: "Thanks!", attachments: [] },
    { id: "1003", created_at: 1_700_000_003, user_id: "200", name: "Ann", text: "", attachments: [{ type: "location", lat: "40.7", lng: "-74.0", name: "Cafe" }] },
  ];
  directMessages: J[] = [
    { id: "2001", created_at: 1_700_000_010, sender_id: "200", recipient_id: "100", name: "Ann", text: "hi there" },
    { id: "2002", created_at: 1_700_000_011, sender_id: "100", recipient_id: "200", name: "Me Myself", text: "hello" },
  ];
  sent: J[] = []; deleted: string[] = []; uploads: { type: string; size: number }[] = []; unauthorized = false;
  pushQueue: J[] = []; private waiters: ((m: J[]) => void)[] = []; connects = 0;
  url(path: string) { return `http://127.0.0.1:${this.port}${path}`; }

  async start(port = 0) {
    this.server = createServer(async (req, res) => {
      const u = new URL(req.url!, "http://x"); const raw = await body(req);
      const out = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
      const p = u.pathname;
      if (p === "/faye") {
        const msgs = JSON.parse(raw.toString()) as J[]; const ch = msgs[0].channel;
        if (ch === "/meta/handshake") { this.waiters = []; return out(200, [{ channel: ch, successful: true, clientId: "c1" }]); }
        if (ch === "/meta/subscribe") return out(200, [{ channel: ch, successful: true, subscription: msgs[0].subscription }]);
        this.connects++;
        let done = false;
        const flush = (events: J[]) => { if (done || res.destroyed) return; done = true; out(200, [{ channel: ch, successful: true }, ...events.map((data) => ({ channel: "/user/100", data }))]); };
        if (this.pushQueue.length) return flush(this.pushQueue.splice(0));
        const t = setTimeout(() => flush([]), 400);
        this.waiters.push((m) => { clearTimeout(t); flush(m); });
        res.on("close", () => { clearTimeout(t); this.waiters = this.waiters.filter((w) => w !== wait); });
        const wait = this.waiters[this.waiters.length - 1];
        return;
      }
      if (p === "/pictures" && req.method === "POST") { this.uploads.push({ type: String(req.headers["content-type"]), size: raw.length }); return out(200, { payload: { url: this.url("/img/uploaded.png"), picture_url: this.url("/img/uploaded.png") } }); }
      if (p.startsWith("/img/")) { res.writeHead(200, { "content-type": "image/png" }); return res.end(Buffer.from([137, 80, 78, 71])); }
      if (this.unauthorized || req.headers["x-access-token"] !== "good-token") return out(401, { meta: { code: 401, errors: ["Unauthorized"] } });
      const r = (response: unknown) => out(200, { response, meta: { code: 200 } });
      if (p === "/v3/users/me") return r(this.me);
      if (p === "/v3/groups") return r(u.searchParams.get("page") === "1" ? this.groups : []);
      let m;
      if ((m = /^\/v3\/groups\/(\d+)$/.exec(p))) return r(this.groups.find((g) => g.id === m![1]));
      if ((m = /^\/v3\/groups\/(\d+)\/messages$/.exec(p))) {
        if (req.method === "POST") { const msg = JSON.parse(raw.toString()).message; const saved = { id: String(5000 + this.sent.length), created_at: 1_700_000_100, user_id: "100", name: this.me.name, group_id: m[1], ...msg }; this.sent.push({ group: m[1], ...msg }); this.groupMessages.push(saved); return out(201, { response: { message: saved }, meta: { code: 201 } }); }
        const after = u.searchParams.get("after_id");
        const list = after ? this.groupMessages.filter((x) => BigInt(x.id) > BigInt(after)) : this.groupMessages.slice().reverse();
        return r({ count: list.length, messages: list });
      }
      if (p === "/v3/chats") return r(u.searchParams.get("page") === "1" ? this.chats : []);
      if (p === "/v3/direct_messages") {
        if (req.method === "POST") { const msg = JSON.parse(raw.toString()).direct_message; this.sent.push({ dm: msg.recipient_id, ...msg }); return out(201, { response: { direct_message: { id: String(6000 + this.sent.length), created_at: 1_700_000_200, sender_id: "100", ...msg } }, meta: { code: 201 } }); }
        const after = u.searchParams.get("after_id");
        const list = after ? this.directMessages.filter((x) => BigInt(x.id) > BigInt(after)) : this.directMessages.slice().reverse();
        return r({ count: list.length, direct_messages: list });
      }
      if ((m = /^\/v3\/conversations\/([^/]+)\/messages\/(\d+)$/.exec(p)) && req.method === "DELETE") { this.deleted.push(`${decodeURIComponent(m[1])}/${m[2]}`); res.writeHead(204); return res.end(); }
      out(404, { meta: { code: 404 } });
    });
    this.port = await listen(this.server, port);
  }
  push(data: J) { const w = this.waiters.shift(); w ? w([data]) : this.pushQueue.push(data); }
  stop() { this.server.closeAllConnections(); this.server.close(); }
}

/** A stand-in for the Matrix server's client API (what the bridge uses). */
export class FakeMatrix {
  server!: Server; port = 0;
  rooms: { id: string; opts: J; members: Set<string>; events: { type: string; content: J; as?: string; ts?: string; id: string }[] }[] = [];
  registered = new Set<string>(); profiles: Record<string, J> = {}; uploads = 0; media: Record<string, Buffer> = {}; redactions: string[] = [];
  failImpersonating = false;
  async start() {
    this.server = createServer(async (req, res) => {
      const u = new URL(req.url!, "http://x"); const raw = await body(req); const as = u.searchParams.get("user_id") ?? undefined;
      const out = (status: number, data: unknown) => { res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(data)); };
      if (req.headers.authorization !== "Bearer as-secret") return out(401, { errcode: "M_UNKNOWN_TOKEN" });
      const json = () => (raw.length ? JSON.parse(raw.toString()) : {});
      const p = decodeURIComponent(u.pathname); let m;
      if (p === "/_matrix/client/v3/register") { const name = json().username; if (this.registered.has(name)) return out(400, { errcode: "M_USER_IN_USE", error: "in use" }); this.registered.add(name); return out(200, { user_id: `@${name}:test.local` }); }
      if ((m = /^\/_matrix\/client\/v3\/profile\/([^/]+)\/(displayname|avatar_url)$/.exec(p))) { (this.profiles[m[1]] ??= {})[m[2]] = json()[m[2]]; return out(200, {}); }
      if (p === "/_matrix/client/v3/createRoom") { const id = `!room${this.rooms.length + 1}:test.local`; const o = json(); this.rooms.push({ id, opts: o, members: new Set(["@groupmebot:test.local"]), events: [] }); return out(200, { room_id: id }); }
      if ((m = /^\/_matrix\/client\/v3\/rooms\/([^/]+)\/invite$/.exec(p))) return out(200, {});
      if ((m = /^\/_matrix\/client\/v3\/rooms\/([^/]+)\/join$/.exec(p))) {
        if (this.failImpersonating && as?.startsWith("@me:")) return out(403, { errcode: "M_FORBIDDEN", error: "not in namespace" });
        this.rooms.find((r) => r.id === m![1])?.members.add(as!); return out(200, { room_id: m[1] });
      }
      if ((m = /^\/_matrix\/client\/v3\/rooms\/([^/]+)\/send\/([^/]+)\/([^/]+)$/.exec(p))) {
        if (this.failImpersonating && as?.startsWith("@me:")) return out(403, { errcode: "M_FORBIDDEN", error: "not in namespace" });
        const room = this.rooms.find((r) => r.id === m![1])!; const id = `$ev${room.events.length + 1}_${room.id.slice(5, 6)}`;
        room.events.push({ type: m[2], content: json(), as, ts: u.searchParams.get("ts") ?? undefined, id }); return out(200, { event_id: id });
      }
      if ((m = /^\/_matrix\/client\/v3\/rooms\/([^/]+)\/redact\/([^/]+)\/([^/]+)$/.exec(p))) { this.redactions.push(m[2]); return out(200, { event_id: "$red" }); }
      if (p === "/_matrix/media/v3/upload") { this.uploads++; const id = `mxc://test.local/up${this.uploads}`; this.media[id] = raw; return out(200, { content_uri: id }); }
      if ((m = /^\/_matrix\/client\/v1\/media\/download\/([^/]+)\/(.+)$/.exec(p))) { const b = this.media[`mxc://${m[1]}/${m[2]}`]; if (!b) { res.writeHead(404); return res.end(); } res.writeHead(200, { "content-type": "image/png" }); return res.end(b); }
      out(404, { errcode: "M_NOT_FOUND", error: p });
    });
    this.port = await listen(this.server);
  }
  stop() { this.server.closeAllConnections(); this.server.close(); }
}

export function testConfig(gm: FakeGroupMe, mx: FakeMatrix, over: Partial<Config> = {}): Config {
  return {
    port: 0, domain: "test.local", homeserverUrl: `http://127.0.0.1:${mx.port}`, asToken: "as-secret", hsToken: "hs-secret", botLocalpart: "groupmebot", ghostPrefix: "groupme_",
    provisioningSecret: "prov-secret", dataDir: "/tmp", groupmeApi: `http://127.0.0.1:${gm.port}/v3`, groupmeImageApi: `http://127.0.0.1:${gm.port}`, groupmePush: `http://127.0.0.1:${gm.port}/faye`, backfill: 20, ...over,
  };
}
