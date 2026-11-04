import { describe, expect, it } from "vitest";
import { badgeLabel, badgePng } from "./badgeicon";

describe("unread badge", () => {
  it("shows the number, and 99+ for more", () => {
    expect(badgeLabel(1)).toBe("1");
    expect(badgeLabel(99)).toBe("99");
    expect(badgeLabel(100)).toBe("99+");
    expect(badgeLabel(-3)).toBe("0");
  });
  it("makes no picture when nothing is unread or there is no page to draw on", () => {
    expect(badgePng(0)).toBeUndefined();
    expect(badgePng(5)).toBeUndefined();   // no document in the test environment
  });
});
