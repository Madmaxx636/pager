import { test, expect } from "@playwright/test";
import { signIn, snap } from "./helpers.mjs";

// Phone report: for a contact with two accounts shown as one page, the call button showed in one account's chat but not the other's. Which chat is open must not decide it.
test("on a page that merges two networks, the call button shows whichever chat is open", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 1180, height: 760 } });
  await context.route((url) => !["127.0.0.1", "localhost"].includes(url.hostname), (route) => route.fulfill({ status: 200, body: "" }));
  const page = await context.newPage();
  await signIn(page);
  const call = page.getByRole("button", { name: "Call" });
  const rows = page.locator(".chat-row", { hasText: "Dana Brooks" });
  await expect(rows).toHaveCount(2);

  // The text-message chat on its own: on a computer it has no way to place a call, so no button.
  await rows.filter({ hasText: "late" }).click();
  await expect(page.locator(".chat-title")).toContainText("Dana Brooks");
  await expect(call).toHaveCount(0);
  await page.getByRole("button", { name: "Show as one" }).click();

  // Shown as one, the same chat now offers what the WhatsApp chat offers.
  await expect(call).toBeVisible();
  const popup = page.waitForEvent("popup");
  await call.click();
  expect((await popup).url()).toContain("wa.me/15554440000");
  await snap(page, "32-merged-call");

  // And from the other chat of the pair.
  await page.evaluate(() => window.dispatchEvent(new CustomEvent("pager:nav", { detail: "home" })));
  await page.locator(".chat-row", { hasText: "Dana Brooks" }).first().click();
  await expect(call).toBeVisible();
});
