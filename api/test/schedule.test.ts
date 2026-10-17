import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, isDue, parseAt, runDue, type Sched } from "../src/schedule.ts";

const at = (iso: string) => Date.parse(iso);
test("times are checked", () => { assert.deepEqual(parseAt("04:30"), { h: 4, m: 30 }); assert.equal(parseAt("24:00"), undefined); assert.equal(parseAt("4:30"), undefined); assert.equal(parseAt(5), undefined); });
test("odd input becomes off", () => { assert.equal(clean({ every: "hourly" }, 1).every, "off"); assert.equal(clean(null, 1).every, "off"); assert.equal(clean({ every: "daily", at: "99:99" }, 1).at, "04:00"); });
test("interval schedules wait for the period", () => {
  const s: Sched = { every: "6h", at: "04:00", last: at("2026-10-17T00:00:00Z") };
  assert.equal(isDue(s, at("2026-10-17T05:59:00Z")), false);
  assert.equal(isDue(s, at("2026-10-17T06:00:00Z")), true);
  assert.equal(isDue({ ...s, every: "off" }, at("2030-01-01T00:00:00Z")), false);
});
test("a daily schedule runs once after its time, even if the server was down at that moment", () => {
  const s: Sched = { every: "daily", at: "04:00", last: at("2026-10-16T10:00:00Z") };
  assert.equal(isDue(s, at("2026-10-17T03:59:00Z")), false);
  assert.equal(isDue(s, at("2026-10-17T04:00:00Z")), true);
  assert.equal(isDue(s, at("2026-10-17T09:00:00Z")), true); // missed the minute, still owed
  assert.equal(isDue({ ...s, last: at("2026-10-17T04:00:30Z") }, at("2026-10-17T09:00:00Z")), false);
});
test("turning a daily schedule on late in the day does not restart right away", () => {
  const now = at("2026-10-17T15:00:00Z");
  assert.equal(isDue({ every: "daily", at: "04:00", last: now }, now), false);
  assert.equal(isDue({ every: "daily", at: "04:00", last: now }, at("2026-10-18T04:00:00Z")), true);
});
test("runDue restarts what is due and remembers how it went", async () => {
  const now = at("2026-10-17T12:00:00Z"), done: string[] = [];
  const all: Record<string, Sched> = {
    a: { every: "6h", at: "04:00", last: at("2026-10-17T00:00:00Z") }, b: { every: "6h", at: "04:00", last: at("2026-10-17T11:00:00Z") }, c: { every: "12h", at: "04:00", last: at("2026-10-16T00:00:00Z") },
  };
  const tried = await runDue(all, now, async (id) => { done.push(id); return id !== "c"; });
  assert.deepEqual(tried, ["a", "c"]); assert.deepEqual(done, ["a", "c"]);
  assert.equal(all.a.result, "ok"); assert.equal(all.c.result, "failed"); assert.equal(all.a.last, now); assert.equal(all.b.last, at("2026-10-17T11:00:00Z"));
});
