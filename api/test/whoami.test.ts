import { test } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { whoami } from "../src/synapse.ts";

test("a token that was good a moment ago still works while the homeserver is slow or down", async () => {
  let up = true, calls = 0;
  const srv = createServer((req, res) => { calls++; if (!up) return void req.socket.destroy(); res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ user_id: "@a:x" })); });
  await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
  const cfg = { synapseUrl: `http://127.0.0.1:${(srv.address() as AddressInfo).port}` } as never;
  try {
    assert.equal(await whoami(cfg, "tok1"), "@a:x");
    assert.equal(await whoami(cfg, "tok1"), "@a:x"); assert.equal(calls, 1, "the second ask is answered from memory");
    up = false;
    assert.equal(await whoami(cfg, "tok1"), "@a:x");
    await assert.rejects(() => whoami(cfg, "never-seen"), (e: { status?: number }) => e.status === 503);
  } finally { srv.close(); }
});
