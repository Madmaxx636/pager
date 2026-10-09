import { describe, expect, it } from "vitest";
import { DEFAULTS } from "./settings";
import { decide, keywordHit, PolicyInput } from "./notifypolicy";

const msg = (o: Partial<PolicyInput> = {}): PolicyInput => ({ roomId: "!a", network: "signal", isGroup: false, mentioned: false, text: "hi", quiet: false, pinned: false, nowMin: 12 * 60, day: 2, ...o });
const S = (o: Partial<typeof DEFAULTS> = {}) => ({ ...DEFAULTS, ...o });

describe("notification policy", () => {
  it("shows ordinary messages by default", () => expect(decide(msg(), S())).toMatchObject({ show: true, silent: false }));
  it("master switch off hides everything, even mentions", () => expect(decide(msg({ mentioned: true }), S({ notifEnabled: false })).show).toBe(false));
  it("muted chats only break through for things about you", () => {
    expect(decide(msg({ quiet: true }), S()).show).toBe(false);
    expect(decide(msg({ quiet: true, mentioned: true }), S()).show).toBe(true);
    expect(decide(msg({ quiet: true, replyToMe: true }), S()).show).toBe(true);
  });
  it("keywords count as being about you, whole words only", () => {
    expect(keywordHit("hey Lane!", ["lane"])).toBe(true);
    expect(keywordHit("plane crash", ["lane"])).toBe(false);
    expect(decide(msg({ quiet: true, text: "lane, dinner?" }), S({ notifKeywords: ["Lane"] })).show).toBe(true);
  });
  it("per-network modes", () => {
    const s = S({ notifNetworkMode: { signal: "mentions", whatsapp: "none" } });
    expect(decide(msg(), s).show).toBe(false);
    expect(decide(msg({ mentioned: true }), s).show).toBe(true);
    expect(decide(msg({ network: "whatsapp", mentioned: true }), s).show).toBe(false);
  });
  it("legacy muted networks still work", () => expect(decide(msg({ network: "signal" }), S({ notifMutedNetworks: ["signal"] })).show).toBe(false));
  it("per-chat overrides beat network and scope settings", () => {
    const s = S({ notifNetworkMode: { signal: "none" }, notifChat: { "!a": { mode: "all" } } });
    expect(decide(msg(), s).show).toBe(true);
    expect(decide(msg({ mentioned: true }), S({ notifChat: { "!a": { mode: "none" } } })).show).toBe(false);
    expect(decide(msg(), S({ notifChat: { "!a": { mode: "mentions" } } })).show).toBe(false);
  });
  it("scope: direct messages and mentions / pinned", () => {
    expect(decide(msg({ isGroup: true }), S({ notifScope: "dm_mentions" })).show).toBe(false);
    expect(decide(msg({ isGroup: true, mentioned: true }), S({ notifScope: "dm_mentions" })).show).toBe(true);
    expect(decide(msg({ pinned: true }), S({ notifScope: "favorites" })).show).toBe(true);
    expect(decide(msg(), S({ notifScope: "favorites" })).show).toBe(false);
  });
  it("quiet hours silence, days respected, break-through allowed", () => {
    const quiet = S({ quietHoursEnabled: true, quietStartMin: 22 * 60, quietEndMin: 7 * 60 });
    expect(decide(msg({ nowMin: 23 * 60 }), quiet)).toMatchObject({ show: true, silent: true });
    expect(decide(msg({ nowMin: 12 * 60 }), quiet).silent).toBe(false);
    expect(decide(msg({ nowMin: 23 * 60, day: 2 }), { ...quiet, notifQuietDays: [5, 6] }).silent).toBe(false);
    expect(decide(msg({ nowMin: 23 * 60, pinned: true }), { ...quiet, notifQuietBreakThrough: true }).silent).toBe(false);
  });
  it("per-chat sound off and preview overrides", () => {
    const s = S({ notifChat: { "!a": { sound: "off", preview: "hide" } } });
    expect(decide(msg(), s)).toMatchObject({ show: true, silent: true, preview: "hidden" });
  });
  it("do not disturb silences everything, but important things can break through if allowed", () => {
    const dnd = S({ dndUntil: 10_000 });
    expect(decide(msg({ nowMs: 5_000 }), dnd).show).toBe(false);
    expect(decide(msg({ nowMs: 20_000 }), dnd).show).toBe(true);
    expect(decide(msg({ nowMs: 5_000, mentioned: true }), { ...dnd, notifQuietBreakThrough: true }).show).toBe(true);
  });
  it("picks the sound: chat, then network, then the app's", () => {
    expect(decide(msg(), S()).sound).toBe("chime");
    expect(decide(msg(), S({ notifNetworkSound: { signal: "pop" } })).sound).toBe("pop");
    expect(decide(msg(), S({ notifNetworkSound: { signal: "pop" }, notifChat: { "!a": { soundId: "knock" } } })).sound).toBe("knock");
  });
});
