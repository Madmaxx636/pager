import { describe, expect, it } from "vitest";
import { FONTS, PALETTES, paletteById } from "./palettes";
import { SOUNDS } from "./sounds";

describe("looks, fonts and sounds", () => {
  it("every look has a unique id and real colours", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) for (const c of [p.bg, p.panel, p.panel2, p.line, p.theirs, p.text, p.muted, p.accent]) expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    expect(paletteById("pager")?.dark).toBe(true);
    expect(paletteById("nope")).toBeUndefined();
  });
  it("the system font is first and has no override", () => { expect(FONTS[0][0]).toBe("system"); expect(FONTS[0][2]).toBe(""); });
  it("the pager sounds are on offer", () => { for (const id of ["pager", "beepbeep", "trill", "tick"]) expect(SOUNDS.some((s) => s[0] === id)).toBe(true); });
});
