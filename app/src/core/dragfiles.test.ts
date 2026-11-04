import { describe, expect, it } from "vitest";
import { hasFiles } from "./dragfiles";

describe("hasFiles", () => {
  it("is true for a file dragged in from the desktop", () => expect(hasFiles({ dataTransfer: { types: ["Files"] } })).toBe(true));
  it("is false for dragged text or an item dragged inside the app", () => {
    expect(hasFiles({ dataTransfer: { types: ["text/plain"] } })).toBe(false);
    expect(hasFiles({ dataTransfer: { types: ["application/x-pager-pin"] } })).toBe(false);
  });
  it("is false when there is no data", () => expect(hasFiles({ dataTransfer: null })).toBe(false));
});
