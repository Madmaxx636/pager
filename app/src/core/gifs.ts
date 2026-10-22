// GIF and sticker search through GIPHY and KLIPY, using the user's own API keys (Pager doesn't ship a shared key). Each source keeps to its own tab:
// KLIPY asks that its results are not blended with another provider's. Tenor is gone: Google shut its API down on 30 June 2026.
export interface Gif { id: string; title: string; previewUrl: string; url: string; w: number; h: number; source?: string }

export interface GifSource {
  id: string; name: string;
  /** Whose key it needs ("giphy" or "klipy"): the stickers use the same key as the GIFs. */
  keyOf: "giphy" | "klipy";
  stickers: boolean;
}
export const GIF_SOURCES: GifSource[] = [
  { id: "giphy", name: "GIPHY", keyOf: "giphy", stickers: false },
  { id: "giphy-stickers", name: "GIPHY Stickers", keyOf: "giphy", stickers: true },
  { id: "klipy", name: "KLIPY", keyOf: "klipy", stickers: false },
  { id: "klipy-stickers", name: "KLIPY Stickers", keyOf: "klipy", stickers: true },
];
export const KEY_PROVIDERS: { id: "giphy" | "klipy"; name: string; where: string; url: string }[] = [
  { id: "giphy", name: "GIPHY", where: "developers.giphy.com", url: "https://developers.giphy.com/" },
  { id: "klipy", name: "KLIPY", where: "partner.klipy.com", url: "https://partner.klipy.com/" },
];
/** The sources you can search right now: those whose key you have entered. */
export const sourcesWithKeys = (keys: Record<string, string> | undefined) => GIF_SOURCES.filter((s) => (keys?.[s.keyOf] ?? "").trim().length > 0);

type J = Record<string, any>;

export function parseGiphy(o: J, source = "giphy"): Gif[] {
  return ((o.data ?? []) as J[]).flatMap((r) => {
    const orig = r.images?.original, small = r.images?.fixed_height_small?.url ? r.images.fixed_height_small : r.images?.fixed_height;
    return orig?.url ? [{ id: String(r.id), title: r.title ?? "", previewUrl: small?.url ?? orig.url, url: orig.url, w: Number(orig.width) || 0, h: Number(orig.height) || 0, source }] : [];
  });
}

/** KLIPY: each result has several sizes (hd, md, sm, xs), each in several formats. A small one previews; a medium one is sent. */
export function parseKlipy(o: J, source = "klipy"): Gif[] {
  const list = (o.data?.data ?? o.data ?? []) as J[];
  const pick = (f: J | undefined, order: string[], kinds: string[]) => { for (const sz of order) for (const k of kinds) { const x = f?.[sz]?.[k]; if (x?.url) return x as J; } return undefined; };
  return (Array.isArray(list) ? list : []).flatMap((r) => {
    const send = pick(r.file, ["md", "hd", "sm"], ["gif", "webp", "png"]);
    const small = pick(r.file, ["sm", "xs", "md"], ["gif", "webp", "jpg", "png"]) ?? send;
    return send ? [{ id: String(r.id ?? r.slug), title: r.title ?? "", previewUrl: small!.url, url: send.url, w: Number(send.width) || 0, h: Number(send.height) || 0, source }] : [];
  });
}

export function requestFor(source: GifSource, key: string, query: string): string {
  const q = encodeURIComponent(query), k = encodeURIComponent(key.trim());
  if (source.keyOf === "klipy") {
    const kind = source.stickers ? "static-memes" : "gifs";
    return `https://api.klipy.com/api/v1/${k}/${source.stickers ? "stickers" : kind}/${query ? "search" : "trending"}?per_page=30&customer_id=pager&content_filter=medium${query ? `&q=${q}` : ""}`;
  }
  return `https://api.giphy.com/v1/${source.stickers ? "stickers" : "gifs"}/${query ? "search" : "trending"}?api_key=${k}&limit=30&rating=pg-13${query ? `&q=${q}` : ""}`;
}

/** Why a search failed, in words: the status alone ("403") does not help anyone fix it. */
export function explainFailure(source: GifSource, status: number): string {
  const who = source.keyOf === "klipy" ? "KLIPY" : "GIPHY";
  if (status === 401 || status === 403) return `${who} rejected the key. Check that it is the ${who} key (not another service's), that it is still active, and that it is not restricted to another device or address.`;
  if (status === 429) return `${who} says too many searches were made. A new key is limited to about 100 an hour. Wait a bit and try again.`;
  return `${who} search failed (${status}).`;
}

/** What the service itself said when it refused (it tells apart a wrong key from a limit or a blocked address). */
export async function providerSays(res: Response): Promise<string> {
  try {
    const t = await res.text(); let m = "";
    try { const j = JSON.parse(t); m = String(j?.meta?.msg ?? j?.message ?? j?.error?.message ?? j?.error ?? j?.errors?.[0]?.message ?? ""); } catch { m = t; }
    m = m.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
    return m ? ` It said: “${m}” (code ${res.status}).` : ` (code ${res.status})`;
  } catch { return ` (code ${res.status})`; }
}
/** Lets you compare a key across devices without showing it: its length and last four characters. */
export const keyFingerprint = (key: string) => { const k = key.trim(); return k ? `${k.length} characters, ends …${k.slice(-4)}` : "empty"; };

export async function searchGifs(source: GifSource, key: string, query: string): Promise<Gif[]> {
  let res: Response;
  try { res = await fetch(requestFor(source, key, query)); } catch { throw new Error(`Couldn't reach ${source.keyOf === "klipy" ? "KLIPY" : "GIPHY"}. Check your connection.`); }
  if (!res.ok) throw new Error(explainFailure(source, res.status) + await providerSays(res));
  const o = await res.json();
  return source.keyOf === "klipy" ? parseKlipy(o, source.id) : parseGiphy(o, source.id);
}
