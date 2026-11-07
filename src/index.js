import { COMMANDS, discord, ephemeral, json } from "./discord.js";
import { accountInfo, ensureEmojis, handleInteraction, oauthRedirect, pollAll } from "./bot.js";
import { TYPES, accountKeys, connectedProviders, keyForEmail, provider, saveAccountKeys } from "./providers/index.js";
import { K, clearTokens, storeTokens } from "./tokens.js";
import { tr } from "./i18n.js";

// แพ็กเกจฟรีจำกัด subrequest ประมาณ 50 ครั้งต่อรอบ จึงแบ่งโควตาตามจำนวนบัญชี

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    try {
      if (request.method === "POST" && url.pathname === "/")
        return await handleInteraction(request, env, ctx).catch((err) => ephemeral(`❌ ${err.message}`.slice(0, 1900)));
      if (request.method === "GET") {
        if (url.pathname === "/")
          return html(
            "Mail Discord Bot",
            `<p>บอทส่วนตัวที่แจ้งเตือนอีเมลใหม่จาก Gmail / Outlook เข้าช่อง Discord ส่วนตัวของเจ้าของ และให้เจ้าของอ่าน ตอบ หรือลบอีเมลจาก Discord ได้</p><p>A personal bot that forwards new-mail notifications to the owner's private Discord channel. <a href="/privacy">Privacy policy</a></p>`
          );
        if (url.pathname === "/privacy") return privacyPage();
        if (url.pathname === "/oauth/callback") return await oauthCallback(url, env);
        if (url.pathname === "/oauth/link") {
          const t = url.searchParams.get("t") || "";
          const type = t && (await env.KV.get(`oauth_link:${t}`));
          if (!type) return html(tr(env)("ลิงก์หมดอายุ"), tr(env)("<p>สั่ง <code>/account add</code> ใน Discord ใหม่อีกครั้ง</p>"), 400);
          await env.KV.delete(`oauth_link:${t}`);
          return Response.redirect(await oauthRedirect(env, type, url.origin), 302);
        }
        if (url.pathname.startsWith("/oauth/") || url.pathname.startsWith("/setup")) {
          if (!env.SETUP_KEY || url.searchParams.get("key") !== env.SETUP_KEY) return new Response("Forbidden", { status: 403 });
          if (url.pathname === "/setup") return await setupPage(url, env);
          if (url.pathname === "/oauth/start") return await oauthStart(url, env);
          if (url.pathname === "/setup/commands") return await registerCommands(env);
          if (url.pathname === "/setup/test") return await testPost(env);
          if (url.pathname === "/setup/disconnect") return await disconnect(url, env);
          if (url.pathname === "/setup/debug") return await debugPoll(env);
        }
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      console.error(err);
      return new Response(`Error: ${err.message}`, { status: 500 });
    }
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(pollAll(env));
  },
};


// ───────────────────────── Setup routes ─────────────────────────

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const CSS = `
:root{--bg:#f5f6fa;--card:#fff;--fg:#1f2328;--muted:#667085;--line:#e4e7ec;--accent:#5865f2}
@media (prefers-color-scheme:dark){:root{--bg:#1e1f22;--card:#2b2d31;--fg:#f2f3f5;--muted:#a3a6aa;--line:#3f4147;--accent:#7983f5}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.6 system-ui,"Noto Sans Thai",sans-serif}
main{max-width:640px;margin:32px auto;padding:0 16px}h1{font-size:22px;margin:0 0 16px}h2{font-size:15px;color:var(--muted);margin:24px 0 8px;font-weight:600}
.card{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:4px 16px;margin-bottom:8px}
.row{display:flex;align-items:center;gap:12px;padding:12px 0;border-bottom:1px solid var(--line)}.row:last-child{border:0}
.row img{width:28px;height:28px}.grow{flex:1;min-width:0}.grow b{display:block}.grow span{color:var(--muted);font-size:13px;word-break:break-all}
a{color:var(--accent);text-decoration:none}a.btn{display:inline-block;padding:6px 12px;border:1px solid var(--line);border-radius:8px;font-size:13px;white-space:nowrap}
a.danger{color:#ed4245}code{background:var(--line);padding:1px 6px;border-radius:4px;font-size:13px}p.note{color:var(--muted);font-size:13px}`;

const html = (title, bodyHtml, status = 200) =>
  new Response(
    `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><style>${CSS}</style><main><h1>${esc(title)}</h1>${bodyHtml}</main>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  );

const redirectUri = (url) => `${url.origin}/oauth/callback`;

async function setupPage(url, env) {
  const T = tr(env);
  const key = encodeURIComponent(url.searchParams.get("key"));
  const accounts = await connectedProviders(env);
  const rows = await Promise.all(
    accounts.map(async (p) => {
      const a = await accountInfo(env, p);
      return `<div class="row"><img src="${esc(p.logo)}" alt=""><div class="grow"><b>${esc(a.label || p.name)}</b><span>${esc(a.email)}</span></div>
        <a class="btn" href="/oauth/start?key=${key}&p=${p.type}">${T("เชื่อมใหม่")}</a>
        <a class="btn danger" href="/setup/disconnect?key=${key}&p=${p.key}" onclick="return confirm('${esc(T("ยกเลิกการเชื่อม {email}?", { email: a.email }))}')">${T("ยกเลิก")}</a></div>`;
    })
  );
  const add = TYPES.map((t) =>
    t.configured(env)
      ? `<div class="row"><img src="${esc(t.logo)}" alt=""><div class="grow"><b>${t.name}</b></div><a class="btn" href="/oauth/start?key=${key}&p=${t.type}">${T("➕ เพิ่มบัญชี")}</a></div>`
      : `<div class="row"><img src="${esc(t.logo)}" alt=""><div class="grow"><b>${t.name}</b><span>${T("ยังไม่ได้ใส่ client ID/secret")}</span></div></div>`
  );
  return html(
    T("ตั้งค่า Mail Discord Bot"),
    `<h2>${T("บัญชีที่เชื่อมแล้ว ({count})", { count: accounts.length })}</h2><div class="card">${rows.join("") || `<div class="row">${T("ยังไม่มี")}</div>`}</div>
     <h2>${T("เพิ่มบัญชี")}</h2><div class="card">${add.join("")}</div>
     <p class="note">${T("จัดการบน Discord ได้เหมือนกัน:")} <code>/account add</code> <code>/account rename</code> <code>/account remove</code> <code>/account list</code> · ${T("แนะนำไม่เกิน 5 บัญชี (โควตาฟรี)")}</p>
     <h2>Discord</h2><div class="card">
       <div class="row"><div class="grow"><b>${T("ส่งข้อความทดสอบเข้าช่อง")}</b></div><a class="btn" href="/setup/test?key=${key}">${T("ทดสอบ")}</a></div>
       <div class="row"><div class="grow"><b>${T("ลงทะเบียนคำสั่ง + โลโก้")}</b><span>${T("กดใหม่ทุกครั้งที่อัปเดตบอท")}</span></div><a class="btn" href="/setup/commands?key=${key}">${T("ลงทะเบียน")}</a></div>
     </div>
     <p class="note">${T("Redirect URI สำหรับ Google และ Microsoft:")} <code>${esc(redirectUri(url))}</code></p>`
  );
}

async function oauthStart(url, env) {
  const type = url.searchParams.get("p") || "";
  if (!provider(type).configured(env)) return html(tr(env)("ยังตั้งค่าไม่ครบ"), `<p>${tr(env)("ยังไม่ได้ใส่ client ID/secret")}</p>`, 400);
  return Response.redirect(await oauthRedirect(env, type, url.origin), 302);
}

async function oauthCallback(url, env) {
  const T = tr(env);
  const state = url.searchParams.get("state");
  const type = state && (await env.KV.get(`oauth_state:${state}`));
  if (!type) return html(T("ลิงก์หมดอายุ"), T("<p>เริ่มใหม่จากหน้า /setup</p>"), 400);
  await env.KV.delete(`oauth_state:${state}`);
  const t = provider(type);
  if (url.searchParams.get("error"))
    return html(T("ยกเลิกการเชื่อมต่อ"), `<p>${esc(url.searchParams.get("error"))}: ${esc(url.searchParams.get("error_description"))}</p>`, 400);

  const res = await fetch(t.tokenUrl(env), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      ...t.clientParams(env),
      code: url.searchParams.get("code") || "",
      redirect_uri: redirectUri(url),
      grant_type: "authorization_code",
    }),
  });
  const data = await res.json();
  if (!res.ok) return html(T("เชื่อมต่อไม่สำเร็จ"), `<pre>${esc(JSON.stringify(data, null, 2))}</pre>`, 400);
  if (!data.refresh_token)
    return html(T("ไม่ได้ refresh token"), T("<p>ลองยกเลิกสิทธิ์ของแอปนี้ในบัญชี {name} แล้วเชื่อมใหม่อีกครั้ง</p>", { name: t.name }), 400);

  // ใช้ key ชั่วคราวเพื่อถามอีเมลก่อน แล้วค่อยเลือก key จริง (อีเมลซ้ำ = บัญชีเดิม)
  const tmp = provider(`${type}0`);
  await storeTokens(env, tmp, data);
  const email = await tmp.email(env);
  await clearTokens(env, tmp);

  const p = provider(await keyForEmail(env, type, email));
  await clearTokens(env, p);
  await storeTokens(env, p, data);
  await env.KV.put(K(p, "email"), email);
  await p.initPoll(env);
  await saveAccountKeys(env, [...(await accountKeys(env)), p.key]);
  return html(
    T("✅ เชื่อม {name} สำเร็จ", { name: p.name }),
    T("<p>บัญชี: <b>{email}</b></p><p>ต่อไปบอทจะแจ้งเตือนอีเมลใหม่เข้า Discord ภายในประมาณ 1 นาที</p><p>ปิดหน้านี้แล้วกลับไปที่ Discord ได้เลย · ตั้งชื่อบัญชีด้วย <code>/account rename</code></p>", { email: esc(email) })
  );
}

async function disconnect(url, env) {
  const p = provider(url.searchParams.get("p") || "");
  const email = await env.KV.get(K(p, "email"));
  await clearTokens(env, p);
  await env.KV.delete(K(p, "label"));
  await saveAccountKeys(env, (await accountKeys(env)).filter((k) => k !== p.key));
  const T = tr(env);
  return html(T("ยกเลิกการเชื่อม {account} แล้ว", { account: email || p.name }), T("<p>ถ้าต้องการยกเลิกสิทธิ์ฝั่ง {name} ด้วย ให้ไปลบที่หน้าตั้งค่าความปลอดภัยของบัญชี</p>", { name: p.name }));
}

async function registerCommands(env) {
  // ลงทะเบียนเฉพาะเซิร์ฟเวอร์ที่มีช่องแจ้งเตือน (ขึ้นทันที) แล้วล้างคำสั่ง global ไม่ให้ซ้ำ
  const app = env.DISCORD_APPLICATION_ID;
  const { guild_id } = await discord(env, `/channels/${env.DISCORD_CHANNEL_ID}`);
  const result = await discord(env, `/applications/${app}/guilds/${guild_id}/commands`, { method: "PUT", body: COMMANDS });
  await discord(env, `/applications/${app}/commands`, { method: "PUT", body: [] });
  let emojis;
  try {
    emojis = (await ensureEmojis(env)).join(", ");
  } catch (err) {
    emojis = tr(env)("สร้างโลโก้ไม่สำเร็จ: {error}", { error: esc(err.message) });
  }
  const T = tr(env);
  return html(T("✅ ลงทะเบียนคำสั่งแล้ว"), `<p>${result.map((c) => "/" + esc(c.name)).join(", ")}</p><p>${T("โลโก้: {emojis}", { emojis })}</p><p>${T("คำสั่งอาจใช้เวลาสักครู่กว่าจะขึ้นใน Discord")}</p>`);
}

async function testPost(env) {
  await discord(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, { method: "POST", body: { content: tr(env)("✅ บอทเชื่อมต่อช่องนี้ได้แล้ว") } });
  return html(tr(env)("✅ ส่งข้อความทดสอบแล้ว"), tr(env)("<p>เช็กในช่อง Discord ได้เลย</p>"));
}

function privacyPage() {
  return html(
    "Privacy Policy",
    `<p><b>Mail Discord Bot</b> is a personal tool used only by its owner. (ภาษาไทยด้านล่าง)</p>
     <ul>
       <li>It accesses the connected mailbox (Gmail API scope <code>gmail.modify</code> / Microsoft Graph <code>Mail.ReadWrite</code>, <code>Mail.Send</code>) only to show new-mail notifications, read, reply to, mark as read, move to trash, and send mail when the owner asks in their private Discord channel.</li>
       <li>Mail content is sent only to the owner's private Discord channel. It is not sold, shared with third parties, or used for advertising or AI training.</li>
       <li>OAuth tokens are stored in the owner's Cloudflare account and can be revoked at any time from the setup page or from the Google / Microsoft account security settings.</li>
       <li>Use of information received from Google APIs adheres to the Google API Services User Data Policy, including the Limited Use requirements.</li>
     </ul>
     <p><b>ภาษาไทย:</b> แอปนี้เป็นเครื่องมือส่วนตัวของเจ้าของ ใช้สิทธิ์เข้าถึงอีเมลเพื่อแจ้งเตือน อ่าน ตอบ ลบ และส่งอีเมลตามคำสั่งของเจ้าของในช่อง Discord ส่วนตัวเท่านั้น ไม่มีการขายหรือแชร์ข้อมูลให้บุคคลอื่น และยกเลิกสิทธิ์ได้ทุกเมื่อ</p>`
  );
}

// ดูว่า Gmail รายงานอะไรกลับมา (ไม่แก้ state)
async function debugPoll(env) {
  const { apiFetch } = await import("./tokens.js");
  const g = provider("g");
  const state = await env.KV.get(K(g, "poll"), "json");
  const api = (path) => apiFetch(env, g, new URL("https://gmail.googleapis.com/gmail/v1/users/me" + path));
  const [profile, hist, latest] = await Promise.all([
    api("/profile"),
    state ? api(`/history?startHistoryId=${state.historyId}&historyTypes=messageAdded`) : null,
    api("/messages?maxResults=3&labelIds=INBOX"),
  ]);
  const metas = await Promise.all((latest.messages || []).map((m) => api(`/messages/${m.id}?format=minimal`)));
  if (latest.messages?.[0]) {
    const full = await api(`/messages/${latest.messages[0].id}?format=full`);
    const parts = [];
    const walk = (p, d = 0) => {
      parts.push({ d, mime: p.mimeType, headers: (p.headers || []).filter((h) => /content-(type|transfer)/i.test(h.name)), sample: p.body?.data?.slice(0, 40) });
      (p.parts || []).forEach((c) => walk(c, d + 1));
    };
    walk(full.payload);
    globalThis.__dbgParts = parts;
  }
  return json({
    state,
    profileHistoryId: profile.historyId,
    historyRecords: (hist?.history || []).map((h) => (h.messagesAdded || []).map((a) => ({ id: a.message.id, labels: a.message.labelIds }))),
    parts: globalThis.__dbgParts,
    latestInbox: metas.map((m) => ({ id: m.id, historyId: m.historyId, labels: m.labelIds, at: new Date(Number(m.internalDate)).toISOString() })),
  });
}
