import { beforeEach, describe, expect, it, vi } from "vitest";

describe("settings that follow the account", () => {
  beforeEach(() => {
    const store: Record<string, string> = {};
    vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
    vi.resetModules();
  });

  it("applies newer remote settings and ignores older ones", async () => {
    const s = await import("./settings");
    s.updateSettings({ accent: "blue" });
    const t = s.getSettingsUpdatedAt();
    expect(s.applyRemoteSettings({ v: 1, updatedAt: t - 1000, settings: { accent: "red" } })).toBe(false);
    expect(s.getSettings().accent).toBe("blue");
    expect(s.applyRemoteSettings({ v: 1, updatedAt: t + 1000, settings: { accent: "red", gifKey: "secret" } })).toBe(true);
    expect(s.getSettings().accent).toBe("red");
    expect(s.getSettings().gifKey).not.toBe("secret");
  });

  it("does not upload device-only settings and tells listeners about local edits", async () => {
    const s = await import("./settings");
    const cb = vi.fn();
    s.onLocalSettingsChange(cb);
    s.updateSettings({ gifKey: "k", accent: "pink" });
    expect(cb).toHaveBeenCalledTimes(1);
    const p = s.settingsPayload();
    expect(p.settings.accent).toBe("pink");
    expect("gifKey" in p.settings).toBe(false);
  });

  it("applying remote settings is not treated as a local edit", async () => {
    const s = await import("./settings");
    const cb = vi.fn();
    s.onLocalSettingsChange(cb);
    s.applyRemoteSettings({ v: 1, updatedAt: Date.now() + 5000, settings: { accent: "green" } });
    expect(cb).not.toHaveBeenCalled();
  });
});
