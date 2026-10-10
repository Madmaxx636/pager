import { afterEach, describe, expect, it, vi } from "vitest";
import { couldNotResolve, dialable, http, pager, startError } from "./api";

afterEach(() => vi.unstubAllGlobals());

describe("phone numbers for starting a chat", () => {
  it("keeps the digits and a leading plus", () => {
    expect(dialable("+1 (912) 555-0100")).toBe("+19125550100");
    expect(dialable("tel:+19125550100")).toBe("+19125550100");
    expect(dialable("9125550100")).toBe("9125550100");
  });
  it("rejects things that are not numbers", () => {
    expect(dialable("ann@example.com")).toBe("");
    expect(dialable("1.431")).toBe("");
    expect(dialable("")).toBe("");
  });
});

describe("when a bridge can't find the person", () => {
  it("recognises its wording", () => {
    expect(couldNotResolve(new Error("Internal error resolving identifier"))).toBe(true);
    expect(couldNotResolve("phone number of ghost 1.431 not known")).toBe(true);
    expect(couldNotResolve(new Error("Signal bridge is unreachable"))).toBe(false);
  });
  it("tells the person what to do instead", () => {
    expect(startError(new Error("Internal error resolving identifier"))).toMatch(/phone number/);
    expect(startError(new Error("Signal bridge is unreachable"))).toBe("Signal bridge is unreachable");
  });
});

describe("opening a chat with a contact", () => {
  const reply = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  http.base = "http://x";

  it("tries the contact's number when its own id can't be resolved", async () => {
    const calls: string[] = [];
    vi.stubGlobal("fetch", async (u: string) => {
      calls.push(decodeURIComponent(new URL(u).pathname));
      return calls.length === 1 ? reply(500, { error: "Internal error resolving identifier" }) : reply(200, { dm_room_mxid: "!room:x" });
    });
    expect(await pager.createDm("gmessages", "l1", "1.431", "+1 (912) 555-0100")).toBe("!room:x");
    expect(calls).toEqual(["/api/bridges/gmessages/create_dm/1.431", "/api/bridges/gmessages/create_dm/+19125550100"]);
  });

  it("does not retry other problems, or when there is no number", async () => {
    let n = 0;
    vi.stubGlobal("fetch", async () => { n++; return reply(502, { error: "Signal bridge is unreachable" }); });
    await expect(pager.createDm("signal", "l1", "abc", "+19125550100")).rejects.toThrow(/unreachable/);
    expect(n).toBe(1);
    n = 0;
    vi.stubGlobal("fetch", async () => { n++; return reply(500, { error: "Internal error resolving identifier" }); });
    await expect(pager.createDm("gmessages", "l1", "1.431", undefined)).rejects.toThrow(/resolving/);
    expect(n).toBe(1);
  });
});
