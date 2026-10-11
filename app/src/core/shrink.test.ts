import { describe, expect, it } from "vitest";
import { fitWithin, shrinkImage } from "./shrink";

describe("showing a picture at preview size", () => {
  it("scales down to the longest side, keeping the shape", () => {
    expect(fitWithin(4000, 3000, 960)).toEqual({ w: 960, h: 720, scaled: true });
    expect(fitWithin(3000, 4000, 960)).toEqual({ w: 720, h: 960, scaled: true });
  });
  it("never enlarges", () => {
    expect(fitWithin(400, 300, 960)).toEqual({ w: 400, h: 300, scaled: false });
  });
  it("copes with odd sizes", () => { expect(fitWithin(0, 0, 100).scaled).toBe(false); expect(fitWithin(10000, 1, 100).h).toBe(1); });

  it("hands back the original when it cannot or need not shrink it", async () => {
    const small = new Blob([new Uint8Array(1000)], { type: "image/jpeg" });
    expect(await shrinkImage(small, 640)).toBe(small);                                             // already small
    const big = new Blob([new Uint8Array(400_000)], { type: "image/jpeg" });
    expect(await shrinkImage(big, 640)).toBe(big);                                                 // no image decoder here: keep the original
    const gif = new Blob([new Uint8Array(400_000)], { type: "image/gif" });
    expect(await shrinkImage(gif, 640)).toBe(gif);                                                 // animations are left alone
  });
});
