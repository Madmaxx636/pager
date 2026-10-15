import { describe, expect, it } from "vitest";
import { toMsg, videoExtras } from "./reducer";

describe("videos", () => {
  it("reads the preview picture and the GIF flag", () => {
    expect(videoExtras({ thumbnail_url: "mxc://a/b", "fi.mau.gif": true })).toEqual({ poster: "mxc://a/b", gifLike: true });
    expect(videoExtras({})).toEqual({ poster: undefined, gifLike: undefined });
  });
  it("puts them on the message", () => {
    const m = toMsg({ type: "m.room.message", event_id: "$1", sender: "@a:b", origin_server_ts: 1, content: { msgtype: "m.video", body: "v.mp4", url: "mxc://a/v", info: { mimetype: "video/mp4", duration: 4000, thumbnail_url: "mxc://a/t", "fi.mau.loop": true } } });
    expect(m?.poster).toBe("mxc://a/t");
    expect(m?.gifLike).toBe(true);
    expect(m?.durationMs).toBe(4000);
  });
});
