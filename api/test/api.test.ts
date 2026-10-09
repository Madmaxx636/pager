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
const adminCalls: { method: string; url: string; body: any }[] = [];
const bridgeCalls: { method: string; url: string; auth?: string; body: any }[] = [];

before(async () => {
  synapse = createServer(async (req, res) => {
    if (req.url === "/_synapse/admin/v1/register" && req.method === "GET") return json(res, 200, { nonce: "abc" });
    if (req.url === "/_synapse/admin/v1/register") {
      const b = await readBody(req);
      const mac = createHmac("sha1", "regsecret").update(`abc\0${b.username}\0${b.password}\0${b.admin ? "admin" : "notadmin"}`).digest("hex");
      if (mac !== b.mac) return json(res, 403, { errcode: "M_FORBIDDEN", error: "bad mac" });
      if (b.username === "taken") return json(res, 400, { errcode: "M_USER_IN_USE", error: "in use" });
      registered.push(b);
      return json(res, 200, { user_id: `@${b.username}:test.local` });
    }
    if (req.url === "/_matrix/client/v3/account/whoami")
      return req.headers.authorization === "Bearer goodtoken" ? json(res, 200, { user_id: "@alice:test.local" })
        : req.headers.authorization === "Bearer admintoken" ? json(res, 200, { user_id: "@root:test.local" })
        : json(res, 401, { errcode: "M_UNKNOWN_TOKEN" });
    // Synapse's admin API: only admintoken may use it.
    req.url = decodeURIComponent(req.url!);
    if (req.method === "GET" && req.url! === "/_synapse/admin/v2/users/@root:test.local") return json(res, 200, { name: "@root:test.local", admin: true });
    if (req.method === "GET" && req.url! === "/_synapse/admin/v2/users/@alice:test.local") return json(res, 200, { name: "@alice:test.local", admin: false });
    if (req.url!.startsWith("/_synapse/admin/")) {
      if (req.headers.authorization !== "Bearer admintoken") return json(res, 403, { errcode: "M_FORBIDDEN", error: "not admin" });
      if (req.url!.startsWith("/_synapse/admin/v2/users?")) return json(res, 200, { users: [
        { name: "@root:test.local", admin: true, creation_ts: 1 }, { name: "@alice:test.local", admin: false, creation_ts: 2 }, { name: "@whatsappbot:test.local", admin: false },
        { name: "@whatsapp_12345:test.local", admin: false }, { name: "@whatsapp_lid-99:test.local", admin: false } ] });
      if (req.url!.endsWith("/devices") && req.method === "GET") return json(res, 200, { devices: [{ device_id: "D1", display_name: "Pager Android", last_seen_ts: 5, last_seen_ip: "1.2.3.4" }, { device_id: "D2" }] });
      adminCalls.push({ method: req.method!, url: req.url!, body: await readBody(req) });
      return json(res, 200, {});
    }
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
    signup: { mode: "invite", inviteCode: "family", adminInviteCode: "boss" },
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

test("CORS: preflight succeeds and responses allow cross-origin callers", async () => {
  const pre = await fetch(base + "/api/bridges", { method: "OPTIONS" });
  assert.equal(pre.status, 204);
  assert.match(pre.headers.get("access-control-allow-headers") ?? "", /authorization/);
  const r = await fetch(base + "/api/config");
  assert.equal(r.headers.get("access-control-allow-origin"), "*");
  const bad = await fetch(base + "/api/bridges");
  assert.equal(bad.status, 401);
  assert.equal(bad.headers.get("access-control-allow-origin"), "*");
});

test("the admin invite code creates an administrator, even when signups are closed", async () => {
  const r = await post("/api/signup", { username: "root", password: "longenough", invite: "boss" });
  assert.equal(r.status, 201);
  assert.equal(registered.at(-1).admin, true);
  assert.equal((await post("/api/signup", { username: "dave", password: "longenough", invite: "family" }).then((x) => x.json()) as any).user_id, "@dave:test.local");
  assert.equal(registered.at(-1).admin, false);
});

test("/api/me says whether you are an admin", async () => {
  const me = async (t: string) => (await (await fetch(base + "/api/me", { headers: { authorization: `Bearer ${t}` } })).json()) as any;
  assert.equal((await me("goodtoken")).admin, false);
  assert.equal((await me("admintoken")).admin, true);
});

test("admin routes refuse everyone but admins", async () => {
  assert.equal((await fetch(base + "/api/admin/users", { headers: { authorization: "Bearer goodtoken" } })).status, 403);
  assert.equal((await fetch(base + "/api/admin/users")).status, 401);
});

test("admins can list profiles (without bridge bots), see logins, change roles and delete", async () => {
  const h = { authorization: "Bearer admintoken", "content-type": "application/json" };
  const users: any = await (await fetch(base + "/api/admin/users", { headers: h })).json();
  assert.deepEqual(users.users.map((u: any) => u.id), ["@root:test.local", "@alice:test.local"]);
  assert.equal(users.users[0].you, true);
  const logins: any = await (await fetch(base + "/api/admin/users/@alice:test.local/logins", { headers: h })).json();
  assert.equal(logins.networks[0].logins[0].id, "123");
  assert.equal((await fetch(base + "/api/admin/users/@alice:test.local/admin", { method: "POST", headers: h, body: JSON.stringify({ admin: true }) })).status, 200);
  assert.deepEqual(adminCalls.at(-1)?.body, { admin: true });
  assert.equal((await fetch(base + "/api/admin/users/@root:test.local/admin", { method: "POST", headers: h, body: JSON.stringify({ admin: false }) })).status, 400);
  assert.equal((await fetch(base + "/api/admin/users/@alice:test.local/delete", { method: "POST", headers: h, body: "{}" })).status, 200);
  assert.ok(adminCalls.at(-1)!.url.includes("/deactivate/"));
  assert.equal((await fetch(base + "/api/admin/users/@root:test.local/delete", { method: "POST", headers: h, body: "{}" })).status, 400);
});

test("admins can close signups and make a new invite code", async () => {
  const h = { authorization: "Bearer admintoken", "content-type": "application/json" };
  const r: any = await (await fetch(base + "/api/admin/server", { method: "POST", headers: h, body: JSON.stringify({ signup: "invite", regenerateInvite: true }) })).json();
  assert.equal(r.signup, "invite");
  assert.notEqual(r.inviteCode, "family");
  assert.equal((await post("/api/signup", { username: "erin", password: "longenough", invite: "family" })).status, 403);
});

test("admins get everyone with their connected apps in one call", async () => {
  const h = { authorization: "Bearer admintoken" };
  const r: any = await (await fetch(base + "/api/admin/overview", { headers: h })).json();
  assert.deepEqual(r.users.map((u: any) => u.id), ["@root:test.local", "@alice:test.local"]);
  assert.equal(r.users[1].networks[0].id, "whatsapp");
  assert.equal(r.users[1].networks[0].logins[0].id, "123");
  assert.equal((await fetch(base + "/api/admin/overview", { headers: { authorization: "Bearer goodtoken" } })).status, 403);
});

test("bridge puppets (your contacts) are never listed as accounts", async () => {
  const h = { authorization: "Bearer admintoken" };
  const r: any = await (await fetch(base + "/api/admin/users", { headers: h })).json();
  assert.deepEqual(r.users.map((u: any) => u.id), ["@root:test.local", "@alice:test.local"]);
});

test("account info lists devices; sign out everywhere removes them all; rename and lock go to Synapse", async () => {
  const h = { authorization: "Bearer admintoken", "content-type": "application/json" };
  const info: any = await (await fetch(base + "/api/admin/users/@alice:test.local/info", { headers: h })).json();
  assert.deepEqual(info.devices.map((d: any) => d.id), ["D1", "D2"]);
  assert.equal(info.devices[0].name, "Pager Android");
  const out: any = await (await fetch(base + "/api/admin/users/@alice:test.local/logout-all", { method: "POST", headers: h, body: "{}" })).json();
  assert.equal(out.signedOut, 2);
  assert.deepEqual(adminCalls.at(-1)?.body, { devices: ["D1", "D2"] });
  await fetch(base + "/api/admin/users/@alice:test.local/rename", { method: "POST", headers: h, body: JSON.stringify({ displayname: "Alice A" }) });
  assert.deepEqual(adminCalls.at(-1)?.body, { displayname: "Alice A" });
  await fetch(base + "/api/admin/users/@alice:test.local/lock", { method: "POST", headers: h, body: JSON.stringify({ locked: true }) });
  assert.deepEqual(adminCalls.at(-1)?.body, { locked: true });
  assert.equal((await fetch(base + "/api/admin/users/@root:test.local/lock", { method: "POST", headers: h, body: JSON.stringify({ locked: true }) })).status, 400);
});

test("bridge control says so when it isn't turned on", async () => {
  const h = { authorization: "Bearer admintoken", "content-type": "application/json" };
  const c: any = await (await fetch(base + "/api/admin/control", { headers: h })).json();
  assert.equal(c.docker, false);
  assert.equal((await fetch(base + "/api/admin/bridges/whatsapp/restart", { method: "POST", headers: h, body: "{}" })).status, 409);
});
