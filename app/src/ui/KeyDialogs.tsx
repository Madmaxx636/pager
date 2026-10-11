import { useEffect, useState } from "react";
import { createRecoveryKey, restoreWithRecoveryKey, useEncryption } from "../core/store";
import { Modal } from "./common";

export function RecoveryKeyDialog({ onClose, first }: { onClose: () => void; first?: boolean }) {
  const [key, setKey] = useState<string>();
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  // A key already exists for this account: making another one replaces it, and the old one stops working. Ask first.
  const hasOne = useEncryption().backupOnServer;
  const [sure, setSure] = useState(!hasOne);
  useEffect(() => { if (sure) createRecoveryKey().then(setKey).catch((e) => setErr(e.message)); }, [sure]);
  if (!sure) return (
    <Modal title="Replace your recovery key?" onClose={onClose}>
      <p>This account already has a recovery key. A new one <b>replaces it</b>: the old key stops working, including on your other devices' backups.</p>
      <p className="muted">If you meant to open your history on this device, go back and enter the key you saved, or use a signed-in device's key file instead.</p>
      <div className="row-end"><button className="link" onClick={onClose}>Go back</button><button className="primary danger" onClick={() => setSure(true)}>Replace my key</button></div>
    </Modal>
  );
  return (
    <Modal title={first ? "Save your recovery key" : "Your recovery key"} onClose={() => { if (!key || saved) onClose(); }}>
      {err ? <p className="error">{err}</p> : !key ? <p className="muted">Making your key…</p> : (
        <>
          {first && <p>This is the one thing to keep. It opens your private messages on any new phone or computer.</p>}
          <p className="muted">Save this somewhere safe, like a password manager. Anyone with it can read your history, and without it lost devices mean lost history.</p>
          <pre className="recovery-key">{key}</pre>
          <div className="row-end"><button className="link" onClick={() => void navigator.clipboard.writeText(key)}>Copy</button>
            <button className="link" onClick={() => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`Pager recovery key\n\n${key}\n`], { type: "text/plain" })); a.download = "pager-recovery-key.txt"; a.click(); }}>Download</button></div>
          <label className="check-row"><input type="checkbox" checked={saved} onChange={(e) => setSaved(e.target.checked)} /> I saved my recovery key</label>
        </>
      )}
      <div className="row-end"><button className="primary" disabled={!!key && !saved} onClick={onClose}>{key ? "Done" : "Close"}</button></div>
    </Modal>
  );
}

export function RestoreDialog({ onClose, onLost, first }: { onClose: () => void; onLost: () => void; first?: boolean }) {
  const [text, setText] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<number>();
  return (
    <Modal title={first ? "Welcome back. Enter your recovery key" : "Enter your recovery key"} onClose={onClose}>
      {done != null ? <p>Restored {done} message keys. Older messages in your encrypted pages can be read now.</p> : (
        <>
          <textarea rows={3} autoFocus placeholder="EsTc 4xYz …" value={text} onChange={(e) => setText(e.target.value)} spellCheck={false} />
          {err && <p className="error">{err}</p>}
        </>
      )}
      {done == null && <p className="muted small">Lost it? A key file (Settings → Encryption → Restore keys from a file) or another signed-in device can still get your history back. If you have neither, <button className="link inline" onClick={onLost}>start fresh with a new key</button>: you can read and send new messages, but older encrypted ones stay unreadable.</p>}
      <div className="row-end">
        <button className="link" onClick={onClose}>{done != null ? "Close" : "Cancel"}</button>
        {done == null && <button className="primary" disabled={busy || !text.trim()} onClick={() => { setBusy(true); setErr(""); restoreWithRecoveryKey(text).then(setDone).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }}>{busy ? "Restoring…" : "Restore"}</button>}
      </div>
    </Modal>
  );
}
