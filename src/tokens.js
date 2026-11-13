import { tr } from "./i18n.js";
import { apiError } from "./errors.js";

// จัดการ OAuth token ของทุก provider: cache access token, เก็บ refresh token (รวมถึงตัวที่ถูกหมุนใหม่)

const mem = new Map(); // cache ใน isolate เดียวกัน ลดการอ่าน/เขียน KV

export const K = (p, name) => `${p.key}:${name}`;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const RETRY = new Set([429, 500, 502, 503, 504]);

// fetch ที่ลองใหม่เมื่อเซิร์ฟเวอร์ล่มชั่วคราว (5xx/429) แล้วอ่านผลเป็น JSON แบบไม่พัง
// (Microsoft/Google บางครั้งตอบ "error code: 502" เป็นข้อความธรรมดา ไม่ใช่ JSON)
export async function fetchJson(url, init, tries = 3) {
  let res, text;
  for (let i = 0; i < tries; i++) {
    if (i) await sleep(400 * i);
    try {
      res = await fetch(url, init);
    } catch (err) {
      if (i === tries - 1) throw err;
      continue;
    }
    text = await res.text();
    if (!RETRY.has(res.status)) break;
  }
  let data = {};
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { error: { message: text.trim().slice(0, 200) } };
  }
  return { res, data };
}

function errText(data, status) {
  const e = data.error;
  const msg = typeof e === "string" ? e : e?.message || e?.code;
  return msg || `HTTP ${status}`;
}

export async function isConnected(env, p) {
  return Boolean(await env.KV.get(K(p, "refresh")));
}

export async function storeTokens(env, p, data) {
  if (data.refresh_token) await env.KV.put(K(p, "refresh"), data.refresh_token);
  if (data.access_token) {
    const tok = { token: data.access_token, exp: Date.now() + data.expires_in * 1000 };
    mem.set(p.key, tok);
    await env.KV.put(K(p, "access"), JSON.stringify(tok), { expirationTtl: Math.max(60, data.expires_in - 60) });
  }
}

export async function getAccessToken(env, p) {
  const now = Date.now();
  const m = mem.get(p.key);
  if (m && m.exp > now + 60_000) return m.token;

  const cached = await env.KV.get(K(p, "access"), "json");
  if (cached && cached.exp > now + 60_000) {
    mem.set(p.key, cached);
    return cached.token;
  }

  const refresh = await env.KV.get(K(p, "refresh"));
  if (!refresh) throw Object.assign(new Error(tr(env)("ยังไม่ได้เชื่อม {name} — สั่ง /account add เพื่อเชื่อมบัญชี", { name: p.name })), { friendly: true });

  const { res, data } = await fetchJson(p.tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...p.clientParams(env), refresh_token: refresh, grant_type: "refresh_token" }),
  });
  if (!res.ok) {
    // 4xx ตอนขอ token = refresh token ใช้ไม่ได้แล้ว ต้องเชื่อมใหม่ / 5xx = เซิร์ฟเวอร์ล่ม
    throw apiError(p.name, res.status, errText(data, res.status), { auth: res.status < 500 && res.status !== 429 });
  }
  await storeTokens(env, p, data); // Microsoft ส่ง refresh token ใหม่มาทุกครั้ง ต้องเก็บตัวใหม่
  return data.access_token;
}

export async function clearTokens(env, p) {
  mem.delete(p.key);
  await Promise.all(["refresh", "access", "poll", "email"].map((n) => env.KV.delete(K(p, n))));
}

// เรียก API แบบ JSON พร้อม Bearer token
export async function apiFetch(env, p, url, { method = "GET", body, headers = {} } = {}) {
  const token = await getAccessToken(env, p);
  const { res, data } = await fetchJson(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw apiError(p.name, res.status, errText(data, res.status));
  return data;
}
