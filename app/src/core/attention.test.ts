import { describe, expect, it } from "vitest";
import { attentionKindOf, attentionText, isFresh, ATTENTION_FIELD } from "./attention";

describe("attention", () => {
  it("reads the kind and ignores anything else", () => {
    expect(attentionKindOf({ [ATTENTION_FIELD]: { kind: "ring" } })).toBe("ring");
    expect(attentionKindOf({ [ATTENTION_FIELD]: { kind: "boom" } })).toBeUndefined();
    expect(attentionKindOf({})).toBeUndefined();
    expect(attentionKindOf(null)).toBeUndefined();
  });
  it("has words for every other app", () => { for (const k of ["nudge", "ring", "video", "image"] as const) expect(attentionText(k).length).toBeGreaterThan(3); });
  it("only rings for fresh messages", () => {
    expect(isFresh(Date.now() - 5_000)).toBe(true);
    expect(isFresh(Date.now() - 10 * 60_000)).toBe(false);
  });
});
