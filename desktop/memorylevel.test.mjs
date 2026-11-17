import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const { memoryLevel } = createRequire(import.meta.url)("./memorylevel.js");

test("a window that was hidden or minimised is hidden, whatever the memory", () => {
  assert.equal(memoryLevel({ hidden: true, total: 150 }), "hidden");
  assert.equal(memoryLevel({ hidden: true, total: 1500 }), "hidden");
});
test("a window that is not hidden is judged by memory alone, so a covered window in use is never 'hidden'", () => {
  assert.equal(memoryLevel({ hidden: false, total: 150 }), "ok");
  assert.equal(memoryLevel({ hidden: false, total: 701 }), "high");
  assert.equal(memoryLevel({ hidden: false, total: 1001 }), "critical");
});
test("an app that idles at about 300 MB (Windows) is never squeezed", () => {
  for (const total of [280, 300, 310, 380, 420, 560]) assert.equal(memoryLevel({ hidden: false, total, previous: "ok" }), "ok");
});
test("a level is only left once memory is clearly below it, so a number hovering at a limit does not flip", () => {
  assert.equal(memoryLevel({ hidden: false, total: 690, previous: "high" }), "high");
  assert.equal(memoryLevel({ hidden: false, total: 610, previous: "high" }), "ok");
  assert.equal(memoryLevel({ hidden: false, total: 990, previous: "critical" }), "critical");
  assert.equal(memoryLevel({ hidden: false, total: 900, previous: "critical" }), "high");
});
