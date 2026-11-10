import { test, expect } from "@playwright/test";
import { openChat, signIn } from "./helpers.mjs";
import { api, login } from "../lib.mjs";

// "Mark as read when I reply or type": with the usual way of marking as read switched to "I do it myself", clicking in the message box, typing in it or sending a message
// still marks the page as read. A switch in Settings turns that off.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
let page, bob, room;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
  await context.addInitScript(() => { try { const k = "pager.settings", cur = JSON.parse(localStorage.getItem(k) || "{}"); localStorage.setItem(k, JSON.stringify({ ...cur, markReadMode: "manual" })); } catch { /* none */ } });
  page = await context.newPage(); await signIn(page);
  bob = await login("bob");
  for (const r of (await api(bob, "GET", "/joined_rooms")).joined_rooms) { const n = await api(bob, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (n?.name === "Pager team") room = r; }
});
test.afterAll(async () => { await page.context().close(); });

let n = 0;
const bobSays = () => api(bob, "PUT", `/rooms/${encodeURIComponent(room)}/send/m.room.message/m${Date.now()}${n++}`, { msgtype: "m.text", body: `unread ${n}` });
const badge = () => page.locator(".chat-row", { hasText: "Pager team" }).first().locator(".unread");
const box = () => page.getByPlaceholder(/Message|Add a message/);
/** A new unread message in a page that is open on screen, with "I do it myself" meaning nothing marks it read by itself. */
async function unreadAndOpen() {
  await bobSays();
  await expect(badge()).toBeVisible({ timeout: 20_000 });
  await openChat(page, "Pager team");
  await page.waitForTimeout(1500);
  await expect(badge(), "opening it must not have marked it read (the setting is 'I do it myself')").toBeVisible();
}

test("clicking in the message box marks the page as read", async () => {
  await unreadAndOpen();
  await box().click();
  await expect(badge()).toHaveCount(0, { timeout: 10_000 });
});

test("typing in the message box marks the page as read", async () => {
  await page.getByRole("button", { name: /Pager team/ }).first().click().catch(() => {});
  await unreadAndOpen();
  await box().focus();                       // keyboard focus alone is not a click
  await page.waitForTimeout(500);
  await expect(badge()).toBeVisible();
  await page.keyboard.type("hello");
  await expect(badge()).toHaveCount(0, { timeout: 10_000 });
  await box().fill("");
});

test("replying marks the page as read", async () => {
  await unreadAndOpen();
  await page.evaluate(() => (document.activeElement)?.blur?.());
  await box().fill("a reply"); await box().press("Enter");
  await expect(badge()).toHaveCount(0, { timeout: 10_000 });
});

test("with the switch off in Settings, none of that marks it read", async () => {
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("pager:nav", { detail: "settings/chats" })));
  const sw = page.getByRole("switch", { name: "Mark as read when I reply or type" });
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("pager:nav", { detail: "home" })));
  await unreadAndOpen();
  await box().click(); await page.keyboard.type("x");
  await page.waitForTimeout(1500);
  await expect(badge(), "the switch is off: clicking and typing must leave it unread").toBeVisible();
  await box().fill("");
});
