/** The size a picture should be shown at: no bigger than [max] on its longest side, never enlarged. */
export function fitWithin(w: number, h: number, max: number): { w: number; h: number; scaled: boolean } {
  const s = Math.min(1, max / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)), scaled: s < 1 };
}

/**
 * A chat shows pictures at preview size, but an encrypted picture can only be downloaded whole (the server cannot make a thumbnail of what it
 * cannot read), and a phone photo is several megabytes of memory to hold and many more to decode. So scale it down once, keep the small
 * copy, and fetch the original again only if you open the picture full size. Returns the original when it is already small or unsupported.
 */
export async function shrinkImage(blob: Blob, max: number): Promise<Blob> {
  try {
    if (!/^image\/(jpeg|png|bmp)$/.test(blob.type) || blob.size < 150_000 || typeof createImageBitmap !== "function" || typeof OffscreenCanvas === "undefined") return blob;
    const bmp = await createImageBitmap(blob);
    const { w, h, scaled } = fitWithin(bmp.width, bmp.height, Math.round(max * 1.5)); // a little more than asked, so it stays sharp on dense screens
    if (!scaled) { bmp.close(); return blob; }
    const canvas = new OffscreenCanvas(w, h);
    const g = canvas.getContext("2d");
    if (!g) { bmp.close(); return blob; }
    g.imageSmoothingQuality = "high"; g.drawImage(bmp, 0, 0, w, h); bmp.close();
    const small = await canvas.convertToBlob(blob.type === "image/png" ? { type: "image/webp", quality: 0.85 } : { type: "image/jpeg", quality: 0.85 });
    return small.size < blob.size ? small : blob;
  } catch { return blob; }
}
