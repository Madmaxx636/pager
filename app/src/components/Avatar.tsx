import { useEffect, useState } from "react";
import { fetchMedia } from "../matrix";
import { networkMeta } from "../networks";

const hue = (s: string) => [...s].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);

export function Avatar({ name, mxc, size = 44, network }: { name: string; mxc?: string; size?: number; network?: string }) {
  const [src, setSrc] = useState<string>();
  useEffect(() => {
    setSrc(undefined);
    if (mxc) fetchMedia(mxc, size * 2).then(setSrc).catch(() => {});
  }, [mxc, size]);
  const meta = network && network !== "matrix" ? networkMeta(network) : null;
  return (
    <div className="avatar" style={{ width: size, height: size, fontSize: size * 0.4 }}>
      {src ? (
        <img src={src} alt="" />
      ) : (
        <span style={{ background: `hsl(${hue(name)} 45% 42%)` }}>{(name.replace(/^[^\p{L}\p{N}]+/u, "")[0] ?? "?").toUpperCase()}</span>
      )}
      {meta && (
        <i className="badge" style={{ background: meta.color }} title={meta.label}>
          {meta.glyph}
        </i>
      )}
    </div>
  );
}
