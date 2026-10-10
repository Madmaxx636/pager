import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { Config } from "./config.ts";
import type { Bridge } from "./bridge.ts";
import type { Store } from "./store.ts";
import type { MatrixAS } from "./matrix.ts";
import { GroupMeError } from "./groupme.ts";

type J = Record<string, any>;

const same = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && timingSafeEqual(x, y); };

async function readJson(req: IncomingMessage): Promise<J> {
  const chunks: Buffer[] = []; let size = 0;
  for await (const c of req) { size += (c as Buffer).length; if (size > 5_000_000) throw new GroupMeError(413, "Request too large"); chunks.push(c as Buffer); }
  const text = Buffer.concat(chunks).toString("utf8");
  return text ? JSON.parse(text) : {};
}

function send(res: ServerResponse, status: number, body: unknown) {
  const text = JSON.stringify(body);
  res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(text) });
  res.end(text);
}

/**
 * Two doors: the one Synapse uses (the appservice API: new events, "does this user exist?") and the one Pager's server uses on a
 * person's behalf (linking an account, the list of people, starting a chat). Each has its own secret.
 */
export function createBridgeServer(cfg: Config, bridge: Bridge, store: Store, mx: MatrixAS) {
  const seen: string[] = [];

  async function appservice(req: IncomingMessage, res: ServerResponse, url: URL, path: string) {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("access_token") ?? "";
    if (!same(auth, cfg.hsToken)) return send(res, 403, { errcode: "M_FORBIDDEN", error: "Bad token" });
    const m = /^\/(?:_matrix\/app\/v1\/)?(transactions|users|rooms|ping)(?:\/(.+))?$/.exec(path);
    if (!m) return send(res, 404, { errcode: "M_NOT_FOUND" });
    if (m[1] === "ping") return send(res, 200, {});
    if (m[1] === "transactions" && req.method === "PUT" && m[2]) {
      const txn = decodeURIComponent(m[2]);
      const body = await readJson(req);
      if (!seen.includes(txn)) {
        seen.push(txn); if (seen.length > 200) seen.shift();
        // Answer at once; Synapse retries (and queues everything behind) anything that takes long.
        void bridge.handleEvents(Array.isArray(body.events) ? body.events : []).catch(() => {});
      }
      return send(res, 200, {});
    }
    if (m[1] === "users" && m[2]) {
      const id = decodeURIComponent(m[2]);
      if (!mx.isGhost(id)) return send(res, 404, { errcode: "M_NOT_FOUND" });
      await mx.ensureGhost(id).catch(() => {});
      return send(res, 200, {});
    }
    return send(res, 404, { errcode: "M_NOT_FOUND" });
  }

  async function provisioning(req: IncomingMessage, res: ServerResponse, url: URL, path: string) {
    const auth = req.headers.authorization?.replace(/^Bearer\s+/i, "") ?? "";
    if (!same(auth, cfg.provisioningSecret)) return send(res, 401, { errcode: "M_UNKNOWN_TOKEN", error: "Bad provisioning secret" });
    const user = url.searchParams.get("user_id") ?? "";
    if (!/^@[^:]+:.+$/.test(user)) return send(res, 400, { errcode: "M_BAD_JSON", error: "user_id is required" });
    const loginOf = () => {
      const id = url.searchParams.get("login_id");
      const mine = store.loginsOf(user);
      const l = id ? mine.find((x) => x.id === id) : mine[0];
      if (!l) throw new GroupMeError(404, "Link a GroupMe account first");
      return l;
    };
    const m = req.method ?? "GET";

    if (m === "GET" && path === "/whoami") {
      return send(res, 200, { homeserver: cfg.domain, logins: store.loginsOf(user).map((l) => ({ id: l.id, name: l.name, profile: { name: l.name }, state_event: bridge.stateOf(l.id) })) });
    }
    if (m === "GET" && path === "/login/flows") {
      return send(res, 200, { flows: [{ id: "token", name: "Access token", description: "Link GroupMe with your own access token" }] });
    }
    if (m === "POST" && path === "/login/start/token") {
      return send(res, 200, {
        login_id: randomUUID(), step_id: "token", type: "user_input",
        instructions: "Sign in at dev.groupme.com, choose Access Token at the top, and copy it here. It lets Pager read and send GroupMe messages as you.",
        user_input: { fields: [{ type: "password", id: "token", name: "Access token", description: "From dev.groupme.com → Access Token" }] },
      });
    }
    const step = /^\/login\/step\/([^/]+)\/([^/]+)\/([^/]+)$/.exec(path);
    if (m === "POST" && step) {
      const body = await readJson(req);
      const token = String(body.token ?? "").trim();
      if (!token) throw new GroupMeError(400, "Paste your access token");
      const login = await bridge.link(user, token);
      void bridge.syncChats(login).catch((e) => console.log("first sync failed:", String(e?.message ?? e)));
      return send(res, 200, { login_id: step[1], step_id: "complete", type: "complete", instructions: `Linked ${login.name}. Your chats appear in a moment.`, complete: { user_login_id: login.id } });
    }
    const out = /^\/logout\/(.+)$/.exec(path);
    if (m === "POST" && out) { await bridge.unlink(user, decodeURIComponent(out[1])); return send(res, 200, {}); }

    if (m === "GET" && path === "/contacts") {
      const list = await bridge.contacts(loginOf());
      return send(res, 200, { contacts: list.map((c) => ({ id: c.id, name: c.name, identifiers: [] })) });
    }
    if (m === "POST" && path === "/search_users") {
      const q = String((await readJson(req)).query ?? "").trim().toLowerCase();
      const list = (await bridge.contacts(loginOf())).filter((c) => !q || c.name.toLowerCase().includes(q));
      return send(res, 200, { results: list.slice(0, 50).map((c) => ({ id: c.id, name: c.name, identifiers: [] })) });
    }
    const resolve = /^\/resolve_identifier\/(.+)$/.exec(path);
    if (m === "GET" && resolve) {
      const id = decodeURIComponent(resolve[1]);
      const c = (await bridge.contacts(loginOf())).find((x) => x.id === id);
      if (!c) throw new GroupMeError(404, "No such person on GroupMe");
      return send(res, 200, { id: c.id, name: c.name, identifiers: [] });
    }
    const dm = /^\/create_dm\/(.+)$/.exec(path);
    if (m === "POST" && dm) {
      const id = decodeURIComponent(dm[1]);
      return send(res, 200, { id, dm_room_mxid: await bridge.openChat(loginOf(), id) });
    }
    return send(res, 404, { errcode: "M_UNRECOGNIZED", error: "Not found" });
  }

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://x");
      const path = url.pathname;
      if (path === "/health") return send(res, 200, { ok: true });
      if (path.startsWith("/_matrix/provision/v3")) return await provisioning(req, res, url, path.slice("/_matrix/provision/v3".length));
      return await appservice(req, res, url, path);
    } catch (e) {
      if (e instanceof GroupMeError) return send(res, e.status >= 400 && e.status < 600 ? e.status : 502, { errcode: "M_UNKNOWN", error: e.message });
      console.log("request failed:", String((e as Error)?.message ?? e));
      send(res, 500, { errcode: "M_UNKNOWN", error: "Something went wrong in the GroupMe bridge" });
    }
  });
}
