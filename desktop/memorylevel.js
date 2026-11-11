// How tight the app's memory is, as the shell tells the page. "hidden" means the window is really away (in the tray, or minimised), not just behind another window:
// on Wayland (KDE, GNOME) the compositor does not say when a window is covered, so Electron's own "is it visible" answer cannot be trusted, and a window in plain
// use was being called hidden every 20 seconds, which cut the open page down to 20 messages each time.
/** [hidden]: the window was hidden or minimised by an event we saw. [total]: MB the app's processes hold. */
function memoryLevel({ hidden, total }) {
  return hidden ? "hidden" : total > 400 ? "critical" : total > 300 ? "high" : "ok";
}
module.exports = { memoryLevel };
