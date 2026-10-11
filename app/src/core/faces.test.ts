import { describe, expect, it } from "vitest";
import { faceLayout, groupFaces } from "./faces";
import { emptyChat } from "./types";

describe("a group's round picture", () => {
  it("fits every face inside the circle", () => {
    for (const n of [1, 2, 3, 4, 7]) for (const f of faceLayout(n)) { expect(f.x + f.d).toBeLessThanOrEqual(1.001); expect(f.y + f.d).toBeLessThanOrEqual(1.001); expect(f.x).toBeGreaterThanOrEqual(0); }
    expect(faceLayout(7)).toHaveLength(4); expect(faceLayout(3)).toHaveLength(3);
  });
  it("uses people, not bots or you", () => {
    const c = { ...emptyChat("!a:x"), members: { "@me:x": "Me", "@signalbot:x": "Signal bot", "@a:x": "Amy", "@b:x": "Ben" }, memberAvatars: { "@a:x": "mxc://x/amy" } };
    expect(groupFaces(c, "@me:x")).toEqual([{ name: "Amy", mxc: "mxc://x/amy" }, { name: "Ben", mxc: undefined }]);
  });
});
