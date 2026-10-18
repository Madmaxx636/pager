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
  it("low-end drops only the heavy things", () => {
    const e = effective({ ...DEFAULTS, lowEnd: true, bubbleFill: "glass", screenEffects: true, fancyMotion: true });
    expect(e).toMatchObject({ fancyMotion: false, screenEffects: false, bubbleFill: "solid", autoPlayGifs: false });
  });
  it("low-end keeps the small things", () => {
    const mine = { ...DEFAULTS, lowEnd: true, wallpaper: "dusk", messageAnimation: "pop" as const, bubbleDepth: "raised" as const, reduceMotion: false, greetings: true };
    expect(effective(mine)).toMatchObject({ wallpaper: "dusk", messageAnimation: "pop", bubbleDepth: "raised", reduceMotion: false, greetings: true });
  });
  it("both together stack", () => {
    const e = effective({ ...DEFAULTS, lowEnd: true, lowData: true });
    expect(e.autoDownload).toBe("never"); expect(e.screenEffects).toBe(false);
  });
});
