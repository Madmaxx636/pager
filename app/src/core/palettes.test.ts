import { describe, expect, it } from "vitest";
import { HUES, PALETTES, paletteById } from "./palettes";

const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

describe("ready-made looks", () => {
  it("has white, black and solid for every colour", () => {
    for (const [name] of HUES) for (const kind of ["white", "black", "solid"]) expect(paletteById(`${name.toLowerCase()}-${kind}`), `${name} ${kind}`).toBeDefined();
  });
  it("has unique ids and valid colours", () => {
    expect(new Set(PALETTES.map((p) => p.id)).size).toBe(PALETTES.length);
    for (const p of PALETTES) for (const c of [p.bg, p.panel, p.panel2, p.line, p.theirs, p.text, p.muted, p.accent]) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
  it("keeps text readable on every background and panel", () => {
    for (const p of PALETTES) for (const bg of [p.bg, p.panel, p.theirs]) expect(contrast(p.text, bg), `${p.id} text on ${bg}`).toBeGreaterThan(4.5);
  });
  it("keeps the muted text legible", () => {
    for (const p of PALETTES) expect(contrast(p.muted, p.panel), `${p.id} muted`).toBeGreaterThan(3);
  });
});
