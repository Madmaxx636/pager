import { describe, expect, it } from "vitest";
import { addToPhonebook, isPhone, parseVcf, prettyName, stripTag } from "./names";

describe("names", () => {
  it("drops network tags but keeps real parentheses", () => {
    expect(stripTag("Sam Rivera (WA)")).toBe("Sam Rivera");
    expect(stripTag("Sam (Signal)")).toBe("Sam");
    expect(stripTag("Sam (work)")).toBe("Sam (work)");
  });
  it("recognises phone numbers", () => {
    expect(isPhone("+1 (555) 123-4567")).toBe(true);
    expect(isPhone("Sam")).toBe(false);
    expect(isPhone("12345")).toBe(false);
  });
  it("replaces a bare number with the contact's name", () => {
    addToPhonebook([{ number: "tel:+15551234567", name: "Alex Kim (WA)" }]);
    expect(prettyName("+1 555-123-4567")).toBe("Alex Kim");
    expect(prettyName("(555) 123 4567 (WA)")).toBe("Alex Kim");
    expect(prettyName("+44 7700 900123")).toBe("+44 7700 900123");
  });
  it("reads a vCard export", () => {
    const v = "BEGIN:VCARD\r\nVERSION:3.0\r\nFN:Jo Park\r\nTEL;TYPE=CELL:+1 555 987 6543\r\nTEL:555-000-1111\r\nEND:VCARD\r\nBEGIN:VCARD\r\nN:Lee;Kai;;;\r\nTEL:5552223333\r\nEND:VCARD";
    expect(parseVcf(v)).toEqual([{ number: "+1 555 987 6543", name: "Jo Park" }, { number: "555-000-1111", name: "Jo Park" }, { number: "5552223333", name: "Kai Lee" }]);
  });
});
