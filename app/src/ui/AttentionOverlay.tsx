import { Phone, Video, X, Bell } from "lucide-react";
import { dismiss, useAlert } from "../core/attention";
import { useMxc } from "./common";

/** Fills the window when someone nudges or rings you. A ring keeps ringing until you answer, decline, or it times out. */
export function AttentionOverlay({ open }: { open: (roomId: string) => void }) {
  const a = useAlert();
  const img = useMxc(a?.kind === "image" ? a.mxc : undefined, 0);
  if (!a) return null;
  const calling = a.kind === "ring" || a.kind === "video";
  const answer = () => { open(a.roomId); dismiss(); };
  return (
    <div className={"attn " + a.kind} role="alertdialog" aria-label={`${a.sender} wants your attention`}>
      {a.kind === "image" && img && <img className="attn-img" src={img} alt="" />}
      <div className="attn-card">
        <div className="attn-ico">{a.kind === "video" ? <Video size={40} /> : calling ? <Phone size={40} /> : <Bell size={40} />}</div>
        <h2>{a.sender}</h2>
        <p>{a.kind === "nudge" ? "wants your attention" : a.kind === "image" ? "sent you something to look at" : a.kind === "video" ? "is video-ringing you…" : "is ringing you…"}</p>
        {a.chat !== a.sender && <small>{a.chat}</small>}
        <div className="attn-btns">
          <button className="decline" onClick={dismiss}><X size={20} /> {calling ? "Decline" : "Dismiss"}</button>
          <button className="answer" onClick={answer}>{calling ? (a.kind === "video" ? <Video size={20} /> : <Phone size={20} />) : null} {calling ? "Answer" : "Open chat"}</button>
        </div>
        {calling && <small className="attn-note">A Pager ring. Answering opens the chat; it isn't a voice or video call.</small>}
      </div>
    </div>
  );
}
