import { describe, expect, it } from "vitest";
import { tourSteps, typedLength } from "./tour";

describe("the welcome tour", () => {
  const f = { admin: false, hasKey: true, server: "https://chat.example.com" };

  it("starts with hello and ends with the goodbye", () => {
    const s = tourSteps(f);
    expect(s[0].id).toBe("hello"); expect(s.at(-1)!.id).toBe("done");
  });

  it("only administrators hear about inviting people", () => {
    expect(tourSteps(f).some((s) => s.id === "people")).toBe(false);
    const a = tourSteps({ ...f, admin: true });
    expect(a.some((s) => s.id === "people")).toBe(true);
    expect(a.find((s) => s.id === "people")!.action!.go).toBe("settings/admin");
  });

  it("offers to make a recovery key only when there isn't one yet", () => {
    expect(tourSteps(f).find((s) => s.id === "secure")!.action).toBeUndefined();
    expect(tourSteps({ ...f, hasKey: false }).find((s) => s.id === "secure")!.action!.go).toBe("settings/privacy");
  });

  it("tells you the server address to use on a phone, without the https://", () => {
    const t = tourSteps(f).find((s) => s.id === "phone")!.text;
    expect(t).toContain("chat.example.com"); expect(t).not.toContain("https://");
  });

  it("every step is short enough to read in a bubble", () => {
    for (const s of tourSteps({ ...f, admin: true, hasKey: false })) expect(s.text.length).toBeLessThan(170);
  });
});

describe("typing out a bubble", () => {
  it("grows with time and stops at the end", () => {
    expect(typedLength("hello", 0)).toBe(0);
    expect(typedLength("hello", 44)).toBe(2);
    expect(typedLength("hello", 10_000)).toBe(5);
  });
});
