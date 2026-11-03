import { describe, expect, it } from "vitest";
import { incidentText } from "../core/incidents";

describe("an incident as text to copy", () => {
  const base = { id: "x", fp: "x", service: "discord", severity: "error" as const, message: "Failed to send notice", first: 1_700_000_000, last: 1_700_000_100, count: 1, before: ["INF a", "INF b"], after: ["INF c"] };
  it("shows the lines before, the event and the lines after, in that order", () => {
    const t = incidentText(base);
    expect(t.indexOf("INF a")).toBeLessThan(t.indexOf("Failed to send notice"));
    expect(t.indexOf("Failed to send notice")).toBeLessThan(t.indexOf("INF c"));
    expect(t).toContain("Error in discord (once)");
  });
  it("says how many times a repeated problem happened and leaves out empty parts", () => {
    const t = incidentText({ ...base, count: 7, before: [], after: [], severity: "crash" });
    expect(t).toContain("Crash in discord (7 times)");
    expect(t).not.toContain("Before:"); expect(t).not.toContain("After:");
  });
});
