import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { memoryLevel } = createRequire(import.meta.url)("./memorylevel.js");

test("a window that was hidden or minimised is hidden, whatever the memory", () => {
  assert.equal(memoryLevel({ hidden: true, total: 150 }), "hidden");
  assert.equal(memoryLevel({ hidden: true, total: 500 }), "hidden");
});
test("a window that is not hidden is judged by memory alone, so a covered window in use is never 'hidden'", () => {
  assert.equal(memoryLevel({ hidden: false, total: 150 }), "ok");
  assert.equal(memoryLevel({ hidden: false, total: 301 }), "high");
  assert.equal(memoryLevel({ hidden: false, total: 401 }), "critical");
});
