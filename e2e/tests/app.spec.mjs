import { test, expect } from "@playwright/test";
import { chatRow, openChat, signIn, snap } from "./helpers.mjs";

test.describe.configure({ mode: "serial" });
let page;
test.beforeAll(async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
  // Nothing in a test reaches the real internet: a link the app opens (WhatsApp, say) is answered here, so the address it asked for is what we see.
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>outside</title>" }));
  page = await context.newPage();
  await signIn(page);
});
test.afterAll(async () => { await page.context().close(); });

test("the page list shows the seeded chats, their networks and unread counts", async () => {
  for (const name of ["Sam Carter", "Jordan Lee", "Weekend plans", "Pager team", "Alex Kim"]) await expect(chatRow(page, name)).toBeVisible();
  await expect(chatRow(page, "+1 (555) 777-8888")).toBeVisible();
  await expect(chatRow(page, "Sam Carter")).toContainText("speaker");            // the newest message is the preview
  // (Chats no other test opens, because opening one marks it read.)
  await expect(chatRow(page, "Jordan Lee").locator(".unread").first()).toHaveText("1");
  await expect(chatRow(page, "+1 (555) 777-8888").locator(".unread").first()).toHaveText("1");
  await snap(page, "01-page-list");
});

test("a chat opens with its messages, your own on the other side, and a reaction", async () => {
  await openChat(page, "Sam Carter");
  await expect(page.getByText("Are you still coming on Saturday?")).toBeVisible();
  await expect(page.getByText("I'll bring the chairs")).toBeVisible();
  await expect(page.getByText("👍").first()).toBeVisible();
  await snap(page, "02-chat");
});

test("the call button on a WhatsApp chat opens WhatsApp on that person's number", async () => {
  await openChat(page, "Sam Carter");
  const popup = page.waitForEvent("popup");
  await page.getByRole("button", { name: "Call" }).click();
  expect((await popup).url()).toContain("wa.me/15551234567");
});

test("a group chat has no call button", async () => {
  await openChat(page, "Weekend plans");
  await expect(page.getByRole("button", { name: "Call" })).toHaveCount(0);
});

test("a message you type is sent and shows in the chat", async () => {
  await openChat(page, "Pager team");
  const box = page.getByPlaceholder(/Message/);
  await box.fill("Testing from the end-to-end suite");
  await box.press("Enter");
  await expect(page.locator(".timeline").getByText("Testing from the end-to-end suite")).toBeVisible();
});
