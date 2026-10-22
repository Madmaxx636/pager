/**
 * Whether you are really at the app: the window is in front and you have clicked, touched or typed in it since it came to the front.
 * A window that is only open behind another one doesn't count, so what arrives meanwhile stays unread and still raises a notification.
 */
let lastInput = 0, windowActive = true;
const IDLE_MS = 120_000;
/** Real use of the window within the last two minutes, while it is in front. Sitting open behind another window never counts. */
export const attended = (): boolean => windowActive && Date.now() - lastInput < IDLE_MS && document.hasFocus() && document.visibilityState === "visible";
const listeners = new Set<() => void>();
/** Runs when you come back to the app (a click or key press after being away). */
export const onAttended = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function installPresence() {
  const touch = () => {
    if (!document.hasFocus()) return;
    const was = attended(); lastInput = Date.now();
    if (!was && attended()) listeners.forEach((f) => f());
  };
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) window.addEventListener(ev, touch, { capture: true, passive: true });
  const away = () => { lastInput = 0; };
  window.pagerDesktop?.onWindowActive?.((on) => { windowActive = on; if (!on) away(); else window.dispatchEvent(new Event("pager:wake")); });
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") window.dispatchEvent(new Event("pager:wake")); });
  window.addEventListener("blur", away);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") away(); });
}
