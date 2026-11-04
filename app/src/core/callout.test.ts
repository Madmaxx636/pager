import { describe, expect, it } from "vitest";
import { callOptions, callOptionsFor, messengerId, normalizeNumber, numberFor, numbersFor } from "./callout";

const chat = (network: string, name: string, others: string[] = [], isGroup = false) => ({ network, name, heroes: others, joined: ["@me:s", ...others], isGroup });

describe("normalizeNumber", () => {
  it("makes one clean form", () => {
    expect(normalizeNumber("+1 (555) 123-4567")).toBe("+15551234567");
    expect(normalizeNumber("1 555 123 4567")).toBe("+15551234567");
    expect(normalizeNumber("555-123-4567")).toBe("5551234567");   // no country code: kept as written
    expect(normalizeNumber("12")).toBe("");
  });
});

describe("numberFor", () => {
  it("reads a WhatsApp number from the bridge id", () => expect(numberFor(chat("whatsapp", "Sam", ["@whatsapp_15551234567:s"]), "@me:s")).toBe("+15551234567"));
  it("uses the name when it is only a number", () => expect(numberFor(chat("gmessages", "+1 555 123 4567 (SMS)"), "@me:s")).toBe("+15551234567"));
  it("finds a number among your own contacts by name", () => expect(numberFor(chat("signal", "Sam"), "@me:s", [["+15559998888", "sam"]])).toBe("+15559998888"));
  it("gives nothing when there is no way to tell", () => expect(numberFor(chat("signal", "Sam", ["@signal_3f2a-uuid:s"]), "@me:s")).toBe(""));
  it("ignores your own id", () => expect(numberFor({ ...chat("whatsapp", "Me", ["@whatsapp_15550000000:s"]), heroes: ["@whatsapp_15550000000:s"], joined: ["@whatsapp_15550000000:s"] }, "@whatsapp_15550000000:s")).toBe(""));
});

describe("callOptions", () => {
  it("WhatsApp opens the chat on wa.me, and a phone can also dial", () => {
    const c = chat("whatsapp", "Sam", ["@whatsapp_15551234567:s"]);
    expect(callOptions(c, "@me:s", [], false).map((o) => o.url)).toEqual(["https://wa.me/15551234567"]);
    expect(callOptions(c, "@me:s", [], true).map((o) => o.url)).toEqual(["https://wa.me/15551234567", "tel:+15551234567"]);
  });
  it("Signal opens through signal.me when the number is known", () => expect(callOptions(chat("signal", "Sam", [], false), "@me:s", [["+15559998888", "Sam"]], false)[0].url).toBe("https://signal.me/#p/+15559998888"));
  it("Messenger opens the person's page from the id", () => {
    const c = chat("messenger", "Alex", ["@messenger_1000123456789:s"]);
    expect(messengerId(c, "@me:s")).toBe("1000123456789");
    expect(callOptions(c, "@me:s", [], false)[0].url).toBe("https://www.messenger.com/t/1000123456789");
  });
  it("SMS and Google Voice only dial, and only on a phone", () => {
    const c = chat("gmessages", "+1 555 123 4567");
    expect(callOptions(c, "@me:s", [], false)).toEqual([]);
    expect(callOptions(c, "@me:s", [], true).map((o) => o.url)).toEqual(["tel:+15551234567"]);
  });
  it("a number without a country code cannot be sent to WhatsApp or Signal", () => expect(callOptions(chat("whatsapp", "555-123-4567"), "@me:s", [], false)).toEqual([]));
  it("groups and Matrix chats get nothing", () => {
    expect(callOptions(chat("whatsapp", "Friends", ["@whatsapp_15551234567:s"], true), "@me:s", [], true)).toEqual([]);
    expect(callOptions(chat("matrix", "+1 555 123 4567"), "@me:s", [], true)).toEqual([]);
  });

  it("a contact with two numbers offers both for the dialler", () => {
    const contacts: [string, string][] = [["+15551110000", "Sam"], ["+1 (555) 222-0000", "sam"], ["+15551110000", "Sam"]];
    expect(numbersFor(chat("gmessages", "Sam"), "@me:s", contacts)).toEqual(["+15551110000", "+15552220000"]);
    expect(callOptions(chat("gmessages", "Sam"), "@me:s", contacts, true).map((o) => o.url)).toEqual(["tel:+15551110000", "tel:+15552220000"]);
  });
  it("a merged page offers what each of its chats offers, once", () => {
    const wa = chat("whatsapp", "Sam", ["@whatsapp_15551110000:s"]), sms = chat("gmessages", "Sam");
    const contacts: [string, string][] = [["+15551110000", "Sam"], ["+15552220000", "Sam"]];
    expect(callOptionsFor([sms, wa], "@me:s", contacts, true).map((o) => o.url)).toEqual(["tel:+15551110000", "tel:+15552220000", "https://wa.me/15551110000"]);
    expect(callOptionsFor([wa], "@me:s", contacts, false).map((o) => o.url)).toEqual(["https://wa.me/15551110000"]);
  });
});
