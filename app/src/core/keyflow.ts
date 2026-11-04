import { useSyncExternalStore } from "react";

/** Whether the "save your recovery key" screen is up. The welcome tour waits for it, and it must stay up until the key has been saved. */
let open = false;
const listeners = new Set<() => void>();
export const setKeyFlow = (v: boolean) => { if (open === v) return; open = v; listeners.forEach((f) => f()); };
export const useKeyFlowOpen = () => useSyncExternalStore((f) => { listeners.add(f); return () => { listeners.delete(f); }; }, () => open);
