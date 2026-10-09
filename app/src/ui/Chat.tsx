import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock, Archive, ArrowDownToLine, ArrowLeft, Bell, BellOff, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, FileText, Forward, Info, Link2, LogOut, Mic, Pencil, Pin, Plus,
  Reply, ExternalLink, Lock, Share2, Search, Send, Smile, Hourglass, Star, Tag, Trash2, X, Code2, MailOpen, Image as ImageIcon,
} from "lucide-react";
import { ChatState, Msg, STATUS_FAILED, STATUS_SENT, displayName, isArchived, isGroup, isLowPriority, isPinned, labelsOf, nameOf, peopleCount, previewOf, readersOf, isBridgeBot } from "../core/types";
import { networkMeta } from "../core/emoji";
import { getSettings, useSettings, updateSettings, AppSettings, ChatNotifPrefs } from "../core/settings";
import {
  edit, enableEncryption, endPoll, forward as _forward, loadOlder, markRead, markUnread, me, members, muteLeft, mediaUrl, pin, react, remind, remove, rename, schedule, send, sendContact, sendFile, sendGif,
  sendLocation, sendPoll, sendSticker, setDraft, setLowPriority, setMuted, setTag, snooze, leave, saveAsSticker, toggleStar, typing, useStore, votePoll, getState,
} from "../core/store";
import { SOUNDS, playSound } from "../core/sounds";
import { Avatar, EmojiPicker, TypingDots, IconButton, Modal, Select, SheetItem, Switch, WhenModal, humanSize, useMxc } from "./common";
import { MessageRow } from "./Message";
import { Effects } from "./Effects";
import { AttachKind, AttachMenu, ContactModal, GifModal, PollModal, StickerModal } from "./Attach";
import { firstUrl } from "./rich";
import type { Nav } from "./Sidebar";

const dayLabel = (d: Date) => {
  const t = new Date(); const y = new Date(); y.setDate(t.getDate() - 1);
  return d.toDateString() === t.toDateString() ? "Today" : d.toDateString() === y.toDateString() ? "Yesterday" : d.toLocaleDateString([], { weekday: "long", month: "short", day: "numeric", year: d.getFullYear() === t.getFullYear() ? undefined : "numeric" });
};

type Item = { kind: "day"; key: string; label: string } | { kind: "unread"; key: string } | { kind: "msg"; key: string; msg: Msg; index: number; first: boolean; last: boolean };
function buildItems(messages: Msg[], unreadBefore: string | undefined, gapMs: number): Item[] {
  const out: Item[] = []; let lastDay = "";
  messages.forEach((m, i) => {
    const d = new Date(m.ts), k = d.toDateString();
    if (k !== lastDay) { out.push({ kind: "day", key: `day-${k}`, label: dayLabel(d) }); lastDay = k; }
    if (m.id === unreadBefore) out.push({ kind: "unread", key: "unread" });
    const prev = messages[i - 1], next = messages[i + 1], before = out[out.length - 1];
    const first = !prev || prev.sender !== m.sender || m.ts - prev.ts > gapMs || before.kind !== "msg";
    const last = !next || next.sender !== m.sender || next.ts - m.ts > gapMs || new Date(next.ts).toDateString() !== k || next.id === unreadBefore;
    out.push({ kind: "msg", key: m.id, msg: m, index: i, first, last });
  });
  return out;
}

const notifSummary = (p?: ChatNotifPrefs) => !p || ((!p.level || p.level === "default") && (!p.mode || p.mode === "default") && (!p.sound || p.sound === "default") && (!p.preview || p.preview === "default")) ? "Default"
  : [p.level === "priority" ? "Priority" : p.level === "silent" ? "Silent" : "", p.mode && p.mode !== "default" ? { all: "Every message", mentions: "Mentions only", none: "Off" }[p.mode] : "", p.sound === "off" ? "Silent" : "", p.preview === "hide" ? "Hidden previews" : p.preview === "show" ? "Shown previews" : ""].filter(Boolean).join(" · ");
/** "Billy · WhatsApp": who you are writing to and on which service. */
const placeholderName = (chat: ChatState) => `${displayName(chat, me()).split(/\s+/)[0] || "chat"} · ${networkMeta(chat.network).label}`;
const fullTime = (ts: number) => new Date(ts).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });

export function Chat({ roomId, onBack, nav, onForward }: { roomId: string; onBack: () => void; nav: Nav; onForward: (m: Msg) => void }) {
  const chat = useStore((s) => s.chats[roomId]);
  const stars = useStore((s) => s.stars);
  const st = useSettings();
  const user = me();
  const scroller = useRef<HTMLDivElement>(null);
  const [infoOpen, setInfoOpen] = useState(false); // the info panel stays out of the way until you ask for it
  const [menu, setMenu] = useState<{ msg: Msg; x: number; y: number }>();
  const [viewer, setViewer] = useState<string>();
  const [picker, setPicker] = useState<Msg>();
  const [who, setWho] = useState<{ msg: Msg; key: string }>();
  const [details, setDetails] = useState<Msg>();
  const [replyTo, setReplyTo] = useState<Msg>();
  const [editing, setEditing] = useState<Msg>();
  const [dragging, setDragging] = useState(false);
  const [confirmDel, setConfirmDel] = useState<Msg>();

  const messages = chat?.messages ?? [];
  const byId = useMemo(() => new Map(messages.map((m) => [m.id, m])), [messages]);
  const images = useMemo(() => messages.filter((m) => m.type === "m.image" && m.mxc && !m.sticker), [messages]);
  // Read = a person read it. Delivered = the bridge says it reached the other network (its bot sends that receipt).
  const readIndex = useMemo(() => {
    const r = chat?.receipts ?? {};
    return Math.max(-1, ...Object.entries(r).filter(([u]) => u !== user && !isBridgeBot(u)).map(([, id]) => messages.findIndex((m) => m.id === id)));
  }, [chat?.receipts, messages, user]);
  const deliveredIndex = useMemo(() => {
    const r = chat?.receipts ?? {};
    return Math.max(-1, ...Object.entries(r).filter(([u]) => isBridgeBot(u)).map(([, id]) => messages.findIndex((m) => m.id === id)));
  }, [chat?.receipts, messages]);
  const group = chat ? isGroup(chat) || new Set(messages.map((m) => m.sender)).size > 2 : false;

  // Where the unread messages begin; computed once when the chat opens.
  const unreadBefore = useMemo(() => {
    if (!chat) return undefined;
    const read = chat.receipts[user];
    const i = read ? chat.messages.findIndex((m) => m.id === read) : -1;
    const fresh = i >= 0 ? chat.messages.slice(i + 1) : chat.unread > 0 ? chat.messages.slice(-chat.unread) : [];
    return fresh.find((m) => m.sender !== user)?.id;
  }, [roomId, chat != null]); // eslint-disable-line react-hooks/exhaustive-deps
  const items = useMemo(() => buildItems(messages, unreadBefore, st.groupGapMin * 60_000), [messages, unreadBefore, st.groupGapMin]);

  // Scroll: open at the unread divider (or bottom), stick to bottom for new messages, keep position when older ones load.
  const opened = useRef<string>("");
  const stick = useRef(true);
  const prevTop = useRef<{ first?: string; height: number }>({ height: 0 });
  useLayoutEffect(() => {
    const el = scroller.current; if (!el || !chat) return;
    if (opened.current !== roomId) {
      opened.current = roomId;
      const div = st.openAtFirstUnread ? el.querySelector("#unread-divider") : null;
      if (div) { (div as HTMLElement).scrollIntoView({ block: "center" }); stick.current = false; } else { el.scrollTop = el.scrollHeight; stick.current = true; }
    } else if (prevTop.current.first && messages[0]?.id !== prevTop.current.first && !stick.current) {
      el.scrollTop += el.scrollHeight - prevTop.current.height; // older messages were prepended
    } else if (stick.current || messages[messages.length - 1]?.sender === user) {
      el.scrollTop = el.scrollHeight;
    }
    prevTop.current = { first: messages[0]?.id, height: el.scrollHeight };
  }, [roomId, messages, chat != null]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { opened.current = ""; stick.current = true; setReplyTo(undefined); setEditing(undefined); }, [roomId]);
  const mayMark = () => st.markReadMode === "open" || (st.markReadMode === "scrolled" && stick.current && document.hasFocus());
  useEffect(() => { if (mayMark()) markRead(roomId); }, [roomId, messages.length, st.markReadMode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { const f = () => mayMark() && markRead(roomId); window.addEventListener("focus", f); return () => window.removeEventListener("focus", f); }, [roomId, st.markReadMode]); // eslint-disable-line react-hooks/exhaustive-deps

  const onScroll = () => {
    const el = scroller.current; if (!el) return;
    stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (stick.current && st.markReadMode === "scrolled") markRead(roomId);
    if (el.scrollTop < 120) loadOlder(roomId);
  };
  useEffect(() => { const el = scroller.current; if (el && el.scrollHeight <= el.clientHeight + 40) loadOlder(roomId); }, [roomId, messages.length]);
  const [showJump, setShowJump] = useState(false);
  useEffect(() => { const el = scroller.current; if (!el) return; const f = () => setShowJump(el.scrollHeight - el.scrollTop - el.clientHeight > 400); el.addEventListener("scroll", f); return () => el.removeEventListener("scroll", f); }, [roomId]);

  const openMsg = useCallback((m: Msg) => {
    if (m.type === "m.location" && m.geo) { const [lat, lon] = m.geo.replace("geo:", "").split(";")[0].split(","); window.open(`https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=16/${lat}/${lon}`, "_blank", "noopener"); }
    else if (m.type === "m.image" && m.mxc && !m.sticker) setViewer(m.id);
    else if ((m.type === "m.file" || m.type === "m.video") && m.mxc) void download(m);
  }, []);

  // When someone starts typing and you are at the bottom, bring the dots into view.
  const typingCount = chat?.typing.length ?? 0;
  useEffect(() => {
    const el = scroller.current;
    if (el && typingCount && el.scrollHeight - el.scrollTop - el.clientHeight < 160) el.scrollTo({ top: el.scrollHeight });
  }, [typingCount]);

  if (!chat) return <section className="chat"><header className="chat-head"><IconButton icon={ArrowLeft} label="Back" onClick={onBack} className="back" /><div>Opening…</div></header></section>;
  const name = displayName(chat, user);
  const meta = networkMeta(chat.network);
  const typingNames = chat.typing.map((u) => nameOf(chat, u));
  const attachFiles = (files: FileList | File[]) => Array.from(files).forEach((f) => sendFile(roomId, f));

  return (
    <section className={"chat" + (infoOpen ? " with-info" : "")} onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)} onDrop={(e) => { e.preventDefault(); setDragging(false); attachFiles(e.dataTransfer.files); }}>
      <div className="chat-col">
        <Effects key={chat.id} messages={messages} />
        <header className="chat-head">
          <IconButton icon={ArrowLeft} label="Back" onClick={onBack} className="back" />
          <button className="head-id" onClick={() => setInfoOpen(!infoOpen)}>
            {st.showAvatars && <Avatar name={name} mxc={chat.avatarMxc} size={40} network={st.showNetworkBadges ? chat.network : undefined} />}
            <div>
              <div className="chat-title">{name}</div>
              {<div className="chat-sub"><i style={{ background: meta.color }} />{meta.label}{chat.encrypted ? <span className="enc-badge" title="End-to-end encrypted"> · <Lock size={11} /> Encrypted</span> : null}{isGroup(chat) ? ` · ${peopleCount(chat)} members` : ""}</div>}
            </div>
          </button>
          <IconButton icon={Search} label="Search in page (Ctrl+F)" onClick={() => nav(`search:${roomId}`)} />
          <IconButton icon={Info} label="Page info" onClick={() => setInfoOpen(!infoOpen)} active={infoOpen} />
        </header>

        <div className={"timeline wp-" + st.wallpaper} ref={scroller} onScroll={onScroll}>
          {items.map((it) => it.kind === "day" ? <div key={it.key} className="day"><span>{it.label}</span></div>
            : it.kind === "unread" ? <div key={it.key} id="unread-divider" className="unread-divider"><span>New messages</span></div>
            : <MessageRow key={it.key} chat={chat} msg={it.msg} first={it.first} last={it.last} group={group} mine={it.msg.sender === user} read={it.index <= readIndex} delivered={it.index <= deliveredIndex} reply={it.msg.replyTo ? byId.get(it.msg.replyTo) : undefined}
                st={st} starred={stars.some((s) => s.eventId === it.msg.id)} onMenu={(x, y) => setMenu({ msg: it.msg, x, y })} onOpen={() => openMsg(it.msg)} onWho={(key) => setWho({ msg: it.msg, key })}
                onReact={(key) => react(roomId, it.msg.id, key)} onReply={() => { setReplyTo(it.msg); setEditing(undefined); }}
                onVote={(ids) => votePoll(roomId, it.msg.id, ids)} onEndPoll={() => endPoll(roomId, it.msg.id)} />)}
          {typingNames.length > 0 && (
            <div className="msg typing-row" aria-live="polite">
              {group && <div className="msg-sender">{typingNames.join(", ")}</div>}
              <div className="msg-line"><div className="bubble typing-bubble" aria-label={`${typingNames.join(", ")} typing`}><TypingDots /></div></div>
            </div>
          )}
        </div>
        {showJump && <button className="jump" onClick={() => scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: st.reduceMotion ? "auto" : "smooth" })} aria-label="Jump to latest"><ChevronDown size={20} /></button>}

        <Composer roomId={roomId} chat={chat} replyTo={replyTo} editing={editing} st={st} group={group} nav={nav} onClearReply={() => setReplyTo(undefined)} onClearEdit={() => setEditing(undefined)} onFiles={attachFiles} />
        {dragging && <div className="drop-hint">Drop to send</div>}
      </div>

      {infoOpen && <InfoPanel chat={chat} nav={nav} onClose={() => setInfoOpen(false)} onViewImage={setViewer} />}

      {menu && (
        <div className="ctx-backdrop" onClick={() => setMenu(undefined)} onContextMenu={(e) => { e.preventDefault(); setMenu(undefined); }}>
          <div className="menu ctx msg-menu" style={{ left: Math.max(8, Math.min(menu.x, window.innerWidth - 290)), top: Math.max(8, Math.min(menu.y, window.innerHeight - 440)) }} onClick={(e) => e.stopPropagation()}>
            <div className="quick">
              {st.quickReactions.map((e) => <button key={e} onClick={() => { react(roomId, menu.msg.id, e); setMenu(undefined); }}>{e}</button>)}
              <button className="more" onClick={() => { setPicker(menu.msg); setMenu(undefined); }} aria-label="More reactions"><Plus size={18} /></button>
            </div>
            <MenuItems roomId={roomId} m={menu.msg} mine={menu.msg.sender === user} starred={stars.some((s) => s.eventId === menu.msg.id)} dev={st.developerMode} close={() => setMenu(undefined)}
              onReply={() => { setReplyTo(menu.msg); setEditing(undefined); }} onEdit={() => { setEditing(menu.msg); setReplyTo(undefined); }} onForward={() => onForward(menu.msg)}
              onDetails={() => setDetails(menu.msg)} onDelete={() => (st.confirmDelete ? setConfirmDel(menu.msg) : remove(roomId, menu.msg.id))} />
          </div>
        </div>
      )}
      {picker && <EmojiPicker recent={st.recentEmoji} onPick={(e) => { react(roomId, picker.id, e); setPicker(undefined); }} onClose={() => setPicker(undefined)} />}
      {who && (
        <Modal title={`${who.key}  ${chat.reactions[who.msg.id]?.[who.key]?.length ?? 0}`} onClose={() => setWho(undefined)}>
          <div className="stack">{(chat.reactions[who.msg.id]?.[who.key] ?? []).map((u) => <div key={u} className="who"><Avatar name={nameOf(chat, u)} size={32} />{u === user ? "You" : nameOf(chat, u)}</div>)}</div>
          {chat.reactions[who.msg.id]?.[who.key]?.includes(user) && <button className="link" onClick={() => { react(roomId, who.msg.id, who.key); setWho(undefined); }}>Remove my reaction</button>}
        </Modal>
      )}
      {details && (
        <Modal title="Message details" onClose={() => setDetails(undefined)}>
          <dl className="details">
            <dt>From</dt><dd>{nameOf(chat, details.sender)}</dd><dt>Sent</dt><dd>{fullTime(details.ts)}</dd>{details.edited ? <><dt>Edited</dt><dd>Yes</dd></> : null}<dt>Type</dt><dd>{details.type}</dd>
            <dt>Status</dt><dd>{details.status === STATUS_SENT ? "Sent" : details.status === STATUS_FAILED ? "Failed" : "Sending"}</dd>{details.size ? <><dt>Size</dt><dd>{humanSize(details.size)}</dd></> : null}
            {details.sender === user && details.status === STATUS_SENT && (() => {
              const readers = readersOf(chat, details.id, user);
              return readers.length
                ? <><dt>Read</dt><dd>{readers.map((r) => <div key={r.user}>{nameOf(chat, r.user)}{r.ts ? ` · ${fullTime(r.ts)}` : ""}</div>)}</dd></>
                : <><dt>Read</dt><dd>Not yet</dd></>;
            })()}
            {details.sender === user && chat.network !== "matrix" && <><dt>Delivery</dt><dd className="muted">{networkMeta(chat.network).label} doesn't report delivery through the bridge. Pager shows when someone has read it.</dd></>}
            {st.developerMode && <><dt>Event ID</dt><dd className="mono">{details.id}</dd></>}
          </dl>
        </Modal>
      )}
      {confirmDel && (
        <Modal title="Delete message?" onClose={() => setConfirmDel(undefined)}>
          <p className="muted">It will be removed for everyone in the page where the network allows it.</p>
          <div className="row-end"><button className="link" onClick={() => setConfirmDel(undefined)}>Cancel</button><button className="primary danger" onClick={() => { remove(roomId, confirmDel.id); setConfirmDel(undefined); }}>Delete</button></div>
        </Modal>
      )}
      {viewer && <ImageViewer images={images} startId={viewer} chat={chat} onClose={() => setViewer(undefined)} />}
    </section>
  );
}

async function openInTab(m: Msg) {
  if (!m.mxc) return;
  const u = await mediaUrl(m.mxc); if (u) window.open(u, "_blank", "noopener");
}

async function copyImage(m: Msg) {
  if (!m.mxc) return;
  try {
    const u = await mediaUrl(m.mxc); if (!u) return;
    const blob = await (await fetch(u)).blob();
    // The clipboard only takes PNG, so convert other formats through a canvas.
    const png = blob.type === "image/png" ? blob : await new Promise<Blob>((res, rej) => {
      const img = new Image(); img.onload = () => { const c = document.createElement("canvas"); c.width = img.naturalWidth; c.height = img.naturalHeight; c.getContext("2d")!.drawImage(img, 0, 0); c.toBlob((b) => (b ? res(b) : rej(new Error("no image"))), "image/png"); }; img.onerror = rej; img.src = u;
    });
    await navigator.clipboard.write([new ClipboardItem({ "image/png": png })]);
  } catch { /* the browser refused; nothing to copy */ }
}

async function download(m: Msg) {
  if (!m.mxc) return;
  const u = await mediaUrl(m.mxc); if (!u) return;
  const a = document.createElement("a"); a.href = u; a.download = m.body || "file"; a.click();
}

function MenuItems({ roomId, m, mine, starred, dev, close, onReply, onEdit, onForward, onDelete, onDetails }: { roomId: string; m: Msg; mine: boolean; starred: boolean; dev: boolean; close: () => void; onReply: () => void; onEdit: () => void; onForward: () => void; onDelete: () => void; onDetails: () => void }) {
  const run = (f: () => void) => () => { f(); close(); };
  const Item = ({ icon: I, label, f, danger }: { icon: React.ComponentType<{ size?: number }>; label: string; f: () => void; danger?: boolean }) => <button className={danger ? "danger" : ""} onClick={run(f)}><I size={18} />{label}</button>;
  return (
    <>
      <Item icon={Reply} label="Reply" f={onReply} />
      <Item icon={Forward} label="Forward" f={onForward} />
      {["m.text", "m.notice", "m.emote"].includes(m.type) && <Item icon={Copy} label="Copy text" f={() => void navigator.clipboard.writeText(m.body)} />}
      <Item icon={Star} label={starred ? "Remove star" : "Star"} f={() => toggleStar(roomId, m)} />
      {m.mxc && !["m.text", "m.notice", "m.emote"].includes(m.type) && <Item icon={Download} label="Save" f={() => void download(m)} />}
      {m.mxc && m.type !== "m.file" && <Item icon={ExternalLink} label="Open in new tab" f={() => void openInTab(m)} />}
      {m.type === "m.image" && m.mxc && <Item icon={Copy} label="Copy image" f={() => void copyImage(m)} />}
      {typeof navigator.share === "function" && ["m.text", "m.notice", "m.emote"].includes(m.type) && <Item icon={Share2} label="Share text" f={() => void navigator.share({ text: m.body }).catch(() => {})} />}
      {m.type === "m.image" && m.mxc && <Item icon={Smile} label="Save as sticker" f={() => void saveAsSticker(m)} />}
      {mine && m.type === "m.text" && m.status === STATUS_SENT && <Item icon={Pencil} label="Edit" f={onEdit} />}
      <Item icon={Info} label="Details" f={onDetails} />
      {dev && <Item icon={Code2} label="Copy event ID" f={() => void navigator.clipboard.writeText(m.id)} />}
      {mine && m.status === STATUS_SENT && <Item icon={Trash2} label="Delete" f={onDelete} danger />}
    </>
  );
}

// ---- Composer ----------------------------------------------------------------------------------------

function Composer({ roomId, chat, replyTo, editing, st, group, nav, onClearReply, onClearEdit, onFiles }: {
  roomId: string; chat: ChatState; replyTo?: Msg; editing?: Msg; st: AppSettings; group: boolean; nav: Nav; onClearReply: () => void; onClearEdit: () => void; onFiles: (f: File[]) => void;
}) {
  const [text, setText] = useState(() => getState().drafts[roomId] ?? "");
  const [attach, setAttach] = useState(false);
  const [sheet, setSheet] = useState<AttachKind>();
  const [emoji, setEmoji] = useState(false);
  const [later, setLater] = useState(false);
  const [error, setError] = useState<string>();
  const [rec, setRec] = useState<{ ms: number } | null>(null);
  const mentionIds = useRef(new Map<string, string>());
  const ta = useRef<HTMLTextAreaElement>(null);
  const files = useRef<HTMLInputElement>(null);
  const photos = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const recorder = useRef<{ mr: MediaRecorder; stream: MediaStream; cancel?: boolean } | undefined>(undefined);
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
  useLayoutEffect(() => { const el = ta.current; if (el) { el.style.height = "auto"; el.style.height = `${Math.min(el.scrollHeight + 2, 168)}px`; } }, [text]);

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
      recorder.current = { mr, stream }; setRec({ ms: 0 }); mr.start();
    } catch { setError("Couldn't access the microphone."); }
  }
  const stopRec = (cancel: boolean) => { const r = recorder.current; if (!r) return; r.cancel = cancel; r.mr.stop(); };

  const where = () => navigator.geolocation?.getCurrentPosition((p) => sendLocation(roomId, p.coords.latitude, p.coords.longitude), () => setError("Couldn't get your location."), { timeout: 10000 });
  const pick = (k: AttachKind) => {
    setAttach(false);
    if (k === "photos") photos.current?.click();
    else if (k === "camera") camera.current?.click();
    else if (k === "file") files.current?.click();
    else if (k === "emoji") setEmoji(true);
    else if (k === "location") where();
    else setSheet(k);
  };
  const hasText = text.trim().length > 0;
  const input = (ref: React.RefObject<HTMLInputElement | null>, accept?: string, capture?: boolean) => (
    <input ref={ref} type="file" multiple={!capture} accept={accept} {...(capture ? { capture: "environment" } : {})} hidden onChange={(e) => { if (e.target.files) onFiles(Array.from(e.target.files)); e.target.value = ""; }} />
  );

  return (
    <div className="composer-wrap">
      {replyTo && <div className="banner-bar"><div><b>Replying to {nameOf(chat, replyTo.sender)}</b><span>{previewOf(replyTo)}</span></div><IconButton icon={X} label="Dismiss" onClick={onClearReply} /></div>}
      {editing && <div className="banner-bar"><div><b>Editing message</b><span>{editing.body}</span></div><IconButton icon={X} label="Dismiss" onClick={() => { onClearEdit(); setText(""); }} /></div>}
      {people.length > 0 && <div className="mentions">{people.map(([id, n]) => <button key={id} onClick={() => { setText(text.slice(0, text.length - token!.length - 1) + `@${n} `); mentionIds.current.set(n, id); ta.current?.focus(); }}><Avatar name={n} size={22} />@{n}</button>)}</div>}
      {error && <div className="error pad" onClick={() => setError(undefined)}>{error}</div>}
      {input(files)}{input(photos, "image/*,video/*")}{input(camera, "image/*", true)}
      {rec ? (
        <div className="composer rec"><IconButton icon={Trash2} label="Cancel recording" onClick={() => stopRec(true)} /><i className="rec-dot" /><span className="grow">Recording {Math.floor(rec.ms / 60000)}:{String(Math.floor(rec.ms / 1000) % 60).padStart(2, "0")}</span><button className="send" onClick={() => stopRec(false)} aria-label="Send voice message"><Send size={18} /></button></div>
      ) : (
        <form className="composer" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          <div className="menu-wrap">
            <IconButton icon={Plus} label="Attach" onClick={() => setAttach(!attach)} active={attach} className="plus" />
            {attach && <AttachMenu onPick={pick} onClose={() => setAttach(false)} />}
          </div>
          <div className="field">
            <textarea ref={ta} rows={1} placeholder={`Message ${placeholderName(chat)}`} value={text} onChange={(e) => setText(e.target.value)} onKeyDown={sendKey} spellCheck
              onPaste={(e) => { const fs = Array.from(e.clipboardData.files); if (fs.length) { e.preventDefault(); onFiles(fs); } }} />
            <IconButton icon={Smile} label="Emoji" onClick={() => setEmoji(true)} />
          </div>
          {hasText ? (
            <div className="send-group">
              <button className="send" aria-label="Send"><Send size={18} /></button>
              {!editing && <button type="button" className="send-more" onClick={() => setLater(true)} title="Send later" aria-label="Send later"><ChevronDown size={16} /></button>}
            </div>
          ) : <button type="button" className="send" onClick={startRec} aria-label="Record voice message" title="Record voice message"><Mic size={18} /></button>}
        </form>
      )}
      {emoji && <EmojiPicker recent={st.recentEmoji} onPick={(e) => { setText(text + e); setEmoji(false); ta.current?.focus(); }} onClose={() => setEmoji(false)} />}
      {sheet === "gif" && <GifModal onPick={(g) => { void sendGif(roomId, g).catch((e) => setError(e.message)); setSheet(undefined); }} onSettings={() => { setSheet(undefined); nav("settings/media"); }} onClose={() => setSheet(undefined)} />}
      {sheet === "stickers" && <StickerModal roomId={roomId} onPick={(s) => { sendSticker(roomId, s); setSheet(undefined); }} onClose={() => setSheet(undefined)} />}
      {sheet === "poll" && <PollModal onCreate={(q, a, max, disclosed) => { sendPoll(roomId, q, a, max, disclosed); setSheet(undefined); }} onClose={() => setSheet(undefined)} />}
      {sheet === "contact" && <ContactModal onSend={(n, p) => { sendContact(roomId, n, p); setSheet(undefined); }} onClose={() => setSheet(undefined)} />}
      {later && <WhenModal title="Send later" onClose={() => setLater(false)} onPick={async (at) => { setLater(false); const err = await schedule(roomId, text.trim(), Math.max(5000, at - Date.now())); if (err) setError(err); else { setText(""); onClearReply(); } }} />}
    </div>
  );
}

// ---- Photo viewer --------------------------------------------------------------------------------------

function ImageViewer({ images, startId, chat, onClose }: { images: Msg[]; startId: string; chat: ChatState; onClose: () => void }) {
  const [i, setI] = useState(Math.max(0, images.findIndex((m) => m.id === startId)));
  const [zoom, setZoom] = useState(false);
  const m = images[i];
  const src = useMxc(m?.mxc, 0);
  const step = (d: number) => { setI((x) => Math.min(images.length - 1, Math.max(0, x + d))); setZoom(false); };
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); else if (e.key === "ArrowLeft") step(-1); else if (e.key === "ArrowRight") step(1); };
    window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h);
  }, [images.length]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!m) return null;
  return (
    <div className="viewer" onClick={onClose}>
      <div className="viewer-top" onClick={(e) => e.stopPropagation()}>
        <IconButton icon={X} label="Close" onClick={onClose} />
        <div><b>{nameOf(chat, m.sender)}</b><small>{i + 1} of {images.length} · {new Date(m.ts).toLocaleString()}</small></div>
        <span className="grow" />
        <IconButton icon={Download} label="Download" onClick={() => void download(m)} />
      </div>
      {i > 0 && <button className="nav-arrow left" onClick={(e) => { e.stopPropagation(); step(-1); }} aria-label="Previous"><ChevronLeft size={28} /></button>}
      {i < images.length - 1 && <button className="nav-arrow right" onClick={(e) => { e.stopPropagation(); step(1); }} aria-label="Next"><ChevronRight size={28} /></button>}
      <div className="viewer-stage">{src ? <img src={src} alt={m.body} className={zoom ? "zoom" : ""} onClick={(e) => { e.stopPropagation(); setZoom(!zoom); }} /> : <p>Loading…</p>}</div>
    </div>
  );
}

// ---- Info drawer ----------------------------------------------------------------------------------------

function InfoPanel({ chat, nav, onClose, onViewImage }: { chat: ChatState; nav: Nav; onClose: () => void; onViewImage: (id: string) => void }) {
  const user = me();
  const muted = useStore((s) => s.muted.includes(chat.id));
  const [list, setList] = useState<Record<string, string>>();
  const [muteDlg, setMuteDlg] = useState(false);
  const [when, setWhen] = useState<"remind" | "snooze">();
  const [encDlg, setEncDlg] = useState(false);
  const [confirmLeave, setConfirmLeave] = useState(false);
  const [notifDlg, setNotifDlg] = useState(false);
  const st = useSettings();
  const [tab, setTab] = useState<"photos" | "links" | "files">("photos");
  useEffect(() => { void members(chat.id).then(setList); }, [chat.id]);
  const name = displayName(chat, user);
  const photos = useMemo(() => chat.messages.filter((m) => m.type === "m.image" && m.mxc && !m.sticker).reverse(), [chat.messages]);
  const links = useMemo(() => chat.messages.flatMap((m) => { const u = firstUrl(m.body); return u ? [{ m, u }] : []; }).reverse(), [chat.messages]);
  const files = useMemo(() => chat.messages.filter((m) => ["m.file", "m.audio", "m.video"].includes(m.type)).reverse(), [chat.messages]);
  const left = muted ? muteLeft(chat.id) : undefined;
  const labels = labelsOf(chat);
  return (
    <aside className="info">
      <header><b>Page info</b><IconButton icon={X} label="Close" onClick={onClose} /></header>
      <div className="info-body">
        <div className="info-id"><Avatar name={name} mxc={chat.avatarMxc} size={88} network={chat.network} /><h3>{name}</h3><small>{networkMeta(chat.network).label}{isGroup(chat) ? ` · ${peopleCount(chat)} members` : ""}</small>
          {isGroup(chat) && <button className="link" onClick={() => { const n = prompt("Rename group", chat.name); if (n?.trim()) rename(chat.id, n.trim()); }}>Rename group</button>}</div>
        <div className="quick-actions">
          <button onClick={() => nav(`search:${chat.id}`)}><span><Search size={20} /></span>Search</button>
          <button className={isPinned(chat) ? "on" : ""} onClick={() => pin(chat.id, !isPinned(chat))}><span><Pin size={20} /></span>{isPinned(chat) ? "Unpin" : "Pin"}</button>
          <button className={muted ? "on" : ""} onClick={() => (muted ? setMuted(chat.id, false) : setMuteDlg(true))}><span><BellOff size={20} /></span>{muted ? "Unmute" : "Mute"}</button>
          <button onClick={() => setWhen("remind")}><span><AlarmClock size={20} /></span>Remind</button>
        </div>
        <div className="group-card flat">
          <div className="toggle"><span>Low priority<small>Quiet, except @mentions and replies</small></span><Switch checked={isLowPriority(chat)} onChange={(v) => setLowPriority(chat.id, v)} /></div>
          <div className="toggle"><span>Archived</span><Switch checked={isArchived(chat)} onChange={(v) => setTag(chat.id, "u.archived", v)} /></div>
          <div className="toggle"><span>Marked unread</span><Switch checked={chat.markedUnread} onChange={(v) => markUnread(chat.id, v)} /></div>
          {muted && left && left > 0 && <small className="pad">Muted for {Math.ceil(left / 3.6e6)} more hour(s)</small>}
        </div>
        <SheetItem icon={Tag} label="Labels" hint={labels.length ? labels.join(", ") : "None"} onClick={() => nav(`settings/labels`)} />
        {!chat.encrypted && <SheetItem icon={Lock} label="Turn on encryption" hint="Messages from now on are end-to-end encrypted" onClick={() => setEncDlg(true)} />}
        {chat.encrypted && <SheetItem icon={Lock} label="Encrypted" hint="End-to-end encrypted. This can't be turned off" onClick={() => {}} />}
        <SheetItem icon={Bell} label="Notifications" hint={notifSummary(st.notifChat[chat.id])} onClick={() => setNotifDlg(true)} />
        <SheetItem icon={Hourglass} label="Snooze…" hint="Hide this page and bring it back later" onClick={() => setWhen("snooze")} />
        <div className="tabs flat">{(["photos", "links", "files"] as const).map((t) => <button key={t} className={"tab" + (tab === t ? " on" : "")} onClick={() => setTab(t)}>{t[0].toUpperCase() + t.slice(1)} {t === "photos" ? photos.length : t === "links" ? links.length : files.length}</button>)}</div>
        {tab === "photos" && (photos.length ? <div className="photo-grid">{photos.slice(0, 60).map((m) => <Thumb key={m.id} mxc={m.mxc!} onClick={() => onViewImage(m.id)} />)}</div> : <p className="muted pad">No photos loaded yet. Scroll up in the page to load more.</p>)}
        {tab === "links" && (links.length ? <ul className="plain">{links.slice(0, 40).map(({ m, u }) => <li key={m.id}><a className="list-btn col" href={u} target="_blank" rel="noreferrer noopener"><span className="clip"><Link2 size={14} /> {u}</span><small>{nameOf(chat, m.sender)} · {new Date(m.ts).toLocaleDateString()}</small></a></li>)}</ul> : <p className="muted pad">No links shared.</p>)}
        {tab === "files" && (files.length ? <ul className="plain">{files.slice(0, 40).map((m) => <li key={m.id}><button className="list-btn col" onClick={() => void download(m)}><span className="clip"><FileText size={14} /> {m.body || previewOf(m)}</span><small>{nameOf(chat, m.sender)}{m.size ? ` · ${humanSize(m.size)}` : ""}</small></button></li>)}</ul> : <p className="muted pad">No files shared.</p>)}
        <SheetItem icon={LogOut} label="Delete page" danger onClick={() => setConfirmLeave(true)} />
        <h4>Members{list ? ` (${Object.keys(list).length})` : ""}</h4>
        <ul className="plain">{Object.entries(list ?? chat.members).sort((a, b) => a[1].localeCompare(b[1])).map(([id, n]) => <li key={id} className="member"><Avatar name={n} size={34} /><div>{id === user ? `${n} (you)` : n}<small>{id}</small></div></li>)}</ul>
      </div>
      {muteDlg && <Modal title={`Mute ${name}`} onClose={() => setMuteDlg(false)}><div className="stack">{([["For 1 hour", 3.6e6], ["For 8 hours", 8 * 3.6e6], ["For 1 week", 7 * 864e5], ["Until I turn it back on", undefined]] as [string, number | undefined][]).map(([l, ms]) => <button key={l} className="row-btn" onClick={() => { setMuted(chat.id, true, ms); setMuteDlg(false); }}><b>{l}</b></button>)}</div></Modal>}
      {when && <WhenModal title={when === "snooze" ? "Snooze until" : `Remind me about ${name}`} onPick={(at) => { if (when === "snooze") snooze(chat.id, at); else remind(chat.id, at); setWhen(undefined); }} onClose={() => setWhen(undefined)} />}
      {notifDlg && (
        <Modal title={`Notifications for ${name}`} onClose={() => setNotifDlg(false)}>
          <div className="stack">
            {(() => {
              const p = st.notifChat[chat.id] ?? {};
              const set = (patch: Partial<ChatNotifPrefs>) => updateSettings({ notifChat: { ...st.notifChat, [chat.id]: { ...p, ...patch } } });
              return <>
                <Select title="Importance" value={p.level ?? "default"} options={[["default", "Default"], ["priority", "Priority: always gets through"], ["silent", "Silent: shown without sound"]]} onChange={(v) => set({ level: v })} />
                <Select title="Notify me about" value={p.mode ?? "default"} options={[["default", "Use my general settings"], ["all", "Every message"], ["mentions", "Mentions and replies only"], ["none", "Nothing"]]} onChange={(v) => set({ mode: v })} />
                <Select title="Sound" value={p.sound ?? "default"} options={[["default", "Use my general settings"], ["off", "Silent"]]} onChange={(v) => set({ sound: v })} />
                <Select title="Alert sound" value={p.soundId ?? "default"} options={[["default", "Use the app or network sound"], ...SOUNDS]} onChange={(v) => { set({ soundId: v }); if (v !== "default") playSound(v, st.notifSoundVolume); }} />
                <Select title="Message previews" value={p.preview ?? "default"} options={[["default", "Use my general settings"], ["show", "Show message"], ["hide", "Hide message"]]} onChange={(v) => set({ preview: v })} />
                <p className="muted">Mute and Low priority still apply: muted pages only notify for mentions, replies and your keywords.</p>
                <div className="row-end"><button className="link" onClick={() => { const { [chat.id]: _x, ...rest } = st.notifChat; updateSettings({ notifChat: rest }); }}>Reset</button><button className="primary" onClick={() => setNotifDlg(false)}>Done</button></div>
              </>;
            })()}
          </div>
        </Modal>
      )}
      {encDlg && <EnableEncryptionDialog roomId={chat.id} onClose={() => setEncDlg(false)} />}
      {confirmLeave && <Modal title="Delete this page?" onClose={() => setConfirmLeave(false)}><p className="muted">It will be removed from Pager. The conversation on {networkMeta(chat.network).label} isn't deleted, and it comes back if someone writes again.</p><div className="row-end"><button className="link" onClick={() => setConfirmLeave(false)}>Cancel</button><button className="primary danger" onClick={() => { leave(chat.id); nav("home"); }}>Delete</button></div></Modal>}
    </aside>
  );
}
function Thumb({ mxc, onClick }: { mxc: string; onClick: () => void }) { const s = useMxc(mxc, 200); return <button className="thumb" onClick={onClick}>{s && <img src={s} alt="" />}</button>; }

export { ImageIcon, Archive, ArrowDownToLine, MailOpen, _forward };

function EnableEncryptionDialog({ roomId, onClose }: { roomId: string; onClose: () => void }) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  return (
    <Modal title="Turn on encryption for this page?" onClose={onClose}>
      <p>From now on, messages in this page are end-to-end encrypted.</p>
      <p className="muted">Messages sent before stay readable on your server, as they were. Encryption can't be turned off again for this page. Make sure you've set up your recovery key first (Settings → Privacy → Encryption).</p>
      {err && <p className="error">{err}</p>}
      <div className="row-end"><button className="link" onClick={onClose}>Cancel</button>
        <button className="primary" disabled={busy} onClick={() => { setBusy(true); setErr(""); enableEncryption(roomId).then(onClose).catch((e) => { setErr(e.message); setBusy(false); }); }}>{busy ? "Turning on…" : "Turn on encryption"}</button></div>
    </Modal>
  );
}
