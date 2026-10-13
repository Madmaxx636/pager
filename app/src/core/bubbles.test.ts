import { describe, expect, it } from "vitest";
import { bubbleColorsFor, bubbleLook, DEFAULTS, migrateBubbleStyle } from "./settings";

describe("bubble looks", () => {
  it("maps older shapes onto Beeper's", () => {
    expect(["soft", "pill", "square", "sharp", "notch", "plain"].map(migrateBubbleStyle)).toEqual(Array(6).fill("round"));
    expect(migrateBubbleStyle("cloud")).toBe("curved");
    expect(["round", "curved", "tail", "outline"].map(migrateBubbleStyle)).toEqual(["round", "curved", "tail", "outline"]);
  });
  it("outgoing follows incoming until it is set", () => {
    const s = { ...DEFAULTS, bubbleStyle: "curved" as const, bubbleRadius: 12, bubbleBorder: "dashed" as const, bubbleBorderColor: "#ff0000" };
    expect(bubbleLook(s, true)).toEqual({ style: "curved", radius: 12, border: "dashed", borderColor: "#ff0000" });
    const own = { ...s, outStyle: "tail" as const, outRadius: 0, outBorder: "none" as const, outBorderColor: "#00ff00" };
    expect(bubbleLook(own, true)).toEqual({ style: "tail", radius: 0, border: "none", borderColor: "#00ff00" });
    expect(bubbleLook(own, false).style).toBe("curved");
  });
  it("uses the dark colours in the dark theme and falls back to the light ones", () => {
    const s = { ...DEFAULTS, bubbleMine: "#112233", bubbleMineDark: "#445566", bubbleMineText: "#ffffff" };
    expect(bubbleColorsFor(s, true, false).color).toBe("#112233");
    expect(bubbleColorsFor(s, true, true).color).toBe("#445566");
    expect(bubbleColorsFor(s, true, true).text).toBe("#ffffff");
    expect(bubbleColorsFor(s, false, true)).toEqual({ color: "", text: "" });
  });
});
