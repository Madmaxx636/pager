import { useSyncExternalStore } from "react";

/**
 * Getting someone's attention: a nudge, a ring or a full-screen picture. It is an ordinary message with an extra field that Pager apps
 * act on; every other app (and every other network) simply shows its words. It is a loud alert, not a voice or video call.
 */
export type AttentionKind = "nudge" | "ring" | "video" | "image";
export const ATTENTION_FIELD = "app.pager.attention";
export const ATTENTION_KINDS: { kind: AttentionKind; label: string; hint: string }[] = [
  { kind: "nudge", label: "Nudge", hint: "A loud alert that shakes their screen" },
  { kind: "ring", label: "Ring", hint: "Rings like a phone call until they answer" },
  { kind: "video", label: "Video ring", hint: "Rings like a video call; opens the chat when answered" },
  { kind: "image", label: "Full-screen picture", hint: "Fills their screen with a picture you pick" },
];
const isKind = (x: unknown): x is AttentionKind => x === "nudge" || x === "ring" || x === "video" || x === "image";
export const attentionKindOf = (content: unknown): AttentionKind | undefined => {
  const k = content && typeof content === "object" ? (content as Record<string, unknown>)[ATTENTION_FIELD] : undefined;
  const kind = k && typeof k === "object" ? (k as Record<string, unknown>).kind : undefined;
  return isKind(kind) ? kind : undefined;
};
/** The words other apps show instead. */
export const attentionText = (kind: AttentionKind): string =>
  kind === "nudge" ? "👋 Nudge! Someone wants your attention" : kind === "ring" ? "📞 Ringing you on Pager" : kind === "video" ? "🎥 Video-ringing you on Pager" : "🔔 Look at this!";
/** Only fresh ones ring: an old nudge that arrives with a backlog must not wake the screen. */
export const isFresh = (ts: number, now = Date.now()) => now - ts < 90_000 && ts - now < 60_000;

export interface Alert { id: string; roomId: string; chat: string; sender: string; kind: AttentionKind; mxc?: string; caption?: string }
let current: Alert | undefined;
const subs = new Set<() => void>();
const emit = () => subs.forEach((f) => f());
const seen = new Set<string>();
export const useAlert = () => useSyncExternalStore((f) => { subs.add(f); return () => { subs.delete(f); }; }, () => current);

let timer: number | undefined;
export function raise(a: Alert) {
  if (seen.has(a.id)) return; seen.add(a.id);
  current = a; emit(); ringNow(a.kind);
  window.clearInterval(timer);
  timer = window.setInterval(() => ringNow(a.kind), a.kind === "nudge" || a.kind === "image" ? 1800 : 2600);
  window.setTimeout(() => { if (current?.id === a.id) dismiss(); }, a.kind === "nudge" || a.kind === "image" ? 12_000 : 45_000); // a call that nobody answers stops by itself
}
export function dismiss() { window.clearInterval(timer); current = undefined; emit(); }

let ctx: AudioContext | undefined;
/** A phone-like double burst (ring) or a sharp three-note alert (nudge, picture). Deliberately louder than a normal message sound. */
function ringNow(kind: AttentionKind) {
  if (typeof AudioContext === "undefined") return;
  try {
    ctx ??= new AudioContext(); if (ctx.state === "suspended") void ctx.resume();
    const t0 = ctx.currentTime;
    const tones: [number, number, number][] = kind === "ring" || kind === "video"
      ? [[440, 0, 0.4], [480, 0, 0.4], [440, 0.5, 0.4], [480, 0.5, 0.4]]
      : [[988, 0, 0.14], [1319, 0.17, 0.14], [988, 0.34, 0.14], [1319, 0.51, 0.3]];
    for (const [f, t, d] of tones) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = kind === "ring" || kind === "video" ? "sine" : "square";
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t0 + t); g.gain.exponentialRampToValueAtTime(0.35, t0 + t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + t + d);
      o.connect(g).connect(ctx.destination); o.start(t0 + t); o.stop(t0 + t + d + 0.05);
    }
    navigator.vibrate?.(kind === "ring" || kind === "video" ? [400, 200, 400] : [120, 80, 120, 80, 240]);
  } catch { /* sound may be blocked until the page is used */ }
}
