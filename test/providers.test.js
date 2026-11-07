import test from "node:test";
import assert from "node:assert/strict";
import outlook from "../src/providers/outlook.js";
import gmail from "../src/providers/gmail.js";
import { getAccessToken } from "../src/tokens.js";

function fakeKV() {
  const m = new Map(); let writes = 0;
  return { m, get writes() { return writes; },
    async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { writes++; m.set(k, v); }, async delete(k) { m.delete(k); } };
}
function mockFetch(routes) {
  const calls = [];
  globalThis.fetch = async (url, opts = {}) => {
    const u = new URL(String(url)); calls.push({ url: u, opts });
    for (const [re, fn] of routes) if (re.test(u.href)) {
      const [status, body] = await fn(u, opts);
      return new Response(body == null ? "" : JSON.stringify(body), { status });
    }
    throw new Error("unmocked " + u.href);
  };
  return calls;
}
const env = () => ({ KV: fakeKV(), MS_CLIENT_ID: "c", MS_CLIENT_SECRET: "s", GOOGLE_CLIENT_ID: "gc", GOOGLE_CLIENT_SECRET: "gs" });

test("outlook token refresh stores rotated refresh token", async () => {
  const e = env(); await e.KV.put("o:refresh", "old");
  mockFetch([[/oauth2\/v2.0\/token/, (_u, o) => { assert.match(String(o.body), /refresh_token=old/); assert.match(String(o.body), /Mail.Send/); return [200, { access_token: "A", expires_in: 3600, refresh_token: "new" }]; }]]);
  assert.equal(await getAccessToken(e, outlook), "A");
  assert.equal(await e.KV.get("o:refresh"), "new");
});

test("outlook poll: first run inits, then posts only new mails, dedupes boundary", async () => {
  const e = env(); await e.KV.put("o:refresh", "r"); await e.KV.put("o:access", JSON.stringify({ token: "A", exp: Date.now() + 3e6 }));
  let page = [];
  const calls = mockFetch([[/mailFolders\/inbox\/messages/, () => [200, { value: page }]]]);
  assert.deepEqual(await outlook.poll(e, 10), { items: [], more: 0 });
  const since = (await e.KV.get("o:poll", "json")).since;
  assert.match(since, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);

  const mk = (id, t) => ({ id, subject: "S" + id, from: { emailAddress: { name: "Bob", address: "b@x.com" } }, receivedDateTime: t, bodyPreview: "hi", webLink: "https://outlook/" + id });
  page = [mk("1", "2026-11-07T06:00:00Z"), mk("2", "2026-11-07T06:01:00Z"), mk("3", "2026-11-07T06:01:00Z")];
  const r = await outlook.poll(e, 2);
  assert.deepEqual(r.items.map((x) => x.id), ["1", "2"]); assert.equal(r.more, 1);
  assert.equal(r.items[0].from, "Bob <b@x.com>");
  const st = await e.KV.get("o:poll", "json");
  assert.equal(st.since, "2026-11-07T06:01:00Z"); assert.deepEqual(st.ids, ["2", "3"]);
  assert.match(calls.at(-1).url.searchParams.get("$filter"), /receivedDateTime ge 2026-11-07T06:00:00Z|receivedDateTime ge \d/);
  assert.match(calls.at(-1).opts.headers.Prefer, /ImmutableId/);

  page = [mk("2", "2026-11-07T06:01:00Z"), mk("3", "2026-11-07T06:01:00Z")];
  const w = e.KV.writes;
  assert.deepEqual((await outlook.poll(e, 10)).items, []);
  assert.equal(e.KV.writes, w, "no KV write when nothing new");
});

test("outlook ref fits Discord custom_id and resolves back", async () => {
  const e = env(); const longId = "AAkALgAAAAAAHYQDEapmEc2byACqAC-EWg0A" + "x".repeat(120) + "=";
  const ref = await outlook.ref(e, longId);
  assert.ok(`untrash:o:${ref}`.length <= 100);
  assert.equal(await outlook.resolve(e, ref), longId);
  const w = e.KV.writes; await outlook.ref(e, longId); assert.equal(e.KV.writes, w, "ref reuse doesn't write");
  await assert.rejects(outlook.resolve(e, "nope"));
});

test("outlook actions hit correct Graph endpoints", async () => {
  const e = env(); await e.KV.put("o:refresh", "r"); await e.KV.put("o:access", JSON.stringify({ token: "A", exp: Date.now() + 3e6 }));
  const calls = mockFetch([
    [/\/reply$/, () => [202, null]], [/\/move$/, () => [201, { id: "x" }]], [/\/sendMail$/, () => [202, null]],
    [/messages\/[^/]+\?/, () => [200, { from: { emailAddress: { address: "a@x.com" } }, replyTo: [] }]],
    [/messages\/[^/?]+$/, () => [200, {}]],
  ]);
  await outlook.trash(e, "id/1"); assert.equal(calls.at(-1).url.pathname, "/v1.0/me/messages/id%2F1/move");
  assert.equal(JSON.parse(calls.at(-1).opts.body).destinationId, "deleteditems");
  await outlook.untrash(e, "id"); assert.equal(JSON.parse(calls.at(-1).opts.body).destinationId, "inbox");
  await outlook.markRead(e, "id"); assert.equal(calls.at(-1).opts.method, "PATCH");
  assert.equal(await outlook.reply(e, "id", "line1\n<b>"), "a@x.com");
  assert.equal(JSON.parse(calls.at(-1).opts.body).comment, "line1<br>&lt;b&gt;");
  await outlook.send(e, { to: ["p@x.com", "q@x.com"], subject: "สวัสดี", body: "ทดสอบ" });
  const sent = JSON.parse(calls.at(-1).opts.body).message;
  assert.deepEqual(sent.toRecipients.map((r) => r.emailAddress.address), ["p@x.com", "q@x.com"]);
});

test("gmail poll still works under provider interface", async () => {
  const e = env(); await e.KV.put("g:refresh", "r"); await e.KV.put("g:access", JSON.stringify({ token: "A", exp: Date.now() + 3e6 }));
  await e.KV.put("g:poll", JSON.stringify({ historyId: "10", savedAt: Date.now() }));
  mockFetch([
    [/\/history/, () => [200, { historyId: "20", history: [{ messagesAdded: [{ message: { id: "m1", labelIds: ["INBOX", "UNREAD"] } }, { message: { id: "d1", labelIds: ["DRAFT", "INBOX"] } }] }] }]],
    [/\/messages\/m1/, () => [200, { id: "m1", threadId: "t1", snippet: "a &amp; b", payload: { headers: [{ name: "Subject", value: "Hi" }, { name: "From", value: "x@y" }] } }]],
  ]);
  const r = await gmail.poll(e, 10);
  assert.deepEqual(r.items, [{ id: "m1", from: "x@y", subject: "Hi", date: "", snippet: "a & b", link: "https://mail.google.com/mail/u/0/#all/t1" }]);
  assert.equal((await e.KV.get("g:poll", "json")).historyId, "20");
});
