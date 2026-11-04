import { useEffect, useState } from "react";
import { setKeyFlow } from "../core/keyflow";
import { useEncryption, useStore } from "../core/store";
import { RecoveryKeyDialog, RestoreDialog } from "./KeyDialogs";

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
  // A new account's key is made the moment its screen opens, and making it flips "backed up" to true, which used to close the screen again before
  // the key had been shown. Once the screen has opened for a new key it stays until the key has been saved.
  const needsNewKey = e.ready && !e.backupHere && !seen(key) && !(e.backupOnServer && !fresh) && !(e.keyChanged && !seen(`pager.keychanged.${user}.${e.deviceId}.${e.serverVersion ?? ""}`));
  const [keyShown, setKeyShown] = useState(false);
  // The same for a new device on an existing account: entering the key makes this device "backed up", which used to remove the screen along with its "restored" message.
  const needsRestore = !keyShown && e.ready && !e.backupHere && !seen(key) && e.backupOnServer && !fresh && !(e.keyChanged && !seen(`pager.keychanged.${user}.${e.deviceId}.${e.serverVersion ?? ""}`));
  const [restoreShown, setRestoreShown] = useState(false);
  useEffect(() => { if (needsNewKey) setKeyShown(true); }, [needsNewKey]);
  useEffect(() => { if (needsRestore) setRestoreShown(true); }, [needsRestore]);
  useEffect(() => { setKeyFlow(keyShown || needsNewKey || restoreShown || needsRestore); return () => setKeyFlow(false); }, [keyShown, needsNewKey, restoreShown, needsRestore]);
  if (keyShown) return <RecoveryKeyDialog first onClose={() => { setKeyShown(false); mark(key); bump((n) => n + 1); }} />;
  if (restoreShown) return <RestoreDialog first onClose={() => { setRestoreShown(false); mark(key); bump((n) => n + 1); }} onLost={() => { setRestoreShown(false); setFresh(true); }} />;
  // Another device made a new recovery key: this one still saves to the old one. Ask for the new key (once per new key; Settings → Encryption stays open).
  const changedKey = `pager.keychanged.${user}.${e.deviceId}.${e.serverVersion ?? ""}`;
  if (e.ready && e.keyChanged && !seen(changedKey)) return <RestoreDialog changed onClose={() => { mark(changedKey); bump((n) => n + 1); }} onLost={() => { mark(changedKey); bump((n) => n + 1); }} />;
  if (!e.ready || e.backupHere || seen(key)) return null;
  const done = () => { mark(key); bump((n) => n + 1); };
  // Nobody has made a key yet: this is a new account. Otherwise this device is new and needs the key.
  return e.backupOnServer && !fresh
    ? <RestoreDialog first onClose={done} onLost={() => setFresh(true)} />
    : <RecoveryKeyDialog first onClose={done} />;
}
