// ทะเบียนบัญชีอีเมล: แต่ละบัญชีมี key ของตัวเอง เช่น g, g2, g3 (Gmail) / o, o2 (Outlook)
// key นี้ใช้เป็น prefix ของ KV (เช่น g2:refresh) และอยู่ใน custom_id ของปุ่ม (read:g2:<ref>)
import { createGmail } from "./gmail.js";
import { createOutlook } from "./outlook.js";

const FACTORY = { g: createGmail, o: createOutlook };
export const TYPES = [createGmail("g"), createOutlook("o")]; // ใช้เป็นแม่แบบในหน้า setup

const cache = new Map();
export function provider(key) {
  if (!/^[go]\d*$/.test(key || "")) throw new Error(`Unknown account "${key}"`);
  if (!cache.has(key)) cache.set(key, FACTORY[key[0]](key));
  return cache.get(key);
}

export async function accountKeys(env) {
  const list = await env.KV.get("accounts", "json");
  if (list) return list;
  // ก่อนรองรับหลายบัญชี: บัญชีเดิมใช้ key "g" และ "o"
  const legacy = [];
  for (const k of ["g", "o"]) if (await env.KV.get(`${k}:refresh`)) legacy.push(k);
  return legacy;
}

export async function connectedProviders(env) {
  return (await accountKeys(env)).map(provider);
}

export async function saveAccountKeys(env, keys) {
  await env.KV.put("accounts", JSON.stringify([...new Set(keys)]));
}

// ถ้าอีเมลนี้เคยเชื่อมแล้วใช้ key เดิม ไม่งั้นหา key ว่างตัวถัดไป (g, g2, g3, ...)
export async function keyForEmail(env, type, email) {
  const keys = await accountKeys(env);
  for (const k of keys.filter((k) => k[0] === type)) {
    if ((await env.KV.get(`${k}:email`))?.toLowerCase() === email.toLowerCase()) return k;
  }
  for (let n = 1; ; n++) {
    const k = n === 1 ? type : `${type}${n}`;
    if (!keys.includes(k)) return k;
  }
}
