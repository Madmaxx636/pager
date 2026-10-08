import { ReactNode } from "react";

const ALLOWED = new Set(["b", "strong", "i", "em", "u", "s", "del", "strike", "code", "pre", "blockquote", "ul", "ol", "li", "p"]);
const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]"'])/gi;

export const firstUrl = (t: string) => { URL_RE.lastIndex = 0; const m = URL_RE.exec(t); return m ? (m[1].startsWith("http") ? m[1] : `https://${m[1]}`) : undefined; };

/** Plain text with tappable links. */
export function Linkified({ text }: { text: string }) {
  const parts: ReactNode[] = []; let last = 0; URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = m[1].startsWith("http") ? m[1] : `https://${m[1]}`;
    parts.push(<a key={m.index} href={href} target="_blank" rel="noreferrer noopener">{m[1]}</a>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

/**
 * Renders the small HTML subset Matrix clients and bridges send. Anything not on the allow-list is flattened to its text,
 * attributes are dropped (except safe link targets), so message HTML can never run script or load remote content.
 */
export function Html({ html }: { html: string }) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const walk = (node: Node, key: number): ReactNode => {
    if (node.nodeType === 3) return node.textContent;
    if (node.nodeType !== 1) return null;
    const el = node as Element, tag = el.tagName.toLowerCase();
    const kids = Array.from(el.childNodes).map(walk);
    if (tag === "br") return <br key={key} />;
    if (tag === "a") {
      const href = el.getAttribute("href") ?? "";
      return /^(https?:|mailto:|tel:)/i.test(href) ? <a key={key} href={href} target="_blank" rel="noreferrer noopener">{kids}</a> : <span key={key}>{kids}</span>;
    }
    if (!ALLOWED.has(tag)) return <span key={key}>{kids}</span>;
    const Tag = tag as "b";
    return <Tag key={key}>{kids}</Tag>;
  };
  return <>{Array.from(doc.body.childNodes).map(walk)}</>;
}
