import { useSyncExternalStore } from "react";

/** Everything the user can tune. One JSON blob in localStorage. */
export type RowAction = "none" | "archive" | "read" | "pin" | "mute" | "low" | "snooze";

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
  /** E-ink mode: black on white, no color, no animation, thick lines. */
  eink: boolean;
  /** Scales the whole interface (display size). */
  uiScale: number;
  /** Tighter layout for small screens; auto turns on below ~480×560. */
  smallScreen: "auto" | "on" | "off";
  sidebarWidth: number;
  /** Quick actions that appear when hovering a chat row (desktop's version of swipe actions). */
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
  uiZoom: number;
  closeToTray: boolean;
  startMinimized: boolean;
  launchAtLogin: boolean;
}

export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const DEFAULTS: AppSettings = {
  themeMode: "system", accent: "teal", fontScale: 1, bubbleStyle: "round", bubbleFill: "solid", bubbleDepth: "soft", messageAnimation: "pop", screenEffects: true, wallpaper: "none", timeFormat: "system", colorSenderNames: true,
  density: "comfortable", showAvatars: true, showNetworkBadges: true, showNetworkNameInRows: false, showPreviews: true, showFilterBar: true,
  showReadTicks: true, showMessageTimes: true, inboxStyle: "pro", showPinsRow: true, sortUnreadFirst: false, defaultTab: "inbox",
  avatarShape: "circle", showLabelsInFilterBar: true, reduceMotion: false, eink: false, uiScale: 1, smallScreen: "auto", sidebarWidth: 360, rowAction1: "read", rowAction2: "archive",
  enterToSend: true, sendReadReceipts: true, sendTyping: true, linkPreviews: true, autoDownload: "always", unarchiveOnMessage: true,
  confirmDelete: true, mentionSuggestions: true, markdown: true, largeEmoji: true, autoPlayGifs: true, groupGapMin: 5, markReadMode: "scrolled", openAtFirstUnread: true, gifProvider: "giphy", gifKey: "", doubleTapReact: true, quickReactions: DEFAULT_QUICK_REACTIONS, recentEmoji: [],
  notifEnabled: true, notifPreview: "full", notifSound: true, notifGroupMentionsOnly: false, notifScope: "all", notifMutedNetworks: [],
  quietHoursEnabled: false, quietStartMin: 22 * 60, quietEndMin: 7 * 60,
  hiddenNetworks: [],
  developerMode: false, shortcuts: {}, uiZoom: 1,
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
/** What the app actually uses: your settings, with E-ink mode's overrides on top. */
export function effective(s: AppSettings): AppSettings {
  if (!s.eink) return s;
  return {
    ...s, themeMode: "light", reduceMotion: true, screenEffects: false, messageAnimation: "none", bubbleFill: "solid", bubbleDepth: "flat",
    bubbleStyle: s.bubbleStyle === "plain" ? "plain" : "outline", wallpaper: "none", autoPlayGifs: false, colorSenderNames: false, showNetworkBadges: s.showNetworkBadges,
  };
}
let state: AppSettings = effective(raw);
const listeners = new Set<() => void>();

function load(): AppSettings {
  try { return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") }; } catch { return { ...DEFAULTS }; }
}

export const getSettings = () => state;
/** Your own choices, without E-ink's overrides (this is what gets saved and shown on the settings page). */
export const getRawSettings = () => raw;
export function updateSettings(patch: Partial<AppSettings>) {
  raw = { ...raw, ...patch };
  state = effective(raw);
  try { localStorage.setItem(KEY, JSON.stringify(raw)); } catch { /* storage may be unavailable */ }
  listeners.forEach((l) => l());
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
export function applyTheme(s: AppSettings) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = s.themeMode === "dark" || s.themeMode === "black" || (s.themeMode === "system" && prefersDark);
  const a = ACCENTS[s.accent] ?? ACCENTS.teal;
  const r = document.documentElement;
  r.dataset.theme = dark ? (s.themeMode === "black" ? "black" : "dark") : "light";
  r.style.setProperty("--accent", s.eink ? "#000000" : dark ? a.dark : a.light);
  r.style.setProperty("--accent-ink", s.eink ? "#ffffff" : dark ? a.onDark : a.onLight);
  r.style.setProperty("--font-scale", String(s.fontScale));
  r.dataset.eink = s.eink ? "1" : "0";
  r.style.setProperty("zoom", String(s.uiScale));
  const small = s.smallScreen === "on" || (s.smallScreen === "auto" && (window.innerWidth < 480 || window.innerHeight < 560));
  r.dataset.compact = small ? "1" : "0";
  r.dataset.bubble = s.bubbleStyle;
  r.dataset.fill = s.bubbleFill;
  r.dataset.depth = s.bubbleDepth;
  r.dataset.anim = s.messageAnimation;
  r.dataset.density = s.density;
  r.dataset.motion = s.reduceMotion ? "reduced" : "full";
  r.dataset.wallpaper = s.wallpaper;
}
