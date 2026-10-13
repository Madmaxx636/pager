import { describe, expect, it } from "vitest";
import { toMsg, captionOf } from "./reducer";
import { previewOf } from "./types";

const ev = (content: Record<string, unknown>) => ({ type: "m.room.message", event_id: "$a", sender: "@x:s", origin_server_ts: 1, content });

describe("captions on pictures, videos and files", () => {
  it("shows the words sent with a picture (body is the caption, filename is the file's name)", () => {
    const m = toMsg(ev({ msgtype: "m.image", body: "Look at this!", filename: "IMG_1.jpg", url: "mxc://s/a", info: { mimetype: "image/jpeg" } }))!;
    expect(m.caption).toBe("Look at this!");
    expect(m.body).toBe("IMG_1.jpg");
    expect(previewOf(m)).toBe("Photo: Look at this!");
  });
  it("has no caption when the body is just the file name", () => {
    const m = toMsg(ev({ msgtype: "m.image", body: "IMG_1.jpg", filename: "IMG_1.jpg", url: "mxc://s/a" }))!;
    expect(m.caption).toBeUndefined();
    expect(previewOf(m)).toBe("Photo");
    expect(toMsg(ev({ msgtype: "m.image", body: "IMG_1.jpg", url: "mxc://s/a" }))!.caption).toBeUndefined();
  });
  it("keeps the formatted caption and works for videos and files", () => {
    expect(captionOf("m.video", "Fun", "v.mp4", { format: "org.matrix.html", formatted_body: "<b>Fun</b>" })).toEqual({ name: "v.mp4", text: "Fun", html: "<b>Fun</b>" });
    expect(captionOf("m.file", "The contract", "c.pdf", {})?.text).toBe("The contract");
    expect(captionOf("m.text", "hi", "x", {})).toBeUndefined();
  });
});
