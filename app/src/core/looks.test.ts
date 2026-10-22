import { describe, expect, it } from "vitest";
import { DEFAULTS, effective } from "./settings";
import { LOOKS, withLook } from "./looks";

describe("messenger looks", () => {
  it("do nothing while off", () => { expect(withLook(DEFAULTS)).toBe(DEFAULTS); });
  it("set colours and shapes together", () => {
    const i = effective({ ...DEFAULTS, look: "imessage" });
    expect(i).toMatchObject({ bubbleStyle: "tail", bubbleMine: "#0a84ff", fontFamily: "sf", skin: "default" });
    expect(effective({ ...DEFAULTS, look: "hangouts" })).toMatchObject({ bubbleRadius: 4, showAvatars: true });
    expect(effective({ ...DEFAULTS, look: "gmessages" })).toMatchObject({ bubbleRadius: 20, accentCustom: "#0b57d0" });
  });
  it("leave your own settings as they were", () => {
    const mine = { ...DEFAULTS, look: "imessage" as const, bubbleMine: "#123456", bubbleRadius: 9 };
    effective(mine);
    expect(mine.bubbleMine).toBe("#123456"); expect(mine.bubbleRadius).toBe(9);
  });
  it("step aside for the desktop skin", () => { expect(effective({ ...DEFAULTS, look: "gmessages", skin: "win95" }).skin).toBe("default"); });
  it("have a name, a description and three swatches each", () => { for (const l of LOOKS) { expect(l.name.length).toBeGreaterThan(3); expect(l.blurb.length).toBeGreaterThan(20); expect(l.swatch).toHaveLength(3); } });
  it("still obey low-end mode on top", () => { expect(effective({ ...DEFAULTS, look: "imessage", lowEnd: true, bubbleFill: "glass" }).bubbleFill).toBe("solid"); });
});
