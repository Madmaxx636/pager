import { describe, expect, it } from "vitest";
import { BlobCache } from "./lru";

const make = (budget: number, minKeep = 2) => {
  const released: string[] = []; const queued: (() => void)[] = [];
  const c = new BlobCache(budget, minKeep, (u) => released.push(u), (fn) => queued.push(fn));
  return { c, released, runLater: () => { queued.splice(0).forEach((f) => f()); } };
};

describe("the picture cache", () => {
  it("keeps everything while it fits", () => {
    const { c } = make(100);
    c.set("a", "blob:a", 40); c.set("b", "blob:b", 40);
    expect(c.get("a")).toBe("blob:a"); expect(c.get("b")).toBe("blob:b"); expect(c.totalBytes).toBe(80);
  });

  it("lets go of the least recently used when over budget, a minute later", () => {
    const { c, released, runLater } = make(100, 1);
    c.set("a", "blob:a", 60); c.set("b", "blob:b", 60);
    expect(c.get("a")).toBeUndefined(); expect(c.get("b")).toBe("blob:b");
    expect(released).toEqual([]);          // not yet: it might be on screen right now
    runLater(); expect(released).toEqual(["blob:a"]);
  });

  it("counts a read as use, so what you are looking at stays", () => {
    const { c } = make(100, 1);
    c.set("a", "blob:a", 40); c.set("b", "blob:b", 40);
    c.get("a");                              // a is now newer than b
    c.set("c", "blob:c", 40);                // over budget: b goes
    expect(c.get("b")).toBeUndefined(); expect(c.get("a")).toBe("blob:a"); expect(c.get("c")).toBe("blob:c");
  });

  it("always keeps a minimum number, however big they are", () => {
    const { c } = make(10, 2);
    c.set("a", "blob:a", 500); c.set("b", "blob:b", 500);
    expect(c.size).toBe(2);
  });

  it("replacing an entry releases the old address and recounts the size", () => {
    const { c, released, runLater } = make(1000);
    c.set("a", "blob:1", 100); c.set("a", "blob:2", 30);
    expect(c.totalBytes).toBe(30); runLater(); expect(released).toEqual(["blob:1"]);
  });

  it("clear releases everything now", () => {
    const { c, released } = make(1000);
    c.set("a", "blob:a", 1); c.set("b", "blob:b", 1); c.clear();
    expect(released.sort()).toEqual(["blob:a", "blob:b"]); expect(c.size).toBe(0);
  });
});
