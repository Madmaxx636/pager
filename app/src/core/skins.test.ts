import { describe, expect, it } from "vitest";
import { GNOME_ACCENTS, PLASMA_ACCENTS, SKINS, SKIN_GROUPS, accentsFor, skinById } from "./skins";
import { isBotUser, realPeople } from "./types";

const hex = /^#[0-9a-f]{6}$/i;
describe("desktop looks", () => {
  it("every look has a unique id and real colours", () => {
    expect(new Set(SKINS.map((s) => s.id)).size).toBe(SKINS.length);
    for (const s of SKINS) for (const c of [s.bg, s.panel, s.line, s.text, s.muted, s.accent]) expect(c).toMatch(hex);
    expect(skinById("pager" as string)).toBeUndefined();
    expect(skinById("amber")?.dark).toBe(true);
  });
  it("covers Windows, Mac, KDE and GNOME", () => {
    for (const g of ["Windows", "Mac", "KDE Plasma", "GNOME"]) expect(SKIN_GROUPS).toContain(g);
    for (const id of ["win95", "winxp", "winvista", "win7", "win8", "win11", "aqua", "macos", "breeze", "breezed", "adwaita", "adwaitad"]) expect(skinById(id)).toBeDefined();
  });
  it("offers GNOME's nine accents with GNOME looks and Plasma's with KDE looks", () => {
    expect(GNOME_ACCENTS).toHaveLength(9); expect(PLASMA_ACCENTS).toHaveLength(9);
    expect(accentsFor(skinById("adwaita")!)).toBe(GNOME_ACCENTS); expect(accentsFor(skinById("breeze")!)).toBe(PLASMA_ACCENTS); expect(accentsFor(skinById("win95")!)).toEqual([]);
  });
});

describe("the people in a group", () => {
  it("leaves out bots and bridge accounts with no name", () => {
    const list = { "@me:x": "Me", "@signalbot:x": "Signal bridge bot", "@whatsappbot:x": "WhatsApp bot", "@signal_8f2c9a:x": "signal_8f2c9a", "@signal_11aa22:x": "Maya Chen", "@bob:x": "Bob" };
    expect(realPeople(list).map(([, n]) => n)).toEqual(["Bob", "Maya Chen", "Me"]);
    expect(isBotUser("@signalbot:x")).toBe(true); expect(isBotUser("@bobby:x")).toBe(false);
  });
});
