import { useEffect, useState } from "react";
import { requestNotifications, restoreSession, useSignedIn, useSynced } from "./matrix";
import { Auth } from "./components/Auth";
import { Sidebar } from "./components/Sidebar";
import { Chat } from "./components/Chat";
import { AddAccount } from "./components/AddAccount";

export function App() {
  const [booting, setBooting] = useState(true);
  const signedIn = useSignedIn();
  const synced = useSynced();
  const [selected, setSelected] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    restoreSession().catch(() => {}).finally(() => setBooting(false));
  }, []);

  useEffect(() => {
    const open = (e: Event) => setSelected((e as CustomEvent<string>).detail);
    window.addEventListener("pager:open", open);
    return () => window.removeEventListener("pager:open", open);
  }, []);
  useEffect(() => {
    if (signedIn) requestNotifications();
  }, [signedIn]);

  if (booting) return <div className="splash"><span className="logo-mark big" /></div>;
  if (!signedIn) return <Auth />;

  return (
    <div className={"shell" + (selected ? " chat-open" : "")}>
      <Sidebar selected={selected} onSelect={setSelected} onAdd={() => setAdding(true)} />
      <main className="main">
        {selected ? (
          <Chat key={selected} roomId={selected} onBack={() => setSelected(null)} />
        ) : (
          <div className="blank">
            <span className="logo-mark big" />
            <p>{synced ? "Pick a chat to start." : "Syncing…"}</p>
          </div>
        )}
      </main>
      {adding && <AddAccount onClose={() => setAdding(false)} />}
    </div>
  );
}
