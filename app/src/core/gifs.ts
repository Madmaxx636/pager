// GIF search through Giphy or Tenor using the user's own API key (Pager doesn't ship a shared key).
export interface Gif { id: string; title: string; previewUrl: string; url: string; w: number; h: number }

type J = Record<string, any>;

export function parseGifs(provider: string, o: J): Gif[] {
  if (provider === "tenor") {
    return ((o.results ?? []) as J[]).flatMap((r) => {
      const gif = r.media_formats?.gif, tiny = r.media_formats?.tinygif;
      return gif?.url ? [{ id: String(r.id), title: r.content_description ?? "", previewUrl: tiny?.url ?? gif.url, url: gif.url, w: gif.dims?.[0] ?? 0, h: gif.dims?.[1] ?? 0 }] : [];
    });
  }
  return ((o.data ?? []) as J[]).flatMap((r) => {
    const orig = r.images?.original, small = r.images?.fixed_height_small?.url ? r.images.fixed_height_small : r.images?.fixed_height;
    return orig?.url ? [{ id: String(r.id), title: r.title ?? "", previewUrl: small?.url ?? orig.url, url: orig.url, w: Number(orig.width) || 0, h: Number(orig.height) || 0 }] : [];
  });
}

export async function searchGifs(provider: string, key: string, query: string): Promise<Gif[]> {
  const q = encodeURIComponent(query);
  const url = provider === "tenor"
    ? `https://tenor.googleapis.com/v2/${query ? "search" : "featured"}?key=${key}&client_key=pager&limit=30&media_filter=gif,tinygif&q=${q}`
    : `https://api.giphy.com/v1/gifs/${query ? "search" : "trending"}?api_key=${key}&limit=30&rating=pg-13&q=${q}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(res.status === 401 || res.status === 403 ? "That GIF API key was rejected." : `GIF search failed (${res.status})`);
  return parseGifs(provider, await res.json());
}
