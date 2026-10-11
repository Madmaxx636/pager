import { http, url } from "./api";
import { useSyncExternalStore } from "react";

/**
 * Voice messages as text, made on your own server (it runs the speech recognition; nothing goes anywhere else). The words are kept on this device
 * so a message is only sent once. Only available when the server has transcription switched on.
 */
const KEY = "pager.transcripts", MAX = 300;
let canUse: boolean | undefined;
let book: Record<string, string> = (() => { try { return JSON.parse(localStorage.getItem(KEY) ?? "{}"); } catch { return {}; } })();
const busy = new Set<string>();
const failed = new Set<string>();
const subs = new Set<() => void>();
let version = 0;
const bump = () => { version++; subs.forEach((s) => s()); };

export async function transcriptionAvailable(): Promise<boolean> {
  if (canUse !== undefined) return canUse;
  try { const r = await fetch(url("/api/config")); canUse = !!(await r.json()).transcribe; } catch { return false; }
  return canUse;
}

export const textOf = (id: string): string | undefined => book[id];
export const state = (id: string): "text" | "busy" | "failed" | "idle" => (book[id] !== undefined ? "text" : busy.has(id) ? "busy" : failed.has(id) ? "failed" : "idle");
export function useTranscript(id: string) { useSyncExternalStore((cb) => { subs.add(cb); return () => { subs.delete(cb); }; }, () => version); return { text: textOf(id), state: state(id) }; }

/** Sends the opened recording ([mediaUrl] is the picture-style blob address the app already holds) to the server and keeps the words. */
export async function transcribe(id: string, mediaUrl: string): Promise<void> {
  if (busy.has(id) || book[id] !== undefined) return;
  busy.add(id); failed.delete(id); bump();
  try {
    const blob = await (await fetch(mediaUrl)).blob();
    const r = await fetch(url("/api/transcribe"), { method: "POST", headers: { authorization: `Bearer ${http.token}`, "content-type": blob.type || "application/octet-stream" }, body: blob });
    if (!r.ok) throw new Error(String(r.status));
    const text = String((await r.json()).text ?? "").trim();
    book = { ...book, [id]: text || "(no speech found)" };
    const keys = Object.keys(book); if (keys.length > MAX) for (const k of keys.slice(0, keys.length - MAX)) delete book[k];
    try { localStorage.setItem(KEY, JSON.stringify(book)); } catch { /* storage may be full */ }
  } catch { failed.add(id); }
  busy.delete(id); bump();
}
export function forgetTranscripts() { book = {}; try { localStorage.removeItem(KEY); } catch { /* ignore */ } bump(); }
