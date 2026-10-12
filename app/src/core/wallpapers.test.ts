import { describe, expect, it } from "vitest";
import { fitSize, WALLPAPERS, wallpaperCss } from "./wallpapers";

describe("wallpapers", () => {
  it("has unique ids, and a light and a dark version of each", () => {
    expect(new Set(WALLPAPERS.map((w) => w.id)).size).toBe(WALLPAPERS.length);
    for (const w of WALLPAPERS) { expect(w.light.length).toBeGreaterThan(0); expect(w.dark.length).toBeGreaterThan(0); }
    expect(WALLPAPERS.length).toBeGreaterThanOrEqual(25);
  });
  it("picks by theme, and falls back to nothing for an unknown one", () => {
    expect(wallpaperCss("dusk", false)).not.toBe(wallpaperCss("dusk", true));
    expect(wallpaperCss("nope", true)).toBe("none");
  });
  it("shrinks big photos and leaves small ones", () => {
    expect(fitSize(4000, 2000)).toEqual([1920, 960]);
    expect(fitSize(1000, 500)).toEqual([1000, 500]);
  });
});
