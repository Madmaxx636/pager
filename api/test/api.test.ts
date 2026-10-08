import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { createHmac } from "node:crypto";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.ts";
import type { Config } from "../src/config.ts";

const listen = (s: Server) => new Promise<number>((r) => s.listen(0, () => r((s.address() as AddressInfo).port)));
const json = (res: any, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const readBody = async (req: any) => {
  let s = "";
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
};

let synapse: Server, bridge: Server, api: Server;
let base: string;
const registered: any[] = [];
const bridgeCalls: { method: string; url: string; auth?: string; body: any }[] = [];

before(async () => {
  synapse = createServer(async (req, res) => {
    if (req.url === "/_synapse/admin/v1/register" && req.method === "GET") return json(res, 200, { nonce: "abc" });
    if (req.url === "/_synapse/admin/v1/register") {
      const b = await readBody(req);
      const mac = createHmac("sha1", "regsecret").update(`abc\0${b.username}\0${b.password}\0notadmin`).digest("hex");
      if (mac !== b.mac) return json(res, 403, { errcode: "M_FORBIDDEN", error: "bad mac" });
      if (b.username === "taken") return json(res, 400, { errcode: "M_USER_IN_USE", error: "in use" });
      registered.push(b);
      return json(res, 200, { user_id: `@${b.username}:test.local` });
    }
    if (req.url === "/_matrix/client/v3/account/whoami")
      return req.headers.authorization === "Bearer goodtoken"
        ? json(res, 200, { user_id: "@alice:test.local" })
        : json(res, 401, { errcode: "M_UNKNOWN_TOKEN" });
    json(res, 404, {});
  });
  bridge = createServer(async (req, res) => {
    bridgeCalls.push({ method: req.method!, url: req.url!, auth: req.headers.authorization, body: await readBody(req) });
    if (req.url!.startsWith("/_matrix/provision/v3/whoami")) return json(res, 200, { logins: [{ id: "123", name: "+1 555" }] });
    if (req.url!.startsWith("/_matrix/provision/v3/login/flows")) return json(res, 200, { flows: [{ id: "qr", name: "QR" }] });
    json(res, 200, { ok: true });
  });
  const [sp, bp] = [await listen(synapse), await listen(bridge)];
  const cfg: Config = {
    port: 0,
    domain: "test.local",
    synapseUrl: `http://127.0.0.1:${sp}`,
    registrationSecret: "regsecret",
    provisioningSecret: "provsecret",
    signup: { mode: "invite", inviteCode: "family" },
    bridges: [{ id: "whatsapp", name: "WhatsApp", url: `http://127.0.0.1:${bp}` }],
  };
  api = createApp(cfg);
  base = `http://127.0.0.1:${await listen(api)}`;
});
after(() => [synapse, bridge, api].forEach((s) => s.close()));

const post = (path: string, body: unknown, token?: string) =>
  fetch(base + path, {
    method: "POST",
    headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

test("signup requires the invite code", async () => {
  const r = await post("/api/signup", { username: "bob", password: "longenough", invite: "nope" });
  assert.equal(r.status, 403);
});

test("signup creates a user via Synapse with a valid MAC", async () => {
  const r = await post("/api/signup", { username: "bob", password: "longenough", invite: "family" });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { user_id: "@bob:test.local" });
  assert.equal(registered.at(-1).username, "bob");
});

test("signup validates username, password, and duplicates", async () => {
  assert.equal((await post("/api/signup", { username: "A!", password: "longenough", invite: "family" })).status, 400);
  assert.equal((await post("/api/signup", { username: "carol", password: "short", invite: "family" })).status, 400);
  assert.equal((await post("/api/signup", { username: "taken", password: "longenough", invite: "family" })).status, 409);
});

test("bridge routes reject missing or bad tokens", async () => {
  assert.equal((await fetch(base + "/api/bridges")).status, 401);
  assert.equal((await fetch(base + "/api/bridges", { headers: { authorization: "Bearer bad" } })).status, 401);
});

test("lists connected accounts per network", async () => {
  const r = await fetch(base + "/api/bridges", { headers: { authorization: "Bearer goodtoken" } });
  const body: any = await r.json();
  assert.equal(body.networks[0].id, "whatsapp");
  assert.equal(body.networks[0].logins[0].id, "123");
});

test("login calls are proxied with the shared secret and the user's ID", async () => {
  bridgeCalls.length = 0;
  const r = await post("/api/bridges/whatsapp/login/start/qr", {}, "goodtoken");
  assert.equal(r.status, 200);
  const call = bridgeCalls.at(-1)!;
  assert.equal(call.auth, "Bearer provsecret");
  assert.match(call.url, /^\/_matrix\/provision\/v3\/login\/start\/qr\?user_id=%40alice%3Atest\.local$/);
});

test("unknown networks and unlisted bridge paths are refused", async () => {
  assert.equal((await post("/api/bridges/nope/login/start/qr", {}, "goodtoken")).status, 404);
  assert.equal((await post("/api/bridges/whatsapp/admin/delete", {}, "goodtoken")).status, 404);
});

test("contact search and DM creation are proxied with login_id", async () => {
  bridgeCalls.length = 0;
  const r = await fetch(base + "/api/bridges/whatsapp/contacts?login_id=123&evil=1", { headers: { authorization: "Bearer goodtoken" } });
  assert.equal(r.status, 200);
  const url = bridgeCalls.at(-1)!.url;
  assert.match(url, /^\/_matrix\/provision\/v3\/contacts\?login_id=123&user_id=/);
  assert.ok(!url.includes("evil"));
  assert.equal((await post("/api/bridges/whatsapp/search_users?login_id=123", { query: "al" }, "goodtoken")).status, 200);
  assert.equal(bridgeCalls.at(-1)!.body.query, "al");
  assert.equal((await post("/api/bridges/whatsapp/create_dm/%2B15551234567?login_id=123", {}, "goodtoken")).status, 200);
  assert.match(bridgeCalls.at(-1)!.url, /create_dm\/%2B15551234567/);
});
