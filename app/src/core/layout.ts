import { useSyncExternalStore } from "react";

/** Whether the page info panel is open. The page list steps aside while it is, so there is only ever one side panel on screen. */
let infoOpen = false;
const listeners = new Set<() => void>();
export function setInfoPanelOpen(open: boolean) { if (infoOpen !== open) { infoOpen = open; listeners.forEach((l) => l()); } }
export const useInfoPanelOpen = () => useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, () => infoOpen);
