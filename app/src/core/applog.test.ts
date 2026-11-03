import { beforeEach, describe, expect, it, vi } from "vitest";
import { AFTER, BEFORE, MAX_CRUMBS, appIncidentText, crumb, getCrumbs, getIncidents, recordIncident, resetLogForTests, scrub } from "./applog";

beforeEach(() => {
  const store: Record<string, string> = {};
  vi.stubGlobal("localStorage", { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => { store[k] = v; }, removeItem: (k: string) => { delete store[k]; } });
  vi.useFakeTimers();
  resetLogForTests();
});

describe("scrub", () => {
  it("removes tokens, bearer headers, recovery keys and addresses", () => {
    expect(scrub("access_token=syt_abcdefghij1234 failed")).not.toContain("syt_abc");
    expect(scrub("Authorization: Bearer abc.def-ghi")).toBe("Authorization: Bearer [removed]");
    expect(scrub("key EsTc 1234 5678 9abc defg hijk lmno pqrs tuvw xyz1 2345 6789")).toContain("[recovery key removed]");
    expect(scrub("mail me at someone@example.com")).toBe("mail me at [address removed]");
  });
  it("leaves Matrix ids and plain words alone", () => {
    expect(scrub("room !abc:server for @lane:server")).toBe("room !abc:server for @lane:server");
  });
});

describe("breadcrumbs", () => {
  it("keeps only the newest ones", () => {
    for (let i = 0; i < MAX_CRUMBS + 30; i++) crumb("test", `n${i}`);
    const all = getCrumbs();
    expect(all).toHaveLength(MAX_CRUMBS);
    expect(all[all.length - 1].text).toBe(`n${MAX_CRUMBS + 29}`);
  });
});

describe("incidents", () => {
  it("keeps the lines before and collects the lines after", () => {
    for (let i = 0; i < 40; i++) crumb("test", `before ${i}`);
    recordIncident("sync", "boom");
    for (let i = 0; i < 20; i++) crumb("test", `after ${i}`);
    const [inc] = getIncidents();
    expect(inc.before).toHaveLength(BEFORE);
    expect(inc.before[BEFORE - 1].text).toBe("before 39");
    expect(inc.after).toHaveLength(AFTER);
    expect(appIncidentText(inc)).toContain("Problem:");
  });
  it("counts a repeat instead of listing it again, even when numbers differ", () => {
    recordIncident("sync", "timeout after 3000 ms");
    recordIncident("sync", "timeout after 4500 ms");
    const all = getIncidents();
    expect(all).toHaveLength(1);
    expect(all[0].count).toBe(2);
  });
  it("never keeps a token", () => {
    recordIncident("send", "failed with access_token=secretvalue123", "at x (Bearer abcdef)");
    const t = appIncidentText(getIncidents()[0]);
    expect(t).not.toContain("secretvalue123");
    expect(t).not.toContain("abcdef");
  });
});
