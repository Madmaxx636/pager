import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { ChatState, Msg, STATUS_FAILED, STATUS_SENDING, STATUS_SENT, displayName, isArchived, isGroup, isPinned, nameOf, previewOf } from "../core/types";
import { networkMeta } from "../core/emoji";
import { getSettings, useSettings, AppSettings } from "../core/settings";
import {
  cancelScheduled, edit, forward, loadOlder, markRead, markUnread, me, members, muteLeft, preview, react, remind, remove, rename, retry, schedule,
  send, sendFile, sendLocation, setDraft, setMuted, setTag, leave, toggleStar, typing, useStore, mediaUrl, getState,
} from "../core/store";
import { LinkPreview } from "../core/api";
import { Avatar, EmojiPicker, Modal, TimePresetModal, humanSize, useMxc } from "./common";
import type { Nav } from "./Sidebar";

// ---- helpers -------------------------------------------------------------------------------

const URL_RE = /\b((?:https?:\/\/|www\.)[^\s<]+[^\s<.,;:!?)\]"'])/gi;
const firstUrl = (t: string) => { URL_RE.lastIndex = 0; const m = URL_RE.exec(t); return m ? (m[1].startsWith("http") ? m[1] : `https://${m[1]}`) : undefined; };
function Linkified({ text }: { text: string }) {
  const parts: React.ReactNode[] = []; let last = 0; URL_RE.lastIndex = 0;
  for (let m = URL_RE.exec(text); m; m = URL_RE.exec(text)) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const href = m[1].startsWith("http") ? m[1] : `https://${m[1]}`;
    parts.push(<a key={m.index} href={href} target="_blank" rel="noreferrer noopener">{m[1]}</a>);
    last = m.index + m[0].length;
  }
  parts.push(text.slice(last));
  return <>{parts}</>;
}

const clock = (ts: number, mode: AppSettings["timeFormat"]) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(mode === "system" ? {} : { hour12: mode === "12" }) });
const senderHue = (n: string) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
const dayLabel = (d: Date) => {
  const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};

type Item = { kind: "day"; key: string; label: string } | { kind: "unread"; key: string } | { kind: "msg"; key: string; msg: Msg; index: number; first: boolean };
function buildItems(messages: Msg[], unreadBefore?: string): Item[] {
  const out: Item[] = []; let lastDay = "";
  messages.forEach((m, i) => {
    const d = new Date(m.ts), k = d.toDateString();
    if (k !== lastDay) { out.push({ kind: "day", key: `day-${k}`, label: dayLabel(d) }); lastDay = k; }
    if (m.id === unreadBefore) out.push({ kind: "unread", key: "unread" });
    const prev = out[out.length - 1];
    out.push({ kind: "msg", key: m.id, msg: m, index: i, first: messages[i - 1]?.sender !== m.sender || prev.kind !== "msg" });
  });
  return out;
}

// ---- Chat ------------------------------------------------------------------------------------

export function Chat({ roomId, onBack, nav, onForward }: { roomId: string; onBack: () => void; nav: Nav; onForward: (m: Msg) => void }) {
  const chat = useStore((s) => s.chats[roomId]);
  const stars = useStore((s) => s.stars);
  const st = useSettings();
  const user = me();
  const scroller = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(() => window.innerWidth > 1280);
  const [menu, setMenu] = useState<{ msg: Msg; x: number; y: number }>();
  const [viewer, setViewer] = useState<Msg>();
  const [picker, setPicker] = useState<Msg>();
  const [who, setWho] = useState<{ msg: Msg; key: string }>();
  const [replyTo, setReplyTo] = useState<Msg>();
  const [editing, setEditing] = useState<Msg>();
  const [dragging, setDragging] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Msg>();

  const messages = chat?.messages ?? [];
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const readIndex = useMemo(() => {
    const r = chat?.receipts ?? {};
    return Math.max(-1, ...Object.entries(r).filter(([u]) => u !== user).map(([, id]) => messages.findIndex((m) => m.id === id)));
  }, [chat?.receipts, messages, user]);
  const group = chat ? isGroup(chat) || new Set(messages.map((m) => m.sender)).size > 2 : false;

  // Where the unread messages begin; computed once when the chat opens.
  const unreadBefore = useMemo(() => {
    if (!chat) return undefined;
    const read = chat.receipts[user];
    const i = read ? chat.messages.findIndex((m) => m.id === read) : -1;
    const fresh = i >= 0 ? chat.messages.slice(i + 1) : chat.unread > 0 ? chat.messages.slice(-chat.unread) : [];
    return fresh.find((m) => m.sender !== user)?.id;
  }, [roomId, chat != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildItems(messages, unreadBefore), [messages, unreadBefore]);

  // Scroll: open at the unread divider (or bottom), stick to bottom for new messages, keep position when older ones load.
  const opened = useRef<string>("");
  const stick = useRef(true);
  const prevTop = useRef<{ first?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = scroller.current; if (!el || !chat) return;
    if (opened.current !== roomId) {
      opened.current = roomId;
      const div = el.querySelector("#unread-divider");
      if (div) { (div as HTMLElement).scrollIntoView({ block: "center" }); stick.current = false; } else { el.scrollTop = el.scrollHeight; stick.current = true; }
    } else if (prevTop.current.first && messages[0]?.id !== prevTop.current.first && !stick.current) {
      el.scrollTop += el.scrollHeight - prevTop.current.height; // older messages were prepended
    } else if (stick.current || messages[messages.length - 1]?.sender === user) {
      el.scrollTop = el.scrollHeight;
    }
    prevTop.current = { first: messages[0]?.id, height: el.scrollHeight };
  }, [roomId, messages, chat != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { opened.current = ""; stick.current = true; setReplyTo(undefined); setEditing(undefined); }, [roomId]);
  useEffect(() => { if (stick.current && document.hasFocus()) markRead(roomId); }, [roomId, messages.length]);
  useEffect(() => { const f = () => stick.current && markRead(roomId); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [roomId]);

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current) markRead(roomId);
    if (el.scrollTop < 120) loadOlder(roomId);
  };
  useEffect(() => { const el = scroller.current; if (el && el.scrollHeight <= el.clientHeight + 40) loadOlder(roomId); }, [roomId, messages.length]);

  const openMsg = useCallback((m: Msg) => {
    if (m.type === "m.location" && m.geo) { const [lat, lon] = m.geo.replace("geo:", "").split(";")[0].split(","); window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`, "_blank", "noopener"); }
    else if (m.type === "m.image" && m.mxc) setViewer(m);
    else if ((m.type === "m.file" || m.type === "m.video") && m.mxc) void download(m);
  }, []);

  if (!chat) return <section className="chat"><header><button className="icon back" onClick={onBack}>‹</button><div>Opening…</div></header></section>;
  const name = displayName(chat, user);
  const meta = networkMeta(chat.network);
  const typingNames = chat.typing.map((u) => nameOf(chat, u));
  const attachFiles = (files: FileList | File[]) => Array.from(files).forEach((f) => sendFile(roomId, f));

  return (
    <section className={"chat" + (infoOpen ? " with-info" : "")} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); attachFiles(e.dataTransfer.files); }}>
      <div className="chat-col">
        <header>
          <button className="icon back" onClick={onBack} aria-label="Back">‹</button>
          <button className="head-id" onClick={() => setInfoOpen(!infoOpen)}>
            {st.showAvatars && <Avatar name={name} mxc={chat.avatarMxc} size={38} network={st.showNetworkBadges ? chat.network : undefined} />}
            <div>
              <div className="chat-title">{name}</div>
              {typingNames.length ? <div className="chat-sub typing">{typingNames.length === 1 ? `${typingNames[0]} is typing…` : "Several people are typing…"}</div>
                : <div className="chat-sub"><i style={{ background: meta.color }} />{meta.label}{isGroup(chat) ? ` · ${chat.memberCount} members` : ""}</div>}
            </div>
          </button>
          <button className="icon" onClick={() => nav(`search:${roomId}`)} title="Search in chat" aria-label="Search in chat">🔍</button>
          <button className="icon" onClick={() => setInfoOpen(!infoOpen)} title="Chat info" aria-label="Chat info">ⓘ</button>
        </header>

        <div className={"timeline wp-" + st.wallpaper} ref={scroller} onScroll={onScroll}>
          {items.map((it) => it.kind === "day" ? <div key={it.key} className="day"><span>{it.label}</span></div>
            : it.kind === "unread" ? <div key={it.key} id="unread-divider" className="unread-divider"><span>New messages</span></div>
            : <MessageRow key={it.key} chat={chat} msg={it.msg} first={it.first} group={group} mine={it.msg.sender === user} read={it.index <= readIndex} reply={it.msg.replyTo ? byId.get(it.msg.replyTo) : undefined}
                st={st} starred={stars.some((s) => s.eventId === it.msg.id)} onMenu={(x, y) => setMenu({ msg: it.msg, x, y })} onOpen={() => openMsg(it.msg)} onWho={(key) => setWho({ msg: it.msg, key })}
                onReact={(key) => react(roomId, it.msg.id, key)} onReply={() => { setReplyTo(it.msg); setEditing(undefined); }} />)}
        </div>

        <Composer roomId={roomId} chat={chat} replyTo={replyTo} editing={editing} st={st} group={group} onClearReply={() => setReplyTo(undefined)} onClearEdit={() => setEditing(undefined)} onFiles={attachFiles} />
        {dragging && <div className="drop-hint">Drop to send</div>}
      </div>

      {infoOpen && <InfoPanel chat={chat} nav={nav} onClose={() => setInfoOpen(false)} />}

      {menu && (
        <div className="ctx-backdrop" onClick={() => setMenu(undefined)} onContextMenu={(e) => { e.preventDefault(); setMenu(undefined); }}>
          <div className="menu ctx msg-menu" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 270)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 380)) }} onClick={(e) => e.stopPropagation()}>
            <div className="quick">
              {st.quickReactions.map((e) => <button key={e} onClick={() => { react(roomId, menu.msg.id, e); setMenu(undefined); }}>{e}</button>)}
              <button className="more" onClick={() => { setPicker(menu.msg); setMenu(undefined); }}>＋</button>
            </div>
            <MenuItems roomId={roomId} m={menu.msg} mine={menu.msg.sender === user} starred={stars.some((s) => s.eventId === menu.msg.id)} close={() => setMenu(undefined)}
              onReply={() => { setReplyTo(menu.msg); setEditing(undefined); }} onEdit={() => { setEditing(menu.msg); setReplyTo(undefined); }} onForward={() => onForward(menu.msg)}
              onDelete={() => (st.confirmDelete ? setConfirmDel(menu.msg) : remove(roomId, menu.msg.id))} />
          </div>
        </div>
      )}
      {picker && <EmojiPicker recent={st.recentEmoji} onPick={(e) => { react(roomId, picker.id, e); setPicker(undefined); }} onClose={() => setPicker(undefined)} />}
      {who && (
        <Modal title={`${who.key}  ${chat.reactions[who.msg.id]?.[who.key]?.length ?? 0}`} onClose={() => setWho(undefined)}>
          <div className="stack">{(chat.reactions[who.msg.id]?.[who.key] ?? []).map((u) => <div key={u}>{u === user ? "You" : nameOf(chat, u)}</div>)}</div>
          {chat.reactions[who.msg.id]?.[who.key]?.includes(user) && <button className="link" onClick={() => { react(roomId, who.msg.id, who.key); setWho(undefined); }}>Remove mine</button>}
        </Modal>
      )}
      {confirmDel && (
        <Modal title="Delete message?" onClose={() => setConfirmDel(undefined)}>
          <p className="muted">It will be removed for everyone in the chat where the network allows it.</p>
          <div className="row-end"><button className="link" onClick={() => setConfirmDel(undefined)}>Cancel</button><button className="primary danger" onClick={() => { remove(roomId, confirmDel.id); setConfirmDel(undefined); }}>Delete</button></div>
        </Modal>
      )}
      {viewer && <ImageViewer msg={viewer} onClose={() => setViewer(undefined)} />}
    </section>
  );
}

async function download(m: Msg) {
  if (!m.mxc) return;
  const u = await mediaUrl(m.mxc); if (!u) return;
  const a = document.createElement("a"); a.href = u; a.download = m.body || "file"; a.click();
}

function MenuItems({ roomId, m, mine, starred, close, onReply, onEdit, onForward, onDelete }: { roomId: string; m: Msg; mine: boolean; starred: boolean; close: () => void; onReply: () => void; onEdit: () => void; onForward: () => void; onDelete: () => void }) {
  const run = (f: () => void) => () => { f(); close(); };
  return (
    <>
      <button onClick={run(onReply)}>Reply</button>
      <button onClick={run(onForward)}>Forward</button>
      {["m.text", "m.notice", "m.emote"].includes(m.type) && <button onClick={run(() => void navigator.clipboard.writeText(m.body))}>Copy text</button>}
      <button onClick={run(() => toggleStar(roomId, m))}>{starred ? "Remove star" : "Star"}</button>
      {mine && m.type === "m.text" && m.status === STATUS_SENT && <button onClick={run(onEdit)}>Edit</button>}
      {mine && m.status === STATUS_SENT && <button className="danger" onClick={run(onDelete)}>Delete</button>}
    </>
  );
}

// ---- One message ----------------------------------------------------------------------------------

function MessageRow({ chat, msg, first, group, mine, read, reply, st, starred, onMenu, onOpen, onWho, onReact, onReply }: {
  chat: ChatState; msg: Msg; first: boolean; group: boolean; mine: boolean; read: boolean; reply?: Msg; st: AppSettings; starred: boolean;
  onMenu: (x: number, y: number) => void; onOpen: () => void; onWho: (key: string) => void; onReact: (key: string) => void; onReply: () => void;
}) {
  const reactions = chat.reactions[msg.id] ?? {};
  const author = nameOf(chat, msg.sender);
  const bare = msg.sticker;
  return (
    <div className={"msg" + (mine ? " mine" : "") + (first ? " first" : "")} data-id={msg.id}>
      {group && !mine && first && <div className="msg-sender" style={st.colorSenderNames ? { color: `hsl(${senderHue(author)} 60% 62%)` } : undefined}>{author}</div>}
      <div className="msg-line">
        <div className={"bubble" + (bare ? " bare" : "") + (msg.status === STATUS_FAILED ? " failed" : "")}
          onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
          onDoubleClick={() => st.doubleTapReact && st.quickReactions[0] && onReact(st.quickReactions[0])}
          onClick={() => (msg.status === STATUS_FAILED ? retry(chat.id, msg) : undefined)}>
          {msg.replyTo && (
            <div className="quote"><b>{reply ? nameOf(chat, reply.sender) : "Earlier message"}</b><span>{reply ? previewOf(reply) : "…"}</span></div>
          )}
          <Content msg={msg} chat={chat} st={st} onOpen={onOpen} />
          {!bare && (st.showMessageTimes || (mine && st.showReadTicks) || msg.edited) && (
            <div className="meta">
              {msg.edited && <i>edited</i>}{st.showMessageTimes && <span>{clock(msg.ts, st.timeFormat)}</span>}
              {mine && st.showReadTicks && <span className={"ticks" + (read ? " read" : "")}>{msg.status === STATUS_SENDING ? "⏳" : msg.status === STATUS_FAILED ? "⚠" : read ? "✓✓" : "✓"}</span>}
            </div>
          )}
          {starred && <span className="star">⭐</span>}
        </div>
        <div className="hover-tools">
          <button title="React" onClick={(e) => { const r = (e.target as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}>😀</button>
          <button title="Reply" onClick={onReply}>↩</button>
          <button title="More" onClick={(e) => { const r = (e.target as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}>⋯</button>
        </div>
      </div>
      {msg.status === STATUS_FAILED && <div className="failed-note">Not sent · click the message to retry</div>}
      {Object.keys(reactions).length > 0 && (
        <div className="reactions">
          {Object.entries(reactions).map(([key, users]) => (
            <button key={key} className={users.includes(me()) ? "mine" : ""} onClick={() => onReact(key)} onContextMenu={(e) => { e.preventDefault(); onWho(key); }} title="Right-click to see who">{key}{users.length > 1 && <small>{users.length}</small>}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function Content({ msg, chat, st, onOpen }: { msg: Msg; chat: ChatState; st: AppSettings; onOpen: () => void }) {
  const auto = st.autoDownload === "always";
  const [tapped, setTapped] = useState(false);
  const allowed = auto || tapped || msg.status !== STATUS_SENT;
  const isImg = msg.type === "m.image";
  const img = useMxc(isImg ? msg.mxc : undefined, msg.sticker ? 320 : 640, allowed);
  const media = useMxc(msg.type === "m.audio" || msg.type === "m.video" ? msg.mxc : undefined, 0, allowed);
  const ratio = msg.w && msg.h ? Math.min(2, Math.max(0.5, msg.w / msg.h)) : 4 / 3;

  switch (msg.type) {
    case "m.image":
      return img ? <img className={"media" + (msg.sticker ? " sticker" : "")} src={img} alt={msg.body} onClick={onOpen} />
        : <div className="media placeholder" style={{ aspectRatio: String(ratio) }} onClick={() => setTapped(true)}>{msg.status === STATUS_SENDING ? "Sending…" : !allowed ? `Tap to load${msg.size ? ` · ${humanSize(msg.size)}` : ""}` : "📷"}</div>;
    case "m.video":
      return media ? <video className="media" src={media} controls preload="metadata" /> : <div className="file" onClick={() => setTapped(true)}>🎬 <span>{msg.body || "Video"}{msg.size ? <small>{humanSize(msg.size)} · tap to load</small> : null}</span></div>;
    case "m.audio":
      return media ? <audio src={media} controls preload="metadata" /> : <div className="file" onClick={() => setTapped(true)}>{msg.voice ? "🎤" : "🎵"} <span>{msg.voice ? "Voice message" : msg.body}{msg.durationMs ? <small>{Math.floor(msg.durationMs / 60000)}:{String(Math.floor(msg.durationMs / 1000) % 60).padStart(2, "0")} · tap to load</small> : null}</span></div>;
    case "m.file":
      return <div className="file" onClick={onOpen}>📎 <span>{msg.body || "File"}{msg.size ? <small>{humanSize(msg.size)}</small> : null}</span></div>;
    case "m.location":
      return <div className="file" onClick={onOpen}>📍 <span>Shared location<small>{msg.geo?.replace("geo:", "")} · open map</small></span></div>;
    case "m.emote":
      return <em>* {nameOf(chat, msg.sender)} {msg.body}</em>;
    case "m.notice":
      return <span className="notice"><Linkified text={msg.body} /></span>;
    default: {
      const url = st.linkPreviews ? firstUrl(msg.body) : undefined;
      return <><span className="text"><Linkified text={msg.body} /></span>{url && <LinkCard url={url} />}</>;
    }
  }
}

function LinkCard({ url }: { url: string }) {
  const [p, setP] = useState<LinkPreview>();
  useEffect(() => { let live = true; void preview(url).then((r) => live && setP(r)); return () => { live = false; }; }, [url]);
  const img = useMxc(p?.imageMxc, 480);
  if (!p) return null;
  return (
    <a className="link-card" href={url} target="_blank" rel="noreferrer noopener">
      {p.site && <small>{p.site}</small>}{p.title && <b>{p.title}</b>}{p.description && <span>{p.description}</span>}{img && <img src={img} alt="" />}
    </a>
  );
}

function ImageViewer({ msg, onClose }: { msg: Msg; onClose: () => void }) {
  const src = useMxc(msg.mxc, 0);
  const [zoom, setZoom] = useState(false);
  useEffect(() => { const h = (e: KeyboardEvent) => e.key === "Escape" && onClose(); window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);
  return (
    <div className="viewer" onClick={onClose}>
      {src ? <img src={src} alt={msg.body} className={zoom ? "zoom" : ""} onClick={(e) => { e.stopPropagation(); setZoom(!zoom); }} /> : <p>Loading…</p>}
      <div className="viewer-bar" onClick={(e) => e.stopPropagation()}><button onClick={() => void download(msg)}>Download</button><button onClick={onClose}>Close</button></div>
    </div>
  );
}

// ---- Composer ----------------------------------------------------------------------------------------

function Composer({ roomId, chat, replyTo, editing, st, group, onClearReply, onClearEdit, onFiles }: {
  roomId: string; chat: ChatState; replyTo?: Msg; editing?: Msg; st: AppSettings; group: boolean; onClearReply: () => void; onClearEdit: () => void; onFiles: (f: File[]) => void;
}) {
  const [text, setText] = useState(() => getState().drafts[roomId] ?? "");
  const [attach, setAttach] = useState(false);
  const [emoji, setEmoji] = useState(false);
  const [later, setLater] = useState(false);
  const [error, setError] = useState<string>();
  const [rec, setRec] = useState<{ ms: number } | null>(null);
  const mentionIds = useRef(new Map<string, string>());
  const ta = useRef<HTMLTextAreaElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const recorder = useRef<{ mr: MediaRecorder; chunks: Blob[]; start: number; stream: MediaStream; timer: number; cancel?: boolean } | undefined>(undefined);
  const user = me();

  useEffect(() => { setText(getState().drafts[roomId] ?? ""); mentionIds.current.clear(); }, [roomId]);
  useEffect(() => { if (editing) { setText(editing.body); ta.current?.focus(); } }, [editing]);
  useEffect(() => { if (replyTo) ta.current?.focus(); }, [replyTo]);
  useEffect(() => { ta.current?.focus(); }, [roomId]);
  useEffect(() => {
    if (text.trim()) typing(roomId, true); else typing(roomId, false);
    const t = setTimeout(() => { if (!editing) setDraft(roomId, text); }, 500);
    return () => clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => { typing(roomId, false); }, [roomId]);
  useLayoutEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, 160)}px`; } }, [text]);

  const token = st.mentionSuggestions && group ? /(?:^|\s)@([^\s@]*)$/.exec(text)?.[1] : undefined;
  const people = token === undefined ? [] : Object.entries(chat.members).filter(([id, n]) => id !== user && n.toLowerCase().includes(token.toLowerCase())).slice(0, 8);

  function submit() {
    const body = text.trim(); if (!body) return;
    if (editing) edit(roomId, editing.id, body);
    else send(roomId, body, replyTo?.id, [...mentionIds.current].filter(([n]) => body.includes(`@${n}`)).map(([, id]) => id));
    setText(""); mentionIds.current.clear(); onClearReply(); onClearEdit();
  }
  const sendKey = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.nativeEvent.isComposing && (st.enterToSend ? !e.shiftKey : e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); }
    if (e.key === "Escape") { onClearReply(); onClearEdit(); if (editing) setText(""); }
  };

  async function startRec() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream, MediaRecorder.isTypeSupported("audio/ogg;codecs=opus") ? { mimeType: "audio/ogg;codecs=opus" } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      const start = Date.now();
      const timer = window.setInterval(() => setRec({ ms: Date.now() - start }), 200);
      mr.onstop = () => {
        window.clearInterval(timer); stream.getTracks().forEach((t) => t.stop());
        const ms = Date.now() - start, r = recorder.current; recorder.current = undefined; setRec(null);
        if (!r || r.cancel || ms < 700) return;
        const type = mr.mimeType.split(";")[0] || "audio/webm";
        sendFile(roomId, new Blob(chunks, { type }), `voice-message.${type.includes("ogg") ? "ogg" : "webm"}`, { voice: true, durationMs: ms });
      };
      recorder.current = { mr, chunks, start, stream, timer }; setRec({ ms: 0 }); mr.start();
    } catch { setError("Couldn't access the microphone."); }
  }
  const stopRec = (cancel: boolean) => { const r = recorder.current; if (!r) return; r.cancel = cancel; r.mr.stop(); };

  const where = () => navigator.geolocation?.getCurrentPosition((p) => sendLocation(roomId, p.coords.latitude, p.coords.longitude), () => setError("Couldn't get your location."), { timeout: 10000 });
  const hasText = text.trim().length > 0;

  return (
    <div className="composer-wrap">
      {replyTo && <div className="banner-bar"><div><b>Replying to {nameOf(chat, replyTo.sender)}</b><span>{previewOf(replyTo)}</span></div><button className="icon" onClick={onClearReply}>✕</button></div>}
      {editing && <div className="banner-bar"><div><b>Editing message</b><span>{editing.body}</span></div><button className="icon" onClick={() => { onClearEdit(); setText(""); }}>✕</button></div>}
      {people.length > 0 && <div className="mentions">{people.map(([id, n]) => <button key={id} onClick={() => { setText(text.slice(0, text.length - token!.length - 1) + `@${n} `); mentionIds.current.set(n, id); ta.current?.focus(); }}>@{n}</button>)}</div>}
      {error && <div className="error pad" onClick={() => setError(undefined)}>{error}</div>}
      {rec ? (
        <div className="composer rec"><i className="rec-dot" /><span>Recording {Math.floor(rec.ms / 60000)}:{String(Math.floor(rec.ms / 1000) % 60).padStart(2, "0")}</span><span className="grow" /><button className="link" onClick={() => stopRec(true)}>Cancel</button><button className="primary" onClick={() => stopRec(false)}>Send</button></div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <input ref={file} type="file" multiple hidden onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = ""; }} />
          <div className="menu-wrap">
            <button type="button" className="icon" onClick={() => setAttach(!attach)} aria-label="Attach">＋</button>
            {attach && (
              <div className="menu up" onMouseLeave={() => setAttach(false)} onClick={() => setAttach(false)}>
                <button type="button" onClick={() => file.current?.click()}>📎 File or photo</button>
                <button type="button" onClick={where}>📍 Location</button>
              </div>
            )}
          </div>
          <button type="button" className="icon" onClick={() => setEmoji(true)} aria-label="Emoji">😊</button>
          <textarea ref={ta} rows={1} placeholder="Message" value={text} onChange={(e) => setText(e.target.value)} onKeyDown={sendKey}
            onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); onFiles(fs); } }} />
          {hasText ? (
            <div className="send-group">
              <button className="send" aria-label="Send">➤</button>
              {!editing && <button type="button" className="send-more" onClick={() => setLater(true)} title="Send later">▾</button>}
            </div>
          ) : <button type="button" className="send" onClick={startRec} aria-label="Record voice message" title="Record voice message">🎤</button>}
        </form>
      )}
      {emoji && <EmojiPicker recent={st.recentEmoji} onPick={(e) => { setText(text + e); setEmoji(false); ta.current?.focus(); }} onClose={() => setEmoji(false)} />}
      {later && <TimePresetModal title="Send later" onClose={() => setLater(false)} onPick={async (at) => { setLater(false); const err = await schedule(roomId, text.trim(), Math.max(5000, at - Date.now())); if (err) setError(err); else { setText(""); onClearReply(); } }} />}
    </div>
  );
}

// ---- Info drawer ----------------------------------------------------------------------------------------

function InfoPanel({ chat, nav, onClose }: { chat: ChatState; nav: Nav; onClose: () => void }) {
  const user = me();
  const muted = useStore((s) => s.muted.includes(chat.id));
  const [list, setList] = useState<Record<string, string>>();
  const [muteDlg, setMuteDlg] = useState(false);
  const [remindDlg, setRemindDlg] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  useEffect(() => { void members(chat.id).then(setList); }, [chat.id]);
  const name = displayName(chat, user);
  const photos = useMemo(() => chat.messages.filter((m) => m.type === "m.image" && m.mxc && !m.sticker).slice(-24).reverse(), [chat.messages]);
  const left = muted ? muteLeft(chat.id) : undefined;
  return (
    <aside className="info">
      <header><b>Chat info</b><button className="icon" onClick={onClose}>✕</button></header>
      <div className="info-body">
        <div className="info-id"><Avatar name={name} mxc={chat.avatarMxc} size={88} network={chat.network} /><h3>{name}</h3><small>{networkMeta(chat.network).label}{isGroup(chat) ? ` · ${chat.memberCount} members` : ""}</small>
          {isGroup(chat) && <button className="link" onClick={() => { const n = prompt("Rename group", chat.name); if (n?.trim()) rename(chat.id, n.trim()); }}>Rename group</button>}</div>
        <button className="list-btn" onClick={() => nav(`search:${chat.id}`)}>🔍 Search in this chat</button>
        <button className="list-btn" onClick={() => setRemindDlg(true)}>⏰ Remind me about this chat</button>
        <label className="toggle"><span>Pinned</span><input type="checkbox" checked={isPinned(chat)} onChange={(e) => setTag(chat.id, "m.favourite", e.target.checked)} /></label>
        <label className="toggle"><span>Muted{left && left > 0 ? ` · ${Math.ceil(left / 3.6e6)}h left` : ""}</span><input type="checkbox" checked={muted} onChange={(e) => (e.target.checked ? setMuteDlg(true) : setMuted(chat.id, false))} /></label>
        <label className="toggle"><span>Archived</span><input type="checkbox" checked={isArchived(chat)} onChange={(e) => setTag(chat.id, "u.archived", e.target.checked)} /></label>
        <label className="toggle"><span>Marked unread</span><input type="checkbox" checked={chat.markedUnread} onChange={(e) => markUnread(chat.id, e.target.checked)} /></label>
        {photos.length > 0 && <><h4>Shared photos</h4><div className="photo-grid">{photos.map((m) => <Thumb key={m.id} mxc={m.mxc!} />)}</div></>}
        <button className="list-btn danger" onClick={() => setConfirmLeave(true)}>Leave chat</button>
        <h4>Members{list ? ` (${Object.keys(list).length})` : ""}</h4>
        <ul className="plain">{Object.entries(list ?? chat.members).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <li key={id} className="member"><Avatar name={n} size={32} /><div>{id === user ? `${n} (you)` : n}<small>{id}</small></div></li>)}</ul>
      </div>
      {muteDlg && <Modal title={`Mute ${name}`} onClose={() => setMuteDlg(false)}><div className="stack">{([["For 1 hour", 3.6e6], ["For 8 hours", 8 * 3.6e6], ["For 1 week", 7 * 864e5], ["Until I turn it back on", undefined]] as [string, number | undefined][]).map(([l, ms]) => <button key={l} className="row-btn" onClick={() => { setMuted(chat.id, true, ms); setMuteDlg(false); }}><b>{l}</b></button>)}</div></Modal>}
      {remindDlg && <TimePresetModal title={`Remind me about ${name}`} onPick={(at) => { remind(chat.id, at); setRemindDlg(false); }} onClose={() => setRemindDlg(false)} />}
      {confirmLeave && <Modal title="Leave this chat?" onClose={() => setConfirmLeave(false)}><p className="muted">It will disappear from your inbox. The conversation on {networkMeta(chat.network).label} isn't deleted.</p><div className="row-end"><button className="link" onClick={() => setConfirmLeave(false)}>Cancel</button><button className="primary danger" onClick={() => { leave(chat.id); nav("home"); }}>Leave</button></div></Modal>}
    </aside>
  );
}
function Thumb({ mxc }: { mxc: string }) { const s = useMxc(mxc, 200); return <div className="thumb">{s && <img src={s} alt="" />}</div>; }

export { cancelScheduled };
