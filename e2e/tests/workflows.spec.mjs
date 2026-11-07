import { test, expect } from "@playwright/test";
import { chatRow, openChat, signIn, snap } from "./helpers.mjs";

// The everyday things, one after another, with what should happen written down. A failure here is a bug (or a selector that needs updating).
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);
let page; const errors = [];
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e.stack || e)));
  await signIn(page);
  await openChat(page, "Pager team");
});
test.afterAll(async () => { expect(errors, "page errors during the workflows").toEqual([]); await page.context().close(); });

const box = () => page.getByPlaceholder(/Message|Add a message/);
const send = async (t) => { await box().fill(t); await box().press("Enter"); };
const msgWith = (t) => page.locator(".timeline .msg", { hasText: t }).last();
const hover = async (m) => { await m.hover(); };
const more = async (m) => { await hover(m); await m.getByTitle("More").click(); };

test("plain, formatted and awkward text is sent and shown as written", async () => {
  await send("hello **bold** and _italic_ and `code`");
  const m = msgWith("hello bold");
  await expect(m).toBeVisible({ timeout: 20_000 });
  await expect(m.locator("strong, b")).toHaveText("bold");
  await expect(m.locator("code")).toHaveText("code");
  await send("<img src=x onerror=window.__pwned=1> <b>not bold</b>");
  await expect(msgWith("not bold")).toBeVisible({ timeout: 20_000 });
  expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
  await expect(msgWith("not bold").locator("img")).toHaveCount(0);
  await send("line one\nline two\n\nline four");
  await expect(msgWith("line four")).toBeVisible({ timeout: 20_000 });
  await send("  spaced  ");
  await send("מה שלומך? mixed שלום world");
  await expect(msgWith("שלום")).toBeVisible({ timeout: 20_000 });
  await send("https://example.com/a?b=1&c=2 and www.example.org.");
  const link = msgWith("example.com").locator("a").first();
  await expect(link).toHaveAttribute("href", /example\.com/);
  await expect(link).toHaveAttribute("rel", /noopener/);
  await send("x".repeat(600));
  await page.waitForTimeout(500);
  const wide = await page.locator(".timeline").evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(wide, "a long unbroken word makes the chat scroll sideways").toBeLessThanOrEqual(1);
  await snap(page, "50-workflow-text");
});

test("an empty or whitespace-only message is not sent", async () => {
  const before = await page.locator(".timeline .msg").count();
  await box().fill("   \n  "); await box().press("Enter");
  await page.waitForTimeout(600);
  expect(await page.locator(".timeline .msg").count()).toBe(before);
  await box().fill("");
});

test("reply shows the quote, and the quote goes back to the message", async () => {
  await send("the original words");
  const m = msgWith("the original words"); await expect(m).toBeVisible({ timeout: 20_000 });
  await hover(m); await m.getByTitle("Reply").click();
  await expect(page.locator(".banner-bar")).toContainText("Replying to");
  await send("my answer");
  const a = msgWith("my answer"); await expect(a.locator(".quote")).toContainText("the original words", { timeout: 20_000 });
  await expect(page.locator(".banner-bar")).toHaveCount(0);
});

test("a message can be edited and shows that it was", async () => {
  const m = msgWith("my answer"); await more(m);
  await page.getByRole("button", { name: "Edit" }).click();
  await expect(page.locator(".banner-bar")).toContainText("Editing");
  await box().fill("my better answer"); await box().press("Enter");
  await expect(msgWith("my better answer")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".timeline .msg", { hasText: "my answer" })).toHaveCount(0);
  await expect(msgWith("my better answer")).toContainText(/edited/i);
});

test("reacting adds a chip, and clicking it takes the reaction off", async () => {
  const m = msgWith("my better answer"); await hover(m); await m.getByTitle("React").click();
  const pick = page.locator('.quick button').first();
  await pick.click();
  const chip = msgWith("my better answer").locator(".reactions button").first();
  await expect(chip).toBeVisible({ timeout: 15_000 });
  await chip.click();
  await expect(msgWith("my better answer").locator(".reactions button")).toHaveCount(0, { timeout: 15_000 });
});

test("details, star and delete work from the message menu", async () => {
  let m = msgWith("my better answer"); await more(m);
  await page.getByRole("button", { name: "Details" }).click();
  await expect(page.locator(".modal, [role=dialog]").first()).toBeVisible(); await page.keyboard.press("Escape");
  m = msgWith("my better answer"); await more(m); await page.getByRole("button", { name: /^Star$/ }).click();
  m = msgWith("my better answer"); await more(m); await expect(page.getByRole("button", { name: "Remove star" })).toBeVisible(); await page.keyboard.press("Escape");
  m = msgWith("my better answer"); await more(m); await page.getByRole("button", { name: "Delete" }).click();
  await page.locator(".modal").getByRole("button", { name: "Delete" }).click();
  await expect(page.locator(".timeline .msg", { hasText: "my better answer" })).toHaveCount(0, { timeout: 20_000 });
});

test("a draft is kept when you switch pages and come back", async () => {
  await box().fill("half written thought");
  await openChat(page, "Weekend plans");
  await expect(box()).toHaveValue("");
  await openChat(page, "Pager team");
  await expect(box()).toHaveValue("half written thought");
  await box().fill("");
});

test("search in the page finds a message; the shortcuts open and close their screens", async () => {
  await page.keyboard.press("Control+f");
  const s = page.getByPlaceholder(/Search/).first(); await expect(s).toBeVisible();
  await s.fill("original words"); await page.keyboard.press("Enter");
  await expect(page.getByText("the original words").first()).toBeVisible({ timeout: 15_000 });
  await page.keyboard.press("Escape");
  await page.keyboard.press("Control+k"); await expect(page.locator(".palette, [role=dialog], .modal").first()).toBeVisible(); await page.keyboard.press("Escape");
  await page.keyboard.press("Control+,"); await expect(page.getByText("Settings", { exact: true }).first()).toBeVisible();
  await page.keyboard.press("Control+/"); await page.waitForTimeout(400); await page.keyboard.press("Escape");
  await openChat(page, "Pager team");
});

test("moving to the next page with the keyboard changes the open chat", async () => {
  const before = await page.locator(".chat-title").innerText();
  await page.keyboard.press("Alt+ArrowDown"); await page.waitForTimeout(600);
  expect(await page.locator(".chat-title").innerText()).not.toBe(before);
});
