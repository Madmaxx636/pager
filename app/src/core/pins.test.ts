import { describe, expect, it } from "vitest";
import { movedIds } from "./pins";

describe("moving a pin", () => {
  const row = ["a", "b", "c", "d"];
  it("puts the pin at its new place", () => {
    expect(movedIds(row, "d", 0)).toEqual(["d", "a", "b", "c"]);
    expect(movedIds(row, "a", 2)).toEqual(["b", "c", "a", "d"]);
    expect(movedIds(row, "b", 3)).toEqual(["a", "c", "d", "b"]);
  });
  it("keeps it in the row when the place is out of range", () => {
    expect(movedIds(row, "a", 99)).toEqual(["b", "c", "d", "a"]);
    expect(movedIds(row, "d", -5)).toEqual(["d", "a", "b", "c"]);
  });
  it("works for a pin that was not in the row yet", () => {
    expect(movedIds(["a"], "z", 0)).toEqual(["z", "a"]);
  });
});
