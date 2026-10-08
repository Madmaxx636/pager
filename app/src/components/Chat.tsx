import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chatSummaries, fetchMedia, loadOlder, markRead, messagesOf, sendFile, sendMessage, useMatrixVersion, type Message } from "../matrix";
import { networkMeta } from "../networks";
import { Avatar } from "./Avatar";

function Media({ mxc, alt, kind }: { mxc: string; alt: string; kind: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    fetchMedia(mxc).then(setSrc).catch(() => {});
  }, [mxc]);
  if (!src) return <div className="media placeholder" />;
  if (kind === "m.video") return <video className="media" src={src} controls preload="metadata" />;
  if (kind === "m.audio") return <audio src={src} controls />;
  if (kind === "m.image") return <img className="media" src={src} alt={alt} />;
  return <a className="file" href={src} download={alt}>📎 {alt}</a>;
}

function Bubble({ m, first, group }: { m: Message; first: boolean; group: boolean }) {
  const time = new Date(m.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className={"msg" + (m.mine ? " mine" : "") + (first ? " first" : "")}>
      {group && !m.mine && first && <div className="msg-sender">{m.senderName}</div>}
      <div className="bubble" title={time}>
        {m.mxc && /^m\.(image|video|audio|file)$/.test(m.msgtype) ? <Media mxc={m.mxc} alt={m.body} kind={m.msgtype} /> : <span>{m.body}</span>}
      </div>
    </div>
  );
}

export function Chat({ roomId, onBack }: { roomId: string; onBack: () => void }) {
  useMatrixVersion();
  const chat = chatSummaries().find((c) => c.id === roomId);
  const messages = messagesOf(roomId);
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const stick = useRef(true);
  const fileInput = useRef<HTMLInputElement>(null);
  const [sending, setSending] = useState(false);
  const [failed, setFailed] = useState("");

  useEffect(() => {
    setText("");
    stick.current = true;
  }, [roomId]);
  useEffect(() => markRead(roomId), [roomId, messages.length]);
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stick.current) el.scrollTop = el.scrollHeight;
  }, [roomId, messages.length]);

  const isGroup = new Set(messages.map((m) => m.sender)).size > 2;
  const meta = chat ? networkMeta(chat.network) : null;

  async function send(e: React.FormEvent) {
    e.preventDefault();
    const body = text.trim();
    if (!body) return;
    setText("");
    stick.current = true;
    await sendMessage(roomId, body).catch(() => setText(body));
  }

  async function attach(files: FileList | File[] | null) {
    if (!files?.length) return;
    setSending(true);
    setFailed("");
    stick.current = true;
    try {
      for (const f of Array.from(files)) await sendFile(roomId, f);
    } catch {
      setFailed("Couldn't send that file.");
    }
    setSending(false);
  }

  return (
    <section className="chat" onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); attach(e.dataTransfer.files); }}>
      <header>
        <button className="icon back" onClick={onBack} aria-label="Back">‹</button>
        {chat && <Avatar name={chat.name} mxc={chat.avatarMxc} size={38} />}
        <div>
          <div className="chat-title">{chat?.name}</div>
          {meta && <div className="chat-sub"><i style={{ background: meta.color }} />{meta.label}</div>}
        </div>
      </header>

      <div
        className="timeline"
        ref={scroller}
        onScroll={(e) => {
          const el = e.currentTarget;
          stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
          if (el.scrollTop < 40) loadOlder(roomId);
        }}
      >
        {messages.map((m, i) => (
          <Bubble key={m.id} m={m} group={isGroup} first={messages[i - 1]?.sender !== m.sender} />
        ))}
      </div>

      {(sending || failed) && <div className={"upload-note" + (failed ? " error" : "")}>{failed || "Sending…"}</div>}
      <form className="composer" onSubmit={send}>
        <input ref={fileInput} type="file" multiple hidden onChange={(e) => { attach(e.target.files); e.target.value = ""; }} />
        <button type="button" className="icon attach" onClick={() => fileInput.current?.click()} aria-label="Attach file">📎</button>
        <textarea
          rows={1}
          placeholder="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = Array.from(e.clipboardData.files);
            if (files.length) { e.preventDefault(); attach(files); }
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
          }}
        />
        <button className="send" disabled={!text.trim()} aria-label="Send">➤</button>
      </form>
    </section>
  );
}
