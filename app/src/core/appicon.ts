import baseSvg from "../../public/icon.svg?raw";
import { appIconById, iconSvg } from "./appicons";

const svgUrl = (id: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(iconSvg(baseSvg, appIconById(id)))}`;

/** The icon as a PNG (for the desktop window and tray, which don't take SVG). */
function png(id: string, size: number): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { const c = document.createElement("canvas"); c.width = c.height = size; c.getContext("2d")!.drawImage(img, 0, 0, size, size); resolve(c.toDataURL("image/png")); };
    img.onerror = () => resolve("");
    img.src = svgUrl(id);
  });
}

let last = "";
/** Puts the chosen icon on the browser tab and, in the desktop app, on the window and the tray. */
export async function applyAppIcon(id: string) {
  if (id === last) return;
  last = id;
  const link = document.querySelector<HTMLLinkElement>("link[rel~='icon']") ?? Object.assign(document.createElement("link"), { rel: "icon" });
  link.type = "image/svg+xml"; link.href = svgUrl(id);
  if (!link.isConnected) document.head.appendChild(link);
  if (window.pagerDesktop?.setIcon && id !== "classic") { const p = await png(id, 256); if (p) window.pagerDesktop.setIcon(p); }
  else if (window.pagerDesktop?.setIcon) window.pagerDesktop.setIcon("");
}
