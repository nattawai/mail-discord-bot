import test from "node:test";
import assert from "node:assert/strict";
import { fetchJson } from "../src/tokens.js";

test("fetchJson retries a plain-text 502 and returns the later JSON", async () => {
  const replies = [new Response("error code: 502", { status: 502 }), new Response('{"ok":1}', { status: 200 })];
  const orig = globalThis.fetch;
  globalThis.fetch = async () => replies.shift();
  try {
    const { res, data } = await fetchJson("https://x", {});
    assert.equal(res.status, 200);
    assert.deepEqual(data, { ok: 1 });
  } finally {
    globalThis.fetch = orig;
  }
});

test("fetchJson does not throw on a non-JSON body", async () => {
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("error code: 502", { status: 502 });
  try {
    const { res, data } = await fetchJson("https://x", {}, 2);
    assert.equal(res.status, 502);
    assert.equal(data.error.message, "error code: 502");
  } finally {
    globalThis.fetch = orig;
  }
});
