import { useState } from "react";
import { useEncryption, useStore } from "../core/store";
import { RecoveryKeyDialog, RestoreDialog } from "./Settings";

const flag = (user: string, device: string) => `pager.keysetup.${user}.${device}`;
const seen = (k: string) => { try { return localStorage.getItem(k) === "1"; } catch { return false; } };
const mark = (k: string) => { try { localStorage.setItem(k, "1"); } catch { /* the step just shows again next time */ } };

/**
 * Right after signing in, the first thing a device does: a new account saves its recovery key, a new device on an existing account
 * enters it. One screen, one job, no choices. (The same dialogs stay available in Settings → Encryption.)
 */
export function KeySetup() {
  const e = useEncryption();
  const user = useStore((s) => s.session?.userId ?? "");
  const [, bump] = useState(0);
  const [fresh, setFresh] = useState(false);
  const key = flag(user, e.deviceId);
  if (!e.ready || e.backupHere || seen(key)) return null;
  const done = () => { mark(key); bump((n) => n + 1); };
  // Nobody has made a key yet: this is a new account. Otherwise this device is new and needs the key.
  return e.backupOnServer && !fresh
    ? <RestoreDialog first onClose={done} onLost={() => setFresh(true)} />
    : <RecoveryKeyDialog first onClose={done} />;
}
