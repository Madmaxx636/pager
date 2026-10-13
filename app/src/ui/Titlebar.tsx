/** The thin bar along the top of the Linux desktop window: it holds the title and is where you drag the window. The window buttons are drawn over its right end. */
export function Titlebar() {
  if (!window.pagerDesktop || window.pagerDesktop.platform !== "linux") return null;
  return <div className="titlebar">Pager</div>;
}
