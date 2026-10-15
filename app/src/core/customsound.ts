// A sound of your own for alerts: an audio file you pick, kept on this device only (never sent anywhere), up to a few seconds long.
const DB = "pager-sound", KEY = "alert";
const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function read(): Promise<Blob | undefined> { try { const db = await open(); return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(KEY); q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => res(undefined); }); } catch { return undefined; } }
async function write(b: Blob | undefined) { try { const db = await open(); const st = db.transaction("kv", "readwrite").objectStore("kv"); b ? st.put(b, KEY) : st.delete(KEY); } catch { /* private mode */ } }

export const MAX_BYTES = 3 * 1024 * 1024;
export const MAX_SECONDS = 30;
let url: string | undefined;
const listeners = new Set<() => void>();
const show = (b: Blob | undefined) => { if (url) URL.revokeObjectURL(url); url = b ? URL.createObjectURL(b) : undefined; listeners.forEach((l) => l()); };

export const hasCustomSound = () => url != null;
export const onCustomSoundChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };

/** Why a file can't be used as an alert sound, or "" when it can. Pure, so it can be tested. */
export function problemWith(type: string, bytes: number, seconds: number): string {
  if (!type.startsWith("audio/")) return "That isn't a sound file.";
  if (bytes > MAX_BYTES) return `That file is too big (the limit is ${MAX_BYTES / 1024 / 1024} MB). Try a shorter one.`;
  if (!Number.isFinite(seconds) || seconds <= 0) return "Couldn't read that sound file.";
  if (seconds > MAX_SECONDS) return `That sound is ${Math.round(seconds)} seconds long. Alerts can be up to ${MAX_SECONDS} seconds.`;
  return "";
}

const lengthOf = (b: Blob) => new Promise<number>((res) => { const u = URL.createObjectURL(b), a = new Audio(); a.preload = "metadata"; const done = (n: number) => { URL.revokeObjectURL(u); res(n); }; a.onloadedmetadata = () => done(a.duration); a.onerror = () => done(NaN); a.src = u; });

export async function importSound(file: File): Promise<void> {
  const seconds = file.type.startsWith("audio/") && file.size <= MAX_BYTES ? await lengthOf(file) : 0;
  const bad = problemWith(file.type, file.size, file.type.startsWith("audio/") && file.size > MAX_BYTES ? 1 : seconds);
  if (bad) throw new Error(bad);
  const blob = new Blob([await file.arrayBuffer()], { type: file.type });
  await write(blob); show(blob);
}
export async function removeCustomSound() { await write(undefined); show(undefined); }
/** Loads the saved sound (if any) when the app starts. */
export async function loadCustomSound() { show(await read()); }

export function playCustom(volume = 0.7): boolean {
  if (!url) return false;
  try { const a = new Audio(url); a.volume = Math.min(1, Math.max(0, volume)); void a.play().catch(() => {}); return true; } catch { return false; }
}
