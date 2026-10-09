import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock, Archive, ArchiveRestore, BellOff, CheckCheck, CircleDot, Circle, CheckCircle2, Inbox, ListFilter, MailOpen, MessageSquareDot, MoreVertical, Pin,
  PinOff, Trash2, Search, Settings as SettingsIcon, Hourglass, SquarePen, Star, Tag, TriangleAlert, Users, ArrowDownToLine, ChevronLeft, ChevronRight, UserRoundCog, X, BellRing, ArrowUpToLine,
} from "lucide-react";
import { ChatSummary } from "../core/types";
import { networkMeta } from "../core/emoji";
import {
  addLabel, markAllRead, markRead, markUnread, me, movePin, pin, remind, removeLabel, setLowPriority, setMuted, setTag, snooze, leave, useInbox, useLabels, useStore, useChatsRaw,
} from "../core/store";
import { RowAction, updateSettings, useSettings } from "../core/settings";
import { Avatar, IconButton, Modal, SheetItem, TypingDots, WhenModal, EmptyState } from "./common";
import { needsAttention } from "./Accounts";
import { Mascot } from "./Mascot";

function timeLabel(ts: number) {
  if (!ts) return "";
  const d = new Date(ts), now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (now.getTime() - ts < 6 * 864e5) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

export type Nav = (to: string) => void;

interface Filters { groups: boolean; dms: boolean; drafts: boolean; unanswered: boolean; network?: string }
const noFilters: Filters = { groups: false, dms: false, drafts: false, unanswered: false };
const filterCount = (f: Filters) => [f.groups, f.dms, f.drafts, f.unanswered, !!f.network].filter(Boolean).length;

function inTab(c: ChatSummary, tab: string) {
  const unread = c.unread > 0 || c.markedUnread;
  if (tab === "inbox") return !c.archived && !c.lowPriority;
  if (tab === "unread") return !c.archived && !c.lowPriority && unread;
  if (tab === "low") return c.lowPriority && !c.archived;
  if (tab === "archive") return c.archived;
  if (tab.startsWith("label:")) return c.labels.includes(tab.slice(6)) && !c.archived;
  return true;
}

/** What a hover quick action looks like and does for a chat (and how to undo it). */
function rowAction(a: RowAction, c: ChatSummary, setUndo: (u?: { label: string; revert: () => void }) => void, ask: () => void) {
  const unread = c.unread > 0 || c.markedUnread;
  switch (a) {
    case "archive": return { label: c.archived ? "Move to inbox" : "Archive", icon: c.archived ? ArchiveRestore : Archive, run: () => { setTag(c.id, "u.archived", !c.archived); setUndo({ label: c.archived ? "Moved to inbox" : "Archived", revert: () => setTag(c.id, "u.archived", c.archived) }); } };
    case "read": return { label: unread ? "Mark read" : "Mark unread", icon: unread ? MailOpen : MessageSquareDot, run: () => (unread ? markRead(c.id) : markUnread(c.id, true)) };
    case "pin": return { label: c.pinned ? "Unpin" : "Pin", icon: c.pinned ? PinOff : Pin, run: () => pin(c.id, !c.pinned) };
    case "mute": return { label: c.muted ? "Unmute" : "Mute", icon: BellOff, run: () => (c.muted ? setMuted(c.id, false) : ask()) };
    case "low": return { label: c.lowPriority ? "Move to inbox" : "Low priority", icon: ArrowDownToLine, run: () => { setLowPriority(c.id, !c.lowPriority); setUndo({ label: c.lowPriority ? "Moved to inbox" : "Moved to low priority", revert: () => setLowPriority(c.id, c.lowPriority) }); } };
    case "snooze": return { label: "Snooze 3 hours", icon: Hourglass, run: () => { snooze(c.id, Date.now() + 3 * 3600_000); setUndo({ label: "Snoozed for 3 hours", revert: () => setTag(c.id, "u.archived", c.archived) }); } };
    default: return undefined;
  }
}

export function Sidebar({ selected, onSelect, nav, onAccounts }: { selected: string | null; onSelect: (id: string) => void; nav: Nav; onAccounts: () => void }) {
  const st = useSettings();
  const everything = useInbox();
  const stories = everything.find((c) => c.stories);
  const all = everything.filter((c) => !c.stories);
  const synced = useStore((s) => s.synced);
  const bridges = useStore((s) => s.bridges);
  const labels = useLabels();
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState(st.defaultTab === "unread" ? "unread" : "inbox");
  const [filters, setFilters] = useState<Filters>(noFilters);
  const [menu, setMenu] = useState(false);
  const [ctx, setCtx] = useState<{ c: ChatSummary; x: number; y: number }>();
  const [filterModal, setFilterModal] = useState(false);
  const [muteFor, setMuteFor] = useState<string[]>();
  const [deleteFor, setDeleteFor] = useState<string[]>();
  const [undo, setUndo] = useState<{ label: string; revert: () => void }>();
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(undefined), 4500); return () => clearTimeout(t); }, [undo]);
  const [labelFor, setLabelFor] = useState<string[]>();
  const [whenFor, setWhenFor] = useState<{ ids: string[]; kind: "snooze" | "remind" }>();
  const [picked, setPicked] = useState<string[]>([]);
  const [dragId, setDragId] = useState<string>();
  const search = useRef<HTMLInputElement>(null);
  const selecting = picked.length > 0;

  useEffect(() => {
    const focus = () => { search.current?.focus(); search.current?.select(); };
    window.addEventListener("pager:filter-chats", focus);
    return () => window.removeEventListener("pager:filter-chats", focus);
  }, []);

  const q = query.trim().toLowerCase();
  const pinsRow = st.showPinsRow && tab === "inbox" && !q && !filterCount(filters);
  const pins = pinsRow ? all.filter((c) => c.pinned && !c.archived && !c.lowPriority).sort((a, b) => a.pinOrder - b.pinOrder) : [];
  const pinIds = new Set(pins.map((p) => p.id));
  const networks = useMemo(() => [...new Set(all.map((c) => c.network))].sort(), [all]);
  const unreadCount = all.filter((c) => inTab(c, "unread")).length;
  const shown = all.filter((c) =>
    inTab(c, tab) && !pinIds.has(c.id) && (!filters.groups || c.isGroup) && (!filters.dms || !c.isGroup) && (!filters.drafts || !!c.draft) && (!filters.unanswered || c.unanswered)
    && (!filters.network || c.network === filters.network) && (!q || c.name.toLowerCase().includes(q) || c.preview.toLowerCase().includes(q)));
  const totalUnread = all.filter((c) => !c.archived && !c.muted && !c.lowPriority && (c.unread > 0 || c.markedUnread)).length;
  const attention = [...new Set(bridges.flatMap((n) => n.logins.filter((l) => needsAttention(l.state_event)).map(() => n.name)))];
  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  const open = (id: string) => (selecting ? toggle(id) : onSelect(id));

  const tabs: [string, string, typeof Inbox, number?][] = [
    ["inbox", "Inbox", Inbox], ["unread", "Unread", MessageSquareDot, unreadCount || undefined], ["low", "Low priority", ArrowDownToLine], ["archive", "Archive", Archive],
    ...(st.showLabelsInFilterBar ? labels.map((l): [string, string, typeof Inbox] => [`label:${l}`, l, Tag]) : []),
  ];

  return (
    <aside className="sidebar" style={{ width: st.sidebarWidth }}>
      {selecting ? (
        <header className="side-head sel">
          <IconButton icon={X} label="Cancel selection" onClick={() => setPicked([])} />
          <h1>{picked.length} selected</h1>
          <div className="head-actions">
            <IconButton icon={CheckCheck} label="Mark read" onClick={() => { picked.forEach(markRead); setPicked([]); }} />
            <IconButton icon={MailOpen} label="Mark unread" onClick={() => { picked.forEach((id) => markUnread(id, true)); setPicked([]); }} />
            <IconButton icon={Pin} label="Pin" onClick={() => { picked.forEach((id) => pin(id, true)); setPicked([]); }} />
            <IconButton icon={Archive} label="Archive" onClick={() => { picked.forEach((id) => setTag(id, "u.archived", true)); setPicked([]); }} />
            <IconButton icon={BellOff} label="Mute" onClick={() => setMuteFor(picked)} />
            <IconButton icon={Tag} label="Labels" onClick={() => setLabelFor(picked)} />
            <IconButton icon={Trash2} label="Delete" onClick={() => setDeleteFor(picked)} />
          </div>
        </header>
      ) : (
        <header className="side-head">
          <div><h1 className="pages-title"><Mascot size={30} />Pages</h1>{st.dndUntil > Date.now() ? <small className="accent">Do not disturb</small> : totalUnread > 0 && <small className="accent">{totalUnread} unread</small>}</div>
          <div className="head-actions">
            <IconButton icon={SquarePen} label="Page someone (Ctrl+N)" onClick={() => nav("new")} />
            <IconButton icon={Search} label="Search all messages (Ctrl+Shift+F)" onClick={() => nav("search")} />
            <div className="menu-wrap">
              <IconButton icon={MoreVertical} label="Menu" onClick={() => setMenu(!menu)} />
              {menu && (
                <div className="menu" onMouseLeave={() => setMenu(false)} onClick={() => setMenu(false)}>
                  <div className="menu-id">{me()}</div>
                  <button onClick={onAccounts}><UserRoundCog size={18} />Accounts</button>
                  <button onClick={markAllRead}><CheckCheck size={18} />Mark all as read</button>
                  <button onClick={() => updateSettings({ dndUntil: st.dndUntil > Date.now() ? 0 : Date.now() + 3.6e6 })}><BellOff size={18} />{st.dndUntil > Date.now() ? "Turn off Do not disturb" : "Do not disturb for 1 hour"}</button>
                  <button onClick={() => nav("settings/starred")}><Star size={18} />Starred messages</button>
                  <button onClick={() => nav("settings")}><SettingsIcon size={18} />Settings</button>
                </div>
              )}
            </div>
          </div>
        </header>
      )}

      <div className="pill-search">
        <Search size={18} />
        <input ref={search} placeholder="Search chats" value={query} onChange={(e) => setQuery(e.target.value)} />
        {st.showFilterBar && <button className={"icon sm" + (filterCount(filters) ? " active" : "")} onClick={() => setFilterModal(true)} title="Filters" aria-label="Filters"><ListFilter size={18} />{filterCount(filters) > 0 && <i className="dot-badge" />}</button>}
      </div>

      {st.showFilterBar && !selecting && (
        <div className="tabs">
          {tabs.map(([id, label, Icon, badge]) => (
            <button key={id} className={"tab" + (tab === id ? " on" : "")} onClick={() => setTab(id)}><Icon size={15} />{label}{badge ? <b>{badge}</b> : null}</button>
          ))}
        </div>
      )}

      {attention.length > 0 && !selecting && tab === "inbox" && (
        <button className="banner" onClick={() => nav("settings/bridges")}><TriangleAlert size={18} /><span>{attention.join(", ")} needs you to sign in again</span><b>Fix</b></button>
      )}

      <div className="chat-scroll">
        {stories && tab === "inbox" && !q && !selecting && (
          <button className={"stories-row" + (stories.id === selected ? " sel" : "")} onClick={() => open(stories.id)}>
            <span className={"stories-ring" + (stories.unread > 0 ? " new" : "")}><CircleDot size={22} /></span>
            <span className="col"><b>Stories</b><small>{stories.preview ? stories.preview : "WhatsApp status updates show up here"}</small></span>
            {stories.unread > 0 && <span className="unread muted-badge">{stories.unread > 99 ? "99+" : stories.unread}</span>}
          </button>
        )}
        {pins.length > 0 && (
          <div className="pins">
            {pins.map((c, i) => (
              <button key={c.id} className={"pin-chip" + (c.id === selected ? " sel" : "") + (dragId === c.id ? " dragging" : "")} draggable
                onDragStart={() => setDragId(c.id)} onDragEnd={() => setDragId(undefined)}
                onDragOver={(e) => { e.preventDefault(); }} onDrop={() => { if (dragId && dragId !== c.id) movePin(dragId, i); setDragId(undefined); }}
                onClick={() => open(c.id)} onContextMenu={(e) => { e.preventDefault(); setCtx({ c, x: e.clientX, y: e.clientY }); }} title={c.name}>
                <span className="pin-av"><Avatar name={c.name} mxc={c.avatarMxc} size={76} network={st.showNetworkBadges ? c.network : undefined} />{(c.unread > 0 || c.markedUnread) && <i className={"pin-dot" + (c.muted ? " muted" : "")} />}{c.typing && <span className="typing-badge"><TypingDots /></span>}</span>
                <span className="pin-name">{c.name}</span>
              </button>
            ))}
          </div>
        )}
        <ul className="chat-list">
          {shown.map((c) => {
            const unread = c.unread > 0 || c.markedUnread;
            return (
              <li key={c.id} className="chat-li">
                <button className={"chat-row" + (c.id === selected ? " sel" : "") + (picked.includes(c.id) ? " picked" : "")} onClick={() => open(c.id)} onContextMenu={(e) => { e.preventDefault(); setCtx({ c, x: e.clientX, y: e.clientY }); }}>
                  {selecting && (picked.includes(c.id) ? <CheckCircle2 className="check on" size={22} /> : <Circle className="check" size={22} />)}
                  {st.showAvatars && <Avatar name={c.name} mxc={c.avatarMxc} network={st.showNetworkBadges ? c.network : undefined} size={st.density === "compact" ? 40 : 50} />}
                  <div className="chat-main">
                    <div className="chat-top">
                      <span className={"chat-name" + (unread ? " unread-name" : "")}>{c.name}</span>
                      {c.muted && <BellOff size={13} className="muted-icon" />}
                      {c.pinned && !st.showPinsRow && <Pin size={13} className="muted-icon" />}
                      {st.inboxStyle !== "minimal" && <span className={"chat-time" + (unread && !c.muted ? " hot" : "")}>{timeLabel(c.ts)}</span>}
                      {st.inboxStyle === "minimal" && unread && <span className={"unread" + (c.muted || c.lowPriority ? " muted-badge" : "")}>{c.unread || ""}</span>}
                    </div>
                    {st.showNetworkNameInRows && <div className="chat-net" style={{ color: networkMeta(c.network).color }}>{networkMeta(c.network).label}</div>}
                    {st.inboxStyle !== "minimal" && (
                      <div className="chat-bottom">
                        {c.typing ? <span className="chat-preview"><TypingDots /></span>
                          : c.draft ? <span className="chat-preview"><b className="accent">Draft:</b> {c.draft.replace(/\n/g, " ")}</span>
                          : st.showPreviews ? <span className={"chat-preview" + (c.preview ? "" : " no-msgs")}>{c.preview ? (c.lastFromMe ? "You: " : "") + c.preview : "No messages yet"}</span> : <span className="chat-preview" />}
                        {unread && <span className={"unread" + (c.muted || c.lowPriority ? " muted-badge" : "")}>{c.unread > 99 ? "99+" : c.unread || ""}</span>}
                      </div>
                    )}
                  </div>
                </button>
                {!selecting && (
                  <div className="row-actions">
                    {[st.rowAction1, st.rowAction2].map((a, n) => {
                      const r = rowAction(a, c, setUndo, () => setMuteFor([c.id]));
                      return r ? <button key={n} className="icon sm" title={r.label} aria-label={r.label} onClick={() => r.run()}><r.icon size={17} /></button> : null;
                    })}
                  </div>
                )}
              </li>
            );
          })}
          {shown.length === 0 && pins.length === 0 && (
            <li>
              {!synced ? <EmptyState icon={Inbox} title="Syncing…" />
                : all.length === 0 ? <EmptyState icon={Inbox} title="No chats yet" body="Connect an app to bring your conversations here."><button className="primary" onClick={onAccounts}>Connect an account</button></EmptyState>
                : tab === "unread" ? <EmptyState icon={CheckCheck} title="You're all caught up" body="No unread chats." />
                : tab === "archive" ? <EmptyState icon={Archive} title="Nothing archived" body="Archived chats come back when someone writes." />
                : tab === "low" ? <EmptyState icon={ArrowDownToLine} title="No low-priority chats" body="They stay quiet except for @mentions and replies." />
                : <EmptyState icon={Search} title="No matches" />}
            </li>
          )}
        </ul>
      </div>

      {ctx && <ChatMenu c={ctx.c} x={ctx.x} y={ctx.y} pins={pins} close={() => setCtx(undefined)}
        onMute={() => setMuteFor([ctx.c.id])} onLabels={() => setLabelFor([ctx.c.id])} onWhen={(kind) => setWhenFor({ ids: [ctx.c.id], kind })} onSelect={() => toggle(ctx.c.id)} onDelete={() => setDeleteFor([ctx.c.id])} />}
      {deleteFor && (
        <Modal title={deleteFor.length === 1 ? "Delete this chat?" : `Delete ${deleteFor.length} chats?`} onClose={() => setDeleteFor(undefined)}>
          <p className="muted">They will be removed from Pager. The conversations on the other apps aren't deleted, and a chat comes back if someone writes again.</p>
          <div className="row-end"><button className="link" onClick={() => setDeleteFor(undefined)}>Cancel</button><button className="primary danger" onClick={() => { deleteFor.forEach(leave); setDeleteFor(undefined); setPicked([]); }}>Delete</button></div>
        </Modal>
      )}
      {muteFor && (
        <Modal title={muteFor.length === 1 ? "Mute chat" : `Mute ${muteFor.length} chats`} onClose={() => setMuteFor(undefined)}>
          <div className="stack">
            {([["For 1 hour", 3.6e6], ["For 8 hours", 8 * 3.6e6], ["For 1 week", 7 * 864e5], ["Until I turn it back on", undefined]] as [string, number | undefined][]).map(([l, ms]) => (
              <button key={l} className="row-btn" onClick={() => { muteFor.forEach((id) => setMuted(id, true, ms)); setMuteFor(undefined); setPicked([]); }}><b>{l}</b></button>
            ))}
          </div>
        </Modal>
      )}
      {labelFor && <LabelModal ids={labelFor} onClose={() => setLabelFor(undefined)} />}
      {whenFor && <WhenModal title={whenFor.kind === "snooze" ? "Snooze until" : "Remind me"} onPick={(at) => { whenFor.ids.forEach((id) => (whenFor.kind === "snooze" ? snooze(id, at) : remind(id, at))); setWhenFor(undefined); }} onClose={() => setWhenFor(undefined)} />}
      {filterModal && (
        <Modal title="Filter chats" onClose={() => setFilterModal(false)}>
          <div className="stack">
            {([["groups", "Groups", Users], ["dms", "Direct messages", MessageSquareDot], ["drafts", "With a draft", SquarePen], ["unanswered", "Unanswered (they wrote last)", CircleDot]] as const).map(([key, label, Icon]) => (
              <button key={key} className={"row-btn pick" + (filters[key] ? " on" : "")} onClick={() => setFilters({ ...filters, [key]: !filters[key], ...(key === "groups" && !filters.groups ? { dms: false } : {}), ...(key === "dms" && !filters.dms ? { groups: false } : {}) })}><Icon size={18} /><b>{label}</b>{filters[key] && <CheckCircle2 size={18} />}</button>
            ))}
            {networks.length > 1 && <><h4 className="sec">Network</h4>{networks.map((n) => <button key={n} className={"row-btn pick" + (filters.network === n ? " on" : "")} onClick={() => setFilters({ ...filters, network: filters.network === n ? undefined : n })}><i className="net-swatch" style={{ background: networkMeta(n).color }} /><b>{networkMeta(n).label}</b>{filters.network === n && <CheckCircle2 size={18} />}</button>)}</>}
            {filterCount(filters) > 0 && <button className="link" onClick={() => { setFilters(noFilters); setFilterModal(false); }}>Clear filters</button>}
          </div>
        </Modal>
      )}
      {undo && <div className="undo-toast"><span>{undo.label}</span><button onClick={() => { undo.revert(); setUndo(undefined); }}>Undo</button></div>}
    </aside>
  );
}

function ChatMenu({ c, x, y, pins, close, onMute, onLabels, onWhen, onSelect, onDelete }: { c: ChatSummary; x: number; y: number; pins: ChatSummary[]; close: () => void; onMute: () => void; onLabels: () => void; onWhen: (k: "snooze" | "remind") => void; onSelect: () => void; onDelete: () => void }) {
  const unread = c.unread > 0 || c.markedUnread;
  const at = pins.findIndex((p) => p.id === c.id);
  const run = (f: () => void) => () => { f(); close(); };
  return (
    <div className="ctx-backdrop" onClick={close} onContextMenu={(e) => { e.preventDefault(); close(); }}>
      <div className="menu ctx" style={{ left: Math.min(x, window.innerWidth - 270), top: Math.max(8, Math.min(y, window.innerHeight - 470)) }} onClick={(e) => e.stopPropagation()}>
        <div className="menu-id">{c.name}</div>
        <button onClick={run(() => pin(c.id, !c.pinned))}>{c.pinned ? <PinOff size={18} /> : <Pin size={18} />}{c.pinned ? "Unpin" : "Pin to top"}</button>
        {c.pinned && at > 0 && <button onClick={run(() => movePin(c.id, at - 1))}><ChevronLeft size={18} />Move earlier in pins</button>}
        {c.pinned && at >= 0 && at < pins.length - 1 && <button onClick={run(() => movePin(c.id, at + 1))}><ChevronRight size={18} />Move later in pins</button>}
        <button onClick={run(() => (unread ? markRead(c.id) : markUnread(c.id, true)))}>{unread ? <CheckCheck size={18} /> : <MailOpen size={18} />}{unread ? "Mark as read" : "Mark as unread"}</button>
        <button onClick={run(() => (c.muted ? setMuted(c.id, false) : onMute()))}><BellOff size={18} />{c.muted ? "Unmute" : "Mute…"}</button>
        <button onClick={run(() => setTag(c.id, "u.archived", !c.archived))}>{c.archived ? <ArchiveRestore size={18} /> : <Archive size={18} />}{c.archived ? "Move to inbox" : "Archive"}</button>
        <button onClick={run(() => setLowPriority(c.id, !c.lowPriority))}><ArrowDownToLine size={18} />{c.lowPriority ? "Remove from low priority" : "Low priority"}</button>
        <button onClick={run(() => onWhen("snooze"))}><Hourglass size={18} />Snooze…</button>
        <button onClick={run(() => onWhen("remind"))}><AlarmClock size={18} />Remind me…</button>
        <button onClick={run(onLabels)}><Tag size={18} />Labels…</button>
        <button onClick={run(onSelect)}><CheckCircle2 size={18} />Select</button>
        <button className="danger" onClick={run(onDelete)}><Trash2 size={18} />Delete chat…</button>
      </div>
    </div>
  );
}

function LabelModal({ ids, onClose }: { ids: string[]; onClose: () => void }) {
  const labels = useLabels();
  const chats = useChatsRaw();
  const [name, setName] = useState("");
  const has = (l: string) => ids.every((id) => chats[id]?.tags.includes(`u.label.${l}`));
  return (
    <Modal title="Labels" onClose={onClose}>
      <div className="stack">
        {labels.map((l) => <button key={l} className={"row-btn pick" + (has(l) ? " on" : "")} onClick={() => ids.forEach((id) => (has(l) ? removeLabel(id, l) : addLabel(id, l)))}><Tag size={18} /><b>{l}</b>{has(l) && <CheckCircle2 size={18} />}</button>)}
        <form className="inline-form" onSubmit={(e) => { e.preventDefault(); if (name.trim()) { ids.forEach((id) => addLabel(id, name)); setName(""); } }}>
          <input placeholder="New label (Work, Family, Travel…)" value={name} onChange={(e) => setName(e.target.value)} />
          <button className="primary" disabled={!name.trim()}>Add</button>
        </form>
      </div>
    </Modal>
  );
}
