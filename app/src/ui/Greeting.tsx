import { useEffect, useState } from "react";
import { pickGreeting } from "../core/greetings";
import { getSettings } from "../core/settings";
import { Mascot } from "./Mascot";

// One hello per run of the app: closing it completely and opening it again says something new.
let shown = false;

/** The pager says something silly on its green screen when the app opens. Click to skip. */
export function Greeting() {
  const [text] = useState(() => (!shown && getSettings().greetings ? pickGreeting() : ""));
  const [open, setOpen] = useState(!!text);
  useEffect(() => {
    if (!text) return;
    shown = true;
    const t = setTimeout(() => setOpen(false), 2400);
    return () => clearTimeout(t);
  }, [text]);
  if (!text) return null;
  return (
    <div className={"greeting" + (open ? "" : " gone")} onClick={() => setOpen(false)} aria-hidden={!open}>
      <Mascot size={150} mood="ring" />
      <div className="greeting-lcd">{text}</div>
    </div>
  );
}
