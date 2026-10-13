import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.resetModules();
});

describe("syncing settings by hand", () => {
  it("changing a setting copies nothing anywhere", async () => {
    const s = await import("./settings");
    s.updateSettings({ accent: "pink" });
    expect(Object.keys(s)).not.toContain("applyRemoteShared"); // no automatic copying exists any more
    expect(s.getSettings().accent).toBe("pink");
  });

  it("saves only the groups you pick, keeping what was saved for the others", async () => {
    const s = await import("./settings");
    s.updateSettings({ accent: "pink", bubbleStyle: "curved" });
    const first = s.mergeSaved(undefined, ["look"], "A", 1000);
    expect(first.settings.accent).toBe("pink"); expect("bubbleStyle" in first.settings).toBe(false);
    s.updateSettings({ accent: "green" });
    const second = s.mergeSaved(first, ["bubbles"], "B", 2000);
    expect(second.settings.accent).toBe("pink"); expect(second.settings.bubbleStyle).toBe("curved");
    expect(second.savedAt).toBe(2000); expect(second.from).toBe("B");
  });

  it("loads only the groups you pick and says how many settings changed", async () => {
    const s = await import("./settings");
    const saved = { v: 3 as const, savedAt: 1, from: "A", settings: { accent: "red", bubbleStyle: "outline", fontScale: 1.3 } as Record<string, unknown> };
    s.updateSettings({ accent: "blue" });
    expect(s.loadSaved(saved as never, ["look"])).toBe(2); // accent and fontScale
    expect(s.getSettings().accent).toBe("red"); expect(s.getSettings().bubbleStyle).not.toBe("outline");
    expect(s.loadSaved(saved as never, ["look"])).toBe(0); // nothing left to change
  });

  it("lists only complete groups from a saved set, and never carries secrets", async () => {
    const s = await import("./settings");
    s.updateSettings({ gifKey: "secret" });
    const saved = s.mergeSaved(undefined, s.SYNC_GROUPS.map((g) => g.id), "A");
    expect(s.groupsIn(saved).sort()).toEqual(s.SYNC_GROUPS.map((g) => g.id).sort());
    expect(JSON.stringify(saved)).not.toContain("secret");
    expect(s.groupsIn({ ...saved, settings: { accent: "x" } })).toEqual([]);
  });
});
