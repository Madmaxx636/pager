import { beforeEach, describe, expect, it, vi } from "vitest";

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.resetModules();
});

describe("settings that belong to one device", () => {
  it("applies newer remote settings and ignores older ones", async () => {
    const s = await import("./settings");
    s.updateSettings({ closeToTray: false });
    const t = s.getSettingsUpdatedAt();
    expect(s.applyRemoteSettings({ v: 1, updatedAt: t - 1000, settings: { closeToTray: true } })).toBe(false);
    expect(s.getSettings().closeToTray).toBe(false);
    expect(s.applyRemoteSettings({ v: 1, updatedAt: t + 1000, settings: { closeToTray: true, gifKey: "secret" } })).toBe(true);
    expect(s.getSettings().closeToTray).toBe(true);
    expect(s.getSettings().gifKey).not.toBe("secret");
  });

  it("does not upload device-only secrets, nor the settings every device shares, and tells listeners about local edits", async () => {
    const s = await import("./settings");
    const cb = vi.fn();
    s.onLocalSettingsChange(cb);
    s.updateSettings({ gifKey: "k", accent: "pink", closeToTray: false });
    expect(cb).toHaveBeenCalledTimes(1);
    const p = s.settingsPayload();
    expect(p.settings.closeToTray).toBe(false);
    expect("gifKey" in p.settings).toBe(false);
    expect("accent" in p.settings).toBe(false);
  });

  it("applying remote settings is not treated as a local edit", async () => {
    const s = await import("./settings");
    const cb = vi.fn();
    s.onLocalSettingsChange(cb);
    s.applyRemoteSettings({ v: 1, updatedAt: Date.now() + 5000, settings: { closeToTray: false } });
    expect(cb).not.toHaveBeenCalled();
  });
});

describe("settings every device shares", () => {
  it("changing one anywhere changes it everywhere, and the newest change wins", async () => {
    const s = await import("./settings");
    s.updateSettings({ accent: "pink" });
    const mine = s.sharedPayload().keys.accent.t;
    expect(s.sharedPayload().keys.accent.v).toBe("pink");
    // another device changed it earlier: ours stays
    expect(s.applyRemoteShared({ v: 2, keys: { accent: { v: "red", t: mine - 5000 } } }).changed).toBe(false);
    expect(s.getSettings().accent).toBe("pink");
    // another device changed it later: ours follows
    expect(s.applyRemoteShared({ v: 2, keys: { accent: { v: "green", t: mine + 5000 }, bubbleStyle: { v: "square", t: mine + 5000 } } }).changed).toBe(true);
    expect(s.getSettings().accent).toBe("green"); expect(s.getSettings().bubbleStyle).toBe("square");
  });

  it("saving never wipes what another device saved, and ignores keys it does not know", async () => {
    const s = await import("./settings");
    s.applyRemoteShared({ v: 2, keys: { wallpaper: { v: "dusk", t: 1000 }, notAThing: { v: 1, t: 2000 }, gifKey: { v: "secret", t: 3000 } } });
    s.updateSettings({ accent: "blue" });
    const keys = s.sharedPayload().keys;
    expect(keys.wallpaper.v).toBe("dusk"); expect(keys.accent.v).toBe("blue");
    expect("notAThing" in keys).toBe(false); expect("gifKey" in keys).toBe(false);
    expect(s.getSettings().gifKey).not.toBe("secret");
  });

  it("a device with choices of its own and an account with none shares those choices", async () => {
    const s = await import("./settings");
    s.updateSettings({ fontScale: 1.2 });
    localStorage.removeItem("pager.settingsStamps");
    vi.resetModules();
    const again = await import("./settings");
    again.seedSharedStamps();
    expect(again.sharedPayload().keys.fontScale.v).toBe(1.2);
    expect("accent" in again.sharedPayload().keys).toBe(false); // still the default: nothing to share
  });
});
