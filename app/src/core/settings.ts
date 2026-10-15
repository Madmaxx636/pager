import { FONTS, paletteById } from "./palettes";
import { wallpaperCss } from "./wallpapers";
import { skinById } from "./skins";
import { useSyncExternalStore } from "react";

export type BubbleBorder = "none" | "solid" | "dotted" | "dashed" | "thick" | "edge" | "dashdot";

/** Everything the user can tune. One JSON blob in localStorage. */
export type RowAction = "none" | "archive" | "read" | "pin" | "mute" | "low" | "snooze";

export type ChatNotifPrefs = { level?: "default" | "priority" | "silent"; soundId?: string; mode?: "default" | "all" | "mentions" | "none"; preview?: "default" | "show" | "hide"; sound?: "default" | "off" };

export interface AppSettings {
  // Appearance
  themeMode: "system" | "light" | "dark" | "black";
  accent: string; // teal | blue | purple | pink | orange | green | red | custom | system (desktop: the operating system's accent)
  /** The colour used when accent is "custom" (#rrggbb). */
  accentCustom: string;
  fontScale: number;
  /** Size of the whole app, not only text. */
  uiScale: "small" | "medium" | "large";
  /** A ready-made look (see palettes.ts), or "none" to use the mode and accent. */
  palette: string;
  fontFamily: string;
  reactionStyle: "filled" | "outline";
  hideStories: boolean;
  /** Desktop app only: a ready-made look (see skins.ts). "default" is the look Pager always had. */
  skin: string;
  /** An accent chosen for that look; empty uses the look's own. */
  skinAccent: string;
  /** Extra motion in the desktop looks: menus that slide, buttons that press, bubbles that pop. */
  fancyMotion: boolean;
  /** Deleting a chat in Pager also deletes it on its own network (Signal, WhatsApp, Google Messages). Off unless you turn it on, because it cannot be undone. */
  deleteAtSource: boolean;
  /** Turn voice messages into text as you see them (needs transcription switched on at your server). */
  autoTranscribe: boolean;
  /** Sound when you get a reaction while inside that page. */
  reactionSound: string;
  /** Beeper's shapes: round (no tail), curved tail, pointed tail, and outlined. Settings from older versions are mapped onto these. */
  bubbleStyle: "round" | "curved" | "tail" | "outline";
  bubbleFill: "solid" | "gradient" | "tinted" | "glass";
  /** Colour of your own bubbles and of theirs; empty follows the theme and accent. */
  /** The outgoing side's own shape, roundness and border; empty / -1 follow the incoming side (the plain settings above are the incoming ones). */
  outStyle: "" | "round" | "curved" | "tail" | "outline";
  outRadius: number;
  outBorder: "" | BubbleBorder;
  outBorderColor: string;
  /** Dark-theme colours, and the text on them; bubbleMine / bubbleTheirs are the light-theme ones. */
  bubbleMineDark: string;
  bubbleTheirsDark: string;
  bubbleMineText: string;
  bubbleTheirsText: string;
  bubbleMineTextDark: string;
  bubbleTheirsTextDark: string;
  /** Incoming bubbles take each network's own colour. */
  bubbleNative: boolean;
  bubbleMine: string;
  /** The line around bubbles: none, solid, dotted or dashed, and its colour (empty follows the theme). */
  bubbleBorder: BubbleBorder;
  bubbleBorderColor: string;
  bubbleTheirs: string;
  /** Corner roundness in px (0 = what the bubble style says) and the widest a bubble may get, as a percent of the chat (0 = default). */
  bubbleRadius: number;
  bubbleWidth: number;
  /** How much the wallpaper is darkened, 0 to 70 percent. */
  wallpaperDim: number;
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
  /** Open a chat at its 'New messages' line instead of at the newest message. */
  openAtUnread: boolean;
  /** The app icon you picked (see core/appicons.ts). */
  appIcon: string;
  /** For a slow or limited connection: nothing downloads by itself, smaller pictures, less background traffic. */
  lowData: boolean;
  /** For an older or slower computer: no animation, no effects, no blur or shadows, fewer messages kept in memory. */
  lowEnd: boolean;
  /** Old single-provider setting (Tenor is gone); kept only so older saved settings still load. Use gifKeys. */
  gifProvider: "giphy" | "tenor";
  gifKey: string;
  /** Your GIF search keys, by provider (giphy, klipy). */
  gifKeys: Record<string, string>;
  doubleTapReact: boolean;
  /** Swipe a message to the right to reply (touch, or two fingers on a trackpad). */
  swipeToReply: boolean;
  /** A silly pager message when the app opens. */
  greetings: boolean;
  quickReactions: string[];
  /** The reaction a double-click adds. */
  doubleTapEmoji: string;
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
  /** How direct messages and group chats notify when nothing more specific is set. */
  notifDirectMode: "all" | "mentions" | "none";
  notifGroupMode: "all" | "mentions" | "none";
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
  /** Sounds for sending and receiving, only while you are inside that page. */
  convoSounds: boolean;
  sendSound: string;
  receiveSound: string;
  convoSoundVolume: number;
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
  /** Desktop app: use the graphics chip (smoother, about 30 MB more memory). Off by default; applies after a restart. */
  smoothGraphics: boolean;
  startMinimized: boolean;
  launchAtLogin: boolean;
}

export const DEFAULT_QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "😢", "🙏"];

export const DEFAULTS: AppSettings = {
  themeMode: "system", accent: "teal", accentCustom: "#0d9488", fontScale: 1, uiScale: "medium", palette: "none", fontFamily: "system", reactionStyle: "filled", hideStories: false, skin: "default", skinAccent: "", fancyMotion: true, deleteAtSource: false, autoTranscribe: false, reactionSound: "tick", bubbleStyle: "round", bubbleFill: "solid", bubbleBorder: "none", bubbleBorderColor: "", outStyle: "", outRadius: -1, outBorder: "", outBorderColor: "", bubbleMineDark: "", bubbleTheirsDark: "", bubbleMineText: "", bubbleTheirsText: "", bubbleMineTextDark: "", bubbleTheirsTextDark: "", bubbleNative: false, bubbleMine: "", bubbleTheirs: "", bubbleRadius: 0, bubbleWidth: 0, wallpaperDim: 0, bubbleDepth: "soft", messageAnimation: "pop", screenEffects: true, wallpaper: "none", timeFormat: "system", colorSenderNames: true,
  density: "comfortable", showAvatars: true, showNetworkBadges: true, showNetworkNameInRows: false, showPreviews: true, showFilterBar: true,
  showReadTicks: true, showMessageTimes: true, inboxStyle: "pro", showPinsRow: true, sortUnreadFirst: false, defaultTab: "inbox",
  avatarShape: "circle", showLabelsInFilterBar: true, reduceMotion: false, sidebarWidth: 360, themeFollowSystem: true, rowAction1: "read", rowAction2: "archive",
  enterToSend: true, sendReadReceipts: true, sendTyping: true, linkPreviews: true, autoDownload: "always", unarchiveOnMessage: true,
  doubleTapEmoji: "👍", confirmDelete: true, greetings: true, mentionSuggestions: true, markdown: true, largeEmoji: true, autoPlayGifs: true, groupGapMin: 5, markReadMode: "scrolled", openAtUnread: false, gifProvider: "giphy", gifKey: "", gifKeys: {}, lowData: false, lowEnd: false, appIcon: "classic", doubleTapReact: true, swipeToReply: true, quickReactions: DEFAULT_QUICK_REACTIONS, recentEmoji: [],
  notifEnabled: true, convoSounds: true, sendSound: "swoosh", receiveSound: "pop", convoSoundVolume: 0.5, notifPreview: "full", notifSound: true, notifGroupMentionsOnly: false, notifScope: "all", notifMutedNetworks: [], notifNetworkMode: {}, notifChat: {}, notifKeywords: [], notifQuietDays: [0, 1, 2, 3, 4, 5, 6], notifQuietBreakThrough: false, notifDelaySec: 0, notifBadge: "unmuted", notifDirectMode: "all", notifGroupMode: "all", notifSoundId: "chime", notifSoundVolume: 0.7, notifNetworkSound: {}, dndUntil: 0,
  quietHoursEnabled: false, quietStartMin: 22 * 60, quietEndMin: 7 * 60,
  hiddenNetworks: [],
  developerMode: false, shortcuts: {},
  closeToTray: true, smoothGraphics: false, startMinimized: false, launchAtLogin: false,
};

/** Every shortcut the app understands, with its default keys. Users can rebind them in Settings. */
export const SHORTCUTS: { id: string; label: string; keys: string }[] = [
  { id: "palette", label: "Command bar: jump to a page or setting", keys: "Ctrl+K" },
  { id: "newChat", label: "New page", keys: "Ctrl+N" },
  { id: "search", label: "Search all messages", keys: "Ctrl+Shift+F" },
  { id: "inChatSearch", label: "Search in this page", keys: "Ctrl+F" },
  { id: "settings", label: "Open settings", keys: "Ctrl+," },
  { id: "prevChat", label: "Previous page", keys: "Alt+ArrowUp" },
  { id: "nextChat", label: "Next page", keys: "Alt+ArrowDown" },
  { id: "nextUnread", label: "Next unread page", keys: "Alt+Shift+ArrowDown" },
  { id: "archive", label: "Archive or unarchive this page", keys: "Ctrl+Shift+A" },
  { id: "markUnread", label: "Mark this page unread", keys: "Ctrl+Shift+U" },
  { id: "mute", label: "Mute or unmute this page", keys: "Ctrl+Shift+M" },
  { id: "pin", label: "Pin or unpin this page", keys: "Ctrl+Shift+P" },
  { id: "snooze", label: "Snooze this page", keys: "Ctrl+Shift+Z" },
  { id: "help", label: "Show keyboard shortcuts", keys: "Ctrl+/" },
];

const KEY = "pager.settings";
let raw: AppSettings = load();
let state: AppSettings = effective(raw);
const listeners = new Set<() => void>();

function load(): AppSettings {
  try {
    const x = { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) ?? "{}") } as AppSettings;
    // "Do not disturb", the alert delay and the per-network settings were taken out of Settings, so whatever was saved for them is switched off.
    // One GIPHY key from before several sources existed moves into the new place. (A Tenor key is dropped: that service no longer exists.)
    if (x.gifKey && x.gifProvider !== "tenor" && !x.gifKeys?.giphy) x.gifKeys = { ...(x.gifKeys ?? {}), giphy: x.gifKey };
    return { ...x, gifKeys: x.gifKeys ?? {}, dndUntil: 0, notifDelaySec: 0, notifNetworkMode: {}, notifMutedNetworks: [], bubbleStyle: migrateBubbleStyle(x.bubbleStyle), outStyle: x.outStyle ? migrateBubbleStyle(x.outStyle) : "" };
  } catch { return { ...DEFAULTS }; }
}

/** The bubble shapes are now Beeper's three (round, curved tail, pointed tail) and outlined. Older shapes become the nearest one. */
export function migrateBubbleStyle(style: string): "round" | "curved" | "tail" | "outline" {
  return style === "round" || style === "curved" || style === "tail" || style === "outline" ? style : style === "cloud" ? "curved" : "round";
}

export interface SideLook { style: "round" | "curved" | "tail" | "outline"; radius: number; border: BubbleBorder; borderColor: string }
/** The look of one side of a conversation. Incoming bubbles use the plain settings; outgoing ones use their own where set. */
export function bubbleLook(s: AppSettings, mine: boolean): SideLook {
  if (!mine) return { style: s.bubbleStyle, radius: s.bubbleRadius, border: s.bubbleBorder, borderColor: s.bubbleBorderColor };
  return { style: s.outStyle || s.bubbleStyle, radius: s.outRadius < 0 ? s.bubbleRadius : s.outRadius, border: s.outBorder || s.bubbleBorder, borderColor: s.outBorderColor || s.bubbleBorderColor };
}

/** The colour you chose for a side's bubbles and the text on them, for the light or dark theme. Empty means follow the theme. */
export function bubbleColorsFor(s: AppSettings, mine: boolean, dark: boolean): { color: string; text: string } {
  const [c, cd, t, td] = mine ? [s.bubbleMine, s.bubbleMineDark, s.bubbleMineText, s.bubbleMineTextDark] : [s.bubbleTheirs, s.bubbleTheirsDark, s.bubbleTheirsText, s.bubbleTheirsTextDark];
  const ok = (v: string) => HEX.test(v);
  const pick = (light: string, dk: string) => (dark && ok(dk) ? dk : ok(light) ? light : "");
  return { color: pick(c, cd), text: pick(t, td) };
}

// ---- Syncing settings between your devices: only when you press the button ----------------------------------------
// Nothing here is copied automatically. "Sync settings" in Settings lets you pick which groups of settings to save from this device, and which
// to load onto it. Computers and browsers share one saved set; phones and tablets keep their own.
export interface SyncGroup { id: string; label: string; hint: string; keys: (keyof AppSettings)[] }
export const SYNC_GROUPS: SyncGroup[] = [
  { id: "look", label: "Colours and theme", hint: "Mode, accent, looks, wallpaper, font, text size, avatars", keys: ["themeMode", "accent", "accentCustom", "palette", "wallpaper", "fontFamily", "fontScale", "avatarShape", "colorSenderNames", "largeEmoji", "timeFormat"] },
  { id: "bubbles", label: "Bubbles and messages", hint: "Bubble style, fill, depth, animations, effects", keys: ["bubbleStyle", "bubbleFill", "bubbleBorder", "bubbleBorderColor", "outStyle", "outRadius", "outBorder", "outBorderColor", "bubbleMineDark", "bubbleTheirsDark", "bubbleMineText", "bubbleTheirsText", "bubbleMineTextDark", "bubbleTheirsTextDark", "bubbleNative", "bubbleMine", "bubbleTheirs", "bubbleRadius", "bubbleWidth", "wallpaperDim", "bubbleDepth", "messageAnimation", "screenEffects", "reactionStyle"] },
  { id: "reactions", label: "Reactions", hint: "Double-click reaction and swipe to reply", keys: ["doubleTapReact", "doubleTapEmoji", "swipeToReply"] },
  { id: "list", label: "Chat list", hint: "What each row shows, filters, hidden networks", keys: ["showAvatars", "showFilterBar", "showLabelsInFilterBar", "showMessageTimes", "showNetworkBadges", "showNetworkNameInRows", "showPinsRow", "showPreviews", "showReadTicks", "sortUnreadFirst", "inboxStyle", "defaultTab", "hiddenNetworks", "hideStories"] },
  { id: "notifications", label: "Notifications", hint: "What alerts you, quiet hours, previews", keys: ["notifEnabled", "notifPreview", "notifSound", "notifScope", "notifGroupMentionsOnly", "notifMutedNetworks", "notifNetworkMode", "notifKeywords", "notifQuietDays", "notifQuietBreakThrough", "notifDelaySec", "notifDirectMode", "notifGroupMode", "quietHoursEnabled", "quietStartMin", "quietEndMin"] },
  { id: "sounds", label: "Sounds", hint: "Send, receive and reaction sounds", keys: ["convoSounds", "sendSound", "receiveSound", "reactionSound"] },
  { id: "gifs", label: "GIF search keys", hint: "Your GIPHY and KLIPY keys (kept on your own server)", keys: ["gifKeys"] },
  { id: "behaviour", label: "Chat behaviour", hint: "Read marks, typing, downloads, link previews, confirmations", keys: ["lowData", "lowEnd", "markReadMode", "groupGapMin", "unarchiveOnMessage", "linkPreviews", "autoDownload", "autoPlayGifs", "sendReadReceipts", "sendTyping", "openAtUnread", "confirmDelete", "markdown", "mentionSuggestions", "greetings", "deleteAtSource", "autoTranscribe", "gifProvider"] },
  { id: "desktop", label: "Desktop style", hint: "The desktop look and extra motion (computers only)", keys: ["skin", "skinAccent", "fancyMotion"] },
];
/** Where this kind of device keeps what you save: computers and browsers together. */
export const SYNC_TYPE = "app.pager.sync.desktop";
export interface SavedSettings { v: 3; savedAt: number; from: string; settings: Partial<AppSettings> }
const groupKeys = (ids: string[]) => SYNC_GROUPS.filter((g) => ids.includes(g.id)).flatMap((g) => g.keys);
/** The settings of the chosen groups, as they are on this device now. */
export function pickSettings(ids: string[]): Partial<AppSettings> {
  const out: Partial<AppSettings> = {};
  for (const k of groupKeys(ids)) (out as Record<string, unknown>)[k] = raw[k];
  return out;
}
/** What to store when you save: what was saved before, with the chosen groups replaced by this device's. */
export function mergeSaved(previous: SavedSettings | undefined, ids: string[], from: string, now = Date.now()): SavedSettings {
  return { v: 3, savedAt: now, from, settings: { ...(previous?.settings ?? {}), ...pickSettings(ids) } };
}
/** Which groups a saved set holds (every key of the group is there). */
export function groupsIn(saved: SavedSettings | undefined): string[] {
  if (!saved?.settings) return [];
  return SYNC_GROUPS.filter((g) => g.keys.every((k) => k in saved.settings)).map((g) => g.id);
}
/** Puts the chosen groups of a saved set onto this device. Returns how many settings changed. */
export function loadSaved(saved: SavedSettings, ids: string[]): number {
  const patch: Partial<AppSettings> = {};
  for (const k of groupKeys(ids)) if (k in saved.settings && JSON.stringify(raw[k]) !== JSON.stringify(saved.settings[k])) (patch as Record<string, unknown>)[k] = saved.settings[k];
  const n = Object.keys(patch).length;
  if (n) updateSettings(patch);
  return n;
}
/** A short name for this device in a saved set ("Desktop app" or "Browser"). */
export const deviceLabel = () => (typeof window !== "undefined" && window.pagerDesktop ? `Desktop app (${window.pagerDesktop.hostname || "computer"})` : "Browser");

/**
 * What the app actually uses: your settings with the two "easy on the machine" switches applied on top. Your own choices are not changed,
 * so switching one off puts everything back as it was.
 */
export function effective(r: AppSettings): AppSettings {
  let s = r;
  if (r.lowData) s = { ...s, autoDownload: "never", autoPlayGifs: false, linkPreviews: false, autoTranscribe: false, sendTyping: false, showMessageTimes: s.showMessageTimes };
  if (r.lowEnd) s = { ...s, fancyMotion: false, reduceMotion: true, screenEffects: false, messageAnimation: "none", bubbleDepth: "flat", bubbleFill: s.bubbleFill === "glass" ? "solid" : s.bubbleFill, wallpaper: "none", skin: "default", autoPlayGifs: false, greetings: false };
  return s;
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
/** What the desktop app tells us about the operating system's theme. */
const HEX = /^#[0-9a-f]{6}$/i;
/** The accent's four tones. A custom colour is nudged so it stays readable on light and dark backgrounds. */
export function accentTones(accent: string, custom: string) {
  if (accent !== "custom") return ACCENTS[accent] ?? ACCENTS.teal; // "system" starts from teal until the desktop's own accent is applied
  const base = HEX.test(custom) ? custom : "#0d9488";
  const [h, sat, l] = rgbToHsl(base);
  const dark = hslToHex(h, sat, Math.max(l, 0.68)), light = hslToHex(h, sat, Math.min(l, 0.42));
  const ink = (c: string) => (lumOf(c) > 0.45 ? "#101418" : "#ffffff");
  return { dark, light, onDark: ink(dark), onLight: ink(light) };
}
const lumOf = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
// More accent colours, made from a hue so each one reads well on light and on dark backgrounds.
for (const [name, h, sat] of [["crimson", 350, .8], ["coral", 10, .85], ["amber", 38, .9], ["yellow", 50, .9], ["lime", 84, .65], ["mint", 150, .6], ["emerald", 160, .75], ["cyan", 188, .8], ["sky", 204, .85], ["indigo", 240, .7], ["violet", 262, .75], ["magenta", 300, .7], ["rose", 340, .8], ["brown", 28, .45], ["slate", 215, .2], ["gold", 45, .85]] as [string, number, number][]) {
  const dark = hslToHex(h, sat, .72), light = hslToHex(h, sat, .4), ink = (c: string) => (lumOf(c) > 0.45 ? "#101418" : "#ffffff");
  ACCENTS[name] = { dark, light, onDark: ink(dark), onLight: ink(light) };
}
function rgbToHsl(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16), r = ((n >> 16) & 255) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2, d = max - min;
  if (!d) return [0, 0, l];
  const s = d / (1 - Math.abs(2 * l - 1));
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [((h * 60) + 360) % 360, s, l];
}
function hslToHex(h: number, s: number, l: number) {
  const c = (1 - Math.abs(2 * l - 1)) * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = l - c / 2;
  const [r, g, b] = h < 60 ? [c, x, 0] : h < 120 ? [x, c, 0] : h < 180 ? [0, c, x] : h < 240 ? [0, x, c] : h < 300 ? [x, 0, c] : [c, 0, x];
  return "#" + [r, g, b].map((v) => Math.round((v + m) * 255).toString(16).padStart(2, "0")).join("");
}
// Plain colours of each theme; the accent is mixed into them so it colours the whole app, not just the buttons.
const BASES: Record<string, Record<string, string>> = {
  light: { "--bg": "#f2f4f7", "--panel": "#ffffff", "--panel-2": "#e9ecf1", "--line": "#e1e5ec", "--theirs": "#ffffff" },
  dark: { "--bg": "#0b0e13", "--panel": "#12161d", "--panel-2": "#1c222c", "--line": "#232a35", "--theirs": "#171c24" },
  black: { "--bg": "#000000", "--panel": "#0a0a0a", "--panel-2": "#161616", "--line": "#1d1d1d", "--theirs": "#121212" },
};
const TINT: Record<string, number> = { "--bg": 7, "--panel": 4, "--panel-2": 15, "--line": 14, "--theirs": 6 };

export interface SystemTheme { dark: boolean; source: string; name?: string; bg?: string; panel?: string; fg?: string; accent?: string; accentInk?: string }
let system: SystemTheme | undefined;
export function setSystemTheme(t: SystemTheme | undefined) { system = t; listeners.forEach((l) => l()); }
const lum = (h: string) => { const n = parseInt(h.slice(1), 16); const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };

export function applyTheme(s: AppSettings) {
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const dark = s.themeMode === "dark" || s.themeMode === "black" || (s.themeMode === "system" && prefersDark);
  const a = accentTones(s.accent, s.accentCustom);
  const r = document.documentElement;
  r.dataset.theme = dark ? (s.themeMode === "black" ? "black" : "dark") : "light";
  r.style.setProperty("--accent", dark ? a.dark : a.light);
  r.style.setProperty("--accent-ink", dark ? a.onDark : a.onLight);
  r.style.setProperty("--font-scale", String(s.fontScale));
  // Desktop app: borrow the operating system's colors (KDE Plasma, GNOME, Windows, macOS).
  const sys = s.themeFollowSystem && window.pagerDesktop ? system : undefined;
  if (sys?.bg && sys.fg && sys.panel) {
    const isDark = lum(sys.bg) < 0.4;
    r.dataset.theme = isDark ? "dark" : "light";
    // The system's colours, with a touch of the accent you chose mixed in so changing it is visible everywhere.
    const mix = (c: string, pct: number) => `color-mix(in srgb, ${c}, var(--accent) ${pct}%)`;
    r.style.setProperty("--bg", mix(sys.bg, 6)); r.style.setProperty("--panel", mix(sys.panel, 4)); r.style.setProperty("--text", sys.fg);
    r.style.setProperty("--theirs", mix(sys.panel, 5));
    r.style.setProperty("--panel-2", mix(`color-mix(in srgb, ${sys.panel} 90%, ${sys.fg})`, 12));
    r.style.setProperty("--line", mix(`color-mix(in srgb, ${sys.bg} 85%, ${sys.fg})`, 12));
    r.style.setProperty("--muted", `color-mix(in srgb, ${sys.fg} 62%, ${sys.bg})`);
  } else {
    const base = BASES[r.dataset.theme ?? "light"] ?? BASES.light;
    for (const p of Object.keys(TINT)) r.style.setProperty(p, `color-mix(in srgb, ${base[p]}, var(--accent) ${TINT[p]}%)`);
    ["--text", "--muted"].forEach((p) => r.style.removeProperty(p));
  }
  // Your accent choice wins; the system's accent is used only when you pick "System".
  if (sys?.accent && s.accent === "system") {
    r.style.setProperty("--accent", sys.accent);
    r.style.setProperty("--accent-ink", sys.accentInk ?? (lum(sys.accent) > 0.45 ? "#111418" : "#ffffff"));
  }
  // A ready-made look replaces the surface colours (and E-ink replaces everything with black and white).
  const pal = s.palette !== "none" ? paletteById(s.palette) : undefined;
  if (pal) {
    r.dataset.theme = pal.dark ? "dark" : "light";
    const v: Record<string, string> = { "--bg": pal.bg, "--panel": pal.panel, "--panel-2": pal.panel2, "--line": pal.line, "--theirs": pal.theirs, "--text": pal.text, "--muted": pal.muted };
    for (const [k, c] of Object.entries(v)) r.style.setProperty(k, c);
  }
  r.dataset.uiScale = s.uiScale;
  r.toggleAttribute("data-lowend", getRawSettings().lowEnd);
  r.dataset.reactions = s.reactionStyle;
  const fam = FONTS.find((f) => f[0] === s.fontFamily)?.[2];
  if (fam) r.style.setProperty("--font", fam); else r.style.removeProperty("--font");
  r.dataset.fill = s.bubbleFill;
  r.dataset.depth = s.bubbleDepth;
  r.dataset.anim = s.messageAnimation;
  r.dataset.density = s.density;
  r.dataset.motion = s.reduceMotion ? "reduced" : "full";
  r.dataset.wallpaper = s.wallpaper;
  r.style.setProperty("--wp-dim", String(Math.min(70, Math.max(0, s.wallpaperDim)) / 100));
  if (s.bubbleWidth >= 40) r.style.setProperty("--msg-max", `${Math.min(95, s.bubbleWidth)}%`); else r.style.removeProperty("--msg-max");
  // Desktop looks: colours, fonts and a family that restyles buttons, fields and bubbles. "default" removes every trace of them.
  const skin = window.pagerDesktop && s.skin !== "default" ? skinById(s.skin) : undefined;
  if (skin) {
    r.dataset.theme = skin.dark ? "dark" : "light";
    const accent = s.skinAccent || skin.accent;
    const ink = s.skinAccent ? (lum(accent) > 0.45 ? "#111418" : "#ffffff") : skin.accentInk ?? (lum(accent) > 0.45 ? "#111418" : "#ffffff");
    const v: Record<string, string> = { "--bg": skin.bg, "--panel": skin.panel, "--theirs": skin.panel, "--line": skin.line, "--text": skin.text, "--muted": skin.muted, "--accent": accent, "--accent-ink": ink,
      "--panel-2": `color-mix(in srgb, ${skin.bg}, ${skin.text} 7%)`, "--radius": `${skin.radius ?? 18}px`, "--tight": `${Math.min(8, Math.round((skin.radius ?? 18) / 3))}px` };
    for (const [k, c] of Object.entries(v)) r.style.setProperty(k, c);
    if (skin.font) r.style.setProperty("--font", skin.font);
    r.dataset.skin = skin.id; r.dataset.family = skin.family;
  } else { delete r.dataset.skin; delete r.dataset.family; r.style.removeProperty("--radius"); r.style.removeProperty("--tight"); }
  // Desktop: small touches of motion (slides, glides, glows, pops, breathing, fades). One switch in Settings turns them all off.
  if (window.pagerDesktop) r.dataset.fx = s.fancyMotion && !s.reduceMotion ? "on" : "off"; else delete r.dataset.fx;
  r.style.setProperty("--wp", wallpaperCss(s.wallpaper, r.dataset.theme !== "light"));
  // Linux desktop: the title bar and its window buttons take the theme's colours.
  if (window.pagerDesktop?.platform === "linux") {
    r.dataset.titlebar = "";
    window.requestAnimationFrame(() => { const cs = getComputedStyle(document.body); window.pagerDesktop?.setTitleBar?.({ color: cs.backgroundColor, symbolColor: cs.color }); });
  }
}
