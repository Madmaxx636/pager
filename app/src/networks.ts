export interface NetworkMeta { label: string; color: string; glyph: string }

export const NETWORKS: Record<string, NetworkMeta> = {
  whatsapp: { label: "WhatsApp", color: "#25d366", glyph: "W" },
  signal: { label: "Signal", color: "#3a76f0", glyph: "S" },
  discord: { label: "Discord", color: "#5865f2", glyph: "D" },
  telegram: { label: "Telegram", color: "#2aabee", glyph: "T" },
  instagram: { label: "Instagram", color: "#e1306c", glyph: "I" },
  messenger: { label: "Messenger", color: "#0a7cff", glyph: "M" },
  gmessages: { label: "Messages", color: "#1a73e8", glyph: "G" },
  matrix: { label: "Matrix", color: "#8a94a6", glyph: "#" },
};

export const networkMeta = (id: string): NetworkMeta =>
  NETWORKS[id] ?? { label: id, color: "#8a94a6", glyph: id.slice(0, 1).toUpperCase() };
