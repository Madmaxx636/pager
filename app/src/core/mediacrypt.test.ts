// @vitest-environment node
import { describe, expect, it } from "vitest";
import { decryptAttachment, encryptAttachment } from "./mediacrypt";

describe("encrypted attachments", () => {
  it("round-trips and detects tampering", async () => {
    const original = new TextEncoder().encode("a private photo, pretend");
    const { data, file } = await encryptAttachment(new Blob([original]));
    const cipher = await data.arrayBuffer();
    expect(new TextDecoder().decode(cipher)).not.toContain("private");
    const back = await decryptAttachment(cipher, file);
    expect(new TextDecoder().decode(back)).toBe("a private photo, pretend");
    const bad = new Uint8Array(cipher); bad[0] ^= 1;
    await expect(decryptAttachment(bad.buffer, file)).rejects.toThrow(/checksum/);
  });
});
