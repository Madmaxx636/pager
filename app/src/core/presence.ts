/**
 * Whether you are really at the app: the window is in front and you have clicked, touched or typed in it since it came to the front.
 * A window that is only open behind another one doesn't count, so what arrives meanwhile stays unread and still raises a notification.
 */
let touched = false;
export const attended = (): boolean => touched && document.hasFocus() && document.visibilityState === "visible";
const listeners = new Set<() => void>();
/** Runs when you come back to the app (a click or key press after being away). */
export const onAttended = (f: () => void) => { listeners.add(f); return () => { listeners.delete(f); }; };

export function installPresence() {
  const touch = () => { if (touched || !document.hasFocus()) return; touched = true; listeners.forEach((f) => f()); };
  for (const ev of ["pointerdown", "keydown", "touchstart", "wheel"]) window.addEventListener(ev, touch, { capture: true, passive: true });
  const away = () => { touched = false; };
  window.addEventListener("blur", away);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState !== "visible") away(); });
}
