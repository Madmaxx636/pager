/** The text on the unread badge: "7", and "99+" for anything larger. */
export const badgeLabel = (n: number) => (n > 99 ? "99+" : String(Math.max(0, Math.floor(n))));

/** A small red picture with the unread number on it, for Windows to draw over the taskbar icon (Windows has no badge count of its own). */
export function badgePng(n: number): string | undefined {
  if (n <= 0 || typeof document === "undefined") return undefined;
  try {
    const size = 32, c = document.createElement("canvas"); c.width = c.height = size;
    const g = c.getContext("2d"); if (!g) return undefined;
    g.fillStyle = "#e5484d"; g.beginPath(); g.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); g.fill();
    const label = badgeLabel(n);
    g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `bold ${label.length > 2 ? 14 : label.length > 1 ? 18 : 22}px sans-serif`;
    g.fillText(label, size / 2, size / 2 + 1);
    return c.toDataURL("image/png");
  } catch { return undefined; }
}
