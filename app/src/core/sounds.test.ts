import { describe, expect, it } from "vitest";
import { SOUNDS, hasSound } from "./sounds";

describe("sounds", () => {
  it("has a recipe for every sound in the list, and no duplicates", () => {
    for (const [id] of SOUNDS) expect(hasSound(id), id).toBe(true);
    expect(new Set(SOUNDS.map(([id]) => id)).size).toBe(SOUNDS.length);
    expect(SOUNDS.length).toBeGreaterThanOrEqual(28 + 50);
    expect(SOUNDS[SOUNDS.length - 1][0]).toBe("none");
  });
});
