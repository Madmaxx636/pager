import { useEffect, useRef, useState } from "react";
import { Download, Maximize2, Play, Video as VideoIcon } from "lucide-react";
import type { Msg } from "../core/types";
import type { AppSettings } from "../core/settings";
import { humanSize, useMxc } from "./common";

const clock = (ms?: number) => { if (!ms) return ""; const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };

/**
 * A video the way chat apps show it: a still picture with a play button and its length; it plays right there when tapped.
 * Clips that are really GIFs (silent, looping) just play by themselves while they are on screen.
 */
export function VideoPlayer({ msg, st, allowed, onLoad }: { msg: Msg; st: AppSettings; allowed: boolean; onLoad: () => void }) {
  const gif = !!msg.gifLike;
  const wantsAuto = gif && st.autoPlayGifs && allowed && !st.lowData;
  const [playing, setPlaying] = useState(false);
  const poster = useMxc(msg.poster, 480, allowed || st.autoDownload !== "never");
  const src = useMxc(msg.mxc, 0, allowed && (wantsAuto || playing));
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const vid = useRef<HTMLVideoElement>(null);
  const ratio = msg.w && msg.h ? Math.min(2, Math.max(0.5, msg.w / msg.h)) : 16 / 9;

  useEffect(() => {
    if (!gif || !box.current) return;
    const io = new IntersectionObserver(([e]) => setVisible(e.isIntersecting), { threshold: 0.4 });
    io.observe(box.current);
    return () => io.disconnect();
  }, [gif]);
  // A GIF-like clip runs only while it is on screen, so a long chat doesn't play dozens at once.
  useEffect(() => {
    const v = vid.current; if (!v || !gif) return;
    if (visible && wantsAuto) void v.play().catch(() => undefined); else v.pause();
  }, [visible, wantsAuto, gif, src]);
  // After a tap on a clip that still had to be fetched: start as soon as it arrives.
  useEffect(() => { if (playing && src && vid.current && !gif) void vid.current.play().catch(() => undefined); }, [playing, src, gif]);

  const tap = () => { if (!allowed) onLoad(); setPlaying(true); };
  const save = () => { if (!src) { onLoad(); return; } const a = document.createElement("a"); a.href = src; a.download = msg.body || "video"; a.click(); };

  if (failed) {
    // Some clips (a phone's HEVC video, odd story formats) use a codec this browser doesn't have: say so and offer the file.
    return (
      <div className="vid vid-failed" style={{ aspectRatio: String(ratio) }}>
        {poster && <img src={poster} alt="" />}
        <div className="vid-msg"><VideoIcon size={22} /><span>This video can't play here</span><button onClick={save}><Download size={14} /> Save it{msg.size ? ` · ${humanSize(msg.size)}` : ""}</button></div>
      </div>
    );
  }
  const showVideo = !!src && (playing || (gif && wantsAuto));
  return (
    <div className={"vid" + (gif ? " vid-gif" : "")} ref={box} style={{ aspectRatio: String(ratio) }}>
      {showVideo
        ? <video ref={vid} src={src} poster={poster} playsInline preload="metadata" onError={() => setFailed(true)} onEnded={() => !gif && setPlaying(false)}
            {...(gif ? { muted: true, loop: true } : { controls: true, autoPlay: true, controlsList: "nodownload" })} />
        : poster ? <img src={poster} alt={msg.body} /> : <div className="vid-blank" />}
      {!showVideo && <button className="vid-play" onClick={tap} aria-label="Play video"><Play size={26} fill="currentColor" /></button>}
      {!showVideo && <span className="vid-info">{gif ? "GIF" : clock(msg.durationMs)}{!allowed && msg.size ? ` · ${humanSize(msg.size)}` : ""}</span>}
      {showVideo && !gif && <button className="vid-full" onClick={() => void vid.current?.requestFullscreen?.()} aria-label="Full screen"><Maximize2 size={16} /></button>}
    </div>
  );
}
