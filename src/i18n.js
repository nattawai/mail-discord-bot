// ข้อความ 2 ภาษา: ในโค้ดใช้ภาษาไทยเป็นต้นฉบับ แล้วแปลเป็นอังกฤษเมื่อ LANGUAGE = "en"
// ตัวแปรในข้อความเขียนเป็น {name} แล้วส่งค่าผ่าน T("…{name}…", { name })

export const EN = {
  "เซิร์ฟเวอร์อีเมล": "the mail server",
  "ทำรายการไม่สำเร็จ": "That didn't work",
  "สาเหตุ:": "Why:",
  "วิธีแก้:": "Fix:",
  "บอทไม่มีสิทธิ์ทำสิ่งนี้ในช่องนี้": "The bot doesn't have permission to do this in this channel.",
  "ให้สิทธิ์ View Channel, Send Messages และ Manage Messages กับบอทในช่องนี้": "Give the bot View Channel, Send Messages and Manage Messages in this channel.",
  "ข้อความใน Discord ถูกลบไปแล้ว": "The Discord message was already deleted.",
  "ไม่ต้องทำอะไร": "Nothing to do.",
  "Discord จำกัดความถี่ เพราะส่งคำขอถี่เกินไป": "Discord is rate limiting the bot because of too many requests.",
  "รอสักครู่แล้วลองใหม่": "Wait a moment and try again.",
  "เซิร์ฟเวอร์ Discord ขัดข้องชั่วคราว": "Discord is having a temporary problem.",
  "ลองใหม่อีกครั้งในอีกสักครู่": "Try again in a moment.",
  "สิทธิ์เข้าบัญชี {name} หมดอายุหรือถูกยกเลิก (เช่น เปลี่ยนรหัสผ่าน หรือไม่ได้ใช้นาน)": "Access to the {name} account expired or was revoked (for example after a password change or a long time unused).",
  "สั่ง /account add เพื่อเชื่อมบัญชีนี้ใหม่ บัญชีเดิมและชื่อเล่นจะยังอยู่": "Run /account add to reconnect it. The account keeps its nickname.",
  "{name} ไม่อนุญาตให้บอททำสิ่งนี้ (สิทธิ์ไม่ครบ)": "{name} doesn't allow the bot to do this (missing permission).",
  "สั่ง /account add แล้วติ๊กอนุญาตให้ครบทุกข้อตอนเชื่อม": "Run /account add and allow every permission when connecting.",
  "ไม่พบอีเมลนี้แล้ว อาจถูกลบหรือย้ายจากแอปอีเมลไปก่อน": "This email no longer exists. It was probably deleted or moved in your mail app.",
  "กด ✅ เพื่อปิดแจ้งเตือนนี้ หรือสั่ง /clear": "Press ✅ to dismiss this notification, or run /clear.",
  "{name} จำกัดความถี่ เพราะเรียกใช้บ่อยเกินไป": "{name} is rate limiting the bot because of too many requests.",
  "รอประมาณ 1 นาทีแล้วลองใหม่": "Wait about a minute and try again.",
  "เซิร์ฟเวอร์ {name} ขัดข้องชั่วคราว ({status}) ไม่ใช่ปัญหาของบอท": "{name} is having a temporary server problem ({status}). It isn't a bot problem.",
  "ลองกดใหม่อีกครั้งในอีกสักครู่": "Press the button again in a moment.",
  "ติดต่อ {name} ไม่ได้ (เครือข่ายขัดข้อง)": "Couldn't reach {name} (network problem).",
  "ไม่ทราบสาเหตุแน่ชัด": "Unknown cause.",
  "ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้ดู log ด้วย npx wrangler tail": "Try again. If it keeps failing, check the log with npx wrangler tail.",
  "ยังไม่ได้เชื่อม {name} — สั่ง /account add เพื่อเชื่อมบัญชี": "{name} isn't connected. Run /account add to connect it.",
  // แจ้งเตือน / embed
  "**ผู้ส่ง:** {from}": "**From:** {from}",
  "**ถึง:** {to}": "**To:** {to}",
  "**ไฟล์แนบ:** {files} (เปิดใน {name})": "**Attachments:** {files} (open in {name})",
  "(ไม่มีหัวเรื่อง)": "(no subject)",
  "(ไม่มีเนื้อหาแบบข้อความ)": "(no plain-text content)",
  "ส่วนที่ {n}/{total}": "Part {n}/{total}",
  "เนื้อหายาว {total} ส่วน — ส่วนที่เหลืออยู่ในไฟล์ email.txt ด้านบน": "This mail has {total} parts — the rest is in email.txt above",
  "…และยังมีอีเมลใหม่ใน {account} อีก{count} ฉบับ ใช้ `/inbox` เพื่อดู": "…and{count} more new mail in {account}. Use `/inbox` to see them",
  // ปุ่ม
  "เปิดใน {name}": "Open in {name}",
  "อ่านเต็ม": "Read",
  "ตอบกลับ": "Reply",
  "อ่านแล้ว": "Mark read",
  "ลบ": "Delete",
  "กู้คืน": "Restore",
  "ยกเลิกการเชื่อม": "Disconnect",
  "ไม่ใช่": "Cancel",
  "เชื่อม {name}": "Connect {name}",
  // modal
  "ตอบกลับอีเมล ({name})": "Reply ({name})",
  "ส่งอีเมลใหม่ ({name})": "New email ({name})",
  "ข้อความ": "Message",
  "ถึง (คั่นหลายคนด้วย ,)": "To (separate with ,)",
  "หัวเรื่อง": "Subject",
  // สถานะ
  "✅ อ่านแล้ว โดย {who}": "✅ Marked read by {who}",
  "🗑️ ย้ายไปถังขยะแล้ว โดย {who}": "🗑️ Moved to trash by {who}",
  "↩️ กู้คืนแล้ว โดย {who}": "↩️ Restored by {who}",
  "🗑️ ลบ **{subject}** แล้ว": "🗑️ Deleted **{subject}**",
  "อีเมล": "email",
  // ตอบกลับคำสั่ง
  "⛔ คุณไม่มีสิทธิ์ใช้งานบอทนี้": "⛔ You are not allowed to use this bot",
  "ยังไม่ได้เชื่อมบัญชีนี้ — ใช้ `/account add`": "This account is not connected — use `/account add`",
  "ยังไม่ได้เชื่อมบัญชีอีเมลใด ๆ — ใช้ `/account add`": "No email account connected yet — use `/account add`",
  "ไม่รู้จักคำสั่งนี้": "Unknown command",
  "ไม่รู้จักปุ่มนี้": "Unknown button",
  "ไม่รู้จักคำขอนี้": "Unknown request",
  "ไม่รู้จักคำสั่งย่อยนี้": "Unknown subcommand",
  "ยกเลิกแล้ว": "Cancelled",
  "✅ ยกเลิกการเชื่อม **{account}** แล้ว": "✅ Disconnected **{account}**",
  "✅ ตอบกลับไปที่ **{to}** แล้ว": "✅ Replied to **{to}**",
  "❌ อีเมลผู้รับไม่ถูกต้อง: {to}": "❌ Invalid recipient: {to}",
  '✅ ส่งอีเมล "{subject}" ไปที่ **{to}** แล้ว (จาก {account})': '✅ Sent "{subject}" to **{to}** (from {account})',
  "{emoji} **{account}** — ยังไม่ได้อ่าน {total} ฉบับ": "{emoji} **{account}** — {total} unread",
  "📭 ไม่มีอีเมลค้าง": "📭 No unread mail",
  "📖 {name} {n}": "📖 {name} {n}",
  // /account
  "ยังไม่มีบัญชีที่เชื่อมไว้ — ใช้ `/account add`": "No accounts connected yet — use `/account add`",
  "(ยังไม่ตั้งชื่อ)": "(no nickname)",
  "**บัญชีที่เชื่อมไว้ ({count})**": "**Connected accounts ({count})**",
  "ตั้งชื่อ: `/account rename` · เพิ่ม: `/account add` · ยกเลิก: `/account remove`": "Rename: `/account rename` · Add: `/account add` · Remove: `/account remove`",
  "ยังไม่ได้ใส่ client ID/secret ของ {name} ใน Worker": "The {name} client ID/secret is not set in the Worker",
  "กดปุ่มด้านล่างเพื่อเชื่อมบัญชี {name} (ลิงก์ใช้ได้ครั้งเดียวภายใน 10 นาที)\nถ้าเลือกบัญชีที่เชื่อมไว้แล้ว จะเป็นการเชื่อมใหม่ให้บัญชีเดิม":
    "Press the button to connect a {name} account (one-time link, valid for 10 minutes).\nPicking an account that is already connected reconnects it.",
  "ไม่พบบัญชีนี้": "Account not found",
  "✅ ตั้งชื่อ **{email}** เป็น **{label}** แล้ว": "✅ Renamed **{email}** to **{label}**",
  "✅ ลบชื่อเล่นของ {email} แล้ว": "✅ Removed the nickname of {email}",
  "ยืนยันยกเลิกการเชื่อม **{account}**? บอทจะหยุดแจ้งเตือนบัญชีนี้": "Disconnect **{account}**? The bot will stop notifying for this account.",
  // /clear
  "🧹 ลบข้อความแล้ว {count} ข้อความ": "🧹 Deleted {count} messages",
  " (เก็บเมลที่ยังไม่ได้อ่านไว้ ใช้ `/clear all:True` ถ้าจะลบทั้งหมด)": " (unread mail kept — use `/clear all:True` to delete everything)",
  "\nยังเหลืออีก {count} ข้อความ สั่ง `/clear` อีกครั้งได้ (ให้สิทธิ์ Manage Messages กับบอทจะลบได้เร็วขึ้น)":
    "\n{count} messages left — run `/clear` again (give the bot Manage Messages to delete faster)",
  // errors
  "ข้อความนี้เก่าเกินไปแล้ว (เกิน 90 วัน) — เปิดใน Outlook แทน": "This message is too old (over 90 days) — open it in Outlook instead",
  "โหลดโลโก้ {name} ไม่ได้ ({status})": "Could not download the {name} logo ({status})",
  "ยังไม่ได้ใส่ client ID/secret ของ {name}": "The {name} client ID/secret is not set",
  // หน้าเว็บ
  "ตั้งค่า Mail Discord Bot": "Mail Discord Bot setup",
  "บัญชีที่เชื่อมแล้ว ({count})": "Connected accounts ({count})",
  "ยังไม่มี": "None yet",
  "เพิ่มบัญชี": "Add an account",
  "➕ เพิ่มบัญชี": "➕ Add account",
  "เชื่อมใหม่": "Reconnect",
  "ยกเลิก": "Remove",
  "ยกเลิกการเชื่อม {email}?": "Disconnect {email}?",
  "ยังไม่ได้ใส่ client ID/secret": "Client ID/secret not set",
  "จัดการบน Discord ได้เหมือนกัน:": "You can also manage accounts in Discord:",
  "แนะนำไม่เกิน 5 บัญชี (โควตาฟรี)": "Up to 5 accounts recommended (free plan quota)",
  "ส่งข้อความทดสอบเข้าช่อง": "Send a test message to the channel",
  "ทดสอบ": "Test",
  "ลงทะเบียนคำสั่ง + โลโก้": "Register commands + logos",
  "กดใหม่ทุกครั้งที่อัปเดตบอท": "Run again after every bot update",
  "ลงทะเบียน": "Register",
  "Redirect URI สำหรับ Google และ Microsoft:": "Redirect URI for Google and Microsoft:",
  "ลิงก์หมดอายุ": "Link expired",
  "<p>สั่ง <code>/account add</code> ใน Discord ใหม่อีกครั้ง</p>": "<p>Run <code>/account add</code> in Discord again.</p>",
  "<p>เริ่มใหม่จากหน้า /setup</p>": "<p>Start again from /setup.</p>",
  "ยังตั้งค่าไม่ครบ": "Setup incomplete",
  "ยกเลิกการเชื่อมต่อ": "Connection cancelled",
  "เชื่อมต่อไม่สำเร็จ": "Connection failed",
  "ไม่ได้ refresh token": "No refresh token received",
  "<p>ลองยกเลิกสิทธิ์ของแอปนี้ในบัญชี {name} แล้วเชื่อมใหม่อีกครั้ง</p>": "<p>Remove this app's access in your {name} account, then connect again.</p>",
  "✅ เชื่อม {name} สำเร็จ": "✅ {name} connected",
  "<p>บัญชี: <b>{email}</b></p><p>ต่อไปบอทจะแจ้งเตือนอีเมลใหม่เข้า Discord ภายในประมาณ 1 นาที</p><p>ปิดหน้านี้แล้วกลับไปที่ Discord ได้เลย · ตั้งชื่อบัญชีด้วย <code>/account rename</code></p>":
    "<p>Account: <b>{email}</b></p><p>New mail will now be posted to Discord within about a minute.</p><p>You can close this page and go back to Discord · Set a nickname with <code>/account rename</code></p>",
  "ยกเลิกการเชื่อม {account} แล้ว": "Disconnected {account}",
  "<p>ถ้าต้องการยกเลิกสิทธิ์ฝั่ง {name} ด้วย ให้ไปลบที่หน้าตั้งค่าความปลอดภัยของบัญชี</p>": "<p>To revoke access on the {name} side too, remove the app in your account's security settings.</p>",
  "สร้างโลโก้ไม่สำเร็จ: {error}": "Could not create logos: {error}",
  "✅ ลงทะเบียนคำสั่งแล้ว": "✅ Commands registered",
  "โลโก้: {emojis}": "Logos: {emojis}",
  "คำสั่งอาจใช้เวลาสักครู่กว่าจะขึ้นใน Discord": "Commands may take a moment to appear in Discord (press Ctrl+R).",
  "✅ บอทเชื่อมต่อช่องนี้ได้แล้ว": "✅ The bot can post in this channel",
  "✅ ส่งข้อความทดสอบแล้ว": "✅ Test message sent",
  "<p>เช็กในช่อง Discord ได้เลย</p>": "<p>Check your Discord channel.</p>",
};

export function fill(s, v = {}) {
  return String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? String(v[k] ?? "") : m));
}

export const lang = (env) => (String(env?.LANGUAGE || "th").toLowerCase().startsWith("en") ? "en" : "th");

// T = tr(env); T("ข้อความ {x}", { x })
export function tr(env) {
  const en = lang(env) === "en";
  return (th, v) => fill(en ? (EN[th] ?? th) : th, v);
}

export const TH = tr({}); // ค่าเริ่มต้นของตัวช่วยที่ไม่มี env
