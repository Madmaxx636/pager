import { useEffect, useRef, useState } from "react";
import { AlertCircle, Check, CheckCheck, Clock, FileText, MapPin, Music, Pause, Play, Star, Video, UserRound, Mic } from "lucide-react";
import { ChatState, Msg, STATUS_FAILED, STATUS_SENDING, STATUS_SENT, nameOf, previewOf } from "../core/types";
import { isEmojiOnly } from "../core/format";
import { AppSettings } from "../core/settings";
import { LinkPreview } from "../core/api";
import { me, mediaUrl, preview, retry } from "../core/store";
import { Avatar, humanSize, useMxc } from "./common";
import { Html, Linkified, firstUrl } from "./rich";

const clock = (ts: number, mode: AppSettings["timeFormat"]) => new Date(ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", ...(mode === "system" ? {} : { hour12: mode === "12" }) });
const senderHue = (n: string) => [...n].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);

/**
 * Swipe a message to the right to reply to it: drag with a finger or pen, or swipe sideways with two fingers on a trackpad.
 * Returns props to spread on the row, how far along the swipe is (0 to 1) and applies the sideways shift itself.
 */
function useSwipeToReply(enabled: boolean, onReply: () => void) {
  const [dx, setDx] = useState(0);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
  const wheel = useRef({ sum: 0, at: 0, fired: false });
  const LIMIT = 64;
  const reset = () => { start.current = null; setDx(0); };
  if (!enabled) return { bind: {}, progress: 0 };
  return {
    progress: Math.min(1, dx / LIMIT),
    bind: {
      style: dx ? { transform: `translateX(${dx}px)` } : undefined,
      onPointerDown: (e: React.PointerEvent) => { if (e.pointerType !== "mouse") start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false }; },
      onPointerMove: (e: React.PointerEvent) => {
        const s = start.current; if (!s || s.id !== e.pointerId) return;
        const mx = e.clientX - s.x, my = e.clientY - s.y;
        if (!s.locked) { if (Math.abs(my) > 12 && Math.abs(my) > Math.abs(mx)) return reset(); if (mx > 10 && mx > Math.abs(my)) { s.locked = true; (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId); } else return; }
        setDx(Math.max(0, Math.min(LIMIT * 1.3, mx * 0.7)));
      },
      onPointerUp: () => { const fire = dx >= LIMIT * 0.9; reset(); if (fire) onReply(); },
      onPointerCancel: reset,
      onWheel: (e: React.WheelEvent) => {
        // Two-finger sideways swipe on a trackpad.
        if (Math.abs(e.deltaX) < Math.abs(e.deltaY) * 1.5) return;
        const w = wheel.current, now = Date.now();
        if (now - w.at > 350) { w.sum = 0; w.fired = false; }
        w.at = now; w.sum += -e.deltaX;
        setDx(Math.max(0, Math.min(LIMIT * 1.3, w.sum * 0.5)));
        if (w.sum > 140 && !w.fired) { w.fired = true; onReply(); }
        window.setTimeout(() => { if (Date.now() - w.at >= 300) setDx(0); }, 320);
      },
    },
  };
}

export function MessageRow({ chat, msg, first, last, group, mine, read, delivered, reply, st, starred, onMenu, onOpen, onWho, onReact, onReply, onVote, onEndPoll }: {
  chat: ChatState; msg: Msg; first: boolean; last: boolean; group: boolean; mine: boolean; read: boolean; delivered?: boolean; reply?: Msg; st: AppSettings; starred: boolean;
  onMenu: (x: number, y: number) => void; onOpen: () => void; onWho: (key: string) => void; onReact: (key: string) => void; onReply: () => void; onVote: (ids: string[]) => void; onEndPoll: () => void;
}) {
  const reactions = chat.reactions[msg.id] ?? {};
  const author = nameOf(chat, msg.sender);
  const big = st.largeEmoji && msg.type === "m.text" && !msg.html && isEmojiOnly(msg.body);
  const bare = !!msg.sticker || big;
  const tick = msg.status === STATUS_SENDING ? <Clock size={13} /> : msg.status === STATUS_FAILED ? <AlertCircle size={13} /> : read ? <CheckCheck size={14} /> : delivered ? <CheckCheck size={14} style={{ opacity: 0.55 }} /> : <Check size={14} style={{ opacity: 0.55 }} />;
  const swipe = useSwipeToReply(st.swipeToReply && msg.status === STATUS_SENT, onReply);
  return (
    <div className={"msg" + (mine ? " mine" : "") + (first ? " first" : "") + (last ? " last" : "") + (Date.now() - msg.ts < 4000 ? " fresh" : "")} data-id={msg.id}>
      {group && !mine && first && <div className="msg-sender" style={st.colorSenderNames ? { color: `hsl(${senderHue(author)} 60% 62%)` } : undefined}>{author}</div>}
      <div className="msg-line swipe-line" {...swipe.bind}>
        <span className="swipe-cue" style={{ opacity: swipe.progress, transform: `scale(${0.6 + 0.4 * swipe.progress})` }} aria-hidden>↩</span>
        <div className={"bubble" + (bare ? " bare" : "") + (msg.type === "m.image" && !msg.sticker ? " media-bubble" : "") + (msg.status === STATUS_FAILED ? " failed" : "")}
          onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
          onDoubleClick={() => st.doubleTapReact && st.quickReactions[0] && onReact(st.quickReactions[0])}
          onClick={() => (msg.status === STATUS_FAILED ? retry(chat.id, msg) : undefined)}>
          {msg.replyTo && <div className="quote"><b>{reply ? nameOf(chat, reply.sender) : "Earlier message"}</b><span>{reply ? previewOf(reply) : "…"}</span></div>}
          <Content msg={msg} chat={chat} st={st} big={big} onOpen={onOpen} onVote={onVote} onEndPoll={onEndPoll} />
          {last && !bare && (st.showMessageTimes || (mine && st.showReadTicks) || msg.edited) && (
            <div className="meta">
              {starred && <Star size={11} />}{msg.edited && <i>edited</i>}{st.showMessageTimes && <span>{clock(msg.ts, st.timeFormat)}</span>}
              {mine && st.showReadTicks && <span className={"ticks" + (read ? " read" : "")}>{tick}</span>}
            </div>
          )}
        </div>
        <div className="hover-tools">
          <button title="React" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}><span>☺</span></button>
          <button title="Reply" onClick={onReply}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg></button>
          <button title="More" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg></button>
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

function Content({ msg, chat, st, big, onOpen, onVote, onEndPoll }: { msg: Msg; chat: ChatState; st: AppSettings; big: boolean; onOpen: () => void; onVote: (ids: string[]) => void; onEndPoll: () => void }) {
  const auto = st.autoDownload === "always";
  const [tapped, setTapped] = useState(false);
  const allowed = auto || tapped || msg.status !== STATUS_SENT;
  const isGif = msg.mime === "image/gif" || msg.body.toLowerCase().endsWith(".gif");
  // GIFs animate only from the original file; thumbnails are still frames.
  const img = useMxc(msg.type === "m.image" ? msg.mxc : undefined, isGif && st.autoPlayGifs ? 0 : msg.sticker ? 320 : 640, allowed);
  const media = useMxc(msg.type === "m.audio" || msg.type === "m.video" ? msg.mxc : undefined, 0, allowed);
  const ratio = msg.w && msg.h ? Math.min(2, Math.max(0.5, msg.w / msg.h)) : 4 / 3;

  switch (msg.type) {
    case "m.poll": return <PollCard msg={msg} chat={chat} onVote={onVote} onEnd={onEndPoll} />;
    case "m.image":
      return img ? <div className="img-wrap"><img className={"media" + (msg.sticker ? " sticker" : "")} src={img} alt={msg.body} onClick={onOpen} />{isGif && !st.autoPlayGifs && <span className="gif-tag">GIF</span>}</div>
        : <div className="media placeholder" style={{ aspectRatio: String(ratio) }} onClick={() => setTapped(true)}>{msg.status === STATUS_SENDING ? "Sending…" : !allowed ? `Click to load${msg.size ? ` · ${humanSize(msg.size)}` : ""}` : ""}</div>;
    case "m.video":
      return media ? <video className="media" src={media} controls preload="metadata" /> : <FileChip icon={Video} title={msg.body || "Video"} sub={msg.size ? `${humanSize(msg.size)} · click to load` : undefined} onClick={() => setTapped(true)} />;
    case "m.audio":
      return media ? <audio src={media} controls preload="metadata" /> : <FileChip icon={msg.voice ? Mic : Music} title={msg.voice ? "Voice message" : msg.body} sub={msg.durationMs ? `${Math.floor(msg.durationMs / 60000)}:${String(Math.floor(msg.durationMs / 1000) % 60).padStart(2, "0")} · click to load` : "click to load"} onClick={() => setTapped(true)} />;
    case "m.file":
      return msg.mime?.includes("vcard") || msg.body.endsWith(".vcf") ? <ContactCard msg={msg} onOpen={onOpen} /> : <FileChip icon={FileText} title={msg.body || "File"} sub={msg.size ? humanSize(msg.size) : undefined} onClick={onOpen} />;
    case "m.location":
      return <div className="file" onClick={onOpen}><span className="file-ico red"><MapPin size={20} /></span><span>Shared location<small>{msg.geo?.replace("geo:", "")} · open map</small></span></div>;
    case "m.emote": return <em>* {nameOf(chat, msg.sender)} {msg.body}</em>;
    case "m.notice": return <span className="notice">{msg.html ? <Html html={msg.html} /> : <Linkified text={msg.body} />}</span>;
    default: {
      if (big) return <span className="big-emoji">{msg.body.trim()}</span>;
      const url = st.linkPreviews ? firstUrl(msg.body) : undefined;
      return <><span className="text">{msg.html ? <Html html={msg.html} /> : <Linkified text={msg.body} />}</span>{url && <LinkCard url={url} />}</>;
    }
  }
}

function FileChip({ icon: Icon, title, sub, onClick }: { icon: React.ComponentType<{ size?: number }>; title: string; sub?: string; onClick: () => void }) {
  return <div className="file" onClick={onClick}><span className="file-ico"><Icon size={20} /></span><span>{title}{sub && <small>{sub}</small>}</span></div>;
}

/** A shared contact (vCard). Name and number are read from the file once it loads. */
function ContactCard({ msg, onOpen }: { msg: Msg; onOpen: () => void }) {
  const [card, setCard] = useState<{ name: string; tel: string }>();
  useEffect(() => {
    let live = true;
    if (msg.mxc) void mediaUrl(msg.mxc).then(async (u) => {
      if (!u || !live) return;
      const text = await (await fetch(u)).text();
      if (live) setCard({ name: /^FN[^:]*:(.*)$/m.exec(text)?.[1]?.trim() ?? "", tel: /^TEL[^:]*:(.*)$/m.exec(text)?.[1]?.trim() ?? "" });
    });
    return () => { live = false; };
  }, [msg.mxc]);
  const name = card?.name || msg.body.replace(/\.vcf$/, "");
  return <div className="file contact" onClick={onOpen}><Avatar name={name} size={42} /><span><b>{name}</b>{card?.tel && <small>{card.tel}</small>}<small>Click to save contact</small></span><UserRound size={0} /></div>;
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

/** A poll: click an option to vote, see live results; creators can end it. */
function PollCard({ msg, chat, onVote, onEnd }: { msg: Msg; chat: ChatState; onVote: (ids: string[]) => void; onEnd: () => void }) {
  const poll = msg.poll!;
  const votes = chat.pollVotes[msg.id] ?? {};
  const ended = chat.pollEnded.includes(msg.id);
  const mineVotes = votes[me()] ?? [];
  const total = Object.values(votes).reduce((n, v) => n + v.length, 0);
  const show = poll.disclosed || ended;
  return (
    <div className="poll">
      <b>{poll.question}</b>
      <small>{ended ? "Poll ended" : poll.maxSelections > 1 ? `Select up to ${poll.maxSelections}` : "Select one"}</small>
      {poll.answers.map((a) => {
        const count = Object.values(votes).filter((v) => v.includes(a.id)).length, on = mineVotes.includes(a.id);
        return (
          <button key={a.id} className={"poll-opt" + (on ? " on" : "")} disabled={ended || msg.status !== STATUS_SENT}
            onClick={() => onVote(poll.maxSelections === 1 ? (on ? [] : [a.id]) : on ? mineVotes.filter((x) => x !== a.id) : mineVotes.length < poll.maxSelections ? [...mineVotes, a.id] : mineVotes)}>
            <i style={{ width: `${show && total ? (count / total) * 100 : 0}%` }} />
            <span className={"radio" + (poll.maxSelections > 1 ? " box" : "")}>{on && <Check size={12} />}</span>
            <span className="opt-text">{a.text}</span>{show && <span className="count">{count}</span>}
          </button>
        );
      })}
      <div className="poll-foot"><small>{show ? `${total} vote${total === 1 ? "" : "s"}` : "Results hidden until the poll ends"}</small>{!ended && msg.sender === me() && msg.status === STATUS_SENT && <button className="link" onClick={onEnd}>End poll</button>}</div>
    </div>
  );
}

export { Play, Pause };
