import { describe, expect, it } from "vitest";
import { parseCookies } from "./api";

describe("parseCookies", () => {
  it("reads a JSON object", () => expect(parseCookies('{"SID":"a","HSID":"b"}')).toEqual({ SID: "a", HSID: "b" }));
  it("reads a cookie header", () => expect(parseCookies("Cookie: SID=a; HSID=b")).toEqual({ SID: "a", HSID: "b" }));
  it("reads a cURL command", () => expect(parseCookies("curl 'https://x' -H 'accept: */*' -b 'SID=a; SAPISID=c=d'")).toEqual({ SID: "a", SAPISID: "c=d" }));
  it("reads a cookie header inside cURL -H", () => expect(parseCookies("curl 'https://x' -H 'cookie: SID=a; OSID=z'")).toEqual({ SID: "a", OSID: "z" }));
});
