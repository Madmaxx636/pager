import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { VideoPlayer } from "./Video";
import { AlertCircle, Check, CheckCheck, Clock, FileText, MapPin, Music, Pause, Play, Star, UserRound, Mic } from "lucide-react";
import { ChatState, Msg, STATUS_FAILED, STATUS_SENDING, STATUS_SENT, nameOf, previewOf } from "../core/types";
import { isEmojiOnly } from "../core/format";
import { AppSettings, bubbleColorsFor, bubbleLook } from "../core/settings";
import { networkMeta } from "../core/emoji";
import { LinkPreview } from "../core/api";
import { me, mediaUrl, preview, retry } from "../core/store";
import { Avatar, humanSize, useMxc } from "./common";
import { transcribe, transcriptionAvailable, useTranscript } from "../core/transcribe";
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

/**
 * The sent, delivered and read marks. They look the same in every conversation: grey-ish while it is on its way, sky blue once it is read.
 * Only the lightness follows the bubble (light marks on a dark bubble, dark on a light one) so they can always be seen.
 */
function Ticks({ read, failed, children }: { read: boolean; failed: boolean; children: React.ReactNode }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [tone, setTone] = useState<"dark" | "light">("dark");
  useLayoutEffect(() => {
    const el = ref.current; if (!el) return;
    const bubble = el.closest(".bubble") as HTMLElement | null;
    let bg = bubble ? getComputedStyle(bubble).backgroundColor : "";
    if (!bg || /rgba\(.*,\s*0\)$/.test(bg) || bg === "transparent") bg = getComputedStyle(document.body).backgroundColor;
    const m = bg.match(/[\d.]+/g)?.map(Number) ?? [0, 0, 0];
    const lum = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) / 255;
    setTone(lum < 0.55 ? "dark" : "light");
  });
  return <span ref={ref} data-tone={tone} className={"ticks" + (read ? " read" : "") + (failed ? " failed" : "")}>{children}</span>;
}

export function MessageRow({ chat, msg, first, last, group, mine, read, delivered, latestMine, reply, st, starred, onMenu, onOpen, onWho, onReact, onReply, onVote, onEndPoll, onJump }: {
  chat: ChatState; msg: Msg; first: boolean; last: boolean; group: boolean; mine: boolean; read: boolean; delivered?: boolean; latestMine?: boolean; reply?: Msg; st: AppSettings; starred: boolean;
  onMenu: (x: number, y: number) => void; onOpen: () => void; onWho: (key: string) => void; onReact: (key: string) => void; onReply: () => void; onVote: (ids: string[]) => void; onEndPoll: () => void; onJump?: (id: string) => void;
}) {
  const reactions = chat.reactions[msg.id] ?? {};
  const author = nameOf(chat, msg.sender);
  const big = st.largeEmoji && msg.type === "m.text" && !msg.html && isEmojiOnly(msg.body);
  const bare = !!msg.sticker || big;
  const tick = msg.status === STATUS_SENDING ? <Clock size={13} /> : msg.status === STATUS_FAILED ? <AlertCircle size={13} /> : read ? <CheckCheck size={14} /> : delivered ? <CheckCheck size={14} /> : <Check size={14} />;
  const swipe = useSwipeToReply(st.swipeToReply && msg.status === STATUS_SENT, onReply);
  // Each side has its own shape, roundness, border and colours (set in Settings > Appearance > Message bubbles). A desktop style keeps its own look.
  const look = bubbleLook(st, mine);
  const skinned = !!window.pagerDesktop && st.skin !== "default";
  const dark = document.documentElement.dataset.theme !== "light";
  const col = bubbleColorsFor(st, mine, dark);
  const native = !mine && st.bubbleNative && !col.color ? networkMeta(chat.network).color : "";
  const bg = col.color || native;
  const ink = (c: string) => { const n = parseInt(c.slice(1), 16); const l = (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255; return l > 0.6 ? "#101418" : "#ffffff"; };
  const sideStyle: Record<string, string> = {};
  if (!skinned && look.radius > 0) { sideStyle["--radius"] = `${look.radius}px`; if (look.style !== "curved" && look.style !== "tail") sideStyle["--tight"] = `${Math.min(8, Math.round(look.radius / 3))}px`; }
  if (look.borderColor && /^#[0-9a-f]{6}$/i.test(look.borderColor)) sideStyle["--bc"] = look.borderColor;
  if (bg && /^#[0-9a-f]{6}$/i.test(bg)) { const t = col.text || ink(bg); if (mine) { sideStyle["--mine"] = bg; sideStyle["--mine-ink"] = t; } else { sideStyle["--bubble-theirs"] = bg; sideStyle["--theirs-ink"] = t; } }
  else if (col.text) { sideStyle[mine ? "--mine-ink" : "--theirs-ink"] = col.text; }
  return (
    <div className={"msg" + (mine ? " mine" : "") + (first ? " first" : "") + (last ? " last" : "") + (Date.now() - msg.ts < 4000 ? " fresh" : "")} data-id={msg.id}
      data-shape={skinned ? "round" : look.style} data-border={skinned || look.border === "none" ? undefined : look.border} data-colored={bg || col.text ? "" : undefined} style={Object.keys(sideStyle).length ? (sideStyle as React.CSSProperties) : undefined}>
      {group && !mine && first && <div className="msg-sender" style={st.colorSenderNames ? { color: `hsl(${senderHue(author)} 60% 62%)` } : undefined}>{author}</div>}
      {st.look === "hangouts" && !mine && first && <span className="msg-avatar"><Avatar name={author} mxc={group ? undefined : chat.avatarMxc} size={34} /></span>}
      <div className="msg-line swipe-line" {...swipe.bind}>
        <span className="swipe-cue" style={{ opacity: swipe.progress, transform: `scale(${0.6 + 0.4 * swipe.progress})` }} aria-hidden>↩</span>
        <div className={"bubble" + (bare ? " bare" : "") + (msg.type === "m.image" && !msg.sticker ? " media-bubble" : "") + (msg.status === STATUS_FAILED ? " failed" : "")}
          onContextMenu={(e) => { e.preventDefault(); onMenu(e.clientX, e.clientY); }}
          onDoubleClick={() => st.doubleTapReact && (st.doubleTapEmoji || st.quickReactions[0]) && onReact(st.doubleTapEmoji || st.quickReactions[0])}
          onClick={() => (msg.status === STATUS_FAILED ? retry(chat.id, msg) : undefined)}>
          {msg.replyTo && <div className="quote tappable" role="button" tabIndex={0} title="Go to that message" onClick={(e) => { e.stopPropagation(); onJump?.(msg.replyTo!); }} onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJump?.(msg.replyTo!); } }}><b>{reply ? nameOf(chat, reply.sender) : "Earlier message"}</b><span>{reply ? previewOf(reply) : "…"}</span></div>}
          <Content msg={msg} chat={chat} st={st} big={big} onOpen={onOpen} onVote={onVote} onEndPoll={onEndPoll} />
          {last && !bare && (st.showMessageTimes || (mine && st.showReadTicks) || msg.edited) && (
            <div className="meta">
              {starred && <Star size={11} />}{msg.edited && <i>edited</i>}{st.showMessageTimes && <span>{clock(msg.ts, st.timeFormat)}</span>}
              {mine && st.showReadTicks && <Ticks read={read} failed={msg.status === STATUS_FAILED}>{tick}</Ticks>}
            </div>
          )}
        </div>
        <div className="hover-tools">
          <button title="React" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}><span>☺</span></button>
          <button title="Reply" onClick={onReply}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 17 4 12l5-5" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></svg></button>
          <button title="More" onClick={(e) => { const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); onMenu(r.left, r.bottom); }}><svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="19" cy="12" r="1.6" /></svg></button>
        </div>
      </div>
      {st.look === "imessage" && mine && latestMine && msg.status === STATUS_SENT && st.showReadTicks && <div className="im-status">{read ? `Read${chat.receiptTs ? "" : ""}` : delivered ? "Delivered" : "Sent"}</div>}
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
  const media = useMxc(msg.type === "m.audio" ? msg.mxc : undefined, 0, allowed);
  const ratio = msg.w && msg.h ? Math.min(2, Math.max(0.5, msg.w / msg.h)) : 4 / 3;

  const main = ((): React.ReactNode => { switch (msg.type) {
    case "m.poll": return <PollCard msg={msg} chat={chat} onVote={onVote} onEnd={onEndPoll} />;
    case "m.image":
      return img ? <div className="img-wrap"><img className={"media" + (msg.sticker ? " sticker" : "")} src={img} alt={msg.body} onClick={onOpen} loading="lazy" decoding="async" />{isGif && !st.autoPlayGifs && <span className="gif-tag">GIF</span>}</div>
        : <div className="media placeholder" style={{ aspectRatio: String(ratio) }} onClick={() => setTapped(true)}>{msg.status === STATUS_SENDING ? "Sending…" : !allowed ? `Click to load${msg.size ? ` · ${humanSize(msg.size)}` : ""}` : ""}</div>;
    case "m.video":
      return <VideoPlayer msg={msg} st={st} allowed={allowed} onLoad={() => setTapped(true)} />;
    case "m.audio":
      return media ? <div className="audio-box"><audio src={media} controls preload="metadata" />{msg.voice && <Words id={msg.id} media={media} auto={st.autoTranscribe} />}</div> : <FileChip icon={msg.voice ? Mic : Music} title={msg.voice ? "Voice message" : msg.body} sub={msg.durationMs ? `${Math.floor(msg.durationMs / 60000)}:${String(Math.floor(msg.durationMs / 1000) % 60).padStart(2, "0")} · click to load` : "click to load"} onClick={() => setTapped(true)} />;
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
  } })();
  if (!msg.caption || !["m.image", "m.video", "m.audio", "m.file"].includes(msg.type)) return <>{main}</>;
  return <>{main}<div className="caption">{msg.captionHtml ? <Html html={msg.captionHtml} /> : <Linkified text={msg.caption} />}</div></>;
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

/** The words of a voice message, or a button to make them (when your server can). */
function Words({ id, media, auto }: { id: string; media: string; auto: boolean }) {
  const { text, state } = useTranscript(id);
  const [can, setCan] = useState(false);
  useEffect(() => { void transcriptionAvailable().then(setCan); }, []);
  useEffect(() => { if (can && auto && state === "idle") void transcribe(id, media); }, [can, auto, state, id, media]);
  if (text !== undefined) return <div className="words">{text}</div>;
  if (!can) return null;
  if (state === "busy") return <div className="words muted">Writing it out…</div>;
  return <button className="link words-btn" onClick={() => void transcribe(id, media)}>{state === "failed" ? "Couldn't write it out. Try again" : "Write it out"}</button>;
}
