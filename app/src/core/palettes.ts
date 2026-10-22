/** Ready-made looks for the whole app: backgrounds, panels, lines and text together, with a matching accent. Android has the same list. */
export interface Palette { id: string; name: string; /** Which row it sits in on the picker. */ group?: "classic" | "white" | "black" | "solid"; dark: boolean; bg: string; panel: string; panel2: string; line: string; theirs: string; text: string; muted: string; accent: string }
const CLASSIC: Palette[] = [
  { id: "paper", name: "Paper", dark: false, bg: "#f4efe6", panel: "#fbf8f2", panel2: "#ebe4d6", line: "#dcd3c1", theirs: "#fbf8f2", text: "#2b2620", muted: "#7a6f5f", accent: "#b45309" },
  { id: "ocean", name: "Ocean", dark: false, bg: "#e8f2f7", panel: "#ffffff", panel2: "#d6e8f0", line: "#c3dbe7", theirs: "#ffffff", text: "#0f2a38", muted: "#55758a", accent: "#0a7ea4" },
  { id: "rose", name: "Rose", dark: false, bg: "#fbeff2", panel: "#fff8fa", panel2: "#f5dde3", line: "#ebc9d2", theirs: "#fff8fa", text: "#3a1d26", muted: "#8a5d6b", accent: "#d6336c" },
  { id: "midnight", name: "Midnight", dark: true, bg: "#0a1020", panel: "#101830", panel2: "#18223f", line: "#202c4d", theirs: "#131c36", text: "#e6ebf7", muted: "#8a96b5", accent: "#7aa2ff" },
  { id: "forest", name: "Forest", dark: true, bg: "#0c1410", panel: "#121d17", panel2: "#1a2a21", line: "#223629", theirs: "#15221b", text: "#e3efe7", muted: "#86a091", accent: "#5ad28a" },
  { id: "sunset", name: "Sunset", dark: true, bg: "#1a0f14", panel: "#241419", panel2: "#321c23", line: "#3d232b", theirs: "#2a171d", text: "#f6e9e6", muted: "#b89aa0", accent: "#ff8a5c" },
  { id: "slate", name: "Slate", dark: true, bg: "#14171c", panel: "#1b1f26", panel2: "#252a33", line: "#2f3540", theirs: "#20252d", text: "#e4e7ec", muted: "#8f98a6", accent: "#9db4d3" },
  { id: "terminal", name: "Terminal", dark: true, bg: "#000000", panel: "#031003", panel2: "#0a1f0a", line: "#0f3a0f", theirs: "#031003", text: "#6dff6d", muted: "#3fae3f", accent: "#39ff14" },
  { id: "pager", name: "Pager (amber)", dark: true, bg: "#1b1608", panel: "#241d0b", panel2: "#332a10", line: "#44381a", theirs: "#2a2210", text: "#ffcf5a", muted: "#b08e35", accent: "#ffb000" },
];
// The colour families: every one comes with white, with black, and as a solid colour. Hue in degrees; Grey has no colour at all.
export const HUES: [string, number, number][] = [
  ["Red", 0, 1], ["Orange", 24, 1], ["Amber", 40, 1], ["Yellow", 50, 1], ["Lime", 84, 1], ["Green", 130, 1], ["Emerald", 155, 1], ["Teal", 175, 1], ["Cyan", 190, 1],
  ["Sky", 205, 1], ["Blue", 220, 1], ["Indigo", 240, 1], ["Violet", 262, 1], ["Purple", 282, 1], ["Fuchsia", 300, 1], ["Pink", 330, 1], ["Rose", 348, 1], ["Grey", 215, 0],
];
function hex(h: number, s: number, l: number) {
  s /= 100; l /= 100;
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
function family([name, h, k]: [string, number, number]): Palette[] {
  const id = name.toLowerCase();
  return [
    // White with the colour: white panels, the colour in the lines, the accent and a faint wash.
    { id: `${id}-white`, name: `${name} on white`, group: "white", dark: false, bg: hex(h, 40 * k, 97), panel: "#ffffff", panel2: hex(h, 40 * k, 93), line: hex(h, 30 * k, 86), theirs: hex(h, 40 * k, 94), text: hex(h, 30 * k, 12), muted: hex(h, 12 * k, 42), accent: hex(h, 75 * k, 42) },
    // Black with the colour: black background, panels that lean a little to the colour, a bright accent.
    { id: `${id}-black`, name: `${name} on black`, group: "black", dark: true, bg: "#000000", panel: hex(h, 30 * k, 7), panel2: hex(h, 30 * k, 12), line: hex(h, 25 * k, 19), theirs: hex(h, 30 * k, 11), text: hex(h, 20 * k, 94), muted: hex(h, 12 * k, 62), accent: hex(h, 90 * k, 64) },
    // Solid: the whole app is the colour, with white text and a pale accent.
    { id: `${id}-solid`, name: `${name} solid`, group: "solid", dark: true, bg: hex(h, 55 * k, 28), panel: hex(h, 55 * k, 23), panel2: hex(h, 55 * k, 18), line: hex(h, 45 * k, 38), theirs: hex(h, 55 * k, 21), text: "#ffffff", muted: hex(h, 30 * k, 82), accent: hex(h, 100 * k, 85) },
  ];
}
export const PALETTES: Palette[] = [...CLASSIC.map((p) => ({ ...p, group: "classic" as const })), ...HUES.flatMap(family)];
export const PALETTE_GROUPS: [Palette["group"] & string, string][] = [["classic", "Classic"], ["white", "With white"], ["black", "With black"], ["solid", "Solid colours"]];
export const paletteById = (id: string) => PALETTES.find((p) => p.id === id);

/** Fonts that need nothing downloaded: each is a stack of what the system already has. */
export const FONTS: [string, string, string][] = [
  ["system", "System", ""],
  ["serif", "Serif", `Georgia, "Iowan Old Style", "Palatino Linotype", "Noto Serif", serif`],
  ["rounded", "Rounded", `ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif`],
  ["humanist", "Humanist", `"Gill Sans", "Trebuchet MS", "Noto Sans", Candara, sans-serif`],
  ["mono", "Monospace", `ui-monospace, "SF Mono", "JetBrains Mono", "DejaVu Sans Mono", Consolas, monospace`],
  ["sf", "iPhone style", `-apple-system, "SF Pro Text", "Helvetica Neue", system-ui, "Segoe UI", sans-serif`],
  ["googlesans", "Google style", `"Google Sans", "Product Sans", "Google Sans Text", Roboto, "Segoe UI", system-ui, sans-serif`],
  ["roboto", "Roboto", `Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif`],
  ["readable", "Easy to read", `Verdana, "Atkinson Hyperlegible", "DejaVu Sans", Tahoma, sans-serif`],
];
