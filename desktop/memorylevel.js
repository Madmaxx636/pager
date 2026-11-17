// How tight the app's memory is, as the shell tells the page. "hidden" means the window is really away (in the tray, or minimised), not just behind another window:
// on Wayland (KDE, GNOME) the compositor does not say when a window is covered, so Electron's own "is it visible" answer cannot be trusted, and a window in plain
// use was being called hidden every 20 seconds, which cut the open page down to 20 messages each time.
// An idle Electron app already holds about 300 MB (the main process, the graphics process and the page), so the old limits of 300 and 400 MB were crossed all the
// time on Windows: the app flipped between "ok" and "high" every minute or so, and each flip cut every other page back to 40 messages. The limits now sit well above that,
// and a level is only left when memory is clearly below it (a margin), so a number hovering around a limit does not flip it back and forth.
const HIGH = 700, CRITICAL = 1000, MARGIN = 80;
/** [hidden]: the window was hidden or minimised by an event we saw. [total]: MB the app's processes hold. [previous]: the level it had last time. */
function memoryLevel({ hidden, total, previous }) {
  if (hidden) return "hidden";
  if (total > CRITICAL || (previous === "critical" && total > CRITICAL - MARGIN)) return "critical";
  if (total > HIGH || (previous === "high" && total > HIGH - MARGIN) || (previous === "critical" && total > HIGH - MARGIN)) return "high";
  return "ok";
}
module.exports = { memoryLevel };
