// Formatting helpers shared with the Android app: markdown you type becomes Matrix HTML, and emoji-only messages are detected.
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Turns *, **, _, ~~, ` and ``` markdown into Matrix HTML. Returns undefined when nothing is formatted. */
export function markdownToHtml(text: string): string | undefined {
  let html = esc(text), changed = false;
  const stash: string[] = [];
  html = html.replace(/```([\s\S]+?)```/g, (_m, c) => { changed = true; stash.push(`<pre><code>${c}</code></pre>`); return `\u0000${stash.length - 1}\u0000`; });
  html = html.replace(/`([^`\n]+)`/g, (_m, c) => { changed = true; stash.push(`<code>${c}</code>`); return `\u0000${stash.length - 1}\u0000`; });
  html = html.replace(/\*\*([^*\n]+)\*\*/g, (_m, c) => { changed = true; return `<b>${c}</b>`; });
  html = html.replace(/(?<![\w*])\*([^*\n]+)\*(?![\w*])/g, (_m, c) => { changed = true; return `<i>${c}</i>`; });
  html = html.replace(/(?<![\w_])_([^_\n]+)_(?![\w_])/g, (_m, c) => { changed = true; return `<i>${c}</i>`; });
  html = html.replace(/~~([^~\n]+)~~/g, (_m, c) => { changed = true; return `<s>${c}</s>`; });
  if (!changed) return undefined;
  return html.replace(/\u0000(\d+)\u0000/g, (_m, i) => stash[Number(i)]).replace(/\n/g, "<br>");
}

/** True for messages that are only 1-3 emoji (shown large, without a bubble). */
export function isEmojiOnly(text: string, max = 3): boolean {
  const t = text.trim();
  if (!t || t.length > 40) return false;
  let count = 0, prev = 0, flagOpen = false;
  for (const ch of t) {
    const cp = ch.codePointAt(0)!;
    if (cp === 0x200d || cp === 0xfe0f || (cp >= 0x1f3fb && cp <= 0x1f3ff) || cp === 0x20e3 || /\s/.test(ch)) { prev = cp; continue; }
    const emoji = (cp >= 0x1f300 && cp <= 0x1faff) || (cp >= 0x2600 && cp <= 0x27bf) || (cp >= 0x2300 && cp <= 0x23ff) || (cp >= 0x1f1e6 && cp <= 0x1f1ff) || (cp >= 0x2190 && cp <= 0x21ff) || (cp >= 0x2b00 && cp <= 0x2bff) || cp === 0xa9 || cp === 0xae || cp === 0x203c || cp === 0x2049;
    if (!emoji) return false;
    const flag = cp >= 0x1f1e6 && cp <= 0x1f1ff;
    if (!(prev === 0x200d || (flag && flagOpen))) count++; // a ZWJ sequence or flag pair counts once
    flagOpen = flag && !flagOpen;
    prev = cp;
  }
  return count >= 1 && count <= max;
}
