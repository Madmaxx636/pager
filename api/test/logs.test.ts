import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import { createApp } from "../src/app.ts";
import { ackIncidents, listIncidents, readIncidents } from "../src/logs.ts";

const NOW = Date.now() / 1000;
const rec = (fp: string, severity: string, last: number, extra: object = {}) => ({ id: fp + "00001", fp, service: "synapse", severity, message: "msg " + fp, first: last - 5, last, count: 1, before: ["a"], after: ["b"], ...extra });
const write = (dir: string, incidents: unknown[], updated = NOW) => { mkdirSync(dir, { recursive: true }); writeFileSync(join(dir, "incidents.json"), JSON.stringify({ version: 1, updated, incidents })); };

test("odd or missing files give an empty list, never an error", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-logs-"));
  assert.deepEqual(readIncidents(dir), { updated: 0, incidents: [] });
  writeFileSync(join(dir, "incidents.json"), "{ half written");
  assert.deepEqual(readIncidents(dir), { updated: 0, incidents: [] });
  writeFileSync(join(dir, "incidents.json"), JSON.stringify({ incidents: [{ nonsense: true }, null, rec("ok", "error", NOW)] }));
  assert.equal(readIncidents(dir).incidents.length, 1);
});

test("only the important kinds are shown unless everything is asked for", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-logs-"));
  write(dir, [rec("a", "crash", NOW - 1), rec("b", "error", NOW - 2), rec("c", "attention", NOW - 3), rec("d", "warning", NOW - 4)]);
  assert.deepEqual(listIncidents(dir).incidents.map((i) => i.fp), ["a", "b", "c"]);
  assert.deepEqual(listIncidents(dir, "errors").incidents.map((i) => i.fp), ["a", "b"]);
  assert.deepEqual(listIncidents(dir, "all").incidents.map((i) => i.fp), ["a", "b", "c", "d"]);
  assert.deepEqual(listIncidents(dir).counts, { crash: 1, error: 1, attention: 1, warning: 1 });
});

test("newest first, and the list is capped", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-logs-"));
  write(dir, Array.from({ length: 30 }, (_, i) => rec("f" + i, "error", NOW - i)));
  const r = listIncidents(dir, "important", 10);
  assert.equal(r.incidents.length, 10); assert.equal(r.incidents[0].fp, "f0");
});

test("a dismissed incident stays away until it happens again", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-logs-"));
  write(dir, [rec("a", "error", NOW - 100), rec("b", "error", NOW - 50)]);
  assert.equal(ackIncidents(dir, ["a"]), 1);
  assert.deepEqual(listIncidents(dir).incidents.map((i) => i.fp), ["b"]);
  write(dir, [rec("a", "error", NOW + 60, { count: 2 }), rec("b", "error", NOW - 50)]);     // a happened again after it was dismissed
  assert.deepEqual(listIncidents(dir).incidents.map((i) => i.fp).sort(), ["a", "b"]);
  assert.equal(ackIncidents(dir, "all"), 2);
  assert.equal(listIncidents(dir).incidents.length, 0);
});

// ---- the routes ------------------------------------------------------------------------------------------------------------------------
let synapse: Server, api: Server, base: string, dir: string;
before(async () => {
  dir = mkdtempSync(join(tmpdir(), "pager-logsapi-"));
  write(join(dir, "logs"), [rec("a", "error", NOW - 10), rec("w", "warning", NOW - 20)]);
  synapse = createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json" });
    if (req.url!.endsWith("/account/whoami")) return void res.end(JSON.stringify({ user_id: req.headers.authorization === "Bearer admintoken" ? "@root:test.local" : "@sam:test.local" }));
    res.end(JSON.stringify({ admin: decodeURIComponent(req.url!).includes("@root") }));
  });
  const sp = await new Promise<number>((r) => synapse.listen(0, () => r((synapse.address() as AddressInfo).port)));
  api = createApp({ port: 0, domain: "test.local", synapseUrl: `http://127.0.0.1:${sp}`, registrationSecret: "x", provisioningSecret: "x", signup: { mode: "invite", inviteCode: "x", adminInviteCode: "y" }, bridges: [], stateFile: join(dir, "settings.json") });
  base = `http://127.0.0.1:${await new Promise<number>((r) => api.listen(0, () => r((api.address() as AddressInfo).port)))}`;
});
after(() => [synapse, api].forEach((s) => { s.close(); s.closeAllConnections?.(); }));
const get = (path: string, token = "admintoken") => fetch(base + path, { headers: { authorization: `Bearer ${token}` } });

test("only admins can read the logs", async () => {
  assert.equal((await get("/api/admin/logs", "samtoken")).status, 403);
  assert.equal((await fetch(base + "/api/admin/logs")).status, 401);
});

test("an admin gets the important incidents, and a short answer when nothing changed", async () => {
  const r = await (await get("/api/admin/logs")).json();
  assert.equal(r.available, true); assert.deepEqual(r.incidents.map((i: any) => i.fp), ["a"]); assert.equal(r.counts.warning, 1);
  const again = await (await get(`/api/admin/logs?since=${r.updated}`)).json();
  assert.equal(again.unchanged, true); assert.equal(again.incidents, undefined);
  const all = await (await get("/api/admin/logs?level=all")).json();
  assert.equal(all.incidents.length, 2);
});

test("an admin can dismiss incidents", async () => {
  const res = await fetch(base + "/api/admin/logs/ack", { method: "POST", headers: { authorization: "Bearer admintoken", "content-type": "application/json" }, body: JSON.stringify({ fps: ["a"] }) });
  assert.deepEqual(await res.json(), { dismissed: 1 });
  assert.equal((await (await get("/api/admin/logs")).json()).incidents.length, 0);
  assert.ok(readFileSync(join(dir, "logs", "acks.json"), "utf8").includes('"a"'));
});
