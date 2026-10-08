import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { chatSummaries, fetchMedia, loadOlder, markRead, messagesOf, sendMessage, useMatrixVersion, type Message } from "../matrix";
import { networkMeta } from "../networks";
import { Avatar } from "./Avatar";

function Media({ mxc, alt }: { mxc: string; alt: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    fetchMedia(mxc).then(setSrc).catch(() => {});
  }, [mxc]);
  return src ? <img className="media" src={src} alt={alt} /> : <div className="media placeholder" />;
}

function Bubble({ m, first, group }: { m: Message; first: boolean; group: boolean }) {
  const time = new Date(m.ts).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return (
    <div className={"msg" + (m.mine ? " mine" : "") + (first ? " first" : "")}>
      {group && !m.mine && first && <div className="msg-sender">{m.senderName}</div>}
      <div className="bubble" title={time}>
        {m.msgtype === "m.image" && m.mxc ? <Media mxc={m.mxc} alt={m.body} /> : <span>{m.body}</span>}
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

  return (
    <section className="chat">
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

      <form className="composer" onSubmit={send}>
        <textarea
          rows={1}
          placeholder="Message"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) send(e);
          }}
        />
        <button className="send" disabled={!text.trim()} aria-label="Send">➤</button>
      </form>
    </section>
  );
}
