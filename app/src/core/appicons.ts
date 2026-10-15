// The app icons you can pick. The pager drawing is the same; the background colours change. Android uses its own launcher icons with the same names and colours.
export interface AppIcon { id: string; name: string; from: string; to: string }
export const APP_ICONS: AppIcon[] = [
  { id: "classic", name: "Classic", from: "#6ff0dc", to: "#0f9d90" },
  { id: "sunset", name: "Sunset", from: "#ffb36b", to: "#e8408c" },
  { id: "midnight", name: "Midnight", from: "#4b5bd6", to: "#0b1030" },
  { id: "candy", name: "Candy", from: "#ff9ad5", to: "#8b5cf6" },
  { id: "mint", name: "Mint", from: "#c5f7d2", to: "#2fa36b" },
  { id: "retro", name: "Retro beige", from: "#e4dec9", to: "#8c8670" },
  { id: "graphite", name: "Graphite", from: "#58626f", to: "#0b0f14" },
  { id: "sky", name: "Sky", from: "#8fd8ff", to: "#2563eb" },
  { id: "lemon", name: "Lemon", from: "#fff0a6", to: "#f59e0b" },
  { id: "rose", name: "Rose", from: "#fda4af", to: "#be123c" },
];
export const appIconById = (id: string) => APP_ICONS.find((i) => i.id === id) ?? APP_ICONS[0];

/** The icon drawing with this icon's colours in place of the original teal. [base] is the original SVG text. */
export function iconSvg(base: string, icon: AppIcon): string {
  return base.replace(/#6ff0dc/gi, icon.from).replace(/#0f9d90/gi, icon.to);
}
