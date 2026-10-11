/** Alert sounds made with Web Audio, so there are no files to ship and they work the same on every system. */
export const SOUNDS: [string, string][] = [["swoosh", "Swoosh"], ["chime", "Chime"], ["pop", "Pop"], ["ding", "Ding"], ["knock", "Knock"], ["bubble", "Bubble"], ["soft", "Soft"], ["pager", "Pager (three beeps)"], ["beepbeep", "Beep beep"], ["trill", "Trill"], ["twotone", "Two tone"], ["sendblip", "Blip"], ["tick", "Tick"], ["none", "None"]];

type Note = { f: number; t: number; d: number; type?: OscillatorType; g?: number; slideTo?: number };
const RECIPES: Record<string, Note[]> = {
  swoosh: [{ f: 380, t: 0, d: 0.16, type: "sine", slideTo: 1100, g: 0.7 }],
  chime: [{ f: 880, t: 0, d: 0.18 }, { f: 1318.5, t: 0.12, d: 0.35 }],
  pop: [{ f: 520, t: 0, d: 0.09, type: "triangle", slideTo: 220, g: 0.9 }],
  ding: [{ f: 1568, t: 0, d: 0.6, g: 0.6 }],
  knock: [{ f: 160, t: 0, d: 0.07, type: "triangle", g: 1 }, { f: 150, t: 0.12, d: 0.08, type: "triangle", g: 1 }],
  bubble: [{ f: 400, t: 0, d: 0.16, slideTo: 900, g: 0.8 }],
  // The classic pager family: square-wave beeps like a little speaker.
  pager: [0, 0.16, 0.32].map((t) => ({ f: 2093, t, d: 0.09, type: "square" as OscillatorType, g: 0.45 })),
  beepbeep: [0, 0.2].map((t) => ({ f: 1760, t, d: 0.13, type: "square" as OscillatorType, g: 0.45 })),
  trill: [0, 1, 2, 3, 4, 5].map((i) => ({ f: i % 2 ? 2093 : 1568, t: i * 0.055, d: 0.05, type: "square" as OscillatorType, g: 0.4 })),
  twotone: [{ f: 1046.5, t: 0, d: 0.16, type: "triangle", g: 0.8 }, { f: 1568, t: 0.17, d: 0.26, type: "triangle", g: 0.8 }],
  sendblip: [{ f: 1200, t: 0, d: 0.07, type: "square", slideTo: 1900, g: 0.35 }],
  tick: [{ f: 2600, t: 0, d: 0.035, type: "square", g: 0.35 }, { f: 3300, t: 0.05, d: 0.035, type: "square", g: 0.3 }],
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
