import { useEffect, useRef, useState } from "react";
import { BarChart3, ContactRound, File as FileIcon, Image as ImageIcon, MapPin, Plus, Smile, Sticker as StickerIcon, X, Camera } from "lucide-react";
import { Gif, searchGifs } from "../core/gifs";
import { Sticker } from "../core/types";
import { addStickers, stickerPacks, toggleFavoriteGif, useStore } from "../core/store";
import { useSettings } from "../core/settings";
import { EmptyState, Modal, useMxc } from "./common";

export type AttachKind = "photos" | "camera" | "gif" | "stickers" | "emoji" | "file" | "poll" | "contact" | "location";

const ITEMS: [AttachKind, string, React.ComponentType<{ size?: number; color?: string }> | "gif", string][] = [
  ["photos", "Photos", ImageIcon, "#3b82f6"], ["camera", "Camera", Camera, "#6b7280"], ["gif", "GIF", "gif", "#ec4899"],
  ["stickers", "Stickers", StickerIcon, "#f59e0b"], ["emoji", "Emoji", Smile, "#eab308"], ["file", "File", FileIcon, "#14b8a6"],
  ["poll", "Poll", BarChart3, "#8b5cf6"], ["contact", "Contact", ContactRound, "#0ea5e9"], ["location", "Location", MapPin, "#ef4444"],
];

/** The + menu: a grid of everything you can add to a message. */
export function AttachMenu({ onPick, onClose }: { onPick: (k: AttachKind) => void; onClose: () => void }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    const click = (e: MouseEvent) => { if (!(e.target as HTMLElement).closest(".attach-pop, .plus")) onClose(); };
    window.addEventListener("keydown", key); window.addEventListener("mousedown", click);
    return () => { window.removeEventListener("keydown", key); window.removeEventListener("mousedown", click); };
  }, [onClose]);
  const hasCamera = typeof navigator !== "undefined" && !!navigator.mediaDevices;
  return (
    <div className="attach-pop">
      {ITEMS.filter(([k]) => k !== "camera" || hasCamera).map(([k, label, Icon, color]) => (
        <button key={k} onClick={() => onPick(k)}>
          <span style={{ background: color }}>{Icon === "gif" ? <b>GIF</b> : <Icon size={22} color="#fff" />}</span>{label}
        </button>
      ))}
    </div>
  );
}

export function GifModal({ onPick, onSettings, onClose }: { onPick: (g: Gif) => void; onSettings: () => void; onClose: () => void }) {
  const st = useSettings();
  const favorites = useStore((s) => s.favoriteGifs);
  const [tab, setTab] = useState<"favorites" | "search">(favorites.length || !st.gifKey ? "favorites" : "search");
  const [q, setQ] = useState("");
  const [gifs, setGifs] = useState<Gif[]>([]);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!st.gifKey || tab !== "search") return;
    let live = true; setBusy(true); setErr("");
    const t = setTimeout(() => searchGifs(st.gifProvider, st.gifKey, q.trim()).then((r) => live && setGifs(r)).catch((e) => live && (setErr(e.message), setGifs([]))).finally(() => live && setBusy(false)), q ? 350 : 0);
    return () => { live = false; clearTimeout(t); };
  }, [q, st.gifKey, st.gifProvider, tab]);
  const grid = (list: Gif[]) => (
    <div className="gif-grid">{list.map((g) => (
      <div key={g.id + g.url} className="gif-cell" style={{ aspectRatio: g.w && g.h ? String(Math.min(2, Math.max(0.6, g.w / g.h))) : "1.4" }}>
        <button onClick={() => onPick(g)}><img src={g.previewUrl} alt={g.title} loading="lazy" /></button>
        <button className="gif-star" title={favorites.some((x) => x.url === g.url) ? "Remove from favorites" : "Add to favorites"} onClick={() => toggleFavoriteGif(g)}>{favorites.some((x) => x.url === g.url) ? "★" : "☆"}</button>
      </div>))}</div>
  );
  return (
    <Modal title="GIFs" onClose={onClose} wide>
      <div className="tabs pad"><button className={"tab" + (tab === "favorites" ? " on" : "")} onClick={() => setTab("favorites")}>Favorites{favorites.length ? ` (${favorites.length})` : ""}</button><button className={"tab" + (tab === "search" ? " on" : "")} onClick={() => setTab("search")}>Search</button></div>
      {tab === "favorites" ? (
        favorites.length ? grid(favorites) : <EmptyState icon={ImageIcon} title="No favorite GIFs yet" body="Search for a GIF and tap ☆ to keep it here. Your favorites follow your account to every device." />
      ) : !st.gifKey ? (
        <EmptyState icon={ImageIcon} title="Set up GIF search" body="Add a free Giphy or Tenor API key in Settings → Stickers & GIFs. Pager doesn't ship a shared key.">
          <button className="primary" onClick={onSettings}>Open settings</button>
        </EmptyState>
      ) : (
        <>
          <div className="pill-search"><input autoFocus placeholder={`Search ${st.gifProvider === "tenor" ? "Tenor" : "GIPHY"}`} value={q} onChange={(e) => setQ(e.target.value)} /></div>
          {err && <div className="error pad">{err}</div>}
          {busy && !gifs.length && <p className="muted pad">Loading…</p>}
          {grid(gifs)}
        </>
      )}
    </Modal>
  );
}

function StickerThumb({ s, onPick }: { s: Sticker; onPick: () => void }) {
  const src = useMxc(s.url, 256);
  return <button className="sticker-cell" onClick={onPick} title={s.body}>{src && <img src={src} alt={s.body} />}</button>;
}

export function StickerModal({ roomId, onPick, onClose }: { roomId: string; onPick: (s: Sticker) => void; onClose: () => void }) {
  useStore((s) => s.userStickers); useStore((s) => s.chats[roomId]?.stickerPacks);
  const packs = stickerPacks(roomId);
  const [tab, setTab] = useState(0);
  const file = useRef<HTMLInputElement>(null);
  const add = () => file.current?.click();
  return (
    <Modal title="Stickers" onClose={onClose} wide>
      <input ref={file} type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) void addStickers(Array.from(e.target.files)); e.target.value = ""; }} />
      {!packs.length ? (
        <EmptyState icon={StickerIcon} title="No stickers yet" body="Add images from your computer and they become stickers you can send in any page."><button className="primary" onClick={add}>Add stickers</button></EmptyState>
      ) : (
        <>
          <div className="tabs flat">{packs.map((p, i) => <button key={p.key + i} className={"tab" + (tab === i ? " on" : "")} onClick={() => setTab(i)}>{p.name}</button>)}<button className="icon sm" onClick={add} title="Add stickers" aria-label="Add stickers"><Plus size={18} /></button></div>
          <div className="sticker-grid">{(packs[tab] ?? packs[0]).stickers.map((s) => <StickerThumb key={s.shortcode + s.url} s={s} onPick={() => onPick(s)} />)}</div>
        </>
      )}
    </Modal>
  );
}

export function PollModal({ onCreate, onClose }: { onCreate: (q: string, answers: string[], max: number, disclosed: boolean) => void; onClose: () => void }) {
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState(["", ""]);
  const [multiple, setMultiple] = useState(false);
  const [hidden, setHidden] = useState(false);
  const answers = options.map((o) => o.trim()).filter(Boolean);
  return (
    <Modal title="Create poll" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onCreate(question.trim(), answers, multiple ? answers.length : 1, !hidden); }}>
        <label>Question<input autoFocus value={question} onChange={(e) => setQuestion(e.target.value)} /></label>
        {options.map((o, i) => (
          <div className="inline-form" key={i}>
            <input placeholder={`Option ${i + 1}`} value={o} onChange={(e) => setOptions(options.map((x, j) => (j === i ? e.target.value : x)))} />
            {options.length > 2 && <button type="button" className="icon" onClick={() => setOptions(options.filter((_, j) => j !== i))} aria-label="Remove option"><X size={18} /></button>}
          </div>
        ))}
        {options.length < 10 && <button type="button" className="link" onClick={() => setOptions([...options, ""])}><Plus size={14} /> Add option</button>}
        <label className="toggle"><span>Allow multiple answers</span><input type="checkbox" checked={multiple} onChange={(e) => setMultiple(e.target.checked)} /></label>
        <label className="toggle"><span>Hide results until the poll ends</span><input type="checkbox" checked={hidden} onChange={(e) => setHidden(e.target.checked)} /></label>
        <button className="primary" disabled={!question.trim() || answers.length < 2}>Send poll</button>
        <p className="fine">Polls work in Matrix and on networks whose bridge supports them (WhatsApp does).</p>
      </form>
    </Modal>
  );
}

export function ContactModal({ onSend, onClose }: { onSend: (name: string, phone: string) => void; onClose: () => void }) {
  const [name, setName] = useState(""), [phone, setPhone] = useState("");
  return (
    <Modal title="Share a contact" onClose={onClose}>
      <form className="stack" onSubmit={(e) => { e.preventDefault(); onSend(name.trim(), phone.trim()); }}>
        <label>Name<input autoFocus value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label>Phone number<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+1 555 010 4242" /></label>
        <button className="primary" disabled={!name.trim() || !phone.trim()}>Send contact card</button>
        <p className="fine">Sent as a vCard file the other person can save.</p>
      </form>
    </Modal>
  );
}
