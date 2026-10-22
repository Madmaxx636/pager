import { describe, expect, it } from "vitest";
import { searchEmoji } from "./emojisearch";

describe("emoji search", () => {
  it("finds by name", () => {
    expect(searchEmoji("fire")).toContain("🔥");
    expect(searchEmoji("thumbs up")).toContain("👍");
  });
  it("finds by keyword and by the start of a word", () => {
    expect(searchEmoji("hear")).toContain("❤️");
    expect(searchEmoji("laugh")).toContain("😂");
  });
  it("needs every word to match", () => {
    expect(searchEmoji("heart eyes")).toContain("😍");
    expect(searchEmoji("fire zzzznotaword")).toEqual([]);
  });
  it("gives nothing for an empty search", () => { expect(searchEmoji("   ")).toEqual([]); });
  it("puts a name that starts with the word first", () => { expect(searchEmoji("pizza")[0]).toBe("🍕"); });
});
