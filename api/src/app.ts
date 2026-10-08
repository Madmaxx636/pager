import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { Config } from "./config.ts";
import { HttpError, registerUser, whoami } from "./synapse.ts";
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
  const bridgeById = (id: string) => {
    const b = cfg.bridges.find((x) => x.id === id);
    if (!b) throw new HttpError(404, "Unknown network");
    return b;
  };

  async function authedUser(req: IncomingMessage) {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization ?? "")?.[1];
    if (!token) throw new HttpError(401, "Not signed in");
    return whoami(cfg, token);
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
      if (cfg.signup.mode === "closed") throw new HttpError(403, "Signups are closed");
      const { username, password, invite } = await readJson(req);
      if (cfg.signup.mode === "invite" && (!cfg.signup.inviteCode || invite !== cfg.signup.inviteCode))
        throw new HttpError(403, "Invalid invite code");
      if (typeof username !== "string" || !USERNAME_RE.test(username))
        throw new HttpError(400, "Username must be 3-32 chars: a-z, 0-9, . _ -");
      if (typeof password !== "string" || password.length < 8)
        throw new HttpError(400, "Password must be at least 8 characters");
      await registerUser(cfg, username, password);
      return send(res, 201, { user_id: `@${username}:${cfg.domain}` });
    }

    // Everything below requires a signed-in user.
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
