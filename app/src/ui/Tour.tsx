import { useEffect, useRef, useState } from "react";
import { matrixCall } from "../core/api";
import { useEncryption, useStore, me } from "../core/store";
import { useSettings } from "../core/settings";
import { TOUR_TYPE, tourSteps, typedLength } from "../core/tour";
import { Mascot } from "./Mascot";

const localKey = (user: string) => `pager.tour.${user}`;
const seenHere = (user: string) => { try { return localStorage.getItem(localKey(user)) === "1"; } catch { return false; } };
const markHere = (user: string) => { try { localStorage.setItem(localKey(user), "1"); } catch { /* it shows again next time */ } };

/** Has this account been through the tour on some device? Asks the server, so a second device doesn't repeat it. */
async function doneOnServer(user: string): Promise<boolean> {
  try { await matrixCall("GET", `/_matrix/client/v3/user/${encodeURIComponent(user)}/account_data/${TOUR_TYPE}`); return true; }
  catch (e) { return !/404|M_NOT_FOUND|Not found/i.test(String((e as Error).message)); /* unreachable: stay quiet rather than nag */ }
}

/** The mascot's first-start tour: comic speech bubbles above its head. Shown once per account. */
export function Tour({ nav, forceOpen, onClose }: { nav: (to: string) => void; forceOpen?: boolean; onClose?: () => void }) {
  const session = useStore((s) => s.session);
  const isAdmin = useStore((s) => s.isAdmin);
  const synced = useStore((s) => s.synced);
  const enc = useEncryption();
  const st = useSettings();
  const [open, setOpen] = useState(false);
  const [i, setI] = useState(0);
  const [ms, setMs] = useState(0);
  const user = session?.userId ?? "";

  // Decide once the first sync is in, and the key screen (if any) has been dealt with.
  useEffect(() => {
    if (forceOpen) { setOpen(true); setI(0); return; }
    if (!user || !synced || open) return;
    if (enc.ready && !enc.backupHere && !(() => { try { return localStorage.getItem(`pager.keysetup.${user}.${enc.deviceId}`) === "1"; } catch { return true; } })()) return;
    if (seenHere(user)) return;
    let live = true;
    void doneOnServer(user).then((done) => { if (!live) return; if (done) markHere(user); else { setOpen(true); setI(0); } });
    return () => { live = false; };
  }, [user, synced, enc.ready, enc.backupHere, enc.deviceId, forceOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  const steps = tourSteps({ admin: isAdmin, hasKey: enc.backupHere, server: session?.baseUrl || window.location.origin });
  const step = steps[Math.min(i, steps.length - 1)];

  // Type the words out, one letter at a time (all at once when motion is reduced).
  useEffect(() => {
    setMs(0);
    if (!open) return;
    if (st.reduceMotion || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setMs(1e9); return; }
    const t0 = performance.now(); const id = window.setInterval(() => setMs(performance.now() - t0), 30);
    return () => window.clearInterval(id);
  }, [open, step?.id, st.reduceMotion]);

  const finish = (go?: string) => {
    setOpen(false);
    if (user && !forceOpen) { markHere(user); void matrixCall("PUT", `/_matrix/client/v3/user/${encodeURIComponent(me())}/account_data/${TOUR_TYPE}`, { done: true, at: Date.now() }).catch(() => {}); }
    onClose?.();
    if (go) nav(go);
  };
  const next = () => (i >= steps.length - 1 ? finish() : setI(i + 1));
  const back = () => setI(Math.max(0, i - 1));
  const shown = step.text.slice(0, typedLength(step.text, ms));
  const typing = shown.length < step.text.length;

  const primary = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (open) primary.current?.focus(); }, [open, step?.id]);
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); finish(); }
      else if (e.key === "ArrowRight") { e.preventDefault(); typing ? setMs(1e9) : next(); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); back(); }
    };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  });

  if (!open) return null;
  const last = i >= steps.length - 1;
  return (
    <div className="tour-scrim" role="dialog" aria-modal="true" aria-label="Welcome tour">
      <div className="tour-stage">
        <div className="tour-bubble" key={step.id} onClick={() => typing && setMs(1e9)}>
          <p aria-live="polite" aria-label={step.text}>{shown}{typing && <span className="tour-caret" aria-hidden />}</p>
          <div className="tour-actions">
            {step.action && !typing && <button className="tour-btn alt" onClick={() => finish(step.action!.go)}>{step.action.label}</button>}
            <button ref={primary} className="tour-btn" onClick={() => (typing ? setMs(1e9) : next())}>{typing ? "Skip" : last ? "Let's go!" : "Next"}</button>
          </div>
        </div>
        <Mascot size={150} mood={step.mood} className="tour-mascot" />
        <div className="tour-dots" aria-hidden>{steps.map((s, n) => <span key={s.id} className={n === i ? "on" : n < i ? "past" : ""} />)}</div>
        <div className="tour-nav">{i > 0 && <button className="link" onClick={back}>Back</button>}<button className="link" onClick={() => finish()}>Skip tour</button></div>
      </div>
    </div>
  );
}
