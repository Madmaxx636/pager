import { describe, expect, it } from "vitest";
import { lostText, newlyLost } from "./accountalerts";
import type { Network } from "./api";

const net = (id: string, state?: string): Network => ({ id, name: id === "gmessages" ? "Google Messages" : id, logins: [{ id: "a", name: "me@example.com", state_event: state }] } as Network);

describe("account alerts", () => {
  it("reports a login that just broke, once", () => {
    const a = newlyLost([], [net("gmessages", "BAD_CREDENTIALS"), net("signal", "CONNECTED")]);
    expect(a.fresh.map((x) => x.network)).toEqual(["Google Messages"]);
    const b = newlyLost(a.remembered, [net("gmessages", "BAD_CREDENTIALS")]);
    expect(b.fresh).toEqual([]);
  });
  it("alerts again after it recovered and broke again", () => {
    const ok = newlyLost(["gmessages/a"], [net("gmessages", "CONNECTED")]);
    expect(ok.remembered).toEqual([]);
    expect(newlyLost(ok.remembered, [net("gmessages", "LOGGED_OUT")]).fresh).toHaveLength(1);
  });
  it("ignores healthy and transient states", () => {
    expect(newlyLost([], [net("a", "CONNECTED"), net("b", "TRANSIENT_DISCONNECT"), net("c", "CONNECTING")]).fresh).toEqual([]);
  });
  it("says what to do", () => { const t = lostText(newlyLost([], [net("gmessages", "BAD_CREDENTIALS")]).fresh[0]); expect(t.title).toBe("Google Messages disconnected"); expect(t.body).toContain("sign in again"); });
});
