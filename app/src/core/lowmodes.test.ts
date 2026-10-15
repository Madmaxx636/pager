import { describe, expect, it } from "vitest";
import { DEFAULTS, effective } from "./settings";

describe("low data and low-end switches", () => {
  it("do nothing while off", () => {
    expect(effective(DEFAULTS)).toBe(DEFAULTS);
  });
  it("low data stops downloads, GIF autoplay, link previews and typing indicators, without touching your choices", () => {
    const mine = { ...DEFAULTS, lowData: true, autoDownload: "always" as const, linkPreviews: true, sendTyping: true, autoPlayGifs: true };
    const e = effective(mine);
    expect(e).toMatchObject({ autoDownload: "never", linkPreviews: false, sendTyping: false, autoPlayGifs: false });
    expect(mine.autoDownload).toBe("always"); // your own settings are as you left them
    expect(effective({ ...mine, lowData: false }).autoDownload).toBe("always");
  });
  it("low-end stops motion, effects, wallpaper, shadows and glass", () => {
    const e = effective({ ...DEFAULTS, lowEnd: true, bubbleFill: "glass", wallpaper: "dusk", screenEffects: true, messageAnimation: "pop", bubbleDepth: "raised" });
    expect(e).toMatchObject({ reduceMotion: true, fancyMotion: false, screenEffects: false, messageAnimation: "none", bubbleDepth: "flat", bubbleFill: "solid", wallpaper: "none" });
  });
  it("both together stack", () => {
    const e = effective({ ...DEFAULTS, lowEnd: true, lowData: true });
    expect(e.autoDownload).toBe("never"); expect(e.reduceMotion).toBe(true);
  });
});
