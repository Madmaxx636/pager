import raw from "./emojinames.tsv?raw";

// Names and keywords for every emoji (from the open-source Emojibase data, MIT licence), so the pickers can be searched: "fire", "thumbs", "lol", "heart eyes".
let table: [string, string][] | undefined;
const load = () => (table ??= raw.split("\n").flatMap((l) => { const i = l.indexOf("\t"); return i > 0 ? [[l.slice(0, i), l.slice(i + 1).replace(/[-_]/g, " ")] as [string, string]] : []; }));

/** Emoji whose name or keywords match every word you typed (each word may be the start of a word). Best matches first. */
export function searchEmoji(query: string, limit = 150): string[] {
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const scored: [number, number, string][] = [];
  load().forEach(([emoji, names], order) => {
    const tokens = names.split(" ");
    let score = 0;
    for (const w of words) {
      const exact = tokens.includes(w), first = names.startsWith(w);
      const prefix = exact || tokens.some((t) => t.startsWith(w));
      if (!prefix) return;
      score += first ? 4 : exact ? 3 : 1;
    }
    scored.push([score, order, emoji]);
  });
  return scored.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, limit).map((x) => x[2]);
}
