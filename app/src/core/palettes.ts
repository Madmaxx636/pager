/** Ready-made looks for the whole app: backgrounds, panels, lines and text together, with a matching accent. Android has the same list. */
export interface Palette { id: string; name: string; dark: boolean; bg: string; panel: string; panel2: string; line: string; theirs: string; text: string; muted: string; accent: string }
export const PALETTES: Palette[] = [
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
export const paletteById = (id: string) => PALETTES.find((p) => p.id === id);

/** Fonts that need nothing downloaded: each is a stack of what the system already has. */
export const FONTS: [string, string, string][] = [
  ["system", "System", ""],
  ["serif", "Serif", `Georgia, "Iowan Old Style", "Palatino Linotype", "Noto Serif", serif`],
  ["rounded", "Rounded", `ui-rounded, "SF Pro Rounded", "Nunito", "Varela Round", "Segoe UI", system-ui, sans-serif`],
  ["humanist", "Humanist", `"Gill Sans", "Trebuchet MS", "Noto Sans", Candara, sans-serif`],
  ["mono", "Monospace", `ui-monospace, "SF Mono", "JetBrains Mono", "DejaVu Sans Mono", Consolas, monospace`],
  ["readable", "Easy to read", `Verdana, "Atkinson Hyperlegible", "DejaVu Sans", Tahoma, sans-serif`],
];
