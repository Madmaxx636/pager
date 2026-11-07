import { test } from "@playwright/test";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { fakeDesktop } from "./fake-desktop.mjs";
import { chatRow, signIn } from "./helpers.mjs";

// An exploratory walk (EXPLORE=1 npx playwright test tests/explore.spec.mjs, about 7 minutes), not a pass/fail test: clicks everything it can reach on every screen (except the few things that would end the session),
// and writes down every console error, page crash, failed request, error screen and window overflow it meets to .state/explore-<mode>.json.
test.describe.configure({ mode: "serial" });
test.setTimeout(1_800_000);

const DENY = /sign out|log out|delete my profile|delete profile|remove account|wipe and make|replace my key|reset recovery|sign-out/i;
const go = (page, to) => page.evaluate((t) => window.dispatchEvent(new CustomEvent("pager:nav", { detail: t })), to);
const out = resolve(import.meta.dirname, "../.state"); mkdirSync(out, { recursive: true });

const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth, vh = document.documentElement.clientHeight, bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed" || cs.opacity === "0") continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) { const o = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(o.overflowX)) { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; } } a = a.parentElement; }
    if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
  }
  // a dialog taller than the window with no way to scroll it
  const dlg = [...document.querySelectorAll(".modal, [role=dialog]")].filter((m) => { const r = m.getBoundingClientRect(); return r.height > vh + 2 && !/(auto|scroll)/.test(getComputedStyle(m).overflowY); }).map((m) => "tall-dialog:" + (m.querySelector("h2,h3")?.textContent ?? "").slice(0, 30));
  return [...new Set([...bad.slice(0, 4), ...dlg])];
});

const findings = [], stats = {};
const seen = new Set();
const note = (kind, where, text) => { const k = kind + "|" + text.slice(0, 160); if (seen.has(k)) return; seen.add(k); findings.push({ kind, where, text: text.slice(0, 600) }); };

async function sweep(page, where, setup, max = 50) {
  const scope = "body";
  await setup();
  const labels = await page.evaluate(({ scope, max }) => {
    const root = document.querySelector(scope) ?? document.body, res = [];
    const sel = "button, [role=button], [role=tab], [role=menuitem], a[href], .row, .chat-row, summary, [role=switch], input[type=checkbox], select";
    for (const el of root.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect(); if (r.width < 4 || r.height < 4) continue;
      const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || el.disabled) continue;
      res.push((el.getAttribute("aria-label") || el.getAttribute("title") || el.textContent || el.className || el.tagName).trim().replace(/\s+/g, " ").slice(0, 60));
      if (res.length >= max) break;
    }
    return res;
  }, { scope, max });
  for (let i = 0; i < labels.length; i++) {
    const label = labels[i];
    if (DENY.test(label)) continue;
    await setup();
    // re-find by index among the currently visible candidates, since the screen changes under us
    const clicked = await page.evaluate(({ scope, i }) => {
      const root = document.querySelector(scope) ?? document.body;
      const sel = "button, [role=button], [role=tab], [role=menuitem], a[href], .row, .chat-row, summary, [role=switch], input[type=checkbox], select";
      const els = [...root.querySelectorAll(sel)].filter((el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width >= 4 && r.height >= 4 && cs.visibility !== "hidden" && cs.display !== "none" && !el.disabled; });
      const el = els[i]; if (!el) return false;
      el.setAttribute("data-mk", "1"); return true;
    }, { scope, i });
    if (!clicked) break;
    try { await page.locator('[data-mk="1"]').first().click({ timeout: 1500, force: false, noWaitAfter: true }); stats[where] = (stats[where] ?? 0) + 1; } catch { /* covered or gone: fine */ }
    await page.evaluate(() => document.querySelectorAll("[data-mk]").forEach((e) => e.removeAttribute("data-mk")));
    await page.waitForTimeout(120);
    if (await page.getByText(/Something went wrong|Unexpected error|Cannot read prop/i).first().isVisible().catch(() => false)) {
      note("error-screen", where, `after clicking "${label}"`);
      await page.reload(); await page.waitForTimeout(1500); await go(page, "home");
    }
    for (const o of await overflow(page)) note("overflow", where, `after "${label}": ${o}`);
    // close whatever opened
    for (let k = 0; k < 3; k++) { if (await page.locator(".modal, [role=dialog]").first().isVisible().catch(() => false)) await page.keyboard.press("Escape").catch(() => {}); await page.waitForTimeout(80); }
    if (await page.locator(".modal, [role=dialog]").first().isVisible().catch(() => false)) { note("stuck-dialog", where, `a dialog stayed open after Escape (after "${label}")`); await page.reload(); await page.waitForTimeout(1500); }
    if (new URL(page.url()).origin !== "http://127.0.0.1:18081") { note("left-app", where, `"${label}" opened ${page.url()}`); await page.goto("/"); await page.waitForTimeout(1500); }
  }
}

/** Back to a known screen: the page list, nothing filtered, no dialog. */
async function fresh(page) { await page.goto("/"); await page.locator(".chat-row").first().waitFor({ timeout: 20000 }).catch(() => {}); await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 1500 }).catch(() => {}); }

function walk(mode) {
  test(`explore ${mode}`, async ({ browser }) => {
    test.skip(!process.env.EXPLORE, "a long exploratory walk: run it with EXPLORE=1");
    const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
    await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.fulfill({ status: 200, body: "" }));
    if (mode === "desktop") await fakeDesktop(context, "linux");
    await context.grantPermissions(["clipboard-read", "clipboard-write"]).catch(() => {});
    const page = await context.newPage();
    let where = "start";
    page.on("pageerror", (e) => note("pageerror", where, String(e.stack || e)));
    page.on("console", (m) => { if (m.type() === "error" || (m.type() === "warning" && !/deprecat|Download the React/i.test(m.text()))) note("console-" + m.type(), where, m.text()); });
    page.on("requestfailed", (r) => note("request-failed", where, `${r.method()} ${r.url()} ${r.failure()?.errorText}`));
    page.on("response", (r) => { if (r.status() >= 400 && !/account_data|room_keys|\/presence|\/keys\/|profile\/|\.well-known|pushrules|/.test("") ) note("http-" + r.status(), where, `${r.request().method()} ${r.url().replace(/^https?:\/\/[^/]+/, "")}`); });
    page.on("dialog", (d) => d.dismiss().catch(() => {}));
    page.on("crash", () => note("crash", where, "the page crashed"));
    await signIn(page);

    for (const [w, h] of [[1180, 760], [480, 720]]) {
      await page.setViewportSize({ width: w, height: h });
      where = `${mode} ${w}x${h} list`; await fresh(page); await page.waitForTimeout(600); await sweep(page, where, () => go(page, "home"));
      for (const name of ["Sam Carter", "Pager team", "Weekend plans"]) {
        await fresh(page); if (!(await chatRow(page, name).count())) { note("missing-chat", where, name); continue; }
        where = `${mode} ${w}x${h} chat ${name}`; await fresh(page); await chatRow(page, name).click().catch((e) => note("cannot-open-chat", where, String(e).slice(0, 200))); await page.waitForTimeout(700);
        await sweep(page, where, async () => { await go(page, "home"); await chatRow(page, name).click().catch(() => {}); await page.waitForTimeout(500); }, 80);
      }
      for (const dest of ["new", "search", "settings", "settings/appearance", "settings/notifications", "settings/privacy", "settings/system", "settings/shortcuts", "settings/storage", "settings/advanced", "settings/about", ...(mode === "desktop" ? ["settings/desktop"] : [])]) {
        where = `${mode} ${w}x${h} ${dest}`; await fresh(page); await go(page, dest); await page.waitForTimeout(500); await sweep(page, where, async () => { await go(page, dest); await page.waitForTimeout(350); }, 70);
      }
    }
    writeFileSync(`${out}/explore-${mode}.json`, JSON.stringify({ clicks: Object.fromEntries(Object.entries(stats).filter(([k]) => k.startsWith(mode))), findings: findings.filter((f) => f.where.startsWith(mode) || f.where === "start") }, null, 1));
    await context.close();
  });
}
walk("web");
walk("desktop");
