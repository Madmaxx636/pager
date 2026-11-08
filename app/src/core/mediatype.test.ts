import { describe, expect, it } from "vitest";
import { mediaKind, niceReason } from "./mediatype";

describe("which kind of message a file goes as", () => {
  it("puts the usual alternative spellings right: a .m4a from a browser is audio/mp4", () => {
    expect(mediaKind("audio/x-m4a", true)).toEqual({ type: "m.audio", mime: "audio/mp4" });
    expect(mediaKind("audio/x-wav", true)).toEqual({ type: "m.audio", mime: "audio/wav" });
    expect(mediaKind("image/jpg", true)).toEqual({ type: "m.image", mime: "image/jpeg" });
  });
  it("keeps what the bridges take", () => {
    for (const m of ["audio/mpeg", "audio/aac", "audio/mp4", "audio/flac"]) expect(mediaKind(m, true).type).toBe("m.audio");
    expect(mediaKind("image/png", true).type).toBe("m.image");
    expect(mediaKind("video/mp4", true).type).toBe("m.video");
  });
  it("sends what a bridge refuses as a plain file", () => {
    expect(mediaKind("audio/ogg", true)).toEqual({ type: "m.file", mime: "audio/ogg" });
    expect(mediaKind("audio/amr", true).type).toBe("m.file");
    expect(mediaKind("video/quicktime", true).type).toBe("m.file");
    expect(mediaKind("image/heic", true).type).toBe("m.file");
    expect(mediaKind("image/svg+xml", true).type).toBe("m.file");
  });
  it("leaves a page that is only on Pager as it was", () => {
    expect(mediaKind("audio/ogg", false)).toEqual({ type: "m.audio", mime: "audio/ogg" });
    expect(mediaKind("video/quicktime", false).type).toBe("m.video");
  });
  it("treats an unknown or empty type as a file", () => {
    expect(mediaKind("", true)).toEqual({ type: "m.file", mime: "application/octet-stream" });
    expect(mediaKind("application/pdf", true).type).toBe("m.file");
  });
});

describe("the bridge's reason for refusing", () => {
  it("is put in plain words", () => {
    expect(niceReason("unsupported media type (audio/x-m4a in m.audio)")).toBe("it doesn't accept that kind of file");
    expect(niceReason("file is too large")).toBe("the file is too big for it");
    expect(niceReason("Rate limited")).toBe("rate limited");
  });
});
