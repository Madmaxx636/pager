import type { AdminIncident } from "./api";

export const ago = (t: number) => { const s = Math.max(0, Date.now() / 1000 - t); return s < 90 ? "just now" : s < 5400 ? `${Math.round(s / 60)} min ago` : s < 129600 ? `${Math.round(s / 3600)} h ago` : `${Math.round(s / 86400)} days ago`; };
export const SEV_LABEL: Record<AdminIncident["severity"], string> = { crash: "Crash", error: "Error", attention: "Needs attention", warning: "Warning" };
/** One incident as plain text, to copy or send: the lines before, the event, the lines after. */
export function incidentText(i: AdminIncident): string {
  const when = (t: number) => new Date(t * 1000).toLocaleString();
  return [`${SEV_LABEL[i.severity]} in ${i.service} (${i.count === 1 ? "once" : `${i.count} times`}), first ${when(i.first)}, last ${when(i.last)}`, "", ...(i.before.length ? ["Before:", ...i.before.map((l) => "  " + l), ""] : []), "Event:", "  " + i.message, ...(i.after.length ? ["", "After:", ...i.after.map((l) => "  " + l)] : [])].join("\n");
}

