/**
 * Pretends to be the desktop app's shell (what desktop/preload.js gives the page), so the desktop-only parts of the web app (the Linux title bar, Settings >
 * Desktop, notifications through the shell) can be looked at in a browser. Add it to a context before the page loads.
 */
export async function fakeDesktop(context, platform = "linux", server = "http://127.0.0.1:18081") {
  await context.addInitScript(({ platform, server }) => {
    try { localStorage.setItem("pager.server", server); } catch { /* none */ }
    const none = () => {};
    window.pagerDesktop = {
      platform, hostname: "test-pc", notify: none, setBadge: none, setIcon: none, setTitleBar: none, setPrefs: none, setZoom: none, setSpell: none, setAutostart: none,
      getAutostart: async () => false, getSystemTheme: async () => ({ dark: false, source: platform }), onSystemTheme: none,
      getSpell: async () => ({ enabled: true, languages: ["en-US"], available: ["en-US", "en-GB", "de"] }),
      cookieLogin: async () => null, onMemory: (cb) => { window.__memory = cb; }, memory: async () => ({ total: 182, parts: [{ type: "Page", mb: 121 }, { type: "Browser", mb: 61 }] }),
      repaint: none, onUpdateProgress: none, log: none, beat: none, readLog: async () => "2026-11-04T00:00:00.000Z page process gone: crashed (exit 139)",
      onWindowActive: (cb) => { window.__active = cb; }, onOpenRoom: none,
    };
  }, { platform, server });
}
