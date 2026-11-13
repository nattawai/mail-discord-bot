// แปลง error ทางเทคนิคเป็นข้อความที่บอกว่า "เกิดอะไร เพราะอะไร แก้ยังไง"
// error ที่โยนจาก tokens.js / discord.js มี service, status, code, auth ติดมาด้วย

export function apiError(service, status, code, { auth = false } = {}) {
  const err = new Error(`${service} ${status}${code ? `: ${code}` : ""}`);
  Object.assign(err, { service, status, code: String(code || ""), auth });
  return err;
}

// คืน { why, fix, detail } — ใช้ทั้งข้อความ error และหน้า /status
export function errorReason(err, T) {
  const s = err?.status;
  const code = err?.code || "";
  const name = err?.service || T("เซิร์ฟเวอร์อีเมล");
  const detail = String(err?.message || err).slice(0, 300);
  const r = (why, fix) => ({ why, fix, detail });

  if (err?.service === "Discord") {
    if (code === "50013" || code === "50001")
      return r(T("บอทไม่มีสิทธิ์ทำสิ่งนี้ในช่องนี้"), T("ให้สิทธิ์ View Channel, Send Messages และ Manage Messages กับบอทในช่องนี้"));
    if (code === "10008") return r(T("ข้อความใน Discord ถูกลบไปแล้ว"), T("ไม่ต้องทำอะไร"));
    if (s === 401) return r(T("Bot token ของ Discord ใช้ไม่ได้"), T("รีเซ็ต token ใน Developer Portal แล้วใส่ใหม่ด้วย npx wrangler secret put DISCORD_BOT_TOKEN"));
    if (s === 429) return r(T("Discord จำกัดความถี่ เพราะส่งคำขอถี่เกินไป"), T("รอสักครู่แล้วลองใหม่"));
    if (s >= 500) return r(T("เซิร์ฟเวอร์ Discord ขัดข้องชั่วคราว"), T("ลองใหม่อีกครั้งในอีกสักครู่"));
  }
  if (err?.timeout) return r(T("{name} ตอบช้าเกินไป", { name }), T("ลองใหม่อีกครั้งในอีกสักครู่"));
  if (err?.auth || code === "invalid_grant" || s === 401)
    return r(
      T("สิทธิ์เข้าบัญชี {name} หมดอายุหรือถูกยกเลิก (เช่น เปลี่ยนรหัสผ่าน หรือไม่ได้ใช้นาน)", { name }),
      T("สั่ง /account add เพื่อเชื่อมบัญชีนี้ใหม่ บัญชีเดิมและชื่อเล่นจะยังอยู่")
    );
  if (s === 403) return r(T("{name} ไม่อนุญาตให้บอททำสิ่งนี้ (สิทธิ์ไม่ครบ)", { name }), T("สั่ง /account add แล้วติ๊กอนุญาตให้ครบทุกข้อตอนเชื่อม"));
  if (s === 404 || code === "ErrorItemNotFound")
    return r(T("ไม่พบอีเมลนี้แล้ว อาจถูกลบหรือย้ายจากแอปอีเมลไปก่อน"), T("กด ✅ เพื่อปิดแจ้งเตือนนี้ หรือสั่ง /clear"));
  if (s === 429) return r(T("{name} จำกัดความถี่ เพราะเรียกใช้บ่อยเกินไป", { name }), T("รอประมาณ 1 นาทีแล้วลองใหม่"));
  if (s >= 500) return r(T("เซิร์ฟเวอร์ {name} ขัดข้องชั่วคราว ({status}) ไม่ใช่ปัญหาของบอท", { name, status: s }), T("ลองกดใหม่อีกครั้งในอีกสักครู่"));
  if (err?.name === "TypeError" && /fetch|network/i.test(detail))
    return r(T("ติดต่อ {name} ไม่ได้ (เครือข่ายขัดข้อง)", { name }), T("ลองกดใหม่อีกครั้งในอีกสักครู่"));
  if (err?.friendly) return r(err.message, "", "");
  return r(T("ไม่ทราบสาเหตุแน่ชัด"), T("ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้ดู log ด้วย npx wrangler tail"));
}

export function explainError(err, T) {
  if (err?.friendly) return `❌ ${err.message}`;
  const { why, fix, detail } = errorReason(err, T);
  return `❌ ${T("ทำรายการไม่สำเร็จ")}\n**${T("สาเหตุ:")}** ${why}\n**${T("วิธีแก้:")}** ${fix}\n-# ${detail}`;
}
