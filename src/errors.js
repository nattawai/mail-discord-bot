// แปลง error ทางเทคนิคเป็นข้อความที่บอกว่า "เกิดอะไร เพราะอะไร แก้ยังไง"
// error ที่โยนจาก tokens.js / discord.js มี service, status, code, auth ติดมาด้วย

export function apiError(service, status, code, { auth = false } = {}) {
  const err = new Error(`${service} ${status}${code ? `: ${code}` : ""}`);
  Object.assign(err, { service, status, code: String(code || ""), auth });
  return err;
}

export function explainError(err, T) {
  const s = err?.status;
  const code = err?.code || "";
  const name = err?.service || T("เซิร์ฟเวอร์อีเมล");
  const detail = String(err?.message || err).slice(0, 300);
  const out = (why, fix) => `❌ ${T("ทำรายการไม่สำเร็จ")}\n**${T("สาเหตุ:")}** ${why}\n**${T("วิธีแก้:")}** ${fix}\n-# ${detail}`;

  if (err?.friendly) return `❌ ${err.message}`;
  if (err?.service === "Discord") {
    if (code === "50013" || code === "50001")
      return out(T("บอทไม่มีสิทธิ์ทำสิ่งนี้ในช่องนี้"), T("ให้สิทธิ์ View Channel, Send Messages และ Manage Messages กับบอทในช่องนี้"));
    if (code === "10008") return out(T("ข้อความใน Discord ถูกลบไปแล้ว"), T("ไม่ต้องทำอะไร"));
    if (s === 429) return out(T("Discord จำกัดความถี่ เพราะส่งคำขอถี่เกินไป"), T("รอสักครู่แล้วลองใหม่"));
    if (s >= 500) return out(T("เซิร์ฟเวอร์ Discord ขัดข้องชั่วคราว"), T("ลองใหม่อีกครั้งในอีกสักครู่"));
  }
  if (err?.auth || code === "invalid_grant" || s === 401)
    return out(
      T("สิทธิ์เข้าบัญชี {name} หมดอายุหรือถูกยกเลิก (เช่น เปลี่ยนรหัสผ่าน หรือไม่ได้ใช้นาน)", { name }),
      T("สั่ง /account add เพื่อเชื่อมบัญชีนี้ใหม่ บัญชีเดิมและชื่อเล่นจะยังอยู่")
    );
  if (s === 403)
    return out(T("{name} ไม่อนุญาตให้บอททำสิ่งนี้ (สิทธิ์ไม่ครบ)", { name }), T("สั่ง /account add แล้วติ๊กอนุญาตให้ครบทุกข้อตอนเชื่อม"));
  if (s === 404 || code === "ErrorItemNotFound")
    return out(T("ไม่พบอีเมลนี้แล้ว อาจถูกลบหรือย้ายจากแอปอีเมลไปก่อน"), T("กด ✅ เพื่อปิดแจ้งเตือนนี้ หรือสั่ง /clear"));
  if (s === 429) return out(T("{name} จำกัดความถี่ เพราะเรียกใช้บ่อยเกินไป", { name }), T("รอประมาณ 1 นาทีแล้วลองใหม่"));
  if (s >= 500)
    return out(T("เซิร์ฟเวอร์ {name} ขัดข้องชั่วคราว ({status}) ไม่ใช่ปัญหาของบอท", { name, status: s }), T("ลองกดใหม่อีกครั้งในอีกสักครู่"));
  if (err?.name === "TypeError" && /fetch|network/i.test(detail))
    return out(T("ติดต่อ {name} ไม่ได้ (เครือข่ายขัดข้อง)", { name }), T("ลองกดใหม่อีกครั้งในอีกสักครู่"));
  return out(T("ไม่ทราบสาเหตุแน่ชัด"), T("ลองใหม่อีกครั้ง ถ้ายังไม่ได้ให้ดู log ด้วย npx wrangler tail"));
}
