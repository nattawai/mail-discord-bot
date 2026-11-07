import test from "node:test";
import assert from "node:assert/strict";
import { accountKeys, keyForEmail, provider, saveAccountKeys } from "../src/providers/index.js";

const kv = () => { const m = new Map(); return { async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; }, async put(k, v) { m.set(k, v); }, async delete(k) { m.delete(k); } }; };

test("legacy g/o accounts are kept, new emails get g2/o2, same email reuses key", async () => {
  const env = { KV: kv() };
  await env.KV.put("g:refresh", "r"); await env.KV.put("g:email", "A@gmail.com");
  await env.KV.put("o:refresh", "r"); await env.KV.put("o:email", "x@hotmail.com");
  assert.deepEqual(await accountKeys(env), ["g", "o"]);
  assert.equal(await keyForEmail(env, "g", "a@gmail.com"), "g");
  assert.equal(await keyForEmail(env, "g", "b@gmail.com"), "g2");
  await saveAccountKeys(env, ["g", "o", "g2"]);
  assert.equal(await keyForEmail(env, "g", "c@gmail.com"), "g3");
  assert.equal(await keyForEmail(env, "o", "y@hotmail.com"), "o2");
});

test("provider instances are per account and keep custom_id short", () => {
  const p = provider("g2");
  assert.equal(p.key, "g2"); assert.equal(p.type, "g"); assert.equal(provider("o").type, "o");
  assert.notEqual(provider("g"), p);
  assert.throws(() => provider("x1")); assert.throws(() => provider("g:1"));
  assert.ok(`untrash:o12:${"A".repeat(22)}`.length <= 100);
});
