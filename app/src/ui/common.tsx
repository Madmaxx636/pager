import { ReactNode, useEffect, useState } from "react";
import { ChevronRight, MessageCircle, MessageSquare, Phone, Send, Camera, Gamepad2, MessagesSquare, User, X } from "lucide-react";
import { cachedMedia, mediaUrl } from "../core/store";
import { EMOJI_CATEGORIES, networkMeta } from "../core/emoji";
import { useSettings } from "../core/settings";

/** Simple original glyphs for each network (no brand marks). */
const NET_ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number; color?: string }>> = {
  whatsapp: Phone, signal: MessageCircle, telegram: Send, discord: Gamepad2, instagram: Camera, messenger: MessagesSquare, gmessages: MessageSquare,
};
const hueOf = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Loads a Matrix image (thumbnail of `thumb` px; 0 = original) with auth. */
export function useMxc(mxc: string | undefined, thumb = 0, enabled = true): string | undefined {
  const [src, setSrc] = useState<string | undefined>(() => (mxc && enabled ? cachedMedia(mxc, thumb) : undefined));
  useEffect(() => {
    const hit = mxc && enabled ? cachedMedia(mxc, thumb) : undefined;
    setSrc(hit);
    let live = true;
    if (mxc && enabled && !hit) void mediaUrl(mxc, thumb).then((u) => live && setSrc(u));
    return () => { live = false; };
  }, [mxc, thumb, enabled]);
  return src;
}

export function Avatar({ name, mxc, size = 44, network }: { name: string; mxc?: string; size?: number; network?: string }) {
  const src = useMxc(mxc, Math.ceil(size * 2));
  const squircle = useSettings().avatarShape === "squircle";
  const meta = network && network !== "matrix" ? networkMeta(network) : null;
  const h = hueOf(name);
  return (
    <div className={"avatar" + (squircle ? " squircle" : "")} style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" /> : <span style={{ background: `linear-gradient(135deg, hsl(${h} 55% 52%), hsl(${(h + 28) % 360} 62% 38%))` }}>{/^[\d\s+()-]+$/.test(name) ? <User size={size * 0.55} /> : (name.replace(/^[^\p{L}\p{N}]+/u, "")[0] ?? "?").toUpperCase()}</span>}
      {meta && <i className="badge" style={{ background: meta.color, width: size * 0.4, height: size * 0.4, fontSize: size * 0.2 }} title={meta.label}>{NET_ICONS[network!] ? (() => { const I = NET_ICONS[network!]; return <I size={size * 0.24} strokeWidth={2.4} color="#fff" />; })() : meta.glyph}</i>}
    </div>
  );
}

export function IconButton({ icon: Icon, label, onClick, active, size = 20, className = "" }: { icon: React.ComponentType<{ size?: number }>; label: string; onClick?: (e: React.MouseEvent) => void; active?: boolean; size?: number; className?: string }) {
  return <button className={"icon" + (active ? " active" : "") + (className ? " " + className : "")} onClick={onClick} title={label} aria-label={label}><Icon size={size} /></button>;
}

/** A dialog that is a bottom sheet on phones and a centered card on desktop. */
export function Modal({ title, onClose, children, wide }: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && (e.stopPropagation(), onClose());
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true" aria-label={title}>
        <div className="grab" />
        {title && <h2>{title}</h2>}
        <button className="icon close" onClick={onClose} aria-label="Close"><X size={18} /></button>
        {children}
      </div>
    </div>
  );
}

/** A row of an action sheet: icon, label, optional hint. */
export function SheetItem({ icon: Icon, label, hint, danger, onClick }: { icon: React.ComponentType<{ size?: number }>; label: string; hint?: string; danger?: boolean; onClick: () => void }) {
  return <button className={"sheet-item" + (danger ? " danger" : "")} onClick={onClick}><Icon size={20} /><div><span>{label}</span>{hint && <small>{hint}</small>}</div></button>;
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button role="switch" aria-checked={checked} disabled={disabled} className={"switch" + (checked ? " on" : "")} onClick={() => onChange(!checked)}><i /></button>;
}

/** iOS-style inset group of settings rows. */
export function Group({ title, footer, children }: { title?: string; footer?: string; children: ReactNode }) {
  return (
    <section className="group">
      {title && <h3 className="sec">{title}</h3>}
      <div className="group-card">{children}</div>
      {footer && <p className="group-footer">{footer}</p>}
    </section>
  );
}

export function Row({ title, hint, children, onClick, icon, tint, chevron }: { title: string; hint?: string; children?: ReactNode; onClick?: () => void; icon?: React.ComponentType<{ size?: number; color?: string }>; tint?: string; chevron?: boolean }) {
  const Icon = icon;
  return (
    <div className={"srow" + (onClick ? " click" : "")} onClick={onClick}>
      {Icon && <span className="tile" style={{ background: tint }}><Icon size={18} color="#fff" /></span>}
      <div className="srow-text"><div>{title}</div>{hint && <small>{hint}</small>}</div>
      <div className="srow-ctl" onClick={(e) => onClick && e.stopPropagation()}>{children}</div>
      {chevron && <ChevronRight size={18} className="chev" />}
    </div>
  );
}

export function SwitchRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Row title={title} hint={hint} onClick={disabled ? undefined : () => onChange(!checked)}><Switch checked={checked} onChange={onChange} disabled={disabled} /></Row>;
}

export function Select<T extends string>({ title, hint, value, options, onChange, disabled }: { title: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void; disabled?: boolean }) {
  return (
    <Row title={title} hint={hint}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </Row>
  );
}

export const humanSize = (b: number) => (b >= 1 << 20 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1 << 10 ? `${b >> 10} KB` : `${b} B`);

/** Presets used by "Remind me", "Snooze" and "Send later". */
export function timePresets(): [string, number][] {
  const now = Date.now();
  const at = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const list: [string, number][] = [["In 1 minute", now + 6e4], ["In 1 hour", now + 3.6e6], ["In 3 hours", now + 3 * 3.6e6]];
  if (at(0, 20) > now + 6e5) list.push(["This evening (8 PM)", at(0, 20)]);
  list.push(["Tomorrow morning (9 AM)", at(1, 9)]);
  const d = new Date(); const add = ((1 - d.getDay() + 7) % 7) || 7; list.push(["Next week (Mon 9 AM)", at(add, 9)]);
  return list;
}

/** Pick a moment: quick presets, or a specific date and time. */
export function WhenModal({ title, onPick, onClose }: { title: string; onPick: (at: number) => void; onClose: () => void }) {
  const [custom, setCustom] = useState("");
  const soon = new Date(Date.now() + 36e5); soon.setMinutes(0, 0, 0);
  const min = new Date(Date.now() - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">
        {timePresets().map(([label, at]) => <button key={label} className="row-btn" onClick={() => onPick(at)}><b>{label}</b></button>)}
        <label>Pick date & time<input type="datetime-local" min={min} value={custom} onChange={(e) => setCustom(e.target.value)} /></label>
        <button className="primary" disabled={!custom} onClick={() => onPick(Math.max(Date.now() + 3e4, new Date(custom).getTime()))}>Set</button>
      </div>
    </Modal>
  );
}

export function EmojiPicker({ recent, onPick, onClose }: { recent: string[]; onPick: (e: string) => void; onClose: () => void }) {
  const cats: [string, string, string[]][] = [...(recent.length ? [["🕘", "Recent", recent] as [string, string, string[]]] : []), ...EMOJI_CATEGORIES];
  return (
    <Modal onClose={onClose}>
      <div className="emoji-tabs">{cats.map(([icon, name]) => <button key={name} title={name} onClick={() => document.getElementById(`emo-${name}`)?.scrollIntoView({ block: "start" })}>{icon}</button>)}</div>
      <div className="emoji-grid-wrap">
        {cats.map(([, name, list]) => (
          <section key={name} id={`emo-${name}`}>
            <h4>{name}</h4>
            <div className="emoji-grid">{list.map((e) => <button key={e} onClick={() => onPick(e)}>{e}</button>)}</div>
          </section>
        ))}
      </div>
    </Modal>
  );
}

export function EmptyState({ icon: Icon, title, body, children }: { icon: React.ComponentType<{ size?: number }>; title: string; body?: string; children?: ReactNode }) {
  return <div className="empty"><span><Icon size={34} /></span><h3>{title}</h3>{body && <p>{body}</p>}{children}</div>;
}
