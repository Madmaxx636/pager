import { useEffect, useState } from "react";
import { createRecoveryKey, importKeyFile, removeMasterPassword, resetRecoveryKey, restoreWithMasterPassword, restoreWithRecoveryKey, setMasterPassword, showRecoveryKey, useEncryption } from "../core/store";
import { passwordProblem } from "../core/keyvault";
import { Modal } from "./common";

export function RecoveryKeyDialog({ onClose, first, reset }: { onClose: () => void; first?: boolean; reset?: boolean }) {
  const [key, setKey] = useState<string>();
  const [err, setErr] = useState("");
  const [saved, setSaved] = useState(false);
  // A key already exists for this account: making another one replaces it, and the old one stops working. Ask first.
  const hasOne = useEncryption().backupOnServer;
  const [sure, setSure] = useState(!hasOne);
  useEffect(() => { if (sure) (reset ? resetRecoveryKey() : createRecoveryKey()).then(setKey).catch((e) => setErr(e.message)); }, [sure]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!sure && reset) return (
    <Modal title="Reset your recovery key everywhere?" onClose={onClose}>
      <p>This <b>wipes the saved copy of all your old message keys</b> from your server and makes one new recovery key for this Pager account.</p>
      <ul className="muted">
        <li>The old recovery key stops working, on every device.</li>
        <li>This device keeps the keys it has and saves them under the new key.</li>
        <li>Your other devices will ask you for the new key. Until you enter it there, they can't read new encrypted messages' history or save keys.</li>
        <li>A device you sign in later with the new key can read only what this device holds.</li>
      </ul>
      <div className="row-end"><button className="link" onClick={onClose}>Go back</button><button className="primary danger" onClick={() => setSure(true)}>Wipe and make a new key</button></div>
    </Modal>
  );
  if (!sure) return (
    <Modal title="Replace your recovery key?" onClose={onClose}>
      <p>This account already has a recovery key. A new one <b>replaces it</b>: the old key stops working, including on your other devices' backups.</p>
      <p className="muted">If you meant to open your history on this device, go back and enter the key you saved, or use a signed-in device's key file instead.</p>
      <div className="row-end"><button className="link" onClick={onClose}>Go back</button><button className="primary danger" onClick={() => setSure(true)}>Replace my key</button></div>
    </Modal>
  );
  return (
    <Modal title={first ? "Save your recovery key" : reset ? "Your new recovery key" : "Your recovery key"} onClose={() => { if (!key || saved) onClose(); }}>
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

const isKeyFile = (t: string) => t.includes("BEGIN MEGOLM SESSION DATA");
const saveKeyAsFile = (key: string) => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([`Pager recovery key\n\n${key}\n`], { type: "text/plain" })); a.download = "pager-recovery-key.txt"; a.click(); };

/**
 * Opens the history on this device. Three ways in: the master password, the recovery key (typed, pasted, or the text file it was saved in),
 * or a key file made with a passphrase. Only the first two switch the recovery backup on, so new messages keep arriving.
 */
export function RestoreDialog({ onClose, onLost, first, changed }: { onClose: () => void; onLost: () => void; first?: boolean; changed?: boolean }) {
  const hasPassword = !!useEncryption().vault;
  const [mode, setMode] = useState<"password" | "key">(hasPassword ? "password" : "key");
  const [text, setText] = useState("");
  const [name, setName] = useState("");
  const [pass, setPass] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ n: number; file?: boolean }>();
  const file = isKeyFile(text);
  const ready = mode === "password" ? !!pass : file ? !!pass : !!text.trim();
  const go = () => {
    setBusy(true); setErr("");
    (mode === "password" ? restoreWithMasterPassword(pass).then((n) => ({ n })) : file ? importKeyFile(text, pass).then((n) => ({ n, file: true })) : restoreWithRecoveryKey(text).then((n) => ({ n })))
      .then(setDone).catch((e) => setErr(e.message)).finally(() => setBusy(false));
  };
  return (
    <Modal title={changed ? "Your recovery key was changed" : hasPassword ? "Open your history" : first ? "Welcome back. Enter your recovery key" : "Enter your recovery key"} onClose={onClose}>
      {done ? (
        <>
          <p>Restored {done.n} message keys. Older messages in your encrypted pages can be read now.</p>
          {done.file && <p className="warn">A key file holds only the keys that existed when it was saved, and it doesn't switch your recovery backup on. For messages since then, and so new ones keep working on this device, also enter your recovery key{hasPassword ? " (or master password)" : ""}: Settings → Privacy &amp; security → Encryption.</p>}
        </>
      ) : (
        <>
          {changed && <p>A new recovery key was made on another device. Enter the new key so this device can read the new backup and keep saving to it.</p>}
          {mode === "password" ? (
            <>
              <p className="muted">Enter the master password you chose. Your recovery key is unlocked with it.</p>
              <input type="password" autoFocus placeholder="Master password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && ready && !busy) go(); }} />
            </>
          ) : (
            <>
              <textarea rows={3} autoFocus placeholder="EsTc 4xYz …" value={text} onChange={(e) => { setText(e.target.value); setName(""); }} spellCheck={false} />
              <label className="muted small">Or open a file: <input type="file" accept=".txt,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) { setText(await f.text()); setName(f.name); } }} /></label>
              {file && <><p className="muted small">{name || "That"} is a key file, not a recovery key. Enter the passphrase you chose when you saved it.</p><input type="password" placeholder="Key file passphrase" value={pass} onChange={(e) => setPass(e.target.value)} /></>}
            </>
          )}
          {err && <p className="error">{err}</p>}
          {hasPassword && <p className="small"><button className="link inline" onClick={() => { setMode(mode === "password" ? "key" : "password"); setErr(""); setPass(""); }}>{mode === "password" ? "Use the recovery key or a file instead" : "Use my master password instead"}</button></p>}
        </>
      )}
      {!done && !changed && <p className="muted small">Lost everything? Another signed-in device can show your recovery key (Settings → Privacy &amp; security → Encryption → Show recovery key). If you have no way back, <button className="link inline" onClick={onLost}>start fresh with a new key</button>: you can read and send new messages, but older encrypted ones stay unreadable.</p>}
      <div className="row-end">
        <button className="link" onClick={onClose}>{done ? "Close" : changed ? "Later" : "Cancel"}</button>
        {!done && <button className="primary" disabled={busy || !ready} onClick={go}>{busy ? (mode === "password" ? "Unlocking…" : "Restoring…") : "Restore"}</button>}
      </div>
    </Modal>
  );
}

/** Sets or changes the master password: a copy of the recovery key locked with it, kept in your account. */
export function MasterPasswordDialog({ onClose }: { onClose: () => void }) {
  const [pass, setPass] = useState("");
  const [again, setAgain] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const problem = pass ? passwordProblem(pass) : undefined;
  return (
    <Modal title="Master password" onClose={onClose}>
      {done ? <p>Done. On any device you sign in to, this password now brings back your recovery key and your history.</p> : (
        <>
          <p>Choose a password that unlocks your recovery key. Then you can see, copy or use the key from any device without having kept the file.</p>
          <p className="muted small">A locked copy of the key is kept on your server. Pager can't read it, but anyone who could copy it could keep guessing the password, so make it long: four or more random words is good. Don't reuse your account password.</p>
          <input type="password" autoFocus placeholder="Master password" value={pass} onChange={(e) => setPass(e.target.value)} />
          <input type="password" placeholder="Again" value={again} onChange={(e) => setAgain(e.target.value)} />
          {problem && <p className="warn small">{problem}</p>}
          {err && <p className="error">{err}</p>}
        </>
      )}
      <div className="row-end"><button className="link" onClick={onClose}>{done ? "Close" : "Cancel"}</button>
        {!done && <button className="primary" disabled={busy || !pass || !!problem || pass !== again} onClick={() => { setBusy(true); setErr(""); setMasterPassword(pass).then(() => setDone(true)).catch((e) => setErr(e.message)).finally(() => setBusy(false)); }}>{busy ? "Locking…" : "Set password"}</button>}</div>
    </Modal>
  );
}

/** Takes the master password off after a clear warning. */
export function RemoveMasterPasswordDialog({ onClose }: { onClose: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="Remove the master password?" onClose={onClose}>
      <p>The locked copy of your recovery key is deleted from your server. Your recovery key itself and your history are not changed, but a new device will need the key you saved.</p>
      {err && <p className="error">{err}</p>}
      <div className="row-end"><button className="link" onClick={onClose}>Cancel</button>
        <button className="primary danger" disabled={busy} onClick={() => { setBusy(true); removeMasterPassword().then(onClose).catch((e) => { setErr(e.message); setBusy(false); }); }}>Remove</button></div>
    </Modal>
  );
}

/** Shows this account's recovery key to copy or save. With a master password set, the password is asked for first. */
export function ShowKeyDialog({ onClose }: { onClose: () => void }) {
  const needsPassword = !!useEncryption().vault;
  const [pass, setPass] = useState("");
  const [key, setKey] = useState<string>();
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const open = () => { setBusy(true); setErr(""); showRecoveryKey(pass).then(setKey).catch((e) => setErr(e.message)).finally(() => setBusy(false)); };
  useEffect(() => { if (!needsPassword) open(); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Modal title="Your recovery key" onClose={onClose}>
      {key ? (
        <>
          <p className="muted">Anyone with this can read your history. Enter it on a new device, or keep it in a password manager.</p>
          <pre className="recovery-key">{key}</pre>
          <div className="row-end"><button className="link" onClick={() => { void navigator.clipboard.writeText(key).then(() => setCopied(true)); }}>{copied ? "Copied" : "Copy"}</button><button className="link" onClick={() => saveKeyAsFile(key)}>Download</button></div>
        </>
      ) : needsPassword ? (
        <>
          <p>Enter your master password to show the key.</p>
          <input type="password" autoFocus placeholder="Master password" value={pass} onChange={(e) => setPass(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && pass && !busy) open(); }} />
          {err && <p className="error">{err}</p>}
        </>
      ) : err ? <p className="error">{err}</p> : <p className="muted">Reading your key…</p>}
      <div className="row-end"><button className="link" onClick={onClose}>Close</button>
        {!key && needsPassword && <button className="primary" disabled={busy || !pass} onClick={open}>{busy ? "Unlocking…" : "Show key"}</button>}</div>
    </Modal>
  );
}
