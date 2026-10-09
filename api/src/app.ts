import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Config } from "./config.ts";
import { HttpError, registerUser, synapseAdmin, whoami } from "./synapse.ts";
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { bridgeRequest } from "./bridges.ts";

const USERNAME_RE = /^[a-z0-9._-]{3,32}$/;

async function readJson(req: IncomingMessage): Promise<any> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += c.length;
    if (size > 64 * 1024) throw new HttpError(413, "Request too large");
    chunks.push(c);
  }
  if (!chunks.length) return {};
  try {
    return JSON.parse(Buffer.concat(chunks).toString());
  } catch {
    throw new HttpError(400, "Invalid JSON");
  }
}

// Auth is a bearer token in a header (never cookies), so any origin may call the API. The desktop app runs from a local page.
const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, content-type",
  "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
  "access-control-max-age": "86400",
};

function send(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "content-type": "application/json", ...CORS });
  res.end(JSON.stringify(body));
}

export function createApp(cfg: Config) {
  // Settings changed from the admin page are kept in a small file so a restart doesn't undo them.
  if (cfg.stateFile && existsSync(cfg.stateFile)) {
    try {
      const st = JSON.parse(readFileSync(cfg.stateFile, "utf8"));
      if (["invite", "open", "closed"].includes(st.signupMode)) cfg.signup.mode = st.signupMode;
      if (typeof st.inviteCode === "string") cfg.signup.inviteCode = st.inviteCode;
    } catch { /* ignore a damaged file */ }
  }
  const saveState = () => { if (cfg.stateFile) try { writeFileSync(cfg.stateFile, JSON.stringify({ signupMode: cfg.signup.mode, inviteCode: cfg.signup.inviteCode })); } catch { /* read-only */ } };

  const bridgeById = (id: string) => {
    const b = cfg.bridges.find((x) => x.id === id);
    if (!b) throw new HttpError(404, "Unknown network");
    return b;
  };

  const tokenOf = (req: IncomingMessage) => {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token) throw new HttpError(401, "Not signed in");
    return token;
  };
  async function authedUser(req: IncomingMessage) {
    return whoami(cfg, tokenOf(req));
  }
  async function isAdmin(token: string, userId: string) {
    try { return !!(await synapseAdmin(cfg, token, "GET", `/_synapse/admin/v2/users/${encodeURIComponent(userId)}`)).admin; } catch { return false; }
  }

  async function handle(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", "http://x");
    const parts = url.pathname.replace(/^\/api\//, "").split("/").filter(Boolean);
    const method = req.method ?? "GET";

    if (url.pathname === "/api/health") return send(res, 200, { ok: true });

    if (url.pathname === "/api/config" && method === "GET") {
      return send(res, 200, {
        domain: cfg.domain,
        signup: cfg.signup.mode,
        inviteRequired: cfg.signup.mode === "invite",
        bridges: cfg.bridges.map(({ id, name }) => ({ id, name })),
      });
    }

    if (url.pathname === "/api/signup" && method === "POST") {
      const { username, password, invite } = await readJson(req);
      // The admin invite code works even when signups are otherwise closed, and creates an administrator.
      const asAdmin = !!cfg.signup.adminInviteCode && invite === cfg.signup.adminInviteCode;
      if (cfg.signup.mode === "closed" && !asAdmin) throw new HttpError(403, "Signups are closed");
      if (!asAdmin && cfg.signup.mode === "invite" && (!cfg.signup.inviteCode || invite !== cfg.signup.inviteCode))
        throw new HttpError(403, "Invalid invite code");
      if (typeof username !== "string" || !USERNAME_RE.test(username))
        throw new HttpError(400, "Username must be 3-32 chars: a-z, 0-9, . _ -");
      if (typeof password !== "string" || password.length < 8)
        throw new HttpError(400, "Password must be at least 8 characters");
      await registerUser(cfg, username, password, asAdmin);
      return send(res, 201, { user_id: `@${username}:${cfg.domain}` });
    }

    // Everything below requires a signed-in user.
    if (parts[0] === "me" && method === "GET") {
      const token = tokenOf(req);
      const userId = await whoami(cfg, token);
      return send(res, 200, { user_id: userId, admin: await isAdmin(token, userId) });
    }

    // ---- Admin: Synapse enforces who may do this, using the caller's own token ----------------
    if (parts[0] === "admin") {
      const token = tokenOf(req);
      const me = await whoami(cfg, token);
      if (!(await isAdmin(token, me))) throw new HttpError(403, "Admins only");
      const enc = encodeURIComponent;
      const target = parts[2] ? decodeURIComponent(parts[2]) : "";
      if (target && !/^@[a-z0-9._=\-/+]+:[a-z0-9.\-:]+$/i.test(target)) throw new HttpError(400, "Bad user id");

      if (parts[1] === "users" && parts.length === 2 && method === "GET") {
        const r = await synapseAdmin(cfg, token, "GET", "/_synapse/admin/v2/users?from=0&limit=500&guests=false&order_by=creation_ts");
        const bots = new RegExp(`^@(${cfg.bridges.map((b) => b.id).join("|")})bot:`);
        return send(res, 200, { users: (r.users ?? []).filter((u: any) => !bots.test(u.name) && !u.is_guest).map((u: any) => ({
          id: u.name, displayname: u.displayname ?? "", admin: !!u.admin, deactivated: !!u.deactivated, created: u.creation_ts, you: u.name === me,
        })) });
      }
      if (parts[1] === "users" && target && parts[3] === "logins" && method === "GET") {
        const results = await Promise.all(cfg.bridges.map(async (b) => {
          try { const who = await bridgeRequest(cfg, b, target, "GET", "/whoami"); return { id: b.id, name: b.name, logins: who.logins ?? [] }; }
          catch (e) { return { id: b.id, name: b.name, logins: [], error: (e as Error).message }; }
        }));
        return send(res, 200, { networks: results.filter((n) => n.logins.length || n.error) });
      }
      if (parts[1] === "users" && target && parts[3] === "logout" && parts[4] && parts[5] && method === "POST") {
        const bridge = bridgeById(parts[4]);
        return send(res, 200, await bridgeRequest(cfg, bridge, target, "POST", `/logout/${enc(decodeURIComponent(parts[5]))}`, {}));
      }
      if (parts[1] === "users" && target && parts[3] === "admin" && method === "POST") {
        const { admin } = await readJson(req);
        if (target === me && admin === false) throw new HttpError(400, "You can't remove your own admin rights");
        return send(res, 200, await synapseAdmin(cfg, token, "PUT", `/_synapse/admin/v2/users/${enc(target)}`, { admin: !!admin }));
      }
      if (parts[1] === "users" && target && parts[3] === "password" && method === "POST") {
        const { password } = await readJson(req);
        if (typeof password !== "string" || password.length < 8) throw new HttpError(400, "Password must be at least 8 characters");
        return send(res, 200, await synapseAdmin(cfg, token, "POST", `/_synapse/admin/v1/reset_password/${enc(target)}`, { new_password: password, logout_devices: true }));
      }
      if (parts[1] === "users" && target && parts[3] === "delete" && method === "POST") {
        if (target === me) throw new HttpError(400, "Delete your own profile from Settings → About");
        // Disconnect their apps first so the bridges let go of their accounts.
        await Promise.all(cfg.bridges.map(async (b) => {
          try { const who = await bridgeRequest(cfg, b, target, "GET", "/whoami"); for (const l of who.logins ?? []) await bridgeRequest(cfg, b, target, "POST", `/logout/${enc(l.id)}`, {}); } catch { /* bridge down or not logged in */ }
        }));
        return send(res, 200, await synapseAdmin(cfg, token, "POST", `/_synapse/admin/v1/deactivate/${enc(target)}`, { erase: true }));
      }
      if (parts[1] === "server" && parts.length === 2 && method === "GET") {
        return send(res, 200, { domain: cfg.domain, signup: cfg.signup.mode, inviteCode: cfg.signup.inviteCode });
      }
      if (parts[1] === "server" && parts.length === 2 && method === "POST") {
        const { signup, regenerateInvite } = await readJson(req);
        if (signup !== undefined) { if (!["invite", "open", "closed"].includes(signup)) throw new HttpError(400, "Bad signup mode"); cfg.signup.mode = signup; }
        if (regenerateInvite) cfg.signup.inviteCode = randomBytes(9).toString("base64url");
        saveState();
        return send(res, 200, { domain: cfg.domain, signup: cfg.signup.mode, inviteCode: cfg.signup.inviteCode });
      }
      if (parts[1] === "bridges" && parts.length === 2 && method === "GET") {
        const out = await Promise.all(cfg.bridges.map(async (b) => {
          const ok = await fetch(`${b.url}/_matrix/mau/live`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
          return { id: b.id, name: b.name, up: ok };
        }));
        return send(res, 200, { bridges: out });
      }
      throw new HttpError(404, "Not found");
    }

    if (parts[0] === "bridges") {
      const userId = await authedUser(req);

      // GET /api/bridges -> connected accounts across all networks
      if (parts.length === 1 && method === "GET") {
        const results = await Promise.all(
          cfg.bridges.map(async (b) => {
            try {
              const who = await bridgeRequest(cfg, b, userId, "GET", "/whoami");
              return { id: b.id, name: b.name, logins: who.logins ?? [] };
            } catch (e) {
              return { id: b.id, name: b.name, logins: [], error: (e as Error).message };
            }
          }),
        );
        return send(res, 200, { networks: results });
      }

      const bridge = bridgeById(parts[1]);
      const rest = "/" + parts.slice(2).join("/");
      const allowed =
        (method === "GET" && rest === "/login/flows") ||
        (method === "POST" && /^\/login\/start\/[\w.-]+$/.test(rest)) ||
        (method === "POST" && /^\/login\/step\/[\w.-]+\/[\w.-]+\/[\w.-]+$/.test(rest)) ||
        (method === "POST" && /^\/logout\/[\w.:@!-]+$/.test(rest)) ||
        (method === "GET" && rest === "/contacts") ||
        (method === "POST" && rest === "/search_users") ||
        (method === "GET" && /^\/resolve_identifier\/[^/]+$/.test(rest)) ||
        (method === "POST" && /^\/create_dm\/[^/]+$/.test(rest));
      if (!allowed) throw new HttpError(404, "Not found");
      const body = method === "POST" ? await readJson(req) : undefined;
      return send(res, 200, await bridgeRequest(cfg, bridge, userId, method, rest, body, url.searchParams));
    }

    throw new HttpError(404, "Not found");
  }

  return createServer((req, res) => {
    if (req.method === "OPTIONS") { res.writeHead(204, CORS); res.end(); return; }
    handle(req, res).catch((e) => {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      send(res, 500, { error: "Internal error" });
    });
  });
}
