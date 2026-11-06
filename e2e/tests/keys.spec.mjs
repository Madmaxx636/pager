import { test, expect } from "@playwright/test";
import { register, createEncryptedRoom, backedUpSessions } from "../lib.mjs";
import { snap } from "./helpers.mjs";

// The path behind "waiting for the keys": an encrypted message arrives on one device, and another device of the same person has to be able to read it
// after the recovery key is entered. frank has two devices (A, then B); gina writes to him.
test.describe.configure({ mode: "serial" });
test.setTimeout(240_000);

const ROOM = "Secret plans", SECRET = "The vault code is 4417";
let frankKey = "", deviceB;

const open = (browser) => browser.newContext({ viewport: { width: 1180, height: 760 } }).then((c) => c.newPage().then((p) => (p.context = c, p)));

/** A new account: save the recovery key it is shown (returns it), skip the tour. */
async function signUpFlow(page, user) {
  await page.goto("/");
  await page.getByLabel("Username").fill(user);
  await page.locator('input[type="password"]').fill(`pw-${user}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  const dialog = page.locator(".modal, [role=dialog]").filter({ hasText: "Save your recovery key" });
  await expect(dialog).toBeVisible({ timeout: 30_000 });
  const key = (await dialog.locator("pre.recovery-key").innerText()).trim();
  await dialog.getByLabel("I saved my recovery key").check();
  await dialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Skip tour" }).click({ timeout: 20_000 });
  return key;
}

/** Sign in on a device that does not have the account's keys: the "Welcome back" screen asks for the recovery key. */
async function signInWithoutKey(page, user) {
  await page.goto("/");
  await page.getByLabel("Username").fill(user);
  await page.locator('input[type="password"]').fill(`pw-${user}`);
  await page.getByRole("button", { name: "Sign in" }).click();
  const welcome = page.locator(".modal, [role=dialog]").filter({ hasText: "Enter your recovery key" });
  await expect(welcome).toBeVisible({ timeout: 30_000 });
  return welcome;
}
const skipTour = async (page) => { const s = page.getByRole("button", { name: "Skip tour" }); if (await s.waitFor({ timeout: 6000 }).then(() => true, () => false)) await s.click(); };
const openRoom = async (page) => { await page.locator(".chat-row", { hasText: ROOM }).first().click(); await expect(page.locator(".chat-title")).toContainText(ROOM); };
const restoreDialog = (page) => page.locator(".modal, [role=dialog]").filter({ hasText: "Enter your recovery key" });
/** Settings > Privacy > Recovery key, which opens the same restore screen on a device that has no key yet. */
async function openRestoreFromSettings(page) {
  await page.getByLabel("Menu").click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText(/Privacy/).first().click();
  await page.getByText("Recovery key", { exact: true }).first().click();
  await expect(restoreDialog(page)).toBeVisible();
}

test("a message sent to an encrypted page is readable live, and its key is backed up", async ({ browser }) => {
  await register("frank", "pw-frank", false, "Frank"); await register("gina", "pw-gina", false, "Gina");
  await createEncryptedRoom("gina", "frank", ROOM);
  const frank = await open(browser), gina = await open(browser);
  frankKey = await signUpFlow(frank, "frank");
  await signUpFlow(gina, "gina");
  await openRoom(gina);
  const box = gina.getByPlaceholder(/Message/);
  await box.fill(SECRET); await box.press("Enter");
  await openRoom(frank);
  await expect(frank.locator(".timeline").getByText(SECRET)).toBeVisible({ timeout: 60_000 });       // read on frank's first device
  await snap(frank, "20-keys-device-a");
  // The key to that message goes to the recovery backup in the background; a second device can only read it once that has happened.
  await expect.poll(() => backedUpSessions("frank"), { timeout: 120_000, intervals: [2000] }).toBeGreaterThan(0);
  await frank.context.close(); await gina.context.close();
});

test("a second device without the key shows the message as locked, and says why", async ({ browser }) => {
  deviceB = await open(browser);
  const welcome = await signInWithoutKey(deviceB, "frank");
  await welcome.getByRole("button", { name: "Cancel" }).click();
  await skipTour(deviceB);
  await openRoom(deviceB);
  await expect(deviceB.locator(".timeline")).toContainText("🔒", { timeout: 30_000 });
  await expect(deviceB.locator(".timeline").getByText(SECRET)).toHaveCount(0);
  await snap(deviceB, "21-keys-locked");
});

test("a wrong recovery key is refused and the message stays locked", async () => {
  await openRestoreFromSettings(deviceB);
  const dialog = restoreDialog(deviceB);
  const wrong = frankKey.slice(0, -1) + (frankKey.endsWith("A") ? "B" : "A");   // the same key with its last character changed
  await dialog.locator("textarea").fill(wrong);
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(dialog.locator(".error")).toBeVisible({ timeout: 30_000 });
  await snap(deviceB, "22-keys-wrong-key");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(deviceB.locator(".timeline").getByText(SECRET)).toHaveCount(0);
});

test("the right recovery key unlocks the message on the second device", async () => {
  await openRestoreFromSettings(deviceB);
  const dialog = restoreDialog(deviceB);
  await dialog.locator("textarea").fill(frankKey);
  await dialog.getByRole("button", { name: "Restore" }).click();
  await expect(dialog.getByText(/Restored \d+ message keys/)).toBeVisible({ timeout: 60_000 });
  await dialog.locator("button.link", { hasText: "Close" }).click();
  await deviceB.getByLabel("Back").click().catch(() => {});
  await openRoom(deviceB);
  await expect(deviceB.locator(".timeline").getByText(SECRET)).toBeVisible({ timeout: 60_000 });
  await snap(deviceB, "23-keys-unlocked");
});

test("signing out and in again (a new device) and entering the key brings the history back", async () => {
  await deviceB.getByLabel("Menu").click();
  await deviceB.getByRole("button", { name: "Settings" }).click();
  await deviceB.getByText("About", { exact: true }).first().click();
  await deviceB.getByText("Sign out", { exact: true }).first().click();
  const confirm = deviceB.locator(".modal, [role=dialog]").filter({ hasText: "Sign out?" });
  await expect(confirm).toBeVisible();                                    // the keys are backed up here, so this is the calm version
  await confirm.getByRole("button", { name: "Sign out" }).click();
  const welcome = await signInWithoutKey(deviceB, "frank");               // a new device again
  await welcome.locator("textarea").fill(frankKey);
  await welcome.getByRole("button", { name: "Restore" }).click();
  await expect(welcome.getByText(/Restored \d+ message keys/)).toBeVisible({ timeout: 60_000 });
  await welcome.locator("button.link", { hasText: "Close" }).click();
  await skipTour(deviceB);
  await openRoom(deviceB);
  await expect(deviceB.locator(".timeline").getByText(SECRET)).toBeVisible({ timeout: 60_000 });
  await snap(deviceB, "24-keys-after-signout");
});

// The master password: a copy of the recovery key locked with a password, so any device can show it and a new device can open the history with it.
const MASTER = "tulip river lantern 88";
const encryptionSettings = async (page) => {
  await page.getByLabel("Menu").click();
  await page.getByRole("button", { name: "Settings" }).click();
  await page.getByText(/Privacy/).first().click();
};
const dialogWith = (page, text) => page.locator(".modal, [role=dialog]").filter({ hasText: text });

test("a master password can be set from a device that has the key", async () => {
  await encryptionSettings(deviceB);
  await deviceB.getByText("Master password", { exact: true }).first().click();
  const dialog = dialogWith(deviceB, "Master password").filter({ has: deviceB.getByRole("button", { name: /Set password|Close/ }) });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Master password").fill("short");
  await expect(dialog.getByText(/At least 10 characters/)).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Set password" })).toBeDisabled();
  await dialog.getByPlaceholder("Master password").fill(MASTER);
  await dialog.getByPlaceholder("Again").fill(MASTER + "x");
  await expect(dialog.getByRole("button", { name: "Set password" })).toBeDisabled();   // the two must match
  await dialog.getByPlaceholder("Again").fill(MASTER);
  await dialog.getByRole("button", { name: "Set password" }).click();
  await expect(dialog.getByText(/Done\. On any device/)).toBeVisible({ timeout: 60_000 });
  await snap(deviceB, "25-master-set");
  await dialog.locator("button.link", { hasText: "Close" }).click();
});

test("showing the recovery key asks for the master password, and refuses a wrong one", async () => {
  await deviceB.getByText("Show recovery key", { exact: true }).first().click();
  const dialog = dialogWith(deviceB, "Your recovery key");
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Master password").fill(MASTER + "!");
  await dialog.getByRole("button", { name: "Show key" }).click();
  await expect(dialog.locator(".error")).toContainText("isn't right", { timeout: 60_000 });
  await expect(dialog.locator("pre.recovery-key")).toHaveCount(0);
  await dialog.getByPlaceholder("Master password").fill(MASTER);
  await dialog.getByRole("button", { name: "Show key" }).click();
  await expect(dialog.locator("pre.recovery-key")).toHaveText(frankKey, { timeout: 60_000 });
  await snap(deviceB, "26-master-show");
  await dialog.locator("button.link", { hasText: "Close" }).first().click();
});

test("a brand-new device opens the history with just the master password", async ({ browser }) => {
  await deviceB.context.close();
  const deviceC = await open(browser);
  await deviceC.goto("/");
  await deviceC.getByLabel("Username").fill("frank");
  await deviceC.locator('input[type="password"]').fill("pw-frank");
  await deviceC.getByRole("button", { name: "Sign in" }).click();
  const welcome = dialogWith(deviceC, "Open your history");
  await expect(welcome).toBeVisible({ timeout: 30_000 });
  await snap(deviceC, "27-master-new-device");
  await welcome.getByPlaceholder("Master password").fill("not the password");
  await welcome.getByRole("button", { name: "Restore" }).click();
  await expect(welcome.locator(".error")).toContainText("isn't right", { timeout: 60_000 });
  await welcome.getByPlaceholder("Master password").fill(MASTER);
  await welcome.getByRole("button", { name: "Restore" }).click();
  await expect(welcome.getByText(/Restored \d+ message keys/)).toBeVisible({ timeout: 60_000 });
  await welcome.locator("button.link", { hasText: "Close" }).click();
  await skipTour(deviceC);
  await openRoom(deviceC);
  await expect(deviceC.locator(".timeline").getByText(SECRET)).toBeVisible({ timeout: 60_000 });
  // The backup is switched on, so this device now saves new keys too: nothing nags for the key again.
  await expect(dialogWith(deviceC, "recovery key")).toHaveCount(0);
  await deviceC.context.close();
});

test("pasting the whole saved recovery-key text file works, not just the key", async ({ browser }) => {
  const d = await open(browser);
  await d.goto("/");
  await d.getByLabel("Username").fill("frank");
  await d.locator('input[type="password"]').fill("pw-frank");
  await d.getByRole("button", { name: "Sign in" }).click();
  const welcome = dialogWith(d, "Open your history");
  await expect(welcome).toBeVisible({ timeout: 30_000 });
  await welcome.getByRole("button", { name: "Use the recovery key or a file instead" }).click();
  // The text file Pager saves holds a heading, then the key: pasting all of it works
  await welcome.locator("textarea").fill(`Pager recovery key\n\n${frankKey}\n`);
  await welcome.getByRole("button", { name: "Restore" }).click();
  await expect(welcome.getByText(/Restored \d+ message keys/)).toBeVisible({ timeout: 60_000 });
  await d.context.close();
});
