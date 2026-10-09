import { useSyncExternalStore } from "react";

/** Everything the user can tune. One JSON blob in localStorage. */
export type RowAction = "none" | "archive" | "read" | "pin" | "mute" | "low" | "snooze";

export type ChatNotifPrefs = { soundId?: string; mode?: "default" | "all" | "mentions" | "none"; preview?: "default" | "show" | "hide"; sound?: "default" | "off" };

export interface AppSettings {
  // Appearance
  themeMode: "system" | "light" | "dark" | "black";
  accent: string; // teal | blue | purple | pink | orange | green | red
  fontScale: number;
  bubbleStyle: "round" | "soft" | "square" | "tail" | "outline" | "plain";
  bubbleFill: "solid" | "gradient" | "tinted";
  bubbleDepth: "flat" | "soft" | "raised";
  messageAnimation: "none" | "pop" | "slide" | "fade";
  screenEffects: boolean;
  wallpaper: string;
  timeFormat: "system" | "12" | "24";
  colorSenderNames: boolean;
  // Layout
  density: "comfortable" | "compact";
  showAvatars: boolean;
  showNetworkBadges: boolean;
  showNetworkNameInRows: boolean;
  showPreviews: boolean;
  showFilterBar: boolean;
  showReadTicks: boolean;
  showMessageTimes: boolean;
  inboxStyle: "pro" | "minimal";
  showPinsRow: boolean;
  sortUnreadFirst: boolean;
  defaultTab: "inbox" | "unread";
  avatarShape: "circle" | "squircle";
  showLabelsInFilterBar: boolean;
  reduceMotion: boolean;
  sidebarWidth: number;
  /** Quick actions that appear when hovering a chat row (desktop's version of swipe actions). */
  /** Desktop app only: use the operating system's colors. */
  themeFollowSystem: boolean;
  rowAction1: RowAction;
  rowAction2: RowAction;
  // Chats
  enterToSend: boolean;
  sendReadReceipts: boolean;
  sendTyping: boolean;
  linkPreviews: boolean;
  autoDownload: "always" | "never";
  unarchiveOnMessage: boolean;
  confirmDelete: boolean;
  mentionSuggestions: boolean;
  markdown: boolean;
  largeEmoji: boolean;
  autoPlayGifs: boolean;
  groupGapMin: number;
  markReadMode: "open" | "scrolled" | "manual";
  openAtFirstUnread: boolean;
  gifProvider: "giphy" | "tenor";
  gifKey: string;
  doubleTapReact: boolean;
  quickReactions: string[];
  recentEmoji: string[];
  // Notifications
  notifEnabled: boolean;
  notifPreview: "full" | "sender" | "hidden";
  notifSound: boolean;
  notifGroupMentionsOnly: boolean;
  notifScope: "all" | "dm_mentions" | "favorites";
  notifMutedNetworks: string[];
  /** Per network: all messages, only mentions/replies/keywords, or nothing. */
  notifNetworkMode: Record<string, "all" | "mentions" | "none">;
  /** Per chat overrides, set from the chat's info page. */
  notifChat: Record<string, ChatNotifPrefs>;
  /** Words that always notify (even in muted chats), like a name or a nickname. */
  notifKeywords: string[];
  /** Days of the week quiet hours apply on (0 = Sunday). */
  notifQuietDays: number[];
  /** Pinned chats and mentions can still make a sound during quiet hours. */
  notifQuietBreakThrough: boolean;
  /** Wait this long before alerting, and skip it if you read the chat somewhere else meanwhile. */
  notifDelaySec: number;
  /** App-wide alert sound, and how loud (0 to 1). Per network and per chat sounds win over this. */
  notifSoundId: string;
  notifSoundVolume: number;
  notifNetworkSound: Record<string, string>;
  /** Do not disturb: no alerts until this time (ms since 1970). 0 = off. */
  dndUntil: number;
  /** What the unread badge counts. */
  notifBadge: "unmuted" | "all" | "off";
  quietHoursEnabled: boolean;
  quietStartMin: number;
  quietEndMin: number;
  // Networks
  hiddenNetworks: string[];
  // Advanced
  developerMode: boolean;
  // Keyboard shortcuts (desktop and web); values like "Ctrl+Shift+A"
  shortcuts: Record<string, string>;
  // Desktop
  closeToTray: boolean;
  startMinimized: boolean;
  launchAtLogin: boolean;
}

export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const DEFAULTS: AppSettings = {
  themeMode: "system", accent: "teal", fontScale: 1, bubbleStyle: "round", bubbleFill: "solid", bubbleDepth: "soft", messageAnimation: "pop", screenEffects: true, wallpaper: "none", timeFormat: "system", colorSenderNames: true,
  density: "comfortable", showAvatars: true, showNetworkBadges: true, showNetworkNameInRows: false, showPreviews: true, showFilterBar: true,
  showReadTicks: true, showMessageTimes: true, inboxStyle: "pro", showPinsRow: true, sortUnreadFirst: false, defaultTab: "inbox",
  avatarShape: "circle", showLabelsInFilterBar: true, reduceMotion: false, sidebarWidth: 360, themeFollowSystem: true, rowAction1: "read", rowAction2: "archive",
  enterToSend: true, sendReadReceipts: true, sendTyping: true, linkPreviews: true, autoDownload: "always", unarchiveOnMessage: true,
  confirmDelete: true, mentionSuggestions: true, markdown: true, largeEmoji: true, autoPlayGifs: true, groupGapMin: 5, markReadMode: "scrolled", openAtFirstUnread: true, gifProvider: "giphy", gifKey: "", doubleTapReact: true, quickReactions: DEFAULT_QUICK_REACTIONS, recentEmoji: [],
  notifEnabled: true, notifPreview: "full", notifSound: true, notifGroupMentionsOnly: false, notifScope: "all", notifMutedNetworks: [], notifNetworkMode: {}, notifChat: {}, notifKeywords: [], notifQuietDays: [0, 1, 2, 3, 4, 5, 6], notifQuietBreakThrough: false, notifDelaySec: 0, notifBadge: "unmuted", notifSoundId: "chime", notifSoundVolume: 0.7, notifNetworkSound: {}, dndUntil: 0,
  quietHoursEnabled: false, quietStartMin: 22 * 60, quietEndMin: 7 * 60,
  hiddenNetworks: [],
  developerMode: false, shortcuts: {},
  closeToTray: true, startMinimized: false, launchAtLogin: false,
};

/** Every shortcut the app understands, with its default keys. Users can rebind them in Settings. */
export const SHORTCUTS: { id: string; label: string; keys: string }[] = [
  { id: "palette", label: "Command bar: jump to a chat or setting", keys: "Ctrl+K" },
  { id: "newChat", label: "New chat", keys: "Ctrl+N" },
  { id: "search", label: "Search all messages", keys: "Ctrl+Shift+F" },
  { id: "inChatSearch", label: "Search in this chat", keys: "Ctrl+F" },
  { id: "settings", label: "Open settings", keys: "Ctrl+," },
  { id: "prevChat", label: "Previous chat", keys: "Alt+ArrowUp" },
  { id: "nextChat", label: "Next chat", keys: "Alt+ArrowDown" },
  { id: "nextUnread", label: "Next unread chat", keys: "Alt+Shift+ArrowDown" },
  { id: "archive", label: "Archive or unarchive this chat", keys: "Ctrl+Shift+A" },
  { id: "markUnread", label: "Mark this chat unread", keys: "Ctrl+Shift+U" },
  { id: "mute", label: "Mute or unmute this chat", keys: "Ctrl+Shift+M" },
  { id: "pin", label: "Pin or unpin this chat", keys: "Ctrl+Shift+P" },
  { id: "snooze", label: "Snooze this chat", keys: "Ctrl+Shift+Z" },
  { id: "help", label: "Show keyboard shortcuts", keys: "Ctrl+/" },
];

const KEY = "pager.settings";
let raw: AppSettings = load();
let state: AppSettings = raw;
const listeners = new Set<() => void>();

function load(): AppSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...DEFAULTS }; }
}

// ---- Per-device settings that follow your account ---------------------------------------------
// Each kind of device (web, desktop, phone) keeps its own settings in your Matrix account data, so signing in on a new
// computer brings your layout back. Things that only make sense on one machine are left out.
const SYNC_EXCLUDE: (keyof AppSettings)[] = ["gifKey", "sidebarWidth"];
const TS_KEY = "pager.settingsUpdatedAt";
let updatedAt = (() => { try { return Number(localStorage.getItem(TS_KEY) ?? 0) || 0; } catch { return 0; } })();
const localListeners = new Set<() => void>();
/** Settings belong to one device, found by its name: two computers or browsers never share them. */
export function deviceKey(): string {
  const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "device";
  if (typeof window === "undefined") return "web.test";
  if (window.pagerDesktop) return `desktop.${slug(window.pagerDesktop.hostname || "computer")}`;
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "edge" : /Firefox\//.test(ua) ? "firefox" : /Chrome\//.test(ua) ? "chrome" : /Safari\//.test(ua) ? "safari" : "browser";
  const os = /Windows/.test(ua) ? "windows" : /Android/.test(ua) ? "android" : /iPhone|iPad/.test(ua) ? "ios" : /Mac OS/.test(ua) ? "mac" : /Linux/.test(ua) ? "linux" : "os";
  return `web.${browser}-${os}`;
}
export const settingsKind = deviceKey;
export const settingsSyncType = () => `app.pager.settings.${deviceKey()}`;
export const getSettingsUpdatedAt = () => updatedAt;
export function settingsPayload(): { v: 1; updatedAt: number; settings: Partial<AppSettings> } {
  const s: Partial<AppSettings> = { ...raw };
  for (const k of SYNC_EXCLUDE) delete s[k];
  return { v: 1, updatedAt, settings: s };
}
/** Applies settings saved in the account if they are newer than ours. Returns whether anything changed. */
export function applyRemoteSettings(content: unknown): boolean {
  const c = content as { updatedAt?: number; settings?: Partial<AppSettings> } | undefined;
  if (!c || typeof c.updatedAt !== "number" || !c.settings || c.updatedAt <= updatedAt) return false;
  const next: Partial<AppSettings> = { ...c.settings };
  for (const k of SYNC_EXCLUDE) delete next[k];
  raw = { ...raw, ...next };
  state = raw;
  updatedAt = c.updatedAt;
  try { localStorage.setItem(KEY, JSON.stringify(raw)); localStorage.setItem(TS_KEY, String(updatedAt)); } catch { /* storage may be unavailable */ }
  listeners.forEach((l) => l());
  return true;
}
/** Called after you change a setting on this device (not when settings arrive from the account). */
export function onLocalSettingsChange(cb: () => void) { localListeners.add(cb); return () => { localListeners.delete(cb); }; }

export const getSettings = () => state;
/** Your own choices, without E-ink's overrides (this is what gets saved and shown on the settings page). */
export const getRawSettings = () => raw;
export function updateSettings(patch: Partial<AppSettings>) {
  raw = { ...raw, ...patch };
  state = raw;
  updatedAt = Date.now();
  try { localStorage.setItem(KEY, JSON.stringify(raw)); localStorage.setItem(TS_KEY, String(updatedAt)); } catch { /* storage may be unavailable */ }
  listeners.forEach((l) => l());
  localListeners.forEach((l) => l());
}
export const resetSettings = () => updateSettings({ ...DEFAULTS });
export function useSettings(): AppSettings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => state);
}
/** For the settings page: shows your real choices, not E-ink's overrides. */
export function useRawSettings(): AppSettings {
  return useSyncExternalStore((cb) => { listeners.add(cb); return () => listeners.delete(cb); }, () => raw);
}

/** Is [minuteOfDay] inside a quiet-hours window that may wrap midnight? */
export function inQuietHours(s: AppSettings, minuteOfDay: number): boolean {
  if (!s.quietHoursEnabled || s.quietStartMin === s.quietEndMin) return false;
  return s.quietStartMin < s.quietEndMin
    ? minuteOfDay >= s.quietStartMin && minuteOfDay < s.quietEndMin
    : minuteOfDay >= s.quietStartMin || minuteOfDay < s.quietEndMin;
}

export const ACCENTS: Record<string, { dark: string; light: string; onDark: string; onLight: string }> = {
  teal: { dark: "#2dd4bf", light: "#0d9488", onDark: "#04201c", onLight: "#ffffff" },
  blue: { dark: "#60a5fa", light: "#2563eb", onDark: "#061a38", onLight: "#ffffff" },
  purple: { dark: "#c4a1ff", light: "#7c3aed", onDark: "#1e0b3d", onLight: "#ffffff" },
  pink: { dark: "#f9a8d4", light: "#db2777", onDark: "#3b0a23", onLight: "#ffffff" },
  orange: { dark: "#fdba74", light: "#ea580c", onDark: "#3a1a04", onLight: "#ffffff" },
  green: { dark: "#86efac", light: "#16a34a", onDark: "#062b12", onLight: "#ffffff" },
  red: { dark: "#fca5a5", light: "#dc2626", onDark: "#3b0a0a", onLight: "#ffffff" },
};

/** Writes the theme to CSS variables on <html>. */
/** What the desktop app tells us about the operating system's theme. */
export interface SystemTheme { dark: boolean; source: string; name?: string; bg?: string; panel?: string; fg?: string; accent?: string; accentInk?: string }
let system: SystemTheme | undefined;
export function setSystemTheme(t: SystemTheme | undefined) { system = t; listeners.forEach((l) => l()); }
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

export function applyTheme(s: AppSettings) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = s.themeMode === "dark" || s.themeMode === "black" || (s.themeMode === "system" && prefersDark);
  const a = ACCENTS[s.accent] ?? ACCENTS.teal;
  const r = document.documentElement;
  r.dataset.theme = dark ? (s.themeMode === "black" ? "black" : "dark") : "light";
  r.style.setProperty("--accent", dark ? a.dark : a.light);
  r.style.setProperty("--accent-ink", dark ? a.onDark : a.onLight);
  r.style.setProperty("--font-scale", String(s.fontScale));
  // Desktop app: borrow the operating system's colors (KDE Plasma, GNOME, Windows, macOS).
  const sys = s.themeFollowSystem && window.pagerDesktop ? system : undefined;
  const props = ["--bg", "--panel", "--panel-2", "--line", "--text", "--muted", "--theirs"];
  if (sys?.bg && sys.fg && sys.panel) {
    const isDark = lum(sys.bg) < 0.4;
    r.dataset.theme = isDark ? "dark" : "light";
    r.style.setProperty("--bg", sys.bg); r.style.setProperty("--panel", sys.panel); r.style.setProperty("--text", sys.fg);
    r.style.setProperty("--theirs", sys.panel);
    r.style.setProperty("--panel-2", `color-mix(in srgb, ${sys.panel} 90%, ${sys.fg})`);
    r.style.setProperty("--line", `color-mix(in srgb, ${sys.bg} 85%, ${sys.fg})`);
    r.style.setProperty("--muted", `color-mix(in srgb, ${sys.fg} 62%, ${sys.bg})`);
  } else props.forEach((p) => r.style.removeProperty(p));
  if (sys?.accent) {
    r.style.setProperty("--accent", sys.accent);
    r.style.setProperty("--accent-ink", sys.accentInk ?? (lum(sys.accent) > 0.45 ? "#111418" : "#ffffff"));
  }
  r.dataset.bubble = s.bubbleStyle;
  r.dataset.fill = s.bubbleFill;
  r.dataset.depth = s.bubbleDepth;
  r.dataset.anim = s.messageAnimation;
  r.dataset.density = s.density;
  r.dataset.motion = s.reduceMotion ? "reduced" : "full";
  r.dataset.wallpaper = s.wallpaper;
}
