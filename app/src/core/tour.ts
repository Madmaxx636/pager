import type { MascotMood } from "../ui/Mascot";

/** One bubble of the welcome tour: what Pager says, how it looks while saying it, and an optional button that takes you somewhere. */
export interface TourStep { id: string; text: string; mood: MascotMood; action?: { label: string; go: string } }

export interface TourFacts { admin: boolean; hasKey: boolean; server: string; /** The desktop app, which has looks to choose from. */ desktop?: boolean }

/** The tour for this person: administrators also hear about inviting people. Short on purpose; every step is one or two sentences. */
export function tourSteps(f: TourFacts): TourStep[] {
  const steps: TourStep[] = [
    { id: "hello", mood: "idle", text: "Hi! I'm Pager. I'll show you around. It takes about a minute!" },
    { id: "pages", mood: "ring", text: "Every chat from every app lands here as a Page. One inbox for everything. Beep!" },
    { id: "connect", mood: "idle", text: "First, let's plug in an app. WhatsApp, Signal, Messenger, Google Messages and more are ready to go.", action: { label: "Connect an app", go: "settings/bridges" } },
    f.hasKey
      ? { id: "secure", mood: "idle", text: "Your messages are locked so only your own devices can read them. Keep your recovery key safe. It's the only way back in on a new phone!" }
      : { id: "secure", mood: "idle", text: "Your messages are locked so only your own devices can read them. Make a recovery key now, so a lost phone never means lost history!", action: { label: "Make my key", go: "settings/privacy" } },
  ];
  if (f.admin) steps.push({ id: "people", mood: "ring", text: "You're the boss here! Invite your family and friends from Admin. Share the invite code, never your password.", action: { label: "Open Admin", go: "settings/admin" } });
  if (f.desktop) steps.push({ id: "looks", mood: "ring", text: "Make me yours! Pick a look: Windows, macOS, KDE, GNOME and more. Round, soft buttons and all. Beep!", action: { label: "Choose a look", go: "settings/appearance" } });
  steps.push(
    { id: "phone", mood: "idle", text: `Take me with you! On your phone, open ${f.server.replace(/^https?:\/\//, "")} to get the app.` },
    { id: "done", mood: "ring", text: "That's everything! Tap Page someone whenever you want to start a chat. I'll be right here!" },
  );
  return steps;
}

/** How much of [text] is showing after [ms] milliseconds of typing. */
export function typedLength(text: string, ms: number, msPerChar = 22): number {
  return Math.max(0, Math.min(text.length, Math.floor(ms / msPerChar)));
}

export const TOUR_TYPE = "app.pager.tour";
