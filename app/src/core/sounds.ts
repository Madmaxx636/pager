/** Alert sounds made with Web Audio, so there are no files to ship and they work the same on every system. */
export const SOUNDS: [string, string][] = [["swoosh", "Swoosh"], ["chime", "Chime"], ["pop", "Pop"], ["ding", "Ding"], ["knock", "Knock"], ["bubble", "Bubble"], ["soft", "Soft"], ["none", "None"]];

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; slideTo?: number };
const RECIPES: Record<string, Note[]> = {
  swoosh: [{ f: 380, t: 0, d: 0.16, type: "sine", slideTo: 1100, g: 0.7 }],
  chime: [{ f: 880, t: 0, d: 0.18 }, { f: 1318.5, t: 0.12, d: 0.35 }],
  pop: [{ f: 520, t: 0, d: 0.09, type: "triangle", slideTo: 220, g: 0.9 }],
  ding: [{ f: 1568, t: 0, d: 0.6, g: 0.6 }],
  knock: [{ f: 160, t: 0, d: 0.07, type: "triangle", g: 1 }, { f: 150, t: 0.12, d: 0.08, type: "triangle", g: 1 }],
  bubble: [{ f: 400, t: 0, d: 0.16, slideTo: 900, g: 0.8 }],
  soft: [{ f: 660, t: 0, d: 0.3, type: "sine", g: 0.5 }, { f: 784, t: 0.09, d: 0.34, type: "sine", g: 0.4 }],
};

let ctx: AudioContext | undefined;
export function playSound(id: string, volume = 0.7) {
  const notes = RECIPES[id];
  if (!notes || volume <= 0 || typeof AudioContext === "undefined") return;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === "suspended") void ctx.resume();
    const now = ctx.currentTime;
    for (const n of notes) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = n.type ?? "sine";
      o.frequency.setValueAtTime(n.f, now + n.t);
      if (n.slideTo) o.frequency.exponentialRampToValueAtTime(n.slideTo, now + n.t + n.d);
      const peak = Math.max(0.0001, (n.g ?? 0.7) * volume * 0.5);
      g.gain.setValueAtTime(0.0001, now + n.t);
      g.gain.exponentialRampToValueAtTime(peak, now + n.t + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, now + n.t + n.d);
      o.connect(g).connect(ctx.destination);
      o.start(now + n.t); o.stop(now + n.t + n.d + 0.05);
    }
  } catch { /* audio may be blocked until you interact with the page */ }
}
