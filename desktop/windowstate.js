// Where the window opens: the size and place it had when it was last closed, but never somewhere you cannot reach it (a screen that was unplugged, or
// the -32000 position Windows reports for a minimised window).
const DEFAULT = { width: 1180, height: 760 };
const MIN = { width: 360, height: 500 };

/** [saved] is the remembered rectangle (or undefined); [workAreas] the usable rectangles of the screens now connected. */
function startBounds(saved, workAreas) {
  if (!saved || !Number.isFinite(saved.width) || !Number.isFinite(saved.height)) return { ...DEFAULT };
  const width = Math.min(Math.max(saved.width, MIN.width), 10000), height = Math.min(Math.max(saved.height, MIN.height), 10000);
  if (!Number.isFinite(saved.x) || !Number.isFinite(saved.y)) return { width, height };
  // At least a good part of the window, including its top edge, must be on some screen.
  const reachable = workAreas.some((a) =>
    Math.min(saved.x + width, a.x + a.width) - Math.max(saved.x, a.x) >= 120 &&
    Math.min(saved.y + height, a.y + a.height) - Math.max(saved.y, a.y) >= 80 &&
    saved.y >= a.y - 10 && saved.y < a.y + a.height - 40);
  return reachable ? { x: saved.x, y: saved.y, width, height } : { width, height };
}

module.exports = { startBounds, DEFAULT, MIN };
