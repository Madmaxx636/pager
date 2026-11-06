import { describe, expect, it } from "vitest";
import { asVault, findRecoveryKey, openRecoveryKey, passwordProblem, sealRecoveryKey } from "./keyvault";
import { formatRecoveryKey, parseRecoveryKey } from "./crypto";

const KEY = formatRecoveryKey(Uint8Array.from({ length: 32 }, (_, i) => i * 7 + 1));
const salt = Uint8Array.from({ length: 16 }, (_, i) => i), iv = Uint8Array.from({ length: 12 }, (_, i) => 100 + i);

describe("master password vault", () => {
  it("opens with the password it was locked with", async () => {
    const v = await sealRecoveryKey(KEY, "correct horse battery", "7");
    expect(await openRecoveryKey(v, "correct horse battery")).toBe(KEY);
    expect(v.backup).toBe("7");
  });
  it("refuses a wrong password", async () => {
    const v = await sealRecoveryKey(KEY, "correct horse battery", "7");
    await expect(openRecoveryKey(v, "correct horse batterz")).rejects.toThrow("isn't right");
  });
  it("treats the same password typed in a different Unicode form as the same", async () => {
    const v = await sealRecoveryKey(KEY, "café au lait 2026", "1");
    expect(await openRecoveryKey(v, "café au lait 2026")).toBe(KEY);
  });
  it("rejects a short password and a tampered copy", async () => {
    await expect(sealRecoveryKey(KEY, "short", "1")).rejects.toThrow("at least");
    const v = await sealRecoveryKey(KEY, "correct horse battery", "1");
    await expect(openRecoveryKey({ ...v, backup: v.backup, ct: v.ct.slice(0, -4) + "AAAA" }, "correct horse battery")).rejects.toThrow();
    await expect(openRecoveryKey({ ...v, iter: 10 }, "correct horse battery")).rejects.toThrow("damaged");
  });
  it("produces a fixed, known value (the Android app must read the same bytes)", async () => {
    const v = await sealRecoveryKey(KEY, "correct horse battery", "9", salt, iv);
    expect(v.iter).toBe(600_000);
    expect(v.ct).toMatchSnapshot();
    expect(await openRecoveryKey(v, "correct horse battery")).toBe(KEY);
  });
  it("only accepts a well formed stored copy", () => {
    expect(asVault({})).toBeUndefined();
    expect(asVault(undefined)).toBeUndefined();
    expect(asVault({ v: 1, ct: "a", salt: "b", iv: "c", backup: "1" })).toBeTruthy();
  });
  it("judges a password while typing", () => {
    expect(passwordProblem("abc")).toMatch(/At least/);
    expect(passwordProblem("aaaaaaaaaaaa")).toMatch(/repetitive/);
    expect(passwordProblem("tulip river 88 lantern")).toBeUndefined();
  });
});

describe("finding a recovery key in pasted text", () => {
  it("takes the key itself", () => expect(findRecoveryKey(KEY, parseRecoveryKey)).toBe(KEY));
  it("takes the text file Pager saves", () => expect(findRecoveryKey(`Pager recovery key\n\n${KEY}\n`, parseRecoveryKey)).toBe(KEY));
  it("works with Windows line endings", () => expect(findRecoveryKey(`Pager recovery key\r\n\r\n${KEY}\r\n`, parseRecoveryKey)).toBe(KEY));
  it("finds nothing in other text", () => expect(findRecoveryKey("hello there\nnot a key", parseRecoveryKey)).toBeUndefined());
});
