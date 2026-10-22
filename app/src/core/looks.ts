import type { AppSettings } from "./settings";

/**
 * Messenger looks: a whole app style modelled on a well-known messenger (drawn fresh, with no artwork or logos from the originals).
 * Choosing one sets colours, bubble shapes, type and motion together, and styles.css adds what settings alone cannot (headers, composer, reactions,
 * how things move). Your own settings are untouched underneath: switch back to "None" and they are as you left them.
 */
export type LookId = "none" | "imessage" | "hangouts" | "gmessages";
export interface Look { id: LookId; name: string; blurb: string; swatch: [string, string, string]; patch: Partial<AppSettings> }

export const LOOKS: Look[] = [
  {
    id: "imessage", name: "Messages (iPhone)", blurb: "Blue and gray bubbles with tails, a round message field, springy sends and “Delivered / Read” under your last message.", swatch: ["#0a84ff", "#e9e9eb", "#ffffff"],
    patch: {
      accent: "custom", accentCustom: "#0a84ff", palette: "none", fontFamily: "sf", reactionStyle: "filled", bubbleStyle: "tail", outStyle: "tail", bubbleFill: "solid", bubbleBorder: "none", outBorder: "",
      bubbleRadius: 18, outRadius: -1, bubbleWidth: 74, bubbleDepth: "flat", bubbleNative: false,
      bubbleMine: "#0a84ff", bubbleMineDark: "#0a84ff", bubbleMineText: "#ffffff", bubbleMineTextDark: "#ffffff",
      bubbleTheirs: "#e9e9eb", bubbleTheirsDark: "#26262a", bubbleTheirsText: "#000000", bubbleTheirsTextDark: "#ffffff",
      messageAnimation: "pop", wallpaper: "none", colorSenderNames: false, avatarShape: "circle", showMessageTimes: false, showReadTicks: true, density: "comfortable",
    },
  },
  {
    id: "hangouts", name: "Hangouts (classic)", blurb: "Green header, flat cards with soft shadows, a circle photo beside each message, and a round green compose button.", swatch: ["#0f9d58", "#ffffff", "#e0e0e0"],
    patch: {
      accent: "custom", accentCustom: "#0f9d58", palette: "none", fontFamily: "roboto", reactionStyle: "filled", bubbleStyle: "round", outStyle: "round", bubbleFill: "solid", bubbleBorder: "none", outBorder: "",
      bubbleRadius: 4, outRadius: -1, bubbleWidth: 70, bubbleDepth: "soft", bubbleNative: false,
      bubbleMine: "#0f9d58", bubbleMineDark: "#0b8043", bubbleMineText: "#ffffff", bubbleMineTextDark: "#ffffff",
      bubbleTheirs: "#ffffff", bubbleTheirsDark: "#37474f", bubbleTheirsText: "#212121", bubbleTheirsTextDark: "#eceff1",
      messageAnimation: "fade", wallpaper: "none", colorSenderNames: true, avatarShape: "circle", showAvatars: true, showMessageTimes: true, showReadTicks: true, density: "comfortable",
    },
  },
  {
    id: "gmessages", name: "Google Messages", blurb: "Big rounded bubbles that join neatly, a large title, a pill search box, a pill message field and an extended “Start chat” button.", swatch: ["#0b57d0", "#e9eef6", "#c2e7ff"],
    patch: {
      accent: "custom", accentCustom: "#0b57d0", palette: "none", fontFamily: "googlesans", reactionStyle: "filled", bubbleStyle: "round", outStyle: "round", bubbleFill: "solid", bubbleBorder: "none", outBorder: "",
      bubbleRadius: 20, outRadius: -1, bubbleWidth: 78, bubbleDepth: "flat", bubbleNative: false,
      bubbleMine: "#0b57d0", bubbleMineDark: "#a8c7fa", bubbleMineText: "#ffffff", bubbleMineTextDark: "#062e6f",
      bubbleTheirs: "#e9eef6", bubbleTheirsDark: "#2b2f33", bubbleTheirsText: "#1f1f1f", bubbleTheirsTextDark: "#e3e3e3",
      messageAnimation: "slide", wallpaper: "none", colorSenderNames: false, avatarShape: "circle", showMessageTimes: true, showReadTicks: true, density: "comfortable",
    },
  },
];
export const lookById = (id: string) => LOOKS.find((l) => l.id === id);

/** What the look overrides, on top of your own settings. Desktop operating-system styles step aside while a look is on. */
export function withLook(s: AppSettings): AppSettings {
  const l = s.look && s.look !== "none" ? lookById(s.look) : undefined;
  return l ? { ...s, ...l.patch, skin: "default" } : s;
}
