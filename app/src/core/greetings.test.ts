import { describe, expect, it } from "vitest";
import { GREETINGS, pickGreeting } from "./greetings";

describe("greetings", () => {
  it("has plenty to say, none empty, no repeats", () => {
    expect(GREETINGS.length).toBeGreaterThan(30);
    expect(GREETINGS.every((g) => g.trim().length > 0)).toBe(true);
    expect(new Set(GREETINGS).size).toBe(GREETINGS.length);
  });
  it("picks within the list, whatever the dice say", () => {
    expect(GREETINGS).toContain(pickGreeting(() => 0));
    expect(GREETINGS).toContain(pickGreeting(() => 0.999999));
  });
});
