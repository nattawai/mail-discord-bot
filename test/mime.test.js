import test from "node:test";
import assert from "node:assert/strict";
import { buildRawEmail, base64UrlDecodeToBytes, base64UrlEncode, extractText, replySubject } from "../src/mime.js";

const dec = (raw) => new TextDecoder().decode(base64UrlDecodeToBytes(raw));

test("buildRawEmail encodes Thai subject/body and strips header injection", () => {
  const raw = buildRawEmail({ from: "me@x.com", to: "a@b.com\r\nBcc: evil@x.com", subject: "สวัสดี", body: "ทดสอบ 123", inReplyTo: "<id@x>" });
  const msg = dec(raw);
  assert.match(msg, /Subject: =\?UTF-8\?B\?/);
  assert.doesNotMatch(msg, /\r\nBcc:/);
  assert.match(msg, /In-Reply-To: <id@x>/);
  const body = msg.split("\r\n\r\n")[1].replace(/\r\n/g, "");
  assert.equal(Buffer.from(body, "base64").toString("utf8"), "ทดสอบ 123");
});

test("extractText prefers text/plain, falls back to html", () => {
  const p = { mimeType: "multipart/alternative", parts: [
    { mimeType: "text/html", headers: [], body: { data: base64UrlEncode("<p>สวัสดี</p><br>bye &amp; ok") } },
    { mimeType: "text/plain", headers: [{ name: "Content-Type", value: "text/plain; charset=UTF-8" }], body: { data: base64UrlEncode("สวัสดีครับ\r\nline2") } },
    { mimeType: "application/pdf", filename: "a.pdf", body: { attachmentId: "x" } },
  ]};
  const r = extractText(p);
  assert.equal(r.text, "สวัสดีครับ\nline2");
  assert.deepEqual(r.attachments, ["a.pdf"]);
  assert.equal(extractText({ mimeType: "text/html", headers: [], body: { data: base64UrlEncode("<p>สวัสดี</p><br>bye &amp; ok") } }).text, "สวัสดี\n\nbye & ok");
});

test("replySubject", () => {
  assert.equal(replySubject("Hello"), "Re: Hello");
  assert.equal(replySubject("RE: Hello"), "RE: Hello");
});

test("decodes UTF-8 body even when header says windows-874 (Gmail transcodes)", async () => {
  const { decodeBytes } = await import("../src/mime.js");
  const utf8 = new TextEncoder().encode("ทดสอบการส่งเมล");
  assert.equal(decodeBytes(utf8, "windows-874"), "ทดสอบการส่งเมล");
  const tis = Uint8Array.from([0xb7, 0xb4, 0xca, 0xcd, 0xba]); // "ทดสอบ" in windows-874
  assert.equal(decodeBytes(tis, "windows-874"), "ทดสอบ");
});
