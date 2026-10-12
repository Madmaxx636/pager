import { describe, expect, it } from "vitest";
import { KEEP_MESSAGES, poolClearMs } from "./memory";

describe("pulled history pool", () => {
  it("clears after 12 minutes at the normal size and sooner the more was pulled", () => {
    expect(poolClearMs(KEEP_MESSAGES)).toBe(12 * 60_000);
    expect(poolClearMs(KEEP_MESSAGES + 100)).toBe(7 * 60_000);
    expect(poolClearMs(KEEP_MESSAGES + 200)).toBe(2 * 60_000);
    expect(poolClearMs(5000)).toBe(2 * 60_000);
  });
});
