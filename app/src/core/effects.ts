/** Full-screen message effects, triggered by what a message says. Purely local: nothing extra is sent. */
export type Effect = "confetti" | "hearts" | "balloons" | "snow" | "sparkles";

const has = (t: string, ...needles: string[]) => needles.some((n) => t.includes(n));

export function effectFor(text: string): Effect | undefined {
  const t = text.toLowerCase();
  if (has(t, "🎉", "🎊", "🥳", "congrats", "congratulations")) return "confetti";
  if (has(t, "🎈", "happy birthday", "🎂")) return "balloons";
  if (has(t, "❄️", "⛄", "☃️", "🌨", "let it snow")) return "snow";
  if (has(t, "✨", "🌟", "⭐", "🪄")) return "sparkles";
  // Hearts only when the message is mostly hearts, so "I ❤️ pizza" in a long text doesn't fire.
  const stripped = text.replace(/\s/g, "");
  if (stripped.length > 0 && stripped.length <= 12 && /^(?:❤️|💕|💖|💗|💘|😍|🥰|😘|♥️|💞|❤)+$/u.test(stripped)) return "hearts";
  if (has(t, "i love you", "love you")) return "hearts";
  return undefined;
}

export type Particle = { x: number; y: number; vx: number; vy: number; size: number; rot: number; vr: number; color: string; glyph?: string; life: number; wobble: number };

const COLORS = ["#ff5d73", "#ffb703", "#2dd4bf", "#60a5fa", "#c084fc", "#34d399", "#f472b6"];
const rnd = (a: number, b: number) => a + Math.random() * (b - a);

/** Initial particles for an effect on a w×h canvas. */
export function spawn(effect: Effect, w: number, h: number): Particle[] {
  const n = effect === "snow" ? 90 : effect === "confetti" ? 140 : 40;
  return Array.from({ length: n }, (_, i): Particle => {
    const color = COLORS[i % COLORS.length];
    switch (effect) {
      case "confetti": return { x: rnd(0, w), y: rnd(-h * 0.4, 0), vx: rnd(-1.5, 1.5), vy: rnd(2, 5), size: rnd(6, 11), rot: rnd(0, 6.28), vr: rnd(-0.2, 0.2), color, life: 1, wobble: rnd(0, 6.28) };
      case "hearts": return { x: rnd(0, w), y: h + rnd(0, h * 0.5), vx: rnd(-0.5, 0.5), vy: rnd(-4.5, -2), size: rnd(18, 34), rot: 0, vr: 0, color, glyph: ["❤️", "💕", "💖", "💗"][i % 4], life: 1, wobble: rnd(0, 6.28) };
      case "balloons": return { x: rnd(0, w), y: h + rnd(0, h * 0.6), vx: rnd(-0.3, 0.3), vy: rnd(-3.2, -1.6), size: rnd(28, 44), rot: 0, vr: 0, color, glyph: "🎈", life: 1, wobble: rnd(0, 6.28) };
      case "snow": return { x: rnd(0, w), y: rnd(-h, 0), vx: rnd(-0.6, 0.6), vy: rnd(1, 2.8), size: rnd(2, 5), rot: 0, vr: 0, color: "#ffffff", life: 1, wobble: rnd(0, 6.28) };
      case "sparkles": return { x: rnd(0, w), y: rnd(0, h), vx: 0, vy: rnd(-0.3, 0.3), size: rnd(10, 22), rot: 0, vr: 0, color, glyph: "✨", life: rnd(0.2, 1), wobble: rnd(0, 6.28) };
    }
  });
}

/** Advances particles one frame; returns whether anything is still visible. */
export function step(ps: Particle[], effect: Effect, w: number, h: number): boolean {
  let alive = false;
  for (const p of ps) {
    p.wobble += 0.06;
    p.x += p.vx + Math.sin(p.wobble) * (effect === "snow" ? 0.5 : effect === "confetti" ? 0.9 : 0.6);
    p.y += p.vy;
    p.rot += p.vr;
    if (effect === "sparkles") { p.life -= 0.012; if (p.life > 0) alive = true; continue; }
    if (effect === "hearts" || effect === "balloons") { if (p.y > -60) alive = true; }
    else if (p.y < h + 20) alive = true;
  }
  return alive;
}
