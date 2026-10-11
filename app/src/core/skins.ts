/**
 * Looks for the desktop app, drawn fresh in the style of each family (no system artwork or logos). The default look is untouched: "default" turns all of this off.
 * Each look is a colour set plus a "family" that decides how buttons, fields and bubbles are built (see styles.css, "Skins").
 */
export type Family = "plastic" | "bevel" | "luna" | "glass" | "metro" | "fluent" | "aqua" | "mac" | "breeze" | "adwaita" | "flat";
export interface Skin { id: string; name: string; group: string; family: Family; dark: boolean; bg: string; panel: string; line: string; text: string; muted: string; accent: string; radius?: number; font?: string; accentInk?: string }

const S = (group: string, id: string, name: string, family: Family, dark: boolean, bg: string, panel: string, line: string, text: string, muted: string, accent: string, extra: Partial<Skin> = {}): Skin => ({ id, name, group, family, dark, bg, panel, line, text, muted, accent, ...extra });
const SEGOE = `"Segoe UI", "Segoe UI Variable", system-ui, sans-serif`, TAHOMA = `Tahoma, Verdana, "Noto Sans", sans-serif`, MAC = `-apple-system, "SF Pro Text", "Helvetica Neue", system-ui, sans-serif`;
const CANT = `Cantarell, "Noto Sans", system-ui, sans-serif`, NOTO = `"Noto Sans", "Segoe UI", system-ui, sans-serif`;

export const SKINS: Skin[] = [
  S("Pager", "plastic", "Pager plastic", "plastic", false, "#efece4", "#faf8f3", "#d9d3c4", "#2a2620", "#7a7366", "#d2692b", { radius: 20 }),
  S("Pager", "amber", "Pager amber", "plastic", true, "#1b1608", "#241d0b", "#44381a", "#ffcf5a", "#b08e35", "#ffb000", { radius: 16, font: `ui-monospace, "Courier New", monospace`, accentInk: "#1b1608" }),
  S("Windows", "win95", "Windows 95", "bevel", false, "#c0c0c0", "#c0c0c0", "#808080", "#000000", "#404040", "#000080", { radius: 0, font: `"MS Sans Serif", ${TAHOMA}` }),
  S("Windows", "win98", "Windows 98 / ME", "bevel", false, "#c0c0c0", "#c0c0c0", "#808080", "#000000", "#404040", "#0a246a", { radius: 0, font: `"MS Sans Serif", ${TAHOMA}` }),
  S("Windows", "winxp", "Windows XP", "luna", false, "#ece9d8", "#f6f4e8", "#aca899", "#000000", "#58584e", "#245edb", { radius: 8, font: TAHOMA }),
  S("Windows", "winvista", "Windows Vista", "glass", false, "#dfe9f5", "#eef3fa", "#a9bdd6", "#10233b", "#51647c", "#2a7fd4", { radius: 8, font: SEGOE }),
  S("Windows", "win7", "Windows 7", "glass", false, "#e8f0f9", "#f4f8fd", "#b3c8df", "#10233b", "#51647c", "#2f9be0", { radius: 8, font: SEGOE }),
  S("Windows", "win8", "Windows 8", "metro", false, "#ffffff", "#f2f2f2", "#d0d0d0", "#111111", "#666666", "#00a300", { radius: 0, font: SEGOE }),
  S("Windows", "win11", "Windows 10 / 11", "fluent", false, "#f3f3f3", "#fbfbfb", "#e5e5e5", "#1a1a1a", "#606060", "#0067c0", { radius: 10, font: SEGOE }),
  S("Windows", "win11d", "Windows 10 / 11 dark", "fluent", true, "#202020", "#2b2b2b", "#3a3a3a", "#ffffff", "#a0a0a0", "#60cdff", { radius: 10, font: SEGOE, accentInk: "#000000" }),
  S("Mac", "aqua", "OS X Aqua", "aqua", false, "#ececec", "#f2f2f2", "#a8a8a8", "#1c1c1c", "#666666", "#3d87e8", { radius: 8, font: `"Lucida Grande", ${MAC}` }),
  S("Mac", "yosemite", "OS X Yosemite to Catalina", "mac", false, "#f6f6f6", "#ffffff", "#e0e0e3", "#1d1d1f", "#86868b", "#0a84ff", { radius: 10, font: MAC }),
  S("Mac", "macos", "macOS Big Sur and later", "mac", false, "#f5f5f7", "#ffffff", "#e3e3e6", "#1d1d1f", "#86868b", "#007aff", { radius: 12, font: MAC }),
  S("Mac", "macosd", "macOS dark", "mac", true, "#1e1e1e", "#2a2a2c", "#3a3a3d", "#f5f5f7", "#98989d", "#0a84ff", { radius: 12, font: MAC }),
  S("KDE Plasma", "breeze", "Breeze", "breeze", false, "#eff0f1", "#fcfcfc", "#bcc0c3", "#232627", "#7f8c8d", "#3daee9", { radius: 5, font: NOTO }),
  S("KDE Plasma", "breezed", "Breeze Dark", "breeze", true, "#31363b", "#232629", "#4d5257", "#eff0f1", "#a1a9b1", "#3daee9", { radius: 5, font: NOTO, accentInk: "#0b1c27" }),
  S("KDE Plasma", "breezet", "Breeze Twilight", "breeze", true, "#2c3e50", "#1d2a38", "#455a6f", "#eff0f1", "#a1a9b1", "#3daee9", { radius: 5, font: NOTO, accentInk: "#0b1c27" }),
  S("KDE Plasma", "breezec", "Breeze Classic", "breeze", false, "#d6d2d0", "#f1efee", "#a6a09b", "#31363b", "#6f6a65", "#3daee9", { radius: 3, font: NOTO }),
  S("KDE Plasma", "breezehc", "Breeze High Contrast", "breeze", true, "#000000", "#0c0c0c", "#ffffff", "#ffffff", "#e0e0e0", "#ffd000", { radius: 3, font: NOTO, accentInk: "#000000" }),
  S("KDE Plasma", "oxygen", "Oxygen", "breeze", false, "#dedcda", "#f4f2f0", "#b0aaa4", "#2d2b2a", "#6f6a65", "#5b9bd6", { radius: 6, font: NOTO }),
  S("KDE Plasma", "oxygenc", "Oxygen Cold", "breeze", false, "#d9dce1", "#f2f4f7", "#a9b0ba", "#272a2e", "#69707a", "#4f86c6", { radius: 6, font: NOTO }),
  S("KDE Plasma", "honeycomb", "Honeycomb", "breeze", true, "#2d2d2d", "#232323", "#464646", "#ededed", "#a8a8a8", "#f5b800", { radius: 5, font: NOTO, accentInk: "#1a1400" }),
  S("KDE Plasma", "obsidian", "Obsidian Coast", "breeze", true, "#1f2a2e", "#172023", "#364549", "#e6eef0", "#93a6ab", "#2eb398", { radius: 5, font: NOTO, accentInk: "#06201a" }),
  S("KDE Plasma", "zion", "Zion", "breeze", true, "#1c1c1f", "#141416", "#38383d", "#f0f0f0", "#a0a0a8", "#4aa3ff", { radius: 4, font: NOTO, accentInk: "#06182b" }),
  S("KDE Plasma", "zionr", "Zion Reversed", "breeze", false, "#e8e8ec", "#fafafc", "#c2c2c9", "#1c1c1f", "#6a6a72", "#1f7ae0", { radius: 4, font: NOTO }),
  S("GNOME", "adwaita", "Adwaita", "adwaita", false, "#fafafa", "#ffffff", "#d5d0cc", "#2e3436", "#77767b", "#3584e4", { radius: 12, font: CANT }),
  S("GNOME", "adwaitad", "Adwaita dark", "adwaita", true, "#242424", "#303030", "#454545", "#ffffff", "#9a9996", "#78aeed", { radius: 12, font: CANT, accentInk: "#0b1b30" }),
  S("GNOME", "adwaitahc", "Adwaita high contrast", "adwaita", false, "#ffffff", "#ffffff", "#000000", "#000000", "#2a2a2a", "#0050b0", { radius: 8, font: CANT }),
  S("GNOME", "yaru", "Yaru (Ubuntu)", "adwaita", false, "#f6f5f4", "#ffffff", "#d6d1cc", "#2c2c2c", "#7a7570", "#e95420", { radius: 6, font: `Ubuntu, ${NOTO}` }),
  S("GNOME", "yarud", "Yaru dark", "adwaita", true, "#2b2b2b", "#333333", "#4a4a4a", "#f2f2f2", "#a8a49f", "#e95420", { radius: 6, font: `Ubuntu, ${NOTO}` }),
  S("GNOME", "pop", "Pop!_OS", "adwaita", true, "#2b2b2f", "#36363b", "#4a4a50", "#f2f2f2", "#a8a8b0", "#48b9c7", { radius: 8, font: NOTO, accentInk: "#06222a" }),
  S("GNOME", "elementary", "elementary OS", "adwaita", false, "#f5f5f5", "#ffffff", "#d4d4d4", "#333333", "#7e8087", "#3689e6", { radius: 10, font: `"Inter", ${NOTO}` }),
  S("Popular Linux palettes", "nord", "Nord", "flat", true, "#2e3440", "#3b4252", "#4c566a", "#eceff4", "#a3adbf", "#88c0d0", { radius: 8, accentInk: "#1b2430" }),
  S("Popular Linux palettes", "dracula", "Dracula", "flat", true, "#282a36", "#343746", "#44475a", "#f8f8f2", "#a2a6c4", "#bd93f9", { radius: 8, accentInk: "#1d1830" }),
  S("Popular Linux palettes", "gruvbox", "Gruvbox dark", "flat", true, "#282828", "#32302f", "#504945", "#ebdbb2", "#a89984", "#fabd2f", { radius: 6, accentInk: "#2a2000" }),
  S("Popular Linux palettes", "catppuccin", "Catppuccin Mocha", "flat", true, "#1e1e2e", "#313244", "#45475a", "#cdd6f4", "#a6adc8", "#cba6f7", { radius: 10, accentInk: "#1b1030" }),
  S("Popular Linux palettes", "latte", "Catppuccin Latte", "flat", false, "#eff1f5", "#ffffff", "#ccd0da", "#4c4f69", "#6c6f85", "#8839ef", { radius: 10 }),
];
export const skinById = (id: string) => SKINS.find((s) => s.id === id);
export const SKIN_GROUPS = [...new Set(SKINS.map((s) => s.group))];

/** Accent colours offered with a look: Adwaita's own nine, Plasma's accent colours, or both for everything else. */
export const GNOME_ACCENTS: [string, string][] = [["Blue", "#3584e4"], ["Teal", "#2190a4"], ["Green", "#3a944a"], ["Yellow", "#c88800"], ["Orange", "#ed5b00"], ["Red", "#e62d42"], ["Pink", "#d56199"], ["Purple", "#9141ac"], ["Slate", "#6f8396"]];
export const PLASMA_ACCENTS: [string, string][] = [["Breeze blue", "#3daee9"], ["Red", "#da4453"], ["Orange", "#f67400"], ["Yellow", "#fdbc4b"], ["Green", "#27ae60"], ["Teal", "#1abc9c"], ["Purple", "#9b59b6"], ["Pink", "#e93a9a"], ["Gray", "#7f8c8d"]];
export const accentsFor = (s: Skin) => (s.family === "adwaita" ? GNOME_ACCENTS : s.family === "breeze" ? PLASMA_ACCENTS : []);
