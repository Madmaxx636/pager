import { describe, expect, it } from "vitest";
import { GIF_SOURCES, explainFailure, parseGiphy, parseKlipy, requestFor, sourcesWithKeys } from "./gifs";

describe("GIF sources", () => {
  it("lists only the sources you have a key for, stickers sharing their provider's key", () => {
    expect(sourcesWithKeys({}).length).toBe(0);
    expect(sourcesWithKeys({ giphy: "k" }).map((s) => s.id)).toEqual(["giphy", "giphy-stickers"]);
    expect(sourcesWithKeys({ giphy: "a", klipy: " b " }).map((s) => s.id)).toEqual(["giphy", "giphy-stickers", "klipy", "klipy-stickers"]);
    expect(sourcesWithKeys({ klipy: "   " }).length).toBe(0);
  });
  it("builds the right search and trending addresses", () => {
    const [giphy, , klipy, klipyStickers] = GIF_SOURCES;
    expect(requestFor(giphy, "K", "cat dance")).toBe("https://api.giphy.com/v1/gifs/search?api_key=K&limit=30&rating=pg-13&q=cat%20dance");
    expect(requestFor(giphy, "K", "")).toContain("/v1/gifs/trending?api_key=K");
    expect(requestFor(klipy, "K", "hi")).toContain("https://api.klipy.com/api/v1/K/gifs/search?");
    expect(requestFor(klipy, "K", "hi")).toContain("&q=hi");
    expect(requestFor(klipyStickers, "K", "")).toContain("/api/v1/K/stickers/trending?");
  });
  it("reads GIPHY results", () => {
    const g = parseGiphy({ data: [{ id: "1", title: "t", images: { original: { url: "https://x/o.gif", width: "200", height: "100" }, fixed_height_small: { url: "https://x/s.gif" } } }, { id: "2", images: {} }] });
    expect(g).toEqual([{ id: "1", title: "t", previewUrl: "https://x/s.gif", url: "https://x/o.gif", w: 200, h: 100, source: "giphy" }]);
  });
  it("reads KLIPY results: a medium GIF to send, a small one to preview", () => {
    const g = parseKlipy({ result: true, data: { data: [{ id: 8041071659142944, slug: "hello-hi-662", title: "Hello", file: {
      hd: { gif: { url: "https://static.klipy.com/hd.gif", width: 498, height: 498 } }, md: { gif: { url: "https://static.klipy.com/md.gif", width: 320, height: 320 } }, sm: { webp: { url: "https://static.klipy.com/sm.webp", width: 160, height: 160 } } } }, { id: 2, file: {} }] } });
    expect(g.length).toBe(1);
    expect(g[0]).toMatchObject({ title: "Hello", url: "https://static.klipy.com/md.gif", previewUrl: "https://static.klipy.com/sm.webp", w: 320, h: 320, source: "klipy" });
  });
  it("explains failures in words", () => {
    expect(explainFailure(GIF_SOURCES[0], 403)).toMatch(/GIPHY rejected the key/);
    expect(explainFailure(GIF_SOURCES[2], 429)).toMatch(/KLIPY says too many/);
    expect(explainFailure(GIF_SOURCES[2], 500)).toBe("KLIPY search failed (500).");
  });
});
