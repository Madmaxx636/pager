import { test, expect } from "@playwright/test";
import { openChat, signIn } from "./helpers.mjs";
import { api, login } from "../lib.mjs";

// Signal turned back an audio file labelled audio/x-m4a ("unsupported media type") and Pager left the message on "Sent". Files go as a kind the network takes,
// and when a network does refuse a message the chat says so.
test.describe.configure({ mode: "serial" });
test.setTimeout(180_000);
let page, alice, room;
test.beforeAll(async ({ browser }) => {
  page = await (await browser.newContext({ viewport: { width: 1180, height: 760 } })).newPage();
  await signIn(page);
  await openChat(page, "Jordan Lee");           // a Signal chat
  alice = await login("alice");
  for (const r of (await api(alice, "GET", "/joined_rooms")).joined_rooms) { const n = await api(alice, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (n?.name === "Jordan Lee") room = r; }
});
test.afterAll(async () => { await page.context().close(); });

const lastEvents = async (n = 6) => (await api(alice, "GET", `/rooms/${encodeURIComponent(room)}/messages?dir=b&limit=${n}`)).chunk.filter((e) => e.type === "m.room.message");
const sendFile = async (name, mimeType, body = "x") => {
  await page.locator('input[type="file"]').first().setInputFiles({ name, mimeType, buffer: Buffer.from(body) });
  await expect(page.locator(".staged-item")).toHaveCount(1);
  await page.getByPlaceholder(/Message|Add a message/).press("Enter");
  await expect(page.locator(".staged-item")).toHaveCount(0);
};

test("an .m4a labelled audio/x-m4a goes to Signal as audio/mp4, which it takes", async () => {
  await sendFile("song.m4a", "audio/x-m4a");
  await expect.poll(async () => (await lastEvents())[0]?.content?.body, { timeout: 20_000 }).toBe("song.m4a");
  const c = (await lastEvents())[0].content;
  expect(c.msgtype).toBe("m.audio"); expect(c.info.mimetype).toBe("audio/mp4");
});

test("audio, video and pictures Signal does not take go as plain files", async () => {
  await sendFile("clip.ogg", "audio/ogg");
  await expect.poll(async () => (await lastEvents())[0]?.content?.body, { timeout: 20_000 }).toBe("clip.ogg");
  expect((await lastEvents())[0].content.msgtype).toBe("m.file");
  await sendFile("movie.mov", "video/quicktime");
  await expect.poll(async () => (await lastEvents())[0]?.content?.body, { timeout: 20_000 }).toBe("movie.mov");
  expect((await lastEvents())[0].content.msgtype).toBe("m.file");
  await sendFile("photo.heic", "image/heic");
  await expect.poll(async () => (await lastEvents())[0]?.content?.body, { timeout: 20_000 }).toBe("photo.heic");
  expect((await lastEvents())[0].content.msgtype).toBe("m.file");
});

test("a page only on Pager still sends audio as it is", async () => {
  await openChat(page, "Pager team");
  await sendFile("clip.ogg", "audio/ogg");
  const team = (await api(alice, "GET", "/joined_rooms")).joined_rooms;
  let found;
  for (const r of team) { const n = await api(alice, "GET", `/rooms/${encodeURIComponent(r)}/state/m.room.name`).catch(() => null); if (n?.name === "Pager team") found = r; }
  await expect.poll(async () => (await api(alice, "GET", `/rooms/${encodeURIComponent(found)}/messages?dir=b&limit=3`)).chunk.find((e) => e.content?.body === "clip.ogg")?.content?.msgtype, { timeout: 20_000 }).toBe("m.audio");
});

test("when the network refuses a message, the chat says so instead of leaving it on Sent", async () => {
  await openChat(page, "Jordan Lee");
  const box = page.getByPlaceholder(/Message|Add a message/);
  await box.fill("this one will be refused"); await box.press("Enter");
  await expect.poll(async () => (await lastEvents())[0]?.content?.body, { timeout: 20_000 }).toBe("this one will be refused");
  const id = (await lastEvents())[0].event_id;
  await api(alice, "PUT", `/rooms/${encodeURIComponent(room)}/send/com.beeper.message_send_status/${Date.now()}`, { "m.relates_to": { rel_type: "m.reference", event_id: id }, status: "FAIL_RETRIABLE", reason: "com.beeper.unsupported_event", message: "unsupported media type (audio/x-m4a in m.audio)", success: false });
  await expect(page.locator(".failed-note", { hasText: "Didn't reach Signal: it doesn't accept that kind of file" })).toBeVisible({ timeout: 30_000 });
  // and a later success clears it
  await api(alice, "PUT", `/rooms/${encodeURIComponent(room)}/send/com.beeper.message_send_status/${Date.now() + 1}`, { "m.relates_to": { rel_type: "m.reference", event_id: id }, status: "SUCCESS", success: true });
  await expect(page.locator(".failed-note", { hasText: "Didn't reach" })).toHaveCount(0, { timeout: 30_000 });
});
