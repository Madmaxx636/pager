import { describe, expect, it } from "vitest";
import { MAX_BYTES, MAX_SECONDS, problemWith } from "./customsound";

describe("your own alert sound", () => {
  it("accepts a short audio file", () => { expect(problemWith("audio/mpeg", 200_000, 3)).toBe(""); });
  it("explains what is wrong", () => {
    expect(problemWith("image/png", 100, 1)).toMatch(/isn't a sound/);
    expect(problemWith("audio/ogg", MAX_BYTES + 1, 2)).toMatch(/too big/);
    expect(problemWith("audio/ogg", 1000, MAX_SECONDS + 5)).toMatch(/seconds long/);
    expect(problemWith("audio/ogg", 1000, NaN)).toMatch(/Couldn't read/);
  });
});
