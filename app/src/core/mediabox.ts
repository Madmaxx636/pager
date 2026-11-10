/** The room a picture takes once shown (see .media in styles.css: at most 320 wide and 380 tall), so the box held for it is the same size. Unknown size: a 4 to 3 guess. */
export function fitBox(w: number | undefined, h: number | undefined, maxW = 320): { w: number; h: number } {
  if (!w || !h) return { w: 270, h: 203 };
  const k = Math.min(1, maxW / w, 380 / h);
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}
