/** Chat wallpapers. All of them are drawn here (gradients and simple patterns), so there is nothing to download and nothing to license. */
export interface Wallpaper { id: string; name: string; light: string; dark: string }

const svg = (body: string, size: number) => `url("data:image/svg+xml,${encodeURIComponent(`<svg xmlns='http://www.w3.org/2000/svg' width='${size}' height='${size}'>${body}</svg>`)}")`;
const dots = (c: string) => svg(`<circle cx='3' cy='3' r='1.4' fill='${c}'/>`, 18);
const grid = (c: string) => svg(`<path d='M24 0H0V24' fill='none' stroke='${c}' stroke-width='1'/>`, 24);
const lines = (c: string) => svg(`<path d='M-2 2L2 -2M0 24L24 0M22 26L26 22' stroke='${c}' stroke-width='1.2'/>`, 24);
const waves = (c: string) => svg(`<path d='M0 20 Q15 5 30 20 T60 20' fill='none' stroke='${c}' stroke-width='1.4'/>`, 60);
const hexes = (c: string) => svg(`<path d='M14 2l12 7v14l-12 7L2 23V9z' fill='none' stroke='${c}' stroke-width='1'/>`, 28);
const g = (a: string, b: string, deg = 160) => `linear-gradient(${deg}deg, ${a}, ${b})`;
const mesh = (a: string, b: string, c: string, base: string) => `radial-gradient(60% 50% at 15% 10%, ${a}, transparent), radial-gradient(55% 55% at 90% 20%, ${b}, transparent), radial-gradient(70% 60% at 50% 100%, ${c}, transparent), ${base}`;

export const WALLPAPERS: Wallpaper[] = [
  { id: "none", name: "None", light: "none", dark: "none" },
  // The five that have always been here
  { id: "dusk", name: "Dusk", light: "linear-gradient(#e9e1fa, var(--bg))", dark: "linear-gradient(#1b1530, var(--bg))" },
  { id: "forest", name: "Forest", light: "linear-gradient(#dceee3, var(--bg))", dark: "linear-gradient(#0e2219, var(--bg))" },
  { id: "ocean", name: "Ocean", light: "linear-gradient(#d9ecfa, var(--bg))", dark: "linear-gradient(#0a1f33, var(--bg))" },
  { id: "sand", name: "Sand", light: "linear-gradient(#f5ebda, var(--bg))", dark: "linear-gradient(#2a2116, var(--bg))" },
  { id: "graphite", name: "Graphite", light: "linear-gradient(#e3e6ea, var(--bg))", dark: "linear-gradient(#1c1f24, var(--bg))" },
  // Gradients
  { id: "sunrise", name: "Sunrise", light: g("#ffe3cf", "#ffd0e0", 170), dark: g("#2c1620", "#3a1f12", 170) },
  { id: "lavender", name: "Lavender", light: g("#ece4ff", "#dbe9ff"), dark: g("#1e1838", "#12203a") },
  { id: "mint", name: "Mint", light: g("#dcf7ec", "#e1f0ff"), dark: g("#0c2a22", "#0e2133") },
  { id: "peach", name: "Peach", light: g("#ffe8dc", "#fff3d6"), dark: g("#2e1b14", "#2b2410") },
  { id: "rosegold", name: "Rose gold", light: g("#fde4e4", "#f7e3cf"), dark: g("#321a1f", "#2c2013") },
  { id: "steel", name: "Steel", light: g("#e6ebf1", "#cfd8e3"), dark: g("#1a2028", "#10151b") },
  { id: "midnight", name: "Midnight sky", light: g("#d6dcf5", "#e9d9f5"), dark: g("#0a0f24", "#1a1038") },
  { id: "lagoon", name: "Lagoon", light: g("#cdf0f0", "#d4e5ff", 140), dark: g("#07262b", "#0b1d3a", 140) },
  { id: "ember", name: "Ember", light: g("#ffe0d0", "#ffeccb", 120), dark: g("#2e100a", "#2f1f08", 120) },
  { id: "moss", name: "Moss", light: g("#e4efd3", "#d6ecdf"), dark: g("#162410", "#0e2419") },
  // Soft colour clouds
  { id: "aurora", name: "Aurora", light: mesh("#b9f2dc", "#c7d4ff", "#f1c9ff", "#f6f8ff"), dark: mesh("#0f5a46", "#25306e", "#5a1f6e", "#080c18") },
  { id: "candy", name: "Candy", light: mesh("#ffc8dd", "#c8e7ff", "#fff1b8", "#fff8fb"), dark: mesh("#6a1f45", "#1f4a6a", "#5f5214", "#14090f") },
  { id: "tropic", name: "Tropic", light: mesh("#b8f0e4", "#ffe2a8", "#ffc1c1", "#f9fffd"), dark: mesh("#0d5a50", "#6a4b0c", "#6a1f1f", "#07120f") },
  { id: "dawn", name: "Dawn", light: mesh("#ffd6b8", "#d9c8ff", "#bfe3ff", "#fffaf5"), dark: mesh("#6a3517", "#3a2a78", "#1a4a6a", "#0d0a12") },
  // Quiet patterns
  { id: "dots", name: "Dots", light: `${dots("rgba(0,0,0,.09)")}, var(--bg)`, dark: `${dots("rgba(255,255,255,.07)")}, var(--bg)` },
  { id: "grid", name: "Grid", light: `${grid("rgba(0,0,0,.07)")}, var(--bg)`, dark: `${grid("rgba(255,255,255,.06)")}, var(--bg)` },
  { id: "lines", name: "Diagonal lines", light: `${lines("rgba(0,0,0,.07)")}, var(--bg)`, dark: `${lines("rgba(255,255,255,.06)")}, var(--bg)` },
  { id: "waves", name: "Waves", light: `${waves("rgba(0,0,0,.08)")}, var(--bg)`, dark: `${waves("rgba(255,255,255,.07)")}, var(--bg)` },
  { id: "hex", name: "Honeycomb", light: `${hexes("rgba(0,0,0,.08)")}, var(--bg)`, dark: `${hexes("rgba(255,255,255,.07)")}, var(--bg)` },
];
export const wallpaperCss = (id: string, dark: boolean) => { const w = WALLPAPERS.find((x) => x.id === id); return w ? (dark ? w.dark : w.light) : "none"; };

// ---- Your own photo ------------------------------------------------------------------------------------------------------------------
// It is kept in this browser's storage only (never sent anywhere) and shrunk first, so a big photo doesn't sit in memory.
const DB = "pager-wallpaper", KEY = "photo";
const open = () => new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open(DB, 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
async function read(): Promise<Blob | undefined> { try { const db = await open(); return await new Promise((res) => { const q = db.transaction("kv").objectStore("kv").get(KEY); q.onsuccess = () => res(q.result as Blob | undefined); q.onerror = () => res(undefined); }); } catch { return undefined; } }
async function write(b: Blob | undefined) { try { const db = await open(); const st = db.transaction("kv", "readwrite").objectStore("kv"); b ? st.put(b, KEY) : st.delete(KEY); } catch { /* private mode */ } }

let url: string | undefined;
const show = (b: Blob | undefined) => {
  if (url) URL.revokeObjectURL(url);
  url = b ? URL.createObjectURL(b) : undefined;
  if (url) document.documentElement.style.setProperty("--wp-image", `url("${url}")`); else document.documentElement.style.removeProperty("--wp-image");
};
/** Largest side, in pixels, a saved photo is shrunk to. */
export const PHOTO_MAX = 1920;
export function fitSize(w: number, h: number, max = PHOTO_MAX): [number, number] {
  const k = Math.min(1, max / Math.max(w, h));
  return [Math.max(1, Math.round(w * k)), Math.max(1, Math.round(h * k))];
}
export async function importPhoto(file: File): Promise<void> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture.");
  const bmp = await createImageBitmap(file);
  const [w, h] = fitSize(bmp.width, bmp.height);
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  c.getContext("2d")!.drawImage(bmp, 0, 0, w, h); bmp.close();
  const blob = await new Promise<Blob | null>((res) => c.toBlob(res, "image/jpeg", 0.85));
  if (!blob) throw new Error("Couldn't read that picture.");
  await write(blob); show(blob);
}
export async function removePhoto() { await write(undefined); show(undefined); }
/** Loads the saved photo (if any) when the app starts. */
export async function loadPhoto(): Promise<boolean> { const b = await read(); show(b); return !!b; }
