// ตัวช่วยเรื่อง encoding / MIME สำหรับอ่านและสร้างอีเมล

const enc = new TextEncoder();

export function bytesToBase64(bytes) {
  let bin = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    bin += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(bin);
}

export function base64UrlEncode(input) {
  const bytes = typeof input === "string" ? enc.encode(input) : input;
  return bytesToBase64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function base64UrlDecodeToBytes(data) {
  const b64 = data.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "===".slice((b64.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Gmail API มักแปลงเนื้อหาเป็น UTF-8 มาให้แล้ว แม้ header จะยังบอก charset เดิม (เช่น windows-874)
// จึงลอง UTF-8 แบบเข้มงวดก่อน ถ้าไม่ใช่ UTF-8 จริงค่อยใช้ charset ตาม header
export function decodeBytes(bytes, charset) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    try {
      return new TextDecoder(charset || "utf-8").decode(bytes);
    } catch {
      return new TextDecoder("utf-8").decode(bytes);
    }
  }
}

// RFC 2047 สำหรับ header ที่มีภาษาไทย
function encodeHeaderWord(value) {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${bytesToBase64(enc.encode(value))}?=`;
}

function stripCRLF(value) {
  return String(value ?? "").replace(/[\r\n]+/g, " ").trim();
}

export function header(headers, name) {
  const h = (headers || []).find((x) => x.name.toLowerCase() === name.toLowerCase());
  return h ? h.value : "";
}

export function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

function htmlToText(html) {
  return decodeHtmlEntities(
    html
      .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, "\n")
      .replace(/<li[^>]*>/gi, "• ")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function charsetOf(part) {
  const ct = header(part.headers, "Content-Type");
  const m = /charset="?([^";\s]+)"?/i.exec(ct);
  return m ? m[1] : "utf-8";
}

// ดึงเนื้อหาแบบข้อความล้วนจาก payload ของ Gmail API (format=full)
export function extractText(payload) {
  let plain = null;
  let html = null;
  const attachments = [];

  const walk = (part) => {
    if (!part) return;
    const mime = (part.mimeType || "").toLowerCase();
    if (part.filename) {
      attachments.push(part.filename);
    } else if (part.body?.data && mime === "text/plain" && plain === null) {
      plain = decodeBytes(base64UrlDecodeToBytes(part.body.data), charsetOf(part));
    } else if (part.body?.data && mime === "text/html" && html === null) {
      html = decodeBytes(base64UrlDecodeToBytes(part.body.data), charsetOf(part));
    }
    (part.parts || []).forEach(walk);
  };
  walk(payload);

  const text = plain !== null ? plain.replace(/\r\n/g, "\n").trim() : html !== null ? htmlToText(html) : "";
  return { text, attachments };
}

function wrap76(b64) {
  return b64.replace(/(.{76})/g, "$1\r\n");
}

// สร้างอีเมล text/plain แบบ UTF-8 แล้วคืนค่าเป็น raw (base64url) สำหรับ Gmail API
export function buildRawEmail({ from, to, subject, body, inReplyTo, references }) {
  const lines = [
    from ? `From: ${stripCRLF(from)}` : null,
    `To: ${stripCRLF(to)}`,
    `Subject: ${encodeHeaderWord(stripCRLF(subject))}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    inReplyTo ? `In-Reply-To: ${stripCRLF(inReplyTo)}` : null,
    references ? `References: ${stripCRLF(references)}` : null,
  ].filter(Boolean);
  const msg = lines.join("\r\n") + "\r\n\r\n" + wrap76(bytesToBase64(enc.encode(body))) + "\r\n";
  return base64UrlEncode(msg);
}

export function replySubject(subject) {
  const s = subject || "";
  return /^re:/i.test(s.trim()) ? s : `Re: ${s}`;
}
