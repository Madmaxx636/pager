import { describe, expect, it } from "vitest";
import { advance, fraction, ImportJob, QUIET_MS, stuck, NOTHING_MS, importBusy } from "./importjob";

const base: ImportJob = { network: "whatsapp", name: "WhatsApp", mode: "all", startedAt: 0, baseChats: 0, chats: 0, messages: 0, changedAt: 0, phase: "linking" };

describe("import job", () => {
  it("starts importing when chats arrive and finishes after a quiet spell", () => {
    let j = advance(base, 3, 40, 1000);
    expect(j.phase).toBe("importing");
    j = advance(j, 3, 40, 1000 + QUIET_MS - 1);
    expect(j.phase).toBe("importing");
    j = advance(j, 3, 40, 1000 + QUIET_MS);
    expect(j.phase).toBe("done");
    expect(importBusy(j)).toBe(false);
  });
  it("keeps going while messages keep arriving", () => {
    let j = advance(base, 1, 1, 0);
    for (let t = 60_000; t < 600_000; t += 60_000) j = advance(j, 1, t / 1000, t);
    expect(j.phase).toBe("importing");
    expect(importBusy(j)).toBe(true);
  });
  it("waits for the user's pick in choose mode", () => {
    let j = advance({ ...base, mode: "choose" }, 2, 5, 0);
    j = advance(j, 2, 5, QUIET_MS);
    expect(j.phase).toBe("choosing");
    expect(advance(j, 9, 9, QUIET_MS * 2).phase).toBe("choosing");
  });
  it("offers a way out when nothing ever shows up", () => {
    expect(stuck(base, NOTHING_MS - 1)).toBe(false);
    expect(stuck(base, NOTHING_MS)).toBe(true);
  });
  it("bar stays empty until chats arrive and never reaches full before done", () => {
    expect(fraction(base, 5)).toBe(0);
    expect(fraction({ ...base, phase: "importing", chats: 1, changedAt: 0 }, QUIET_MS * 5)).toBe(0.95);
    expect(fraction({ ...base, phase: "done" }, 0)).toBe(1);
  });
});
