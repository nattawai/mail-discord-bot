// ส่วนบอท Discord: interactions (ปุ่ม/คำสั่ง), การแจ้งเตือนเมลใหม่, จัดการบัญชี, เคลียร์ช่อง
import {
  EPHEMERAL,
  InteractionType,
  ResponseType,
  commandOptions,
  discord,
  editOriginal,
  ephemeral,
  existingLink,
  json,
  mailButtons,
  mailEmbed,
  modalValues,
  optionValue,
  readViewButtons,
  replyModal,
  restyleEmbed,
  sendModal,
  verifyRequest,
} from "./discord.js";
import { TYPES, accountKeys, connectedProviders, provider, saveAccountKeys } from "./providers/index.js";
import { K, clearTokens, isConnected } from "./tokens.js";

const CHUNK = 4000;
const autoClean = (env) => String(env.AUTO_CLEAN ?? "true").toLowerCase() !== "false";

// ───────────────────────── ข้อมูลบัญชี ─────────────────────────

export async function accountInfo(env, p) {
  const [email, label, emoji] = await Promise.all([env.KV.get(K(p, "email")), env.KV.get(K(p, "label")), getEmoji(env, p.type)]);
  return { email: email || p.key, label, emoji, display: label ? `${label} (${email})` : email || p.key };
}

// โลโก้ Gmail/Outlook เป็น application emoji ของบอท (ใช้ในข้อความได้ทุกที่ ไม่ต้องอยู่ในเซิร์ฟเวอร์)
async function getEmoji(env, type) {
  return (await env.KV.get(`emoji:${type}`)) || TYPES.find((t) => t.type === type)?.icon || "📧";
}

export async function ensureEmojis(env) {
  const app = env.DISCORD_APPLICATION_ID;
  const existing = (await discord(env, `/applications/${app}/emojis`)).items || [];
  const out = [];
  for (const t of TYPES) {
    const name = `mail_${t.type === "g" ? "gmail" : "outlook"}`;
    let e = existing.find((x) => x.name === name);
    if (!e) {
      const img = await fetch(t.logo);
      if (!img.ok) throw new Error(`โหลดโลโก้ ${t.name} ไม่ได้ (${img.status})`);
      const bytes = new Uint8Array(await img.arrayBuffer());
      let bin = "";
      bytes.forEach((b) => (bin += String.fromCharCode(b)));
      e = await discord(env, `/applications/${app}/emojis`, { method: "POST", body: { name, image: `data:image/png;base64,${btoa(bin)}` } });
    }
    await env.KV.put(`emoji:${t.type}`, `<:${e.name}:${e.id}>`);
    out.push(`${t.name}: ${e.name}`);
  }
  return out;
}

// ───────────────────────── OAuth link จาก Discord ─────────────────────────

export async function oauthRedirect(env, type, origin) {
  const t = provider(type);
  if (!t.configured(env)) throw new Error(`ยังไม่ได้ใส่ client ID/secret ของ ${t.name}`);
  const state = crypto.randomUUID();
  await env.KV.put(`oauth_state:${state}`, t.type, { expirationTtl: 600 });
  return t.authUrl(env, `${origin}/oauth/callback`, state);
}

// ───────────────────────── Interactions ─────────────────────────

export async function handleInteraction(request, env, ctx) {
  const body = await request.text();
  if (!(await verifyRequest(request, body, env.DISCORD_PUBLIC_KEY))) return new Response("Bad signature", { status: 401 });

  const it = JSON.parse(body);
  if (it.type === InteractionType.PING) return json({ type: ResponseType.PONG });

  const userId = it.member?.user?.id || it.user?.id;
  const allowed = (env.ALLOWED_USER_IDS || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(userId)) return ephemeral("⛔ คุณไม่มีสิทธิ์ใช้งานบอทนี้");

  const origin = new URL(request.url).origin;
  const webhook = `/webhooks/${it.application_id}/${it.token}`;
  const followup = (payload) => discord(env, webhook, { method: "POST", body: { flags: EPHEMERAL, ...payload } });

  // งานที่ใช้เวลานาน: ตอบ Discord ภายใน 3 วิแบบ deferred แล้วทำต่อเบื้องหลัง
  const later = (responseType, task) => {
    ctx.waitUntil(
      task().catch(async (err) => {
        console.error(err);
        const msg = { content: `❌ ${err.message}`.slice(0, 1900), flags: EPHEMERAL };
        if (responseType === ResponseType.DEFERRED_MESSAGE) await editOriginal(env, it, msg).catch(() => {});
        else await followup(msg).catch(() => {});
      })
    );
    return json(responseType === ResponseType.DEFERRED_MESSAGE ? { type: responseType, data: { flags: EPHEMERAL } } : { type: responseType });
  };

  if (it.type === InteractionType.AUTOCOMPLETE) {
    const typed = String(commandOptions(it).opts.find((o) => o.focused)?.value || "").toLowerCase();
    const choices = [];
    for (const p of await connectedProviders(env)) {
      const a = await accountInfo(env, p);
      if (!typed || `${a.display} ${p.name}`.toLowerCase().includes(typed))
        choices.push({ name: `${p.icon} ${p.name} · ${a.display}`.slice(0, 100), value: p.key });
    }
    return json({ type: 8, data: { choices: choices.slice(0, 25) } });
  }

  if (it.type === InteractionType.COMMAND) {
    const chosen = optionValue(it, "account");
    switch (it.data.name) {
      case "send": {
        const p = chosen ? provider(chosen) : (await connectedProviders(env))[0];
        if (!p || !(await isConnected(env, p))) return ephemeral("ยังไม่ได้เชื่อมบัญชีนี้ — ใช้ `/account add`");
        return json(sendModal(p));
      }
      case "inbox":
        return later(ResponseType.DEFERRED_MESSAGE, () => showInbox(env, it, chosen));
      case "clear":
        return later(ResponseType.DEFERRED_MESSAGE, () => clearChannel(env, it, Boolean(optionValue(it, "all"))));
      case "account":
        return accountCommand(env, it, origin, later);
    }
    return ephemeral("ไม่รู้จักคำสั่งนี้");
  }

  if (it.type === InteractionType.COMPONENT) {
    const [action, pk, ref] = it.data.custom_id.split(":");

    if (action === "acctdel") {
      return later(ResponseType.DEFERRED_UPDATE, async () => {
        const p = provider(pk);
        const a = await accountInfo(env, p);
        await removeAccount(env, p);
        await editOriginal(env, it, { content: `✅ ยกเลิกการเชื่อม **${a.display}** แล้ว`, embeds: [], components: [] });
      });
    }
    if (action === "cancel") return json({ type: 7, data: { content: "ยกเลิกแล้ว", embeds: [], components: [] } });

    const p = provider(pk);
    const who = it.member?.user?.username || it.user?.username || "";
    const isChannelMsg = it.message && !(it.message.flags & EPHEMERAL);

    // เปลี่ยนสถานะเมล แล้วแก้ข้อความเดิม (หรือลบออกจากช่องถ้าเปิด AUTO_CLEAN)
    const onMail = (state, note, fn, { cleanup } = {}) =>
      later(ResponseType.DEFERRED_UPDATE, async () => {
        await fn(await p.resolve(env, ref));
        const old = it.message?.embeds?.[0] || {};
        if (cleanup && isChannelMsg && autoClean(env)) {
          await discord(env, `/channels/${it.channel_id}/messages/${it.message.id}`, { method: "DELETE" });
          if (state === "trashed")
            await followup({ content: `🗑️ ลบ **${old.title || "อีเมล"}** แล้ว`, components: mailButtons(p, ref, existingLink(it.message), "trashed") });
          return;
        }
        await editOriginal(env, it, { embeds: [restyleEmbed(old, state, note)], components: mailButtons(p, ref, existingLink(it.message), state) });
      });

    switch (action) {
      case "read":
        return later(ResponseType.DEFERRED_MESSAGE, () => readFull(env, it, p, ref, followup));
      case "reply":
        return json(replyModal(p, ref));
      case "seen":
        return onMail("read", `✅ อ่านแล้ว โดย ${who}`, (id) => p.markRead(env, id), { cleanup: true });
      case "trash":
        return onMail("trashed", `🗑️ ย้ายไปถังขยะแล้ว โดย ${who}`, (id) => p.trash(env, id), { cleanup: true });
      case "untrash":
        return onMail("read", `↩️ กู้คืนแล้ว โดย ${who}`, (id) => p.untrash(env, id));
    }
    return ephemeral("ไม่รู้จักปุ่มนี้");
  }

  if (it.type === InteractionType.MODAL_SUBMIT) {
    const [kind, pk, ref] = it.data.custom_id.split(":");
    const p = provider(pk);
    const v = modalValues(it);
    if (kind === "reply_modal")
      return later(ResponseType.DEFERRED_MESSAGE, async () => {
        const to = await p.reply(env, await p.resolve(env, ref), v.body);
        await editOriginal(env, it, { content: `✅ ตอบกลับไปที่ **${to}** แล้ว` });
      });
    if (kind === "send_modal") return later(ResponseType.DEFERRED_MESSAGE, () => sendNew(env, it, p, v));
  }

  return ephemeral("ไม่รู้จักคำขอนี้");
}

// ───────────────────────── อ่านเต็ม (ไม่ตัดข้อความ) ─────────────────────────

export function chunkText(text, size) {
  const out = [];
  let rest = text;
  while (rest.length > size) {
    let cut = rest.lastIndexOf("\n", size);
    if (cut < size * 0.5) cut = size; // ไม่มีขึ้นบรรทัดใหม่ใกล้ ๆ ก็ตัดตรงขนาดเลย
    out.push(rest.slice(0, cut));
    rest = rest.slice(cut).replace(/^\n/, "");
  }
  if (rest) out.push(rest);
  return out;
}

async function readFull(env, it, p, ref, followup) {
  const [mail, a] = await Promise.all([p.resolve(env, ref).then((id) => p.getFull(env, id)), accountInfo(env, p)]);
  const chunks = chunkText(mail.text || "(ไม่มีเนื้อหาแบบข้อความ)", CHUNK);
  const head = [`${a.emoji} : **${a.email}**${a.label ? `  ·  ${a.label}` : ""}`, `**ผู้ส่ง:** ${mail.from || "-"}`, `**ถึง:** ${mail.to || "-"}`];
  if (mail.attachments.length) head.push(`**ไฟล์แนบ:** ${mail.attachments.join(", ")} (เปิดใน ${p.name})`);
  const header = { color: p.color, title: (mail.subject || "(ไม่มีหัวเรื่อง)").slice(0, 256), description: head.join("\n").slice(0, 1500) };

  // ข้อความแรก: หัวเมล + เนื้อหาส่วนแรก (รวมไม่เกิน 6,000 ตัวอักษรต่อข้อความ)
  const MAX_MSGS = 8;
  const shown = chunks.slice(0, MAX_MSGS);
  const files = chunks.length > MAX_MSGS ? [{ name: "email.txt", content: mail.text }] : [];
  await editOriginal(env, it, { embeds: [header, { color: p.color, description: shown[0] }], components: readViewButtons(p, ref, mail.link) }, files);
  for (const [i, c] of shown.slice(1).entries()) {
    await followup({ embeds: [{ color: p.color, description: c, footer: { text: `ส่วนที่ ${i + 2}/${chunks.length}` } }] });
  }
  if (files.length) await followup({ content: `เนื้อหายาว ${chunks.length} ส่วน — ส่วนที่เหลืออยู่ในไฟล์ email.txt ด้านบน` });
}

async function sendNew(env, it, p, { to, subject, body }) {
  const list = to.split(",").map((s) => s.trim()).filter(Boolean);
  if (!list.length || list.some((x) => !/^[^\s@<>,]+@[^\s@<>,]+\.[^\s@<>,]+$/.test(x))) {
    await editOriginal(env, it, { content: `❌ อีเมลผู้รับไม่ถูกต้อง: ${to}` });
    return;
  }
  await p.send(env, { to: list, subject, body });
  const a = await accountInfo(env, p);
  await editOriginal(env, it, { content: `✅ ส่งอีเมล "${subject}" ไปที่ **${list.join(", ")}** แล้ว (จาก ${a.display})` });
}

async function showInbox(env, it, chosen) {
  const providers = (chosen ? [provider(chosen)] : await connectedProviders(env)).slice(0, 5);
  if (!providers.length) {
    await editOriginal(env, it, { content: "ยังไม่ได้เชื่อมบัญชีอีเมลใด ๆ — ใช้ `/account add`" });
    return;
  }
  const perProvider = Math.min(5, Math.floor(10 / providers.length));
  const results = await Promise.all(providers.map((p) => p.listUnread(env, perProvider)));

  const embeds = [];
  const components = [];
  const lines = [];
  for (const [i, p] of providers.entries()) {
    const { items, total } = results[i];
    const a = await accountInfo(env, p);
    lines.push(`${a.emoji} **${a.display}** — ยังไม่ได้อ่าน ${total} ฉบับ`);
    const buttons = [];
    for (const [n, mail] of items.entries()) {
      const ref = await p.ref(env, mail.id);
      const e = mailEmbed(p, null, mail);
      e.title = `${n + 1}. ${e.title}`.slice(0, 256);
      embeds.push(e);
      buttons.push({ type: 2, style: 1, label: `📖 ${(a.label || a.email.split("@")[0]).slice(0, 20)} ${n + 1}`, custom_id: `read:${p.key}:${ref}` });
    }
    if (buttons.length) components.push({ type: 1, components: buttons });
  }
  await editOriginal(env, it, { content: lines.join("\n") + (embeds.length ? "" : "\n📭 ไม่มีอีเมลค้าง"), embeds, components });
}

// ───────────────────────── /account ─────────────────────────

async function removeAccount(env, p) {
  await clearTokens(env, p);
  await env.KV.delete(K(p, "label"));
  await saveAccountKeys(env, (await accountKeys(env)).filter((k) => k !== p.key));
}

async function accountCommand(env, it, origin, later) {
  const { sub } = commandOptions(it);
  const val = (name) => optionValue(it, name);

  if (sub === "list") {
    const accounts = await connectedProviders(env);
    if (!accounts.length) return ephemeral("ยังไม่มีบัญชีที่เชื่อมไว้ — ใช้ `/account add`");
    const rows = await Promise.all(
      accounts.map(async (p) => {
        const a = await accountInfo(env, p);
        return `${a.emoji} **${a.label || "(ยังไม่ตั้งชื่อ)"}** — ${a.email}`;
      })
    );
    return ephemeral(`**บัญชีที่เชื่อมไว้ (${accounts.length})**\n${rows.join("\n")}\n\nตั้งชื่อ: \`/account rename\` · เพิ่ม: \`/account add\` · ยกเลิก: \`/account remove\``);
  }

  if (sub === "add") {
    const type = val("type");
    const t = provider(type);
    if (!t.configured(env)) return ephemeral(`ยังไม่ได้ใส่ client ID/secret ของ ${t.name} ใน Worker`);
    const token = crypto.randomUUID();
    await env.KV.put(`oauth_link:${token}`, type, { expirationTtl: 600 });
    return json({
      type: ResponseType.MESSAGE,
      data: {
        flags: EPHEMERAL,
        content: `กดปุ่มด้านล่างเพื่อเชื่อมบัญชี ${t.name} (ลิงก์ใช้ได้ครั้งเดียวภายใน 10 นาที)\nถ้าเลือกบัญชีที่เชื่อมไว้แล้ว จะเป็นการเชื่อมใหม่ให้บัญชีเดิม`,
        components: [{ type: 1, components: [{ type: 2, style: 5, label: `เชื่อม ${t.name}`, url: `${origin}/oauth/link?t=${token}` }] }],
      },
    });
  }

  if (sub === "rename") {
    const p = provider(val("account"));
    if (!(await isConnected(env, p))) return ephemeral("ไม่พบบัญชีนี้");
    const name = String(val("name") || "").trim();
    if (!name || name === "-") await env.KV.delete(K(p, "label"));
    else await env.KV.put(K(p, "label"), name.slice(0, 40));
    const a = await accountInfo(env, p);
    return ephemeral(name && name !== "-" ? `✅ ตั้งชื่อ **${a.email}** เป็น **${a.label}** แล้ว` : `✅ ลบชื่อเล่นของ ${a.email} แล้ว`);
  }

  if (sub === "remove") {
    const p = provider(val("account"));
    if (!(await isConnected(env, p))) return ephemeral("ไม่พบบัญชีนี้");
    const a = await accountInfo(env, p);
    return json({
      type: ResponseType.MESSAGE,
      data: {
        flags: EPHEMERAL,
        content: `ยืนยันยกเลิกการเชื่อม **${a.display}**? บอทจะหยุดแจ้งเตือนบัญชีนี้`,
        components: [
          {
            type: 1,
            components: [
              { type: 2, style: 4, label: "ยกเลิกการเชื่อม", custom_id: `acctdel:${p.key}` },
              { type: 2, style: 2, label: "ไม่ใช่", custom_id: "cancel:x" },
            ],
          },
        ],
      },
    });
  }
  return ephemeral("ไม่รู้จักคำสั่งย่อยนี้");
}

// ───────────────────────── /clear ─────────────────────────

async function clearChannel(env, it, all) {
  const channel = it.channel_id;
  const me = await discord(env, "/users/@me");
  const twoWeeks = Date.now() - 13.5 * 24 * 3600 * 1000;
  const targets = [];
  let before = "";
  for (let page = 0; page < 3; page++) {
    const msgs = await discord(env, `/channels/${channel}/messages?limit=100${before ? `&before=${before}` : ""}`);
    if (!msgs.length) break;
    for (const m of msgs) {
      if (m.author?.id !== me.id) continue;
      const unread = (m.components || []).some((r) => (r.components || []).some((c) => c.custom_id?.startsWith("seen:")));
      if (!all && unread) continue;
      targets.push(m);
    }
    before = msgs[msgs.length - 1].id;
    if (msgs.length < 100) break;
  }

  let deleted = 0;
  const recent = targets.filter((m) => Date.parse(m.timestamp) > twoWeeks).map((m) => m.id);
  let bulkOk = true;
  for (let i = 0; i < recent.length && bulkOk; i += 100) {
    const ids = recent.slice(i, i + 100);
    try {
      if (ids.length === 1) await discord(env, `/channels/${channel}/messages/${ids[0]}`, { method: "DELETE" });
      else await discord(env, `/channels/${channel}/messages/bulk-delete`, { method: "POST", body: { messages: ids } });
      deleted += ids.length;
    } catch {
      bulkOk = false; // บอทไม่มีสิทธิ์ Manage Messages → ลบทีละข้อความแทน
    }
  }
  const singles = [...(bulkOk ? [] : recent.slice(deleted)), ...targets.filter((m) => Date.parse(m.timestamp) <= twoWeeks).map((m) => m.id)];
  let left = 0;
  for (const [i, id] of singles.entries()) {
    if (i >= 35) {
      left = singles.length - i;
      break;
    }
    await discord(env, `/channels/${channel}/messages/${id}`, { method: "DELETE" }).then(() => deleted++).catch(() => {});
  }
  const kept = all ? "" : " (เก็บเมลที่ยังไม่ได้อ่านไว้ ใช้ `/clear all:True` ถ้าจะลบทั้งหมด)";
  const more = left ? `\nยังเหลืออีก ${left} ข้อความ สั่ง \`/clear\` อีกครั้งได้ (ให้สิทธิ์ Manage Messages กับบอทจะลบได้เร็วขึ้น)` : "";
  await editOriginal(env, it, { content: `🧹 ลบข้อความแล้ว ${deleted} ข้อความ${kept}${more}` });
}

// ───────────────────────── แจ้งเตือนเมลใหม่ (cron ทุก 1 นาที) ─────────────────────────

// ใครจะถูก tag: MENTION_USER_IDS (ค่าเริ่มต้น = ALLOWED_USER_IDS), MENTION_ROLE_ID, หรือ MENTION_USER_IDS = "none" เพื่อปิด
export function mentionOf(env) {
  const raw = env.MENTION_USER_IDS || env.ALLOWED_USER_IDS || "";
  const isId = (s) => /^[0-9]+$/.test(s);
  const users = raw.trim().toLowerCase() === "none" ? [] : raw.split(",").map((s) => s.trim()).filter(isId);
  const roles = (env.MENTION_ROLE_ID || "").split(",").map((s) => s.trim()).filter(isId);
  const text = [...users.map((u) => `<@${u}>`), ...roles.map((r) => `<@&${r}>`)].join(" ");
  return { text: text ? text + " " : "", allowed: { parse: [], users, roles } };
}

export async function pollAll(env) {
  const accounts = await connectedProviders(env);
  const max = Math.max(2, Math.floor(20 / Math.max(1, accounts.length)));
  for (const p of accounts) {
    try {
      await pollProvider(env, p, max);
    } catch (err) {
      console.error(`poll ${p.key} failed:`, err); // บัญชีหนึ่งพัง บัญชีอื่นยังทำงานต่อ
    }
  }
}

async function pollProvider(env, p, max) {
  const { items, more } = await p.poll(env, max);
  if (!items.length && !more) return;
  const a = await accountInfo(env, p);
  const mention = mentionOf(env);
  for (const mail of items) {
    const ref = await p.ref(env, mail.id);
    await discord(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      body: {
        // ข้อความนอก embed ใช้เป็นตัวอย่างใน push บนมือถือ
        content: `${mention.text}📬 ${(a.label || a.email)}: ${mail.subject || "(ไม่มีหัวเรื่อง)"}`.slice(0, 300),
        embeds: [mailEmbed(p, a, mail)],
        components: mailButtons(p, ref, mail.link),
        allowed_mentions: mention.allowed,
      },
    });
  }
  if (more > 0) {
    await discord(env, `/channels/${env.DISCORD_CHANNEL_ID}/messages`, {
      method: "POST",
      body: { content: `…และยังมีอีเมลใหม่ใน ${a.display} อีก${more > 1 ? ` ${more}` : ""} ฉบับ ใช้ \`/inbox\` เพื่อดู` },
    });
  }
}
