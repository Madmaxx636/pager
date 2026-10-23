import { useEffect, useState } from "react";

/** Desktop: says what the update is doing. Without it a 100 MB download looks like the app has hung. */
export function UpdateToast() {
  const [p, setP] = useState<{ version?: string; state: string; percent: number }>();
  useEffect(() => { window.pagerDesktop?.onUpdateProgress?.((x) => setP(x)); }, []);
  useEffect(() => { if (p?.state === "failed") { const t = window.setTimeout(() => setP(undefined), 8000); return () => window.clearTimeout(t); } }, [p]);
  if (!p) return null;
  const text = p.state === "downloading" ? `Downloading Pager ${p.version ?? ""}${p.percent >= 0 ? `: ${p.percent}%` : "…"}` : p.state === "installing" ? "Installing the update…" : "The update didn't download. It will try again later.";
  return (
    <div className="update-toast" role="status">
      <b>{text}</b>
      {p.state === "downloading" && p.percent >= 0 && <i><u style={{ width: `${p.percent}%` }} /></i>}
    </div>
  );
}
