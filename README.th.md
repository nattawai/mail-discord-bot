# Mail Discord Bot

[English](README.md) · **ภาษาไทย**

บอท Discord สำหรับ **Gmail และ Outlook หลายบัญชี** รันบน Cloudflare Workers แพ็กเกจฟรี

- 📬 มีเมลเข้าแล้วแจ้งเตือนในช่อง Discord ภายในประมาณ 1 นาที พร้อม tag คุณ (เด้งบนมือถือ) แสดง หัวเรื่อง → โลโก้ : อีเมลที่รับ → ผู้ส่ง
- 📖 **อ่านเต็ม**: แสดงเนื้อหาทั้งหมด ไม่ตัด (ยาวมากจะแบ่งเป็นหลายข้อความ) เห็นคนเดียว
- ↩️ **ตอบกลับ** · ✅ **อ่านแล้ว** · 🗑️ **ลบ** (กู้คืนได้)
- กด ✅ หรือ 🗑️ แล้ว ข้อความแจ้งเตือนจะหายจากช่องเอง ช่องไม่รก (ปิดได้ด้วย `AUTO_CLEAN = "false"`)

## คำสั่งใน Discord

| คำสั่ง | ทำอะไร |
|---|---|
| `/account list` | ดูบัญชีที่เชื่อมไว้ |
| `/account add type:Gmail` | เชื่อมบัญชีใหม่ (ได้ลิงก์ใช้ครั้งเดียว 10 นาที) เชื่อมอีเมลเดิมซ้ำ = เชื่อมใหม่ให้บัญชีเดิม |
| `/account rename account:… name:งาน` | ตั้งชื่อเล่นบัญชี (ใส่ `-` เพื่อลบชื่อ) |
| `/account remove account:…` | ยกเลิกการเชื่อม |
| `/send account:…` | ส่งเมลใหม่จากบัญชีที่เลือก |
| `/inbox account:…` | ดูเมลที่ยังไม่อ่าน (ไม่เลือก = ทุกบัญชี) |
| `/clear` | ลบข้อความของบอทในช่อง เก็บเมลที่ยังไม่อ่านไว้ · `/clear all:True` ลบทั้งหมด |
| `/status` | เช็กว่าอะไรทำงานอยู่: Worker, KV, ตัวตั้งเวลาดึงเมล, Discord และแต่ละบัญชี ถ้าอะไรล่มจะบอกสาเหตุ วิธีแก้ และล่มมาตั้งแต่เมื่อไร |

`/clear` จะเร็วขึ้นมากถ้าให้สิทธิ์ **Manage Messages** กับบอทในช่องนั้น

**แจ้งเตือนไม่เด้งบนมือถือ?** Discord จะไม่ส่ง push ถ้าคุณเปิด Discord บนคอมอยู่ → Discord บนคอม: User Settings → Notifications → **Push Notification Inactive Timeout** ตั้งให้ต่ำสุด · บนมือถือ: ตั้งช่องเป็น All Messages และอนุญาตแจ้งเตือนของแอป

ใช้งานได้เฉพาะคนที่มี user ID อยู่ใน `ALLOWED_USER_IDS` คนอื่นที่กดปุ่มจะถูกปฏิเสธ

---

## ขั้นที่ 1: Deploy Worker ขึ้นไปก่อน (เพื่อเอา URL)

คัดลอกไฟล์ตั้งค่าตัวอย่างก่อน (`wrangler.toml` ของคุณจะไม่ขึ้น git):

```bash
cp wrangler.example.toml wrangler.toml
```

```bash
npm install
```

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create KV
```

เอา `id` ที่ได้ไปใส่ใน `wrangler.toml` แทน `REPLACE_WITH_KV_ID` แล้วรัน:

```bash
npx wrangler deploy
```

จะได้ URL หน้าตาประมาณ `https://mail-discord-bot.<ชื่อของคุณ>.workers.dev` ให้จดไว้ ต่อไปในเอกสารนี้จะเรียกว่า `WORKER_URL`

ถ้าใช้ Windows: ใส่ URL นี้ในไฟล์ `.worker-url` และ SETUP_KEY ในไฟล์ `.setup-key` แล้วรัน `open-setup.ps1` เพื่อเปิดหน้าตั้งค่าได้ทันที (ทั้งสองไฟล์ไม่ขึ้น git)

Redirect URI ที่ต้องใส่ทั้งฝั่ง Google และ Microsoft คือ **`WORKER_URL/oauth/callback`** (ใช้ตัวเดียวกัน)

## ขั้นที่ 2: สร้าง Discord Bot

1. ไปที่ https://discord.com/developers/applications แล้วกด **New Application**
2. ในหน้า **General Information** คัดลอก **Application ID** และ **Public Key**
3. ในหน้า **Bot** กด **Reset Token** แล้วคัดลอก token ไว้ (ไม่ต้องเปิด Privileged Intents)
4. ในหน้า **OAuth2 → URL Generator**
   - Scopes: `bot`, `applications.commands`
   - Bot Permissions: View Channels, Send Messages, Embed Links, Attach Files
   - เปิดลิงก์ที่ได้ แล้วเชิญบอทเข้าเซิร์ฟเวอร์
5. ใน Discord เปิด **Settings → Advanced → Developer Mode** แล้ว
   - คลิกขวาที่ช่องที่จะให้แจ้งเตือน → **Copy Channel ID**
   - คลิกขวาที่ชื่อตัวเอง → **Copy User ID**
   - ช่องนี้ควรตั้งเป็น **private** เพราะเนื้อหาอีเมลจะไปอยู่ในนั้น

## ขั้นที่ 3A: Gmail (ข้ามได้ถ้าไม่ใช้)

1. ไปที่ https://console.cloud.google.com สร้างโปรเจกต์ใหม่ แล้วไปที่ **APIs & Services → Library** เปิดใช้ **Gmail API**
2. ไปที่ **Google Auth Platform → Branding / Audience** (หรือ OAuth consent screen)
   - **บัญชีบริษัท (Google Workspace)**: เลือก **Internal** จะไม่ต้องยืนยันแอป แต่ถ้า admin บล็อกแอปภายนอกไว้ ต้องให้ IT อนุญาตก่อน
   - **Gmail ส่วนตัว**: เลือก **External** แล้วเพิ่มอีเมลตัวเองเป็น Test user
     ⚠️ ถ้าค้างอยู่ในโหมด Testing token จะหมดอายุทุก 7 วัน ให้กด **Publish app** เป็น Production (ตอน login จะมีคำเตือน "unverified app" ให้กด Advanced → ดำเนินการต่อ ใช้เองได้ไม่มีปัญหา)
3. ในหน้า **Data Access** เพิ่ม scope `https://www.googleapis.com/auth/gmail.modify`
4. ไปที่ **Clients → Create client** เลือกประเภท **Web application** แล้วใส่ Redirect URI ตามขั้นที่ 1
5. คัดลอก **Client ID** และ **Client Secret**

## ขั้นที่ 3B: Outlook / Microsoft 365 (ข้ามได้ถ้าไม่ใช้)

1. ไปที่ https://entra.microsoft.com (หรือ portal.azure.com) → **App registrations → New registration**
   - Supported account types:
     - ใช้ได้ทั้งบัญชีส่วนตัวและบริษัท: **Accounts in any organizational directory and personal Microsoft accounts** (ใช้คู่กับ `MS_TENANT = "common"`)
     - บัญชีบริษัทอย่างเดียว: **Single tenant** แล้วใส่ Tenant ID ใน `MS_TENANT`
   - Redirect URI: เลือก **Web** แล้วใส่ Redirect URI ตามขั้นที่ 1
2. ในหน้า **Overview** คัดลอก **Application (client) ID**
3. ไปที่ **Certificates & secrets → New client secret** แล้วคัดลอก **Value** (ไม่ใช่ Secret ID)
   ⚠️ secret มีวันหมดอายุ (สูงสุด 24 เดือน) ก่อนหมดต้องสร้างตัวใหม่แล้ว `wrangler secret put` อีกครั้ง
4. ไปที่ **API permissions → Add → Microsoft Graph → Delegated** แล้วเพิ่ม `Mail.ReadWrite`, `Mail.Send`, `User.Read`, `offline_access`
   - **บัญชีบริษัท**: ถ้าขึ้นว่าต้องให้ admin อนุมัติ ให้ IT กด **Grant admin consent**
5. **Outlook ส่วนตัว** (outlook.com / hotmail): ถ้าเข้าไปแล้วลงทะเบียนแอปไม่ได้เพราะไม่มี directory ต้องสมัคร Azure แบบฟรีก่อน ขั้นนี้อาจต้องใช้บัตรเพื่อยืนยันตัวตน (การใช้ Graph API ไม่มีค่าใช้จ่าย)

## ขั้นที่ 4: ใส่ค่าลง Worker

แก้ `[vars]` ใน `wrangler.toml`:

| ตัวแปร | ค่าที่ใส่ |
|---|---|
| `DISCORD_APPLICATION_ID` | Application ID |
| `DISCORD_PUBLIC_KEY` | Public Key |
| `DISCORD_CHANNEL_ID` | Channel ID |
| `ALLOWED_USER_IDS` | User ID ของคุณ (ถ้าหลายคนให้คั่นด้วย `,`) |
| `MS_TENANT` | `consumers` = Outlook ส่วนตัว (ตั้งไว้แล้ว), `common` = ทั้งส่วนตัวและบริษัท (แอปใน Entra ต้องเป็น All), หรือ Tenant ID ของบริษัท |
| `MENTION_USER_IDS` / `MENTION_ROLE_ID` | ใคร/role ไหนจะถูก tag ตอนมีเมลใหม่ (`none` = ปิด) |
| `AUTO_CLEAN` | `true` = ลบข้อความแจ้งเตือนเมื่อกดอ่านแล้ว/ลบ |
| `LANGUAGE` | ภาษาของข้อความบอทและหน้า setup: `th` หรือ `en` (คำอธิบายคำสั่งแสดงตามภาษาของแอป Discord แต่ละคนเอง) |

ใส่ค่าที่เป็นความลับด้วย `wrangler secret` (ระบบจะถามค่าทีละตัว ข้ามตัวที่ไม่ใช้ได้):

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
```

```bash
npx wrangler secret put SETUP_KEY
```

Gmail:

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

Outlook:

```bash
npx wrangler secret put MS_CLIENT_ID
```

```bash
npx wrangler secret put MS_CLIENT_SECRET
```

`SETUP_KEY` คือรหัสยาว ๆ ที่ตั้งเองได้เลย ถ้าไม่อยากคิดเอง สร้างด้วยคำสั่งนี้ได้:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

จากนั้น deploy อีกครั้ง:

```bash
npx wrangler deploy
```

## ขั้นที่ 5: เชื่อมทุกอย่างเข้าด้วยกัน

1. **Discord**: ไปที่หน้า General Information → **Interactions Endpoint URL** ใส่ `WORKER_URL/` แล้วกด Save (ถ้าบันทึกสำเร็จแปลว่าตรวจลายเซ็นผ่านแล้ว)
2. เปิด **`WORKER_URL/setup?key=SETUP_KEY`** ใน browser แล้วกดตามลำดับ
   - ส่งข้อความทดสอบเข้าช่อง
   - ลงทะเบียนคำสั่ง `/send` และ `/inbox`
   - 🔗 เชื่อมบัญชี Gmail และ/หรือ Outlook
3. ลองส่งเมลหาตัวเอง แล้วรอประมาณ 1 นาที 🎉

---

## ดูปัญหา / log

เริ่มจากสั่ง `/status` ใน Discord บอทจะทดสอบทุกบริการสด ๆ และมีลิงก์หน้าสถานะทางการของ Google, Microsoft, Discord และ Cloudflare ถ้ากดปุ่มแล้วไม่สำเร็จ ข้อความ error ก็จะบอกสาเหตุและวิธีแก้ด้วย

ดู log ทั้งหมด:

```bash
npx wrangler tail
```

| อาการ | สาเหตุที่พบบ่อย |
|---|---|
| บันทึก Interactions Endpoint ไม่ผ่าน | `DISCORD_PUBLIC_KEY` ผิด หรือยังไม่ได้ deploy ค่าใหม่ |
| กดปุ่มแล้วขึ้น "ไม่มีสิทธิ์" | User ID ไม่อยู่ใน `ALLOWED_USER_IDS` |
| ไม่มีแจ้งเตือนเมลใหม่ | ยังไม่ได้เชื่อมบัญชีในหน้า `/setup` หรือบอทไม่มีสิทธิ์ส่งข้อความในช่องนั้น |
| `invalid_grant` | token หมดอายุ (Gmail โหมด Testing หรือไม่ได้ใช้ Outlook เกิน 90 วัน) ให้กด "เชื่อมใหม่" ในหน้า `/setup` |
| Outlook ขึ้น `AADSTS…` ตอน login | ตั้ง account type ไม่ตรงกับ `MS_TENANT` หรือ admin ยังไม่อนุมัติ |
| Outlook ขึ้น `invalid_client` | ใส่ Secret ID แทน **Value** หรือ secret หมดอายุ |
| `/send` ไม่ขึ้นใน Discord | ยังไม่ได้ลงทะเบียนคำสั่ง หรือต้องรอสักครู่ / รีสตาร์ท Discord |

## ข้อจำกัดของแพ็กเกจฟรี (ระบบออกแบบให้อยู่ในโควตาแล้ว)

- Cron ทำงานทุก 1 นาที แต่ละบัญชีโพสต์ได้สูงสุด 10 ฉบับต่อรอบ ถ้าเมลเข้ามากกว่านั้นจะสรุปเป็นข้อความ "และอีก N ฉบับ"
- KV เขียนได้ 1,000 ครั้งต่อวัน ระบบจะเขียนเฉพาะตอนมีเมลใหม่ ตอนต่ออายุ token (ประมาณชั่วโมงละครั้ง) และเมล Outlook ใช้เพิ่มฉบับละ 1 ครั้ง ถ้าเมลเข้าวันละไม่กี่ร้อยฉบับก็อยู่ในโควตาสบาย ๆ
- Gmail: ถ้า Worker ไม่ได้ทำงานนานเกินประมาณ 1 สัปดาห์ ระบบจะเริ่มนับใหม่ และเมลระหว่างนั้นจะไม่ถูกแจ้งย้อนหลัง
- Outlook: เช็กจากเวลาที่เมลเข้ามาใน Inbox ถ้ามี rule ย้ายเมลเก่ากลับเข้า Inbox ทีหลัง เมลนั้นจะไม่ถูกแจ้ง
- ปุ่มของเมล Outlook ใช้ได้ภายใน 90 วัน
- ไฟล์แนบจะแสดงแค่รายชื่อไฟล์ ให้เปิดดูในกล่องจดหมาย

## ความปลอดภัย

- ทั้งเนื้อหาอีเมลและสิทธิ์ส่งเมล จะเปิดให้ทุกคนที่อ่านช่องนั้นเห็นได้ ควรใช้ช่อง private และใส่ `ALLOWED_USER_IDS` ให้ถูกต้อง
- Refresh token เก็บไว้ใน KV ของบัญชี Cloudflare คุณ ยกเลิกได้ในหน้า `/setup` หรือฝั่งบัญชีที่ https://myaccount.google.com/permissions และ https://account.live.com/consent/Manage (Outlook ส่วนตัว)
- อย่าเผยแพร่ `SETUP_KEY` เพราะคนที่มีรหัสนี้สามารถเชื่อมบัญชีอื่นเข้าแทน หรือยกเลิกการเชื่อมได้
