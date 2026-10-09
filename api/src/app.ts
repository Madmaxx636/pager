import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Config } from "./config.ts";
import { HttpError, asUser, registerUser, synapseAdmin, verifyPassword, whoami } from "./synapse.ts";

/** Wrong admin passwords on the recover screen, per admin, so the screen cannot be used to guess a password. */
const recoverTries = new Map<string, number[]>();
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { bridgeRequest } from "./bridges.ts";
import { control, dockerAvailable, findContainer, logs } from "./docker.ts";
import { readRegistration, readSettings, writeSettings } from "./bridgeconfig.ts";

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

    // Turn on encryption for a page that comes from a connected app. People are not allowed to change those rooms' settings
    // themselves (the app's bot owns them), so the server does this one thing, as that bot, for anyone who is in the page.
    if (parts[0] === "rooms" && parts[1] && parts[2] === "encrypt" && parts.length === 3 && method === "POST") {
      const token = tokenOf(req);
      await whoami(cfg, token);
      const roomId = decodeURIComponent(parts[1]);
      // Newer rooms have ids with no server name after a colon, so only the shape is checked.
      if (!/^![A-Za-z0-9._~:+=\-]{3,200}$/.test(roomId)) throw new HttpError(400, "Bad page id");
      const api = (path: string, init: RequestInit = {}) => fetch(`${cfg.synapseUrl}/_matrix/client/v3${path}`, init).catch(() => { throw new HttpError(502, "Homeserver unavailable"); });
      const members = await api(`/rooms/${encodeURIComponent(roomId)}/joined_members`, { headers: { authorization: `Bearer ${token}` } });
      if (!members.ok) throw new HttpError(403, "You are not in that page");
      const ids = Object.keys(((await members.json()) as { joined?: Record<string, unknown> }).joined ?? {});
      const bridge = cfg.bridges.find((b) => ids.some((u) => u.startsWith(`@${b.id}bot:`)));
      if (!bridge) throw new HttpError(400, "This page doesn't come from a connected app");
      if (!cfg.bridgesDir) throw new HttpError(409, "Server control isn't turned on, so the server can't switch this page for you");
      const reg = readRegistration(cfg.bridgesDir, bridge.id);
      if (!reg) throw new HttpError(500, `Can't read ${bridge.name}'s registration`);
      const already = await api(`/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption`, { headers: { authorization: `Bearer ${token}` } });
      if (already.ok) return send(res, 200, { ok: true, already: true });
      const put = await api(`/rooms/${encodeURIComponent(roomId)}/state/m.room.encryption/?user_id=${encodeURIComponent(`@${reg.bot}:${cfg.domain}`)}`, {
        method: "PUT", headers: { authorization: `Bearer ${reg.asToken}`, "content-type": "application/json" },
        body: JSON.stringify({ algorithm: "m.megolm.v1.aes-sha2", rotation_period_ms: 604_800_000, rotation_period_msgs: 100 }),
      });
      if (!put.ok) throw new HttpError(502, `${bridge.name} could not turn on encryption for this page`);
      console.log(`[rooms] ${(await whoami(cfg, token))} turned on encryption in ${roomId} (via ${bridge.id})`);
      return send(res, 200, { ok: true });
    }

    // ---- Admin: Synapse enforces who may do this, using the caller's own token ----------------
    if (parts[0] === "admin") {
      const token = tokenOf(req);
      const me = await whoami(cfg, token);
      if (!(await isAdmin(token, me))) throw new HttpError(403, "Admins only");
      const enc = encodeURIComponent;
      const target = parts[1] === "users" && parts[2] ? decodeURIComponent(parts[2]) : "";
      if (target && !/^@[a-z0-9._=\-/+]+:[a-z0-9.\-:]+$/i.test(target)) throw new HttpError(400, "Bad user id");

      // Everyone, with what each person has connected, in one call.
      if (parts[1] === "overview" && parts.length === 2 && method === "GET") {
        const r = await synapseAdmin(cfg, token, "GET", "/_synapse/admin/v2/users?from=0&limit=500&guests=false&order_by=creation_ts");
        const bots = new RegExp(`^@(${cfg.bridges.map((b) => b.id).join("|")})(bot:|_)`); // bridge bots and the puppets that stand in for your contacts
        const people = (r.users ?? []).filter((u: any) => !bots.test(u.name) && !u.is_guest);
        const users = await Promise.all(people.map(async (u: any) => {
          const networks = u.deactivated ? [] : (await Promise.all(cfg.bridges.map(async (b) => {
            try {
              const who = await Promise.race([bridgeRequest(cfg, b, u.name, "GET", "/whoami"), new Promise<never>((_, rej) => setTimeout(() => rej(new Error("timed out")), 4000))]);
              return { id: b.id, name: b.name, logins: who.logins ?? [] };
            } catch (e) { return { id: b.id, name: b.name, logins: [], error: (e as Error).message }; }
          }))).filter((n) => n.logins.length || n.error);
          return { id: u.name, displayname: u.displayname ?? "", admin: !!u.admin, deactivated: !!u.deactivated, created: u.creation_ts, you: u.name === me, networks };
        }));
        return send(res, 200, { users });
      }
      if (parts[1] === "users" && parts.length === 2 && method === "GET") {
        const r = await synapseAdmin(cfg, token, "GET", "/_synapse/admin/v2/users?from=0&limit=500&guests=false&order_by=creation_ts");
        const bots = new RegExp(`^@(${cfg.bridges.map((b) => b.id).join("|")})(bot:|_)`); // bridge bots and the puppets that stand in for your contacts
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
      // Recover an account whose owner lost both their password and their recovery key. Needs the ADMIN's own password again.
      // What it can do: set a new password and sign every device out, and remove the encryption backup so the person can start a new one.
      // What it cannot do, by design: read or restore their old encrypted messages. Only the recovery key or a key file can.
      if (parts[1] === "users" && target && parts[3] === "recover" && method === "POST") {
        const { adminPassword, newPassword } = await readJson(req);
        if (target === me) throw new HttpError(400, "Use Settings to change your own password");
        if (newPassword != null && (typeof newPassword !== "string" || newPassword.length < 8)) throw new HttpError(400, "Password must be at least 8 characters");
        const tries = (recoverTries.get(me) ?? []).filter((t) => Date.now() - t < 10 * 60_000);
        if (tries.length >= 5) throw new HttpError(429, "Too many wrong passwords. Wait ten minutes");
        try { await verifyPassword(cfg, me, adminPassword); } catch (e) { if ((e as HttpError).status === 403) recoverTries.set(me, [...tries, Date.now()]); throw e; }
        recoverTries.delete(me);
        const password = (newPassword as string | undefined) ?? randomBytes(15).toString("base64url");
        // Remove their encryption backup (as them), so they can make a new recovery key. Then the password reset signs out everything.
        let backupRemoved = false;
        try {
          backupRemoved = await asUser(cfg, token, target, async (ut) => {
            const h = { authorization: `Bearer ${ut}` };
            const v = await fetch(`${cfg.synapseUrl}/_matrix/client/v3/room_keys/version`, { headers: h }).then((r) => (r.ok ? r.json() : undefined)).catch(() => undefined) as { version?: string } | undefined;
            if (!v?.version) return false;
            return fetch(`${cfg.synapseUrl}/_matrix/client/v3/room_keys/version/${enc(v.version)}`, { method: "DELETE", headers: h }).then((r) => r.ok).catch(() => false);
          });
        } catch { /* a deactivated account has nothing to remove */ }
        await synapseAdmin(cfg, token, "POST", `/_synapse/admin/v1/reset_password/${enc(target)}`, { new_password: password, logout_devices: true });
        console.log(`[admin] ${me} recovered ${target} (backup removed: ${backupRemoved})`);
        return send(res, 200, { ok: true, backupRemoved, ...(newPassword == null ? { temporaryPassword: password } : {}) });
      }
      if (parts[1] === "users" && target && parts[3] === "delete" && method === "POST") {
        if (target === me) throw new HttpError(400, "Delete your own profile from Settings → About");
        // Disconnect their apps first so the bridges let go of their accounts.
        await Promise.all(cfg.bridges.map(async (b) => {
          try { const who = await bridgeRequest(cfg, b, target, "GET", "/whoami"); for (const l of who.logins ?? []) await bridgeRequest(cfg, b, target, "POST", `/logout/${enc(l.id)}`, {}); } catch { /* bridge down or not logged in */ }
        }));
        return send(res, 200, await synapseAdmin(cfg, token, "POST", `/_synapse/admin/v1/deactivate/${enc(target)}`, { erase: true }));
      }
      // One account's details: devices (and when they were last used).
      if (parts[1] === "users" && target && parts[3] === "info" && method === "GET") {
        const u = await synapseAdmin(cfg, token, "GET", `/_synapse/admin/v2/users/${enc(target)}`);
        const d = await synapseAdmin(cfg, token, "GET", `/_synapse/admin/v2/users/${enc(target)}/devices`).catch(() => ({ devices: [] }));
        const devices = (d.devices ?? []).map((x: any) => ({ id: x.device_id, name: x.display_name ?? "", lastSeen: x.last_seen_ts ?? 0, ip: x.last_seen_ip ?? "" }));
        return send(res, 200, { id: target, displayname: u.displayname ?? "", admin: !!u.admin, deactivated: !!u.deactivated, locked: !!u.locked, created: u.creation_ts, devices });
      }
      if (parts[1] === "users" && target && parts[3] === "rename" && method === "POST") {
        const { displayname } = await readJson(req);
        if (typeof displayname !== "string" || displayname.length > 80) throw new HttpError(400, "Bad name");
        return send(res, 200, await synapseAdmin(cfg, token, "PUT", `/_synapse/admin/v2/users/${enc(target)}`, { displayname }));
      }
      if (parts[1] === "users" && target && parts[3] === "lock" && method === "POST") {
        const { locked } = await readJson(req);
        if (target === me) throw new HttpError(400, "You can't lock your own account");
        return send(res, 200, await synapseAdmin(cfg, token, "PUT", `/_synapse/admin/v2/users/${enc(target)}`, { locked: !!locked }));
      }
      if (parts[1] === "users" && target && parts[3] === "logout-all" && method === "POST") {
        const d = await synapseAdmin(cfg, token, "GET", `/_synapse/admin/v2/users/${enc(target)}/devices`);
        const ids = (d.devices ?? []).map((x: any) => x.device_id);
        if (ids.length) await synapseAdmin(cfg, token, "POST", `/_synapse/admin/v2/users/${enc(target)}/delete_devices`, { devices: ids });
        return send(res, 200, { signedOut: ids.length });
      }

      // ---- Bridge controls (need the container runtime: see scripts/enable-admin-control.sh) ----
      if (parts[1] === "control" && method === "GET") return send(res, 200, { docker: dockerAvailable(), settings: !!cfg.bridgesDir });
      if (parts[1] === "bridges" && parts.length === 2 && method === "GET") {
        const docker = dockerAvailable();
        const out = await Promise.all(cfg.bridges.map(async (b) => {
          const up = await fetch(`${b.url}/_matrix/mau/live`, { signal: AbortSignal.timeout(3000) }).then((r) => r.ok).catch(() => false);
          const c = docker ? await findContainer(b.id).catch(() => undefined) : undefined;
          return { id: b.id, name: b.name, up, container: c ? { state: c.state, status: c.status, image: c.image } : undefined };
        }));
        return send(res, 200, { bridges: out, docker });
      }
      if (parts[1] === "bridges" && parts[2] && parts[3] && method === "POST" && ["restart", "stop", "start"].includes(parts[3])) {
        const b = bridgeById(parts[2]);
        if (!dockerAvailable()) throw new HttpError(409, "Server control isn't turned on");
        const c = await findContainer(b.id);
        if (!c) throw new HttpError(404, `${b.name} isn't running on this server`);
        await control(c.id, parts[3] as "restart" | "stop" | "start");
        return send(res, 200, { ok: true });
      }
      if (parts[1] === "bridges" && parts[2] && parts[3] === "logs" && method === "GET") {
        const b = bridgeById(parts[2]);
        if (!dockerAvailable()) throw new HttpError(409, "Server control isn't turned on");
        const c = await findContainer(b.id);
        if (!c) throw new HttpError(404, "Not running");
        return send(res, 200, { log: await logs(c.id, Number(url.searchParams.get("tail") ?? 200)) });
      }
      if (parts[1] === "bridges" && parts[2] && parts[3] === "settings") {
        const b = bridgeById(parts[2]);
        if (!cfg.bridgesDir) throw new HttpError(409, "Server control isn't turned on");
        if (method === "GET") return send(res, 200, { settings: readSettings(cfg.bridgesDir, b.id) ?? [] });
        if (method === "PUT") {
          const { values, restart } = await readJson(req);
          let changed: string[];
          try { changed = writeSettings(cfg.bridgesDir, b.id, values ?? {}); } catch (e) { throw new HttpError(400, (e as Error).message); }
          if (restart && changed.length && dockerAvailable()) { const c = await findContainer(b.id); if (c) await control(c.id, "restart"); }
          return send(res, 200, { changed });
        }
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
