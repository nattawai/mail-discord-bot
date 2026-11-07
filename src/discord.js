// ตัวช่วยฝั่ง Discord: ตรวจลายเซ็น, เรียก REST API, สร้าง embed/ปุ่ม

import { TH } from "./i18n.js";

const API = "https://discord.com/api/v10";

export const InteractionType = { PING: 1, COMMAND: 2, COMPONENT: 3, AUTOCOMPLETE: 4, MODAL_SUBMIT: 5 };
export const ResponseType = {
  PONG: 1,
  MESSAGE: 4,
  DEFERRED_MESSAGE: 5,
  DEFERRED_UPDATE: 6,
  MODAL: 9,
};
export const EPHEMERAL = 64;

const COLOR = { unread: 0x5865f2, read: 0x99aab5, trashed: 0xed4245 };

function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}

let keyPromise = null;
async function publicKey(hex) {
  if (!keyPromise) {
    keyPromise = crypto.subtle
      .importKey("raw", hexToBytes(hex), { name: "Ed25519" }, false, ["verify"])
      .catch(() =>
        crypto.subtle.importKey("raw", hexToBytes(hex), { name: "NODE-ED25519", namedCurve: "NODE-ED25519" }, false, ["verify"])
      );
  }
  return keyPromise;
}

export async function verifyRequest(request, body, publicKeyHex) {
  const sig = request.headers.get("X-Signature-Ed25519");
  const ts = request.headers.get("X-Signature-Timestamp");
  if (!sig || !ts || !/^[0-9a-f]+$/i.test(sig)) return false;
  try {
    const key = await publicKey(publicKeyHex);
    const algo = key.algorithm.name === "Ed25519" ? { name: "Ed25519" } : { name: "NODE-ED25519" };
    return await crypto.subtle.verify(algo, key, hexToBytes(sig), new TextEncoder().encode(ts + body));
  } catch {
    return false;
  }
}

export async function discord(env, path, { method = "GET", body, form } = {}) {
  const headers = {};
  if (!path.startsWith("/webhooks/")) headers.Authorization = `Bot ${env.DISCORD_BOT_TOKEN}`;
  if (body) headers["Content-Type"] = "application/json";
  const res = await fetch(API + path, { method, headers, body: form || (body ? JSON.stringify(body) : undefined) });
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  return res.status === 204 ? {} : res.json();
}

// แก้ข้อความต้นทางของ interaction (ใช้หลังตอบแบบ deferred)
export function editOriginal(env, interaction, payload, files) {
  const path = `/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`;
  if (!files?.length) return discord(env, path, { method: "PATCH", body: payload });
  const form = new FormData();
  form.append("payload_json", JSON.stringify({ ...payload, attachments: files.map((f, i) => ({ id: i, filename: f.name })) }));
  files.forEach((f, i) => form.append(`files[${i}]`, new Blob([f.content], { type: "text/plain;charset=utf-8" }), f.name));
  return discord(env, path, { method: "PATCH", form });
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

export const ephemeral = (content) => json({ type: ResponseType.MESSAGE, data: { content, flags: EPHEMERAL } });

const truncate = (s, n) => (s.length > n ? s.slice(0, n - 1) + "…" : s);

// custom_id ของปุ่ม: "<action>:<provider>:<ref>" เช่น read:g:18c2f... / trash:o:AbC...
// หน้าตาแจ้งเตือน: หัวเรื่อง → โลโก้ : อีเมลที่รับ → ผู้ส่ง
// acct = { emoji, email, label } ของบัญชีที่รับเมล (ถ้าไม่ส่งมา จะแสดงแค่ผู้ส่ง)
export function mailEmbed(p, acct, mail, { state = "unread", note, T = TH } = {}) {
  const lines = [];
  if (acct) lines.push(`${acct.emoji || p.icon} : **${acct.email || "-"}**${acct.label ? `  ·  ${acct.label}` : ""}`);
  lines.push(T("**ผู้ส่ง:** {from}", { from: mail.from || "-" }));
  const embed = {
    color: state === "unread" ? p.color : COLOR[state],
    title: truncate(`${state === "trashed" ? "🗑️ " : ""}${mail.subject || T("(ไม่มีหัวเรื่อง)")}`, 256),
    description: truncate(lines.join("\n"), 4000),
  };
  const t = Date.parse(mail.date || "");
  if (!Number.isNaN(t)) embed.timestamp = new Date(t).toISOString();
  if (note) embed.footer = { text: note };
  return embed;
}

export function restyleEmbed(old, state, note) {
  const title = (old.title || "").replace(/^🗑️ /, "");
  return { ...old, title: state === "trashed" ? `🗑️ ${title}` : title, color: COLOR[state], footer: { text: note } };
}

const btn = (label, custom_id, style = 2, emoji) => ({ type: 2, style, label, custom_id, ...(emoji ? { emoji: { name: emoji } } : {}) });
export const linkButton = (p, url, T = TH) => ({ type: 2, style: 5, label: T("เปิดใน {name}", { name: p.name }), url });

export function mailButtons(p, ref, url, state = "unread", { withRead = true, T = TH } = {}) {
  const id = `${p.key}:${ref}`;
  const open = url ? [linkButton(p, url, T)] : [];
  if (state === "trashed") return [{ type: 1, components: [btn(T("กู้คืน"), `untrash:${id}`, 2, "↩️"), ...open] }];
  const row = [...(withRead ? [btn(T("อ่านเต็ม"), `read:${id}`, 1, "📖")] : []), btn(T("ตอบกลับ"), `reply:${id}`, 2, "↩️")];
  if (state === "unread") row.push(btn(T("อ่านแล้ว"), `seen:${id}`, 3, "✅"));
  row.push(btn(T("ลบ"), `trash:${id}`, 4, "🗑️"), ...open);
  return [{ type: 1, components: row }];
}

// ปุ่มในหน้า "อ่านเต็ม": ไม่ต้องมีปุ่มอ่านเต็มซ้ำ
export const readViewButtons = (p, ref, url, T = TH) => mailButtons(p, ref, url, "unread", { withRead: false, T });

// ดึงปุ่มลิงก์เดิมจากข้อความ (เก็บ URL ไว้ใช้ตอนแก้ข้อความ)
export const existingLink = (message) =>
  (message?.components || []).flatMap((r) => r.components || []).find((c) => c.type === 2 && c.style === 5)?.url;

const textInput = (custom_id, label, style, { required = true, max = 4000, placeholder } = {}) => ({
  type: 1,
  components: [{ type: 4, custom_id, label, style, required, max_length: max, ...(placeholder ? { placeholder } : {}) }],
});

export const replyModal = (p, ref, T = TH) => ({
  type: ResponseType.MODAL,
  data: { custom_id: `reply_modal:${p.key}:${ref}`, title: T("ตอบกลับอีเมล ({name})", { name: p.name }), components: [textInput("body", T("ข้อความ"), 2)] },
});

export const sendModal = (p, T = TH) => ({
  type: ResponseType.MODAL,
  data: {
    custom_id: `send_modal:${p.key}`,
    title: T("ส่งอีเมลใหม่ ({name})", { name: p.name }),
    components: [
      textInput("to", T("ถึง (คั่นหลายคนด้วย ,)"), 1, { max: 500, placeholder: "someone@example.com" }),
      textInput("subject", T("หัวเรื่อง"), 1, { max: 200 }),
      textInput("body", T("ข้อความ"), 2),
    ],
  },
});

export function modalValues(interaction) {
  const out = {};
  for (const row of interaction.data.components || []) for (const c of row.components || []) out[c.custom_id] = c.value;
  return out;
}

// อ่าน option ของคำสั่ง (รองรับ subcommand) → { sub, opts }
export function commandOptions(interaction) {
  let sub = null;
  let opts = interaction.data.options || [];
  while (opts[0] && (opts[0].type === 1 || opts[0].type === 2)) {
    sub = sub ? `${sub} ${opts[0].name}` : opts[0].name;
    opts = opts[0].options || [];
  }
  return { sub, opts };
}

export const optionValue = (interaction, name) => commandOptions(interaction).opts.find((o) => o.name === name)?.value;

// คำอธิบายคำสั่ง: ภาษาอังกฤษเป็นค่าเริ่มต้น + ภาษาไทย (Discord แสดงตามภาษาของแอปผู้ใช้เอง)
const d = (en, th) => ({ description: en, description_localizations: { th } });
const accountOpt = (en, th, required = false) => ({ type: 3, name: "account", ...d(en, th), required, autocomplete: true });

export const COMMANDS = [
  { name: "send", type: 1, ...d("Send a new email", "ส่งอีเมลใหม่"), options: [accountOpt("Send from which account (default: first)", "ส่งจากบัญชีไหน (ไม่เลือก = บัญชีแรก)")] },
  { name: "inbox", type: 1, ...d("Show unread email", "ดูอีเมลที่ยังไม่ได้อ่าน"), options: [accountOpt("Only this account (default: all)", "ดูเฉพาะบัญชีไหน (ไม่เลือก = ทุกบัญชี)")] },
  {
    name: "clear",
    type: 1,
    ...d("Clear the bot's messages in this channel", "เคลียร์ข้อความของบอทในช่องนี้"),
    options: [{ type: 5, name: "all", ...d("Also delete unread mail (default: keep unread)", "ลบทั้งหมด รวมเมลที่ยังไม่ได้อ่าน (ค่าเริ่มต้น: เก็บไว้)"), required: false }],
  },
  {
    name: "account",
    type: 1,
    ...d("Manage email accounts", "จัดการบัญชีอีเมล"),
    options: [
      { type: 1, name: "list", ...d("List connected accounts", "ดูบัญชีที่เชื่อมไว้") },
      {
        type: 1,
        name: "add",
        ...d("Connect an account (or reconnect one)", "เชื่อมบัญชีใหม่ (หรือเชื่อมบัญชีเดิมใหม่)"),
        options: [{ type: 3, name: "type", ...d("Account type", "ประเภทบัญชี"), required: true, choices: [{ name: "Gmail", value: "g" }, { name: "Outlook / Hotmail", value: "o" }] }],
      },
      {
        type: 1,
        name: "rename",
        ...d("Set an account nickname", "ตั้งชื่อเล่นให้บัญชี"),
        options: [
          accountOpt("Account to rename", "บัญชีที่จะตั้งชื่อ", true),
          { type: 3, name: "name", ...d("Nickname, e.g. Work (use - to clear)", "ชื่อเล่น เช่น งาน, ส่วนตัว (ใส่ - เพื่อลบชื่อ)"), required: true, max_length: 40 },
        ],
      },
      { type: 1, name: "remove", ...d("Disconnect an account", "ยกเลิกการเชื่อมบัญชี"), options: [accountOpt("Account to disconnect", "บัญชีที่จะยกเลิก", true)] },
    ],
  },
];
