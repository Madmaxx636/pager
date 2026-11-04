import { test, expect } from "@playwright/test";
import { fakeDesktop } from "./fake-desktop.mjs";
import { chatRow, signIn, snap } from "./helpers.mjs";

// Every main screen at the sizes a desktop window can have: nothing may stick out past the window, and the controls that matter must be on screen.
// (The smallest window the desktop app allows is 360 x 500.) Screenshots are saved to .state/shots/layout-* to look at.
test.describe.configure({ mode: "serial" });
test.setTimeout(300_000);

const SIZES = [[360, 500], [480, 720], [800, 600], [1180, 760], [1920, 1080]];
const SETTINGS = ["", "/appearance", "/notifications", "/privacy", "/system", "/shortcuts", "/storage", "/advanced", "/about"];

/** Content that is wider than the window and not inside something that scrolls or clips it. */
const overflow = (page) => page.evaluate(() => {
  const vw = document.documentElement.clientWidth, bad = [];
  for (const el of document.querySelectorAll("body *")) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue;
    const cs = getComputedStyle(el); if (cs.visibility === "hidden" || cs.display === "none" || cs.position === "fixed") continue;
    if (r.right <= vw + 1 && r.left >= -1) continue;
    let a = el.parentElement, clipped = false;
    while (a && a !== document.body) { const o = getComputedStyle(a); if (/(hidden|auto|scroll|clip)/.test(o.overflowX)) { const ar = a.getBoundingClientRect(); if (ar.right <= vw + 1 && ar.left >= -1) { clipped = true; break; } } a = a.parentElement; }
    if (!clipped) bad.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`);
  }
  return { page: document.documentElement.scrollWidth - vw, bad: [...new Set(bad)].slice(0, 6) };
});
const go = (page, to) => page.evaluate((t) => window.dispatchEvent(new CustomEvent("pager:nav", { detail: t })), to);

async function audit(page, scene, size) {
  await page.waitForTimeout(450);
  const o = await overflow(page);
  expect.soft(o.page, `${scene} at ${size}: the page is wider than the window by ${o.page}px`).toBeLessThanOrEqual(1);
  expect.soft(o.bad, `${scene} at ${size}: sticks out of the window`).toEqual([]);
  await snap(page, `layout-${size}-${scene.replace(/[^a-z0-9]+/gi, "-")}`);
}

function suite(title, setup, scenes) {
  test.describe(title, () => {
    let page;
    test.beforeAll(async ({ browser }) => {
      const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
      await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.fulfill({ status: 200, body: "" }));
      await setup(context);
      page = await context.newPage();
      await signIn(page);
    });
    test.afterAll(async () => { await page.context().close(); });
    for (const [w, h] of SIZES) {
      test(`${w} x ${h}`, async () => {
        await page.setViewportSize({ width: w, height: h });
        await scenes(page, `${w}x${h}`);
      });
    }
  });
}

suite("web", async () => {}, async (page, size) => {
  await go(page, "home"); await audit(page, "list", size);
  await chatRow(page, "Sam Carter").click(); await expect(page.locator(".chat-title")).toContainText("Sam Carter");
  await audit(page, "chat", size);
  const box = page.getByPlaceholder(/Message/);
  const b = await box.boundingBox(); expect.soft(b && b.y + b.height <= h(page), "the message box is on screen").toBeTruthy();
  await page.getByRole("button", { name: "Page info" }).click(); await audit(page, "chat-info", size);
  await page.getByRole("button", { name: "Page info" }).click({ timeout: 3000 }).catch(() => {});
  await go(page, "new"); await audit(page, "new-page", size);
  await go(page, "search"); await audit(page, "search", size);
  for (const p of SETTINGS) { await go(page, `settings${p}`); await audit(page, `settings${p || "-main"}`, size); }
  await go(page, "home");
});

suite("desktop (Linux shell)", (context) => fakeDesktop(context, "linux"), async (page, size) => {
  await go(page, "home"); await audit(page, "d-list", size);
  await chatRow(page, "Sam Carter").click(); await audit(page, "d-chat", size);
  await go(page, "settings/desktop"); await audit(page, "d-settings-desktop", size);
  await go(page, "settings/advanced"); await audit(page, "d-settings-advanced-logs", size);
  await go(page, "home");
});

function h(page) { return page.viewportSize().height; }
