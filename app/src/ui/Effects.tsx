import { useEffect, useRef } from "react";
import { Effect, Particle, effectFor, spawn, step } from "../core/effects";
import { Msg } from "../core/types";
import { useSettings } from "../core/settings";

/** Plays a full-screen effect when a fresh message (sent or received) calls for one. */
export function Effects({ messages }: { messages: Msg[] }) {
  const st = useSettings();
  const canvas = useRef<HTMLCanvasElement>(null);
  const seen = useRef<string | undefined>(undefined);
  const raf = useRef(0);
  const last = messages[messages.length - 1];

  useEffect(() => {
    if (!last) return;
    const first = seen.current === undefined;
    const changed = seen.current !== last.id;
    seen.current = last.id;
    // Local echoes get a new id when the server confirms; only fire for brand-new messages.
    if (first || !changed || !st.screenEffects || st.reduceMotion) return;
    if (Date.now() - last.ts > 6000 || last.type !== "m.text") return;
    const effect = effectFor(last.body);
    if (effect) play(effect);
  }, [last?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function play(effect: Effect) {
    const c = canvas.current; if (!c) return;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    c.width = w * dpr; c.height = h * dpr;
    const ctx = c.getContext("2d")!; ctx.scale(dpr, dpr);
    const ps: Particle[] = spawn(effect, w, h);
    cancelAnimationFrame(raf.current);
    const t0 = performance.now();
    const frame = (now: number) => {
      ctx.clearRect(0, 0, w, h);
      const alive = step(ps, effect, w, h);
      for (const p of ps) {
        if (effect === "sparkles" && p.life <= 0) continue;
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
        if (effect === "sparkles") ctx.globalAlpha = Math.max(0, Math.sin(p.life * Math.PI));
        if (p.glyph) { ctx.font = `${p.size}px sans-serif`; ctx.textAlign = "center"; ctx.fillText(p.glyph, 0, 0); }
        else if (effect === "snow") { ctx.fillStyle = p.color; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(0, 0, p.size, 0, 6.28); ctx.fill(); }
        else { ctx.fillStyle = p.color; ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); }
        ctx.restore();
      }
      if (alive && now - t0 < 6500) raf.current = requestAnimationFrame(frame); else ctx.clearRect(0, 0, w, h);
    };
    raf.current = requestAnimationFrame(frame);
  }
  useEffect(() => () => cancelAnimationFrame(raf.current), []);

  return <canvas ref={canvas} className="effects-canvas" aria-hidden />;
}
