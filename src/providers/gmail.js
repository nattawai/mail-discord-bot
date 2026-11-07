// Gmail (Gmail API + Google OAuth)
import { apiFetch, K } from "../tokens.js";
import { buildRawEmail, decodeHtmlEntities, extractText, header, replySubject } from "../mime.js";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const STATE_REFRESH_MS = 6 * 60 * 60 * 1000;
const META_HEADERS = ["From", "To", "Subject", "Date", "Reply-To", "Message-ID", "References"];

export function createGmail(key = "g") {
const gmail = {
  key,
  type: "g",
  name: "Gmail",
  icon: "📧",
  logo: "https://www.google.com/s2/favicons?domain=mail.google.com&sz=128",
  color: 0xea4335,

  // ── OAuth ──
  configured: (env) => Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
  tokenUrl: () => "https://oauth2.googleapis.com/token",
  clientParams: (env) => ({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET }),
  authUrl(env, redirectUri, state) {
    const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    u.search = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: redirectUri,
      response_type: "code",
      scope: "https://www.googleapis.com/auth/gmail.modify",
      access_type: "offline",
      prompt: "consent",
      state,
    });
    return u.toString();
  },

  // ── Discord custom_id ใช้ id ตรง ๆ ได้ เพราะ Gmail id สั้น ──
  ref: async (_env, id) => id,
  resolve: async (_env, ref) => ref,

  async email(env) {
    return (await api(env, "/profile")).emailAddress;
  },

  // ── แจ้งเตือนเมลใหม่ ──
  async initPoll(env) {
    await saveState(env, (await api(env, "/profile")).historyId);
  },

  async poll(env, max) {
    const state = await env.KV.get(K(gmail, "poll"), "json");
    if (!state) return gmail.initPoll(env).then(() => ({ items: [], more: 0 }));

    let res;
    try {
      res = await api(env, "/history", { query: { startHistoryId: state.historyId, historyTypes: "messageAdded", labelId: "INBOX", maxResults: "100" } });
    } catch (err) {
      if (err.status === 404) return gmail.initPoll(env).then(() => ({ items: [], more: 0 })); // historyId หมดอายุ
      throw err;
    }

    const ids = [];
    for (const h of res.history || []) {
      for (const { message } of h.messagesAdded || []) {
        const labels = message.labelIds || [];
        if (!ids.includes(message.id) && labels.includes("INBOX") && !labels.includes("DRAFT") && !labels.includes("SPAM")) ids.push(message.id);
      }
    }

    const take = ids.slice(0, max);
    const items = [];
    for (const id of take) {
      try {
        items.push(summary(await getMeta(env, id)));
      } catch (err) {
        if (err.status !== 404) throw err; // ถูกลบไปก่อนแล้ว ข้ามได้
      }
    }

    // เขียน KV เฉพาะตอนจำเป็น (แพ็กเกจฟรีเขียนได้ 1,000 ครั้ง/วัน)
    if (res.historyId && (ids.length || Date.now() - state.savedAt > STATE_REFRESH_MS)) await saveState(env, res.historyId);
    return { items, more: ids.length - take.length };
  },

  async listUnread(env, n) {
    const list = await api(env, "/messages", { query: { q: "is:unread in:inbox", maxResults: String(n) } });
    const metas = await Promise.all((list.messages || []).map((m) => getMeta(env, m.id)));
    return { items: metas.map(summary), total: list.resultSizeEstimate ?? metas.length };
  },

  // ── การกระทำกับเมล ──
  async getFull(env, id) {
    const msg = await api(env, `/messages/${id}`, { query: { format: "full" } });
    const h = msg.payload?.headers;
    const { text, attachments } = extractText(msg.payload);
    return { subject: header(h, "Subject"), from: header(h, "From"), to: header(h, "To"), text, attachments, link: link(msg) };
  },

  markRead: (env, id) => api(env, `/messages/${id}/modify`, { method: "POST", body: { removeLabelIds: ["UNREAD"] } }),
  trash: (env, id) => api(env, `/messages/${id}/trash`, { method: "POST" }),
  untrash: (env, id) => api(env, `/messages/${id}/untrash`, { method: "POST" }),

  async reply(env, id, body) {
    const [orig, profile] = await Promise.all([getMeta(env, id), api(env, "/profile")]);
    const h = orig.payload?.headers;
    const to = header(h, "Reply-To") || header(h, "From");
    const messageId = header(h, "Message-ID");
    const raw = buildRawEmail({
      from: profile.emailAddress,
      to,
      subject: replySubject(header(h, "Subject")),
      body,
      inReplyTo: messageId,
      references: [header(h, "References"), messageId].filter(Boolean).join(" "),
    });
    await api(env, "/messages/send", { method: "POST", body: { raw, threadId: orig.threadId } });
    return to;
  },

  async send(env, { to, subject, body }) {
    const profile = await api(env, "/profile");
    await api(env, "/messages/send", { method: "POST", body: { raw: buildRawEmail({ from: profile.emailAddress, to: to.join(", "), subject, body }) } });
  },
};


function api(env, path, { query, ...opts } = {}) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(query || {})) url.searchParams.set(k, v);
  return apiFetch(env, gmail, url, opts);
}

function getMeta(env, id) {
  const url = new URL(`${API}/messages/${id}`);
  url.searchParams.set("format", "metadata");
  META_HEADERS.forEach((h) => url.searchParams.append("metadataHeaders", h));
  return apiFetch(env, gmail, url);
}

async function saveState(env, historyId) {
  await env.KV.put(K(gmail, "poll"), JSON.stringify({ historyId, savedAt: Date.now() }));
}

const link = (msg) => `https://mail.google.com/mail/u/0/#all/${msg.threadId || msg.id}`;

function summary(meta) {
  const h = meta.payload?.headers;
  return {
    id: meta.id,
    from: header(h, "From"),
    subject: header(h, "Subject"),
    date: header(h, "Date"),
    snippet: decodeHtmlEntities(meta.snippet),
    link: link(meta),
  };
}

return gmail;
}

export default createGmail("g");
