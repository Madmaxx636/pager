import { AppSettings, inQuietHours } from "./settings";

/** What to do with one incoming message, from every notification setting. Pure, so it is the same everywhere and testable. */
export interface PolicyInput {
  roomId: string;
  network: string;
  isGroup: boolean;
  mentioned: boolean;
  replyToMe?: boolean;
  text: string;
  /** Chat is muted or in Low priority. */
  quiet: boolean;
  pinned: boolean;
  nowMin: number;
  /** 0 = Sunday. */
  day: number;
}
export interface Decision {
  show: boolean;
  /** Show it, but without sound or vibration. */
  silent: boolean;
  preview: "full" | "sender" | "hidden";
  /** It is about you: a mention, a reply or one of your keywords. */
  direct: boolean;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
export function keywordHit(text: string, keywords: string[]): boolean {
  return keywords.some((k) => k.trim() && new RegExp(`(^|[^\\p{L}\\p{N}])${escape(k.trim())}($|[^\\p{L}\\p{N}])`, "iu").test(text));
}

type Slice = Pick<AppSettings, "notifEnabled" | "notifScope" | "notifGroupMentionsOnly" | "notifMutedNetworks" | "notifNetworkMode" | "notifChat" | "notifKeywords" | "notifQuietDays" | "notifQuietBreakThrough" | "notifPreview" | "notifSound" | "quietHoursEnabled" | "quietStartMin" | "quietEndMin">;

export function decide(m: PolicyInput, s: Slice): Decision {
  const direct = m.mentioned || !!m.replyToMe || keywordHit(m.text, s.notifKeywords);
  const chat = s.notifChat[m.roomId] ?? {};
  const chatMode = chat.mode && chat.mode !== "default" ? chat.mode : undefined;
  const netMode = s.notifNetworkMode[m.network] ?? (s.notifMutedNetworks.includes(m.network) ? "none" : "all");
  const preview = chat.preview === "show" ? "full" : chat.preview === "hide" ? "hidden" : s.notifPreview;
  const no: Decision = { show: false, silent: true, preview, direct };

  if (!s.notifEnabled || chatMode === "none") return no;

  // Is this kind of message allowed at all?
  let allowed: boolean;
  if (chatMode === "mentions") allowed = direct;
  else if (chatMode === "all") allowed = true;
  else if (netMode === "none") allowed = false;
  else if (netMode === "mentions") allowed = direct;
  else {
    allowed = s.notifScope === "dm_mentions" ? !m.isGroup || direct : s.notifScope === "favorites" ? m.pinned || direct : true;
    if (m.isGroup && s.notifGroupMentionsOnly && !direct) allowed = false;
  }
  // Muted and Low priority chats stay quiet except for things about you.
  if (m.quiet && !direct) allowed = false;
  if (!allowed) return no;

  // Quiet hours: still shown, without sound, unless it is important to you and you allowed that.
  const inQuiet = s.notifQuietDays.includes(m.day) && inQuietHours(s as AppSettings, m.nowMin);
  const breaks = inQuiet && (m.pinned || direct) && s.notifQuietBreakThrough;
  const silent = (inQuiet && !breaks) || !s.notifSound || chat.sound === "off";
  return { show: true, silent, preview, direct };
}
