// ระบบเช็กสถานะ: บันทึกว่าการดึงเมลแต่ละบัญชีล้มเหลวตั้งแต่เมื่อไร และคำสั่ง /status ที่ทดสอบทุกบริการสด ๆ
// KV ฟรีเขียนได้ 1,000 ครั้ง/วัน จึงเขียนเฉพาะตอนสถานะเปลี่ยน และ heartbeat ทุก 10 นาที (144 ครั้ง/วัน)
import { discord } from "./discord.js";
import { errorReason } from "./errors.js";
import { connectedProviders } from "./providers/index.js";

const HEARTBEAT = "health:cron";
const healthKey = (p) => `health:${p.key}`;
const unix = (ms) => Math.floor(ms / 1000);
const STATUS_PAGES = [
  ["Google", "https://www.google.com/appsstatus/dashboard/"],
  ["Microsoft", "https://portal.office.com/servicestatus"],
  ["Discord", "https://discordstatus.com"],
  ["Cloudflare", "https://www.cloudflarestatus.com"],
];

export async function heartbeat(env, now = Date.now()) {
  if (new Date(now).getUTCMinutes() % 10 === 0) await env.KV.put(HEARTBEAT, String(now));
}

// เรียกหลังดึงเมลแต่ละบัญชี: err = null แปลว่าสำเร็จ
export async function recordPoll(env, p, err, now = Date.now()) {
  const prev = await env.KV.get(healthKey(p), "json");
  if (!err) {
    if (prev) await env.KV.delete(healthKey(p));
    return;
  }
  if (!prev) {
    const { status, code, service, auth, timeout, friendly, name } = err;
    await env.KV.put(healthKey(p), JSON.stringify({ since: now, message: String(err.message).slice(0, 300), status, code, service, auth, timeout, friendly, name }));
  }
}

function withTimeout(promise, ms, service) {
  let timer;
  const t = new Promise((_, reject) => {
    timer = setTimeout(() => reject(Object.assign(new Error(`${service} timeout ${ms} ms`), { timeout: true, service })), ms);
  });
  return Promise.race([promise, t]).finally(() => clearTimeout(timer));
}

async function timed(fn, service) {
  const start = Date.now();
  try {
    await withTimeout(fn(), 8000, service);
    return { ok: true, ms: Date.now() - start };
  } catch (err) {
    return { ok: false, err };
  }
}

// ข้อความรายงานสถานะ (เห็นเฉพาะคนที่สั่ง)
export async function statusReport(env, T, accountInfo, now = Date.now()) {
  const lines = [T("**🩺 สถานะระบบ** · เช็กเมื่อ <t:{time}:T>", { time: unix(now) })];
  let problems = 0;
  const bad = (row, err, extra = []) => {
    problems++;
    const { why, fix } = errorReason(err, T);
    lines.push(`❌ ${row} — ${why}`, ...(fix ? [`　↳ ${T("วิธีแก้:")} ${fix}`] : []), ...extra);
  };

  lines.push(`✅ Cloudflare Worker — ${T("ทำงานปกติ")}`);

  let beat = null;
  try {
    beat = Number(await env.KV.get(HEARTBEAT)) || null;
    lines.push(`✅ Cloudflare KV — ${T("อ่านข้อมูลได้")}`);
  } catch (err) {
    bad("Cloudflare KV", err);
  }
  if (!beat) lines.push(`⚪ ${T("ตัวตั้งเวลาดึงเมล (cron)")} — ${T("ยังไม่มีข้อมูล รอประมาณ 10 นาทีหลัง deploy")}`);
  else if (now - beat > 25 * 60_000) {
    problems++;
    lines.push(
      `❌ ${T("ตัวตั้งเวลาดึงเมล (cron)")} — ${T("ไม่ได้ทำงานมาตั้งแต่ <t:{time}:R>", { time: unix(beat) })}`,
      `　↳ ${T("วิธีแก้:")} ${T("เช็ก Triggers ของ Worker ใน Cloudflare dashboard แล้ว deploy ใหม่")}`
    );
  } else lines.push(`✅ ${T("ตัวตั้งเวลาดึงเมล (cron)")} — ${T("ทำงานล่าสุด <t:{time}:R>", { time: unix(beat) })}`);

  const providers = await connectedProviders(env);
  const [dc, ...accts] = await Promise.all([
    timed(() => discord(env, `/channels/${env.DISCORD_CHANNEL_ID}`), "Discord"),
    ...providers.map((p) => timed(() => p.email(env), p.name)),
  ]);
  if (dc.ok) lines.push(`✅ Discord — ${dc.ms} ms`);
  else bad("Discord", dc.err);

  if (!providers.length) lines.push(`⚪ ${T("ยังไม่ได้เชื่อมบัญชีอีเมล — ใช้ `/account add`")}`);
  for (const [i, p] of providers.entries()) {
    const a = await accountInfo(env, p);
    const row = `${a.emoji} ${a.display}`;
    const health = await env.KV.get(healthKey(p), "json");
    const pollLine = health
      ? [`　↳ ${T("แจ้งเตือนเมลใหม่ล้มเหลวตั้งแต่ <t:{time}:R>: {why}", { time: unix(health.since), why: errorReason(health, T).why })}`]
      : [];
    if (accts[i].ok) {
      if (health) {
        problems++;
        lines.push(`⚠️ ${row} — ${T("ตอนนี้ติดต่อได้ ({ms} ms) แต่รอบดึงเมลล่าสุดยังล้มเหลว", { ms: accts[i].ms })}`, ...pollLine);
      } else lines.push(`✅ ${row} — ${accts[i].ms} ms`);
    } else bad(row, accts[i].err, pollLine);
  }

  lines.push("", problems ? T("**สรุป:** มีปัญหา {count} รายการ", { count: problems }) : T("**สรุป:** ทุกอย่างทำงานปกติ"));
  lines.push(`-# ${T("หน้าสถานะทางการ:")} ${STATUS_PAGES.map(([n, u]) => `[${n}](<${u}>)`).join(" · ")}`);
  return lines.join("\n");
}
