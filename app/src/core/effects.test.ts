import { describe, expect, it } from "vitest";
import { effectFor, spawn, step } from "./effects";

describe("effectFor", () => {
  it("picks effects from content", () => {
    expect(effectFor("congrats!! 🎉")).toBe("confetti");
    expect(effectFor("Happy Birthday")).toBe("balloons");
    expect(effectFor("it's snowing ❄️")).toBe("snow");
    expect(effectFor("✨")).toBe("sparkles");
    expect(effectFor("❤️❤️")).toBe("hearts");
    expect(effectFor("love you")).toBe("hearts");
  });
  it("ignores ordinary text", () => {
    expect(effectFor("see you at 5")).toBeUndefined();
    expect(effectFor("I ❤️ this really long sentence about pizza")).toBeUndefined();
  });
  it("animates and finishes", () => {
    const ps = spawn("confetti", 400, 300);
    expect(ps.length).toBeGreaterThan(10);
    let alive = true, n = 0;
    while (alive && n++ < 2000) alive = step(ps, "confetti", 400, 300);
    expect(alive).toBe(false);
  });
});
