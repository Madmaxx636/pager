import { ReactNode, useEffect, useState } from "react";
import { mediaUrl } from "../core/store";
import { EMOJI_CATEGORIES, networkMeta } from "../core/emoji";

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

/** Loads a Matrix image (thumbnail of `thumb` px; 0 = original) with auth. */
export function useMxc(mxc: string | undefined, thumb = 0, enabled = true): string | undefined {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    let live = true;
    if (mxc && enabled) void mediaUrl(mxc, thumb).then((u) => live && setSrc(u));
    return () => { live = false; };
  }, [mxc, thumb, enabled]);
  return src;
}

export function Avatar({ name, mxc, size = 44, network }: { name: string; mxc?: string; size?: number; network?: string }) {
  const src = useMxc(mxc, Math.ceil(size * 2));
  const meta = network && network !== "matrix" ? networkMeta(network) : null;
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? <img src={src} alt="" /> : <span style={{ background: `hsl(${hue(name)} 45% 42%)` }}>{(name.replace(/^[^\p{L}\p{N}]+/u, "")[0] ?? "?").toUpperCase()}</span>}
      {meta && <i className="badge" style={{ background: meta.color, width: size * 0.4, height: size * 0.4, fontSize: size * 0.2 }} title={meta.label}>{meta.glyph}</i>}
    </div>
  );
}

export function Modal({ title, onClose, children, wide }: { title?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [onClose]);
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={"modal" + (wide ? " wide" : "")} role="dialog" aria-modal="true">
        {title && <h2>{title}</h2>}
        <button className="icon close" onClick={onClose} aria-label="Close">✕</button>
        {children}
      </div>
    </div>
  );
}

export function Switch({ checked, onChange, disabled }: { checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <button role="switch" aria-checked={checked} disabled={disabled} className={"switch" + (checked ? " on" : "")} onClick={() => onChange(!checked)}><i /></button>;
}

export function Row({ title, hint, children, onClick }: { title: string; hint?: string; children?: ReactNode; onClick?: () => void }) {
  return (
    <div className={"srow" + (onClick ? " click" : "")} onClick={onClick}>
      <div><div>{title}</div>{hint && <small>{hint}</small>}</div>
      <div className="srow-ctl" onClick={(e) => onClick && e.stopPropagation()}>{children}</div>
    </div>
  );
}

export function SwitchRow({ title, hint, checked, onChange, disabled }: { title: string; hint?: string; checked: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return <Row title={title} hint={hint} onClick={disabled ? undefined : () => onChange(!checked)}><Switch checked={checked} onChange={onChange} disabled={disabled} /></Row>;
}

export function Select<T extends string>({ title, hint, value, options, onChange }: { title: string; hint?: string; value: T; options: [T, string][]; onChange: (v: T) => void }) {
  return (
    <Row title={title} hint={hint}>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>{options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
    </Row>
  );
}

export const humanSize = (b: number) => (b >= 1 << 20 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1 << 10 ? `${b >> 10} KB` : `${b} B`);

/** Presets used by "Remind me" and "Send later". */
export function timePresets(): [string, number][] {
  const now = Date.now();
  const at = (days: number, hour: number) => { const d = new Date(); d.setDate(d.getDate() + days); d.setHours(hour, 0, 0, 0); return d.getTime(); };
  const list: [string, number][] = [["In 1 hour", now + 3.6e6], ["In 3 hours", now + 3 * 3.6e6]];
  if (at(0, 20) > now + 6e5) list.push(["This evening (8 PM)", at(0, 20)]);
  list.push(["Tomorrow morning (9 AM)", at(1, 9)]);
  const d = new Date(); const add = ((1 - d.getDay() + 7) % 7) || 7; list.push(["Next week (Mon 9 AM)", at(add, 9)]);
  return list;
}

export function TimePresetModal({ title, onPick, onClose }: { title: string; onPick: (at: number) => void; onClose: () => void }) {
  return (
    <Modal title={title} onClose={onClose}>
      <div className="stack">{timePresets().map(([label, at]) => <button key={label} className="row-btn" onClick={() => onPick(at)}><b>{label}</b></button>)}</div>
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
