// จัดการ OAuth token ของทุก provider: cache access token, เก็บ refresh token (รวมถึงตัวที่ถูกหมุนใหม่)

const mem = new Map(); // cache ใน isolate เดียวกัน ลดการอ่าน/เขียน KV

export const K = (p, name) => `${p.key}:${name}`;

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
  if (!refresh) throw new Error(`ยังไม่ได้เชื่อม ${p.name} — เปิด /setup?key=SETUP_KEY`);

  const res = await fetch(p.tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ ...p.clientParams(env), refresh_token: refresh, grant_type: "refresh_token" }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`${p.name}: ขอ access token ไม่สำเร็จ (${data.error || res.status}) — ลองเชื่อมใหม่ที่ /setup`);
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
  const res = await fetch(url, {
    method,
    headers: { Authorization: `Bearer ${token}`, ...(body ? { "Content-Type": "application/json" } : {}), ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) {
    const err = new Error(`${p.name} API ${res.status}: ${data.error?.message || data.error?.code || "unknown error"}`);
    err.status = res.status;
    throw err;
  }
  return data;
}
