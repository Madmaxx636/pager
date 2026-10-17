import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readBridgeUpdates } from "../src/bridgeupdates.ts";

test("bridge updates are read from the file next to the state file; odd content is ignored", () => {
  const dir = mkdtempSync(join(tmpdir(), "pager-upd-"));
  const state = join(dir, "settings.json");
  assert.deepEqual(readBridgeUpdates(state), []);
  assert.deepEqual(readBridgeUpdates(undefined), []);
  writeFileSync(join(dir, "bridge-updates.json"), JSON.stringify([{ at: "2026-10-17T05:00:00Z", updated: ["gmessages", 5], putBack: [] }, { at: "nonsense", updated: [] }, null]));
  assert.deepEqual(readBridgeUpdates(state), [{ at: "2026-10-17T05:00:00Z", updated: ["gmessages"], putBack: [] }]);
  writeFileSync(join(dir, "bridge-updates.json"), "{ not json");
  assert.deepEqual(readBridgeUpdates(state), []);
});
