import { describe, expect, it } from "vitest";
import { freshUpdates, lostText, newlyLost, updateText } from "./accountalerts";
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

describe("bridge update notices", () => {
  const e = (at: string, updated: string[] = ["gmessages"], putBack: string[] = []) => ({ at, updated, putBack });
  const now = Date.parse("2026-10-17T12:00:00Z");
  it("tells about new updates once", () => {
    const list = [e("2026-10-17T05:00:00Z")];
    expect(freshUpdates(undefined, list, now)).toHaveLength(1);
    expect(freshUpdates("2026-10-17T05:00:00Z", list, now)).toHaveLength(0);
  });
  it("does not announce old ones", () => { expect(freshUpdates(undefined, [e("2026-10-10T05:00:00Z")], now)).toHaveLength(0); });
  it("says what happened", () => {
    const n = (id: string) => (id === "gmessages" ? "Google Messages" : id);
    expect(updateText(e("x", ["gmessages", "signal"]), n).body).toBe("Updated to the newest version: Google Messages, signal.");
    const bad = updateText(e("x", [], ["signal"]), n);
    expect(bad.title).toBe("Bridge update needs a look"); expect(bad.body).toContain("put back");
  });
});
