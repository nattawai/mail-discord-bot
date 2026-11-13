import test from "node:test";
import assert from "node:assert/strict";
import { heartbeat, recordPoll, statusReport } from "../src/status.js";
import { apiError } from "../src/errors.js";
import { provider } from "../src/providers/index.js";
import { tr } from "../src/i18n.js";

const kv = () => {
  const m = new Map();
  return {
    m,
    async get(k, t) { const v = m.get(k); return v == null ? null : t === "json" ? JSON.parse(v) : v; },
    async put(k, v) { m.set(k, v); },
    async delete(k) { m.delete(k); },
  };
};
const T = tr({ LANGUAGE: "en" });
const info = async (env, p) => ({ emoji: "📧", display: p.key });

test("recordPoll writes only when the state changes", async () => {
  const env = { KV: kv() };
  const p = provider("o");
  await recordPoll(env, p, apiError("Outlook", 502, "error code: 502"), 1000);
  await recordPoll(env, p, apiError("Outlook", 503, "later"), 5000);
  assert.equal(JSON.parse(env.KV.m.get("health:o")).since, 1000); // first failure time kept
  await recordPoll(env, p, null);
  assert.equal(env.KV.m.has("health:o"), false);
});

test("heartbeat writes only every 10 minutes", async () => {
  const env = { KV: kv() };
  await heartbeat(env, Date.UTC(2026, 0, 1, 0, 7));
  assert.equal(env.KV.m.has("health:cron"), false);
  await heartbeat(env, Date.UTC(2026, 0, 1, 0, 10));
  assert.equal(env.KV.m.has("health:cron"), true);
});

test("statusReport shows a down account with the reason and since when", async () => {
  const now = Date.UTC(2026, 0, 1, 1, 0);
  const env = { KV: kv(), DISCORD_CHANNEL_ID: "1", DISCORD_BOT_TOKEN: "x" };
  await env.KV.put("accounts", JSON.stringify(["g", "o"]));
  await env.KV.put("health:cron", String(now - 5 * 60_000));
  await env.KV.put("g:access", JSON.stringify({ token: "t", exp: Date.now() + 3600_000 }));
  await env.KV.put("o:access", JSON.stringify({ token: "t", exp: Date.now() + 3600_000 }));
  await recordPoll(env, provider("o"), apiError("Outlook", 502, "error code: 502"), now - 120_000);

  const orig = globalThis.fetch;
  globalThis.fetch = async (url) => {
    const u = String(url);
    if (u.includes("discord.com")) return new Response("{}", { status: 200 });
    if (u.includes("gmail")) return new Response('{"emailAddress":"a@gmail.com"}', { status: 200 });
    return new Response("error code: 502", { status: 502 });
  };
  try {
    const out = await statusReport(env, T, info, now);
    assert.match(out, /✅ Cloudflare Worker/);
    assert.match(out, /✅ Mail check timer \(cron\) — last ran/);
    assert.match(out, /✅ Discord — \d+ ms/);
    assert.match(out, /✅ 📧 g — \d+ ms/);
    assert.match(out, /❌ 📧 o — Outlook is having a temporary server problem \(502\)/);
    assert.match(out, /New-mail checks failing since <t:\d+:R>/);
    assert.match(out, /1 problem/);
  } finally {
    globalThis.fetch = orig;
  }
});

test("statusReport flags a stopped cron", async () => {
  const now = Date.UTC(2026, 0, 1, 1, 0);
  const env = { KV: kv(), DISCORD_CHANNEL_ID: "1" };
  await env.KV.put("accounts", "[]");
  await env.KV.put("health:cron", String(now - 60 * 60_000));
  const orig = globalThis.fetch;
  globalThis.fetch = async () => new Response("{}", { status: 200 });
  try {
    const out = await statusReport(env, T, info, now);
    assert.match(out, /❌ Mail check timer \(cron\) — hasn't run since/);
  } finally {
    globalThis.fetch = orig;
  }
});
