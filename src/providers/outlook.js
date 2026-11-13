// Outlook / Microsoft 365 (Microsoft Graph + Microsoft identity platform)
import { apiFetch, K } from "../tokens.js";
import { base64UrlEncode } from "../mime.js";
import { tr } from "../i18n.js";

const API = "https://graph.microsoft.com/v1.0/me";
const SCOPES = "offline_access User.Read Mail.ReadWrite Mail.Send";
const STATE_REFRESH_MS = 6 * 60 * 60 * 1000;
const LIST_FIELDS = "id,subject,from,receivedDateTime,bodyPreview,webLink";
// ImmutableId: id ไม่เปลี่ยนแม้ย้ายโฟลเดอร์ (ลบ/กู้คืนแล้วปุ่มยังใช้ได้)
const PREFER = 'IdType="ImmutableId", outlook.body-content-type="text"';

const tenant = (env) => env.MS_TENANT || "common";

export function createOutlook(key = "o") {
const outlook = {
  key,
  type: "o",
  name: "Outlook",
  icon: "📨",
  logo: "https://www.google.com/s2/favicons?domain=outlook.live.com&sz=128",
  color: 0x0078d4,

  // ── OAuth ──
  configured: (env) => Boolean(env.MS_CLIENT_ID && env.MS_CLIENT_SECRET),
  tokenUrl: (env) => `https://login.microsoftonline.com/${tenant(env)}/oauth2/v2.0/token`,
  clientParams: (env) => ({ client_id: env.MS_CLIENT_ID, client_secret: env.MS_CLIENT_SECRET, scope: SCOPES }),
  authUrl(env, redirectUri, state) {
    const u = new URL(`https://login.microsoftonline.com/${tenant(env)}/oauth2/v2.0/authorize`);
    u.search = new URLSearchParams({
      client_id: env.MS_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      response_mode: "query",
      scope: SCOPES,
      prompt: "select_account",
      state,
    });
    return u.toString();
  },

  // ── id ของ Outlook ยาวเกิน custom_id ของ Discord (100 ตัวอักษร) จึงเก็บคู่ ref → id ไว้ใน KV ──
  async ref(env, id) {
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(id)));
    const ref = base64UrlEncode(hash).slice(0, 22);
    const key = K(outlook, `ref:${ref}`);
    if (!(await env.KV.get(key))) await env.KV.put(key, id, { expirationTtl: 90 * 24 * 3600 });
    return ref;
  },
  async resolve(env, ref) {
    const id = await env.KV.get(K(outlook, `ref:${ref}`));
    if (!id) throw Object.assign(new Error(tr(env)("ข้อความนี้เก่าเกินไปแล้ว (เกิน 90 วัน) — เปิดใน Outlook แทน")), { friendly: true });
    return id;
  },

  async email(env) {
    const me = await api(env, "", { query: { $select: "mail,userPrincipalName" } });
    return me.mail || me.userPrincipalName;
  },

  // ── แจ้งเตือนเมลใหม่: ดึงเมลใน Inbox ที่ receivedDateTime >= เวลาล่าสุดที่เคยเห็น ──
  async initPoll(env) {
    await saveState(env, isoNow(), []);
  },

  async poll(env, max) {
    const state = await env.KV.get(K(outlook, "poll"), "json");
    if (!state) return outlook.initPoll(env).then(() => ({ items: [], more: 0 }));

    const res = await api(env, "/mailFolders/inbox/messages", {
      query: {
        $filter: `receivedDateTime ge ${state.since}`,
        $orderby: "receivedDateTime asc",
        $top: "25",
        $select: LIST_FIELDS,
      },
    });

    const fresh = (res.value || []).filter((m) => !state.ids.includes(m.id));
    if (!fresh.length) {
      if (Date.now() - state.savedAt > STATE_REFRESH_MS) await saveState(env, state.since, state.ids);
      return { items: [], more: 0 };
    }

    // จำเวลาล่าสุด + id ที่เวลาเดียวกัน กันแจ้งซ้ำ
    const all = res.value;
    const since = all[all.length - 1].receivedDateTime;
    const ids = all.filter((m) => m.receivedDateTime === since).map((m) => m.id);
    await saveState(env, since, ids);

    const take = fresh.slice(0, max);
    const more = fresh.length - take.length + (res["@odata.nextLink"] ? 1 : 0);
    return { items: take.map(summary), more };
  },

  async listUnread(env, n) {
    const [list, folder] = await Promise.all([
      api(env, "/mailFolders/inbox/messages", { query: { $filter: "isRead eq false", $top: String(n), $select: LIST_FIELDS } }),
      api(env, "/mailFolders/inbox", { query: { $select: "unreadItemCount" } }),
    ]);
    return { items: (list.value || []).map(summary), total: folder.unreadItemCount };
  },

  // ── การกระทำกับเมล ──
  async getFull(env, id) {
    const m = await api(env, `/messages/${enc(id)}`, {
      query: { $select: "subject,from,toRecipients,body,hasAttachments,webLink" },
    });
    let attachments = [];
    if (m.hasAttachments) {
      const a = await api(env, `/messages/${enc(id)}/attachments`, { query: { $select: "name,isInline" } });
      attachments = (a.value || []).filter((x) => !x.isInline).map((x) => x.name);
    }
    return {
      subject: m.subject,
      from: addr(m.from),
      to: (m.toRecipients || []).map(addr).join(", "),
      text: (m.body?.content || "").replace(/\r\n/g, "\n").trim(),
      attachments,
      link: m.webLink,
    };
  },

  markRead: (env, id) => api(env, `/messages/${enc(id)}`, { method: "PATCH", body: { isRead: true } }),
  trash: (env, id) => api(env, `/messages/${enc(id)}/move`, { method: "POST", body: { destinationId: "deleteditems" } }),
  untrash: (env, id) => api(env, `/messages/${enc(id)}/move`, { method: "POST", body: { destinationId: "inbox" } }),

  async reply(env, id, body) {
    const m = await api(env, `/messages/${enc(id)}`, { query: { $select: "from,replyTo" } });
    await api(env, `/messages/${enc(id)}/reply`, { method: "POST", body: { comment: toHtml(body) } });
    return m.replyTo?.length ? m.replyTo.map(addr).join(", ") : addr(m.from);
  },

  async send(env, { to, subject, body }) {
    await api(env, "/sendMail", {
      method: "POST",
      body: {
        message: {
          subject,
          body: { contentType: "Text", content: body },
          toRecipients: to.map((address) => ({ emailAddress: { address } })),
        },
        saveToSentItems: true,
      },
    });
  },
};


function api(env, path, { query, ...opts } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  return apiFetch(env, outlook, url, { ...opts, headers: { Prefer: PREFER } });
}

const enc = encodeURIComponent;
const isoNow = () => new Date().toISOString().replace(/\.\d+Z$/, "Z");

async function saveState(env, since, ids) {
  await env.KV.put(K(outlook, "poll"), JSON.stringify({ since, ids, savedAt: Date.now() }));
}

function addr(r) {
  const e = r?.emailAddress;
  if (!e) return "";
  return e.name && e.name !== e.address ? `${e.name} <${e.address}>` : e.address;
}

function toHtml(text) {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br>");
}

function summary(m) {
  return {
    id: m.id,
    from: addr(m.from),
    subject: m.subject,
    date: m.receivedDateTime,
    snippet: m.bodyPreview,
    link: m.webLink,
  };
}

return outlook;
}

export default createOutlook("o");
