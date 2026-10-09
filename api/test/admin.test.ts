import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { demux, dockerAvailable, findContainer, control, logs } from "../src/docker.ts";
import { readSettings, writeSettings } from "../src/bridgeconfig.ts";

const frame = (stream: number, text: string) => { const b = Buffer.from(text); const h = Buffer.alloc(8); h[0] = stream; h.writeUInt32BE(b.length, 4); return Buffer.concat([h, b]); };

test("docker logs are un-framed into plain text", () => {
  assert.equal(demux(Buffer.concat([frame(1, "hello\n"), frame(2, "oops\n")])), "hello\noops\n");
  assert.equal(demux(Buffer.from("already plain text")), "already plain text");
});

test("the docker client finds a bridge's container, controls it and reads its log over the socket", async () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-sock-"));
  const sock = join(dir, "docker.sock");
  const seen: string[] = [];
  const srv = createServer((req, res) => {
    seen.push(`${req.method} ${decodeURIComponent(req.url!)}`);
    if (req.url!.startsWith("/containers/json")) { res.writeHead(200, { "content-type": "application/json" }); return void res.end(JSON.stringify([{ Id: "abc123", Names: ["/pager-signal-1"], State: "running", Status: "Up 2 hours", Image: "dock.mau.dev/mautrix/signal:latest" }])); }
    if (req.url!.includes("/logs")) { res.writeHead(200); return void res.end(Buffer.concat([frame(1, "\x1b[32mINF\x1b[0m started\n")])); }
    res.writeHead(204); res.end();
  });
  await new Promise<void>((r) => srv.listen(sock, r));
  process.env.DOCKER_SOCKET_PATH = sock;
  try {
    assert.equal(dockerAvailable(), true);
    const c = await findContainer("signal");
    assert.deepEqual(c, { id: "abc123", name: "pager-signal-1", state: "running", status: "Up 2 hours", image: "dock.mau.dev/mautrix/signal:latest" });
    assert.ok(seen[0].includes('com.docker.compose.service=signal'));
    await control("abc123", "restart");
    assert.ok(seen.includes("POST /containers/abc123/restart?t=10"));
    assert.equal(await logs("abc123", 50), "INF started\n");
  } finally { srv.close(); delete process.env.DOCKER_SOCKET_PATH; }
});

test("no socket means no server control", () => {
  process.env.DOCKER_SOCKET_PATH = "/nonexistent/docker.sock";
  assert.equal(dockerAvailable(), false);
  delete process.env.DOCKER_SOCKET_PATH;
});

test("bridge settings: only known keys, right types, comments kept, a backup made", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-br-"));
  mkdirSync(join(dir, "signal"));
  writeFileSync(join(dir, "signal", "config.yaml"), "# top comment\nbackfill:\n    enabled: false\n    max_initial_messages: 50\nmatrix:\n    delivery_receipts: false\nnetwork:\n    other: 1\n");
  const s = readSettings(dir, "signal")!;
  assert.deepEqual(s.map((x) => x.key), ["backfill", "backfillInitial", "deliveryReceipts"]); // keys the bridge doesn't have aren't offered
  assert.deepEqual(writeSettings(dir, "signal", { backfill: true, backfillInitial: 2000, deliveryReceipts: true, madeUp: 1 }), ["backfill", "backfillInitial", "deliveryReceipts"]);
  const text = readFileSync(join(dir, "signal", "config.yaml"), "utf8");
  assert.ok(text.includes("# top comment") && text.includes("max_initial_messages: 2000") && text.includes("other: 1"));
  assert.throws(() => writeSettings(dir, "signal", { backfill: "yes" }), /on or off/);
  assert.throws(() => writeSettings(dir, "signal", { backfillInitial: -5 }), /whole number/);
  assert.equal(readFileSync(join(dir, "signal", "config.yaml.bak"), "utf8").includes("enabled: false"), true);
});
