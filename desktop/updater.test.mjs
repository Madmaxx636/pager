import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { createRequire } from "node:module";
// updater.js needs electron at load time; give it a stand-in.
const require = createRequire(import.meta.url);
const Module = require("node:module");
const orig = Module._load;
Module._load = (req, ...a) => (req === "electron" ? { app: {}, dialog: {}, shell: {} } : orig(req, ...a));
const { newer, verify } = require("./updater.js");

test("compares versions by number, not text", () => {
  assert.equal(newer("0.4.10", "0.4.9"), true);
  assert.equal(newer("0.4.1", "0.4.1"), false);
  assert.equal(newer("0.3.9", "0.4.0"), false);
  assert.equal(newer("1.0.0", "0.99.99"), true);
});

test("only a manifest signed by the release key is accepted", () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ed25519");
  const other = crypto.generateKeyPairSync("ed25519");
  const pem = publicKey.export({ type: "spki", format: "pem" });
  const body = Buffer.from('{"desktop":{"version":"9.9.9"}}');
  const good = crypto.sign(null, body, privateKey);
  assert.equal(verify(body, good, pem), true);
  assert.equal(verify(Buffer.from('{"desktop":{"version":"9.9.8"}}'), good, pem), false); // changed after signing
  assert.equal(verify(body, crypto.sign(null, body, other.privateKey), pem), false);      // signed by someone else
  assert.equal(verify(body, Buffer.from("junk"), pem), false);
});
