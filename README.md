# Mail Discord Bot

**English** · [ภาษาไทย](README.th.md)

A Discord bot for **Gmail and Outlook (multiple accounts)** that runs free on Cloudflare Workers. No server or PC needs to stay on.

- 📬 New mail is posted to your private Discord channel within about a minute, and @mentions you so it pushes to your phone. Each post shows the subject, the logo with the receiving address, and the sender.
- 📖 **Read** shows the whole message, unshortened. Long mail is split across several messages. Only you can see it.
- ↩️ **Reply** · ✅ **Mark read** · 🗑️ **Delete**, which you can restore
- Notifications you've handled disappear from the channel by themselves (`AUTO_CLEAN`)
- Bot text in English or Thai (`LANGUAGE`). Command descriptions follow each user's Discord language automatically.

## Discord commands

| Command | What it does |
|---|---|
| `/account list` | List connected accounts |
| `/account add type:Gmail` | Connect an account. You get a one-time link valid for 10 minutes. Connecting an address that's already connected reconnects it. |
| `/account rename account:… name:Work` | Set a nickname. Use `-` to clear it. |
| `/account remove account:…` | Disconnect an account |
| `/send account:…` | Send a new email from the chosen account |
| `/inbox account:…` | Show unread mail. Leave the account empty to see all of them. |
| `/clear` | Delete the bot's messages in the channel but keep unread mail. `/clear all:True` deletes everything. |
| `/status` | Check what's working: the Worker, KV, the mail-check timer, Discord and each account. Anything down shows why, how to fix it, and since when it has failed. |

Only users listed in `ALLOWED_USER_IDS` can use the buttons and commands. `/clear` is much faster when the bot has **Manage Messages** in the channel.

---

## Setup

### 1. Deploy the Worker (to get its URL)

```bash
npm install
```

```bash
cp wrangler.example.toml wrangler.toml
```

```bash
npx wrangler login
```

```bash
npx wrangler kv namespace create MAIL_BOT_KV
```

Put the returned `id` into `wrangler.toml` (`REPLACE_WITH_KV_ID`), then:

```bash
npx wrangler deploy
```

You get a URL like `https://mail-discord-bot.<you>.workers.dev`. This guide calls it `WORKER_URL`.
The OAuth redirect URI for both Google and Microsoft is **`WORKER_URL/oauth/callback`**.

Your `wrangler.toml`, `.setup-key` and `.worker-url` are git-ignored, so your IDs never reach the repository.

### 2. Discord application

1. Go to https://discord.com/developers/applications and choose **New Application**. Copy the **Application ID** and **Public Key**.
2. Open the **Bot** page, choose **Reset Token**, and keep the token. No privileged intents are needed.
3. Open **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: View Channels, Send Messages, Embed Links, Attach Files, and optionally Manage Messages
   - Invite the bot with the generated link.
4. In Discord, turn on **Settings → Advanced → Developer Mode**. Right-click your **private** channel to copy the Channel ID, and right-click yourself to copy your User ID.

### 3A. Gmail (optional)

1. Go to https://console.cloud.google.com, create a project, and enable the **Gmail API**.
2. Open **Google Auth Platform**:
   - Audience **External** works for any Google account. **Internal** works only for your Workspace org.
   - Fill in **Branding**:
     - Home page: `WORKER_URL/`
     - Privacy policy: `WORKER_URL/privacy`
     - Authorized domain: `<you>.workers.dev`
   - Under **Audience**, choose **Publish app**. Apps left in Testing get refresh tokens that expire after 7 days.
   - In **Data Access**, add the `https://www.googleapis.com/auth/gmail.modify` scope. The "verification required" notice is fine for personal use.
3. Under **Clients**, create a **Web application** with the redirect URI from step 1. Copy the Client ID and secret.

When you connect, Google shows "Google hasn't verified this app". Choose **Advanced → Go to … (unsafe)**. It's your own app.

### 3B. Outlook / Hotmail (optional)

1. Open https://entra.microsoft.com, go to **App registrations → New registration**, and pick a **Web** redirect URI from step 1.
   - Personal accounts only (outlook.com, hotmail): use `MS_TENANT = "consumers"`.
   - Personal and work accounts: choose "Accounts in any organizational directory and personal Microsoft accounts" and use `MS_TENANT = "common"`.
2. Copy the **Application (client) ID**. Under **Certificates & secrets**, create a client secret and copy its **Value**, not the Secret ID. Secrets expire after at most 24 months.
3. Under **API permissions → Microsoft Graph → Delegated**, add `Mail.ReadWrite`, `Mail.Send`, `offline_access` and `User.Read`.

### 4. Configure the Worker

Settings in `wrangler.toml` `[vars]`:

| Variable | Value |
|---|---|
| `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_CHANNEL_ID` | From step 2 |
| `ALLOWED_USER_IDS` | Discord user IDs allowed to use the bot, comma-separated |
| `MENTION_USER_IDS` / `MENTION_ROLE_ID` | Who gets @mentioned on new mail. Empty means `ALLOWED_USER_IDS`; `none` turns it off. |
| `MS_TENANT` | `consumers`, `common` or your tenant ID |
| `AUTO_CLEAN` | `true` removes a notification once it's marked read or deleted |
| `LANGUAGE` | `en` or `th` |

Each secret below prompts for its value. Skip the ones you don't use.

```bash
npx wrangler secret put DISCORD_BOT_TOKEN
```

```bash
npx wrangler secret put SETUP_KEY
```

```bash
npx wrangler secret put GOOGLE_CLIENT_ID
```

```bash
npx wrangler secret put GOOGLE_CLIENT_SECRET
```

```bash
npx wrangler secret put MS_CLIENT_ID
```

```bash
npx wrangler secret put MS_CLIENT_SECRET
```

`SETUP_KEY` is any long random string, for example:

```bash
node -e "console.log(crypto.randomUUID()+crypto.randomUUID())"
```

Then deploy again:

```bash
npx wrangler deploy
```

### 5. Connect everything

1. In the Discord developer portal, go to **General Information** and set **Interactions Endpoint URL** to `WORKER_URL/`, then save.
2. Open `WORKER_URL/setup?key=SETUP_KEY` and choose **Register commands + logos**, then **Test**. On Windows, put the URL in `.worker-url` and the key in `.setup-key`, then run `open-setup.ps1`.
3. Add accounts from that page, or run `/account add` in Discord. Then send yourself a test email.

---

## Troubleshooting

Start with `/status` in Discord. It tests every service live and links the official Google, Microsoft, Discord and Cloudflare status pages. When a button fails, the error message also says why and how to fix it.

For the full log:

```bash
npx wrangler tail
```

| Symptom | Usual cause |
|---|---|
| Discord won't save the Interactions Endpoint | Wrong `DISCORD_PUBLIC_KEY`, or the new value isn't deployed yet |
| Commands don't show up | Run **Register commands** again, then press Ctrl+R in Discord |
| "You are not allowed" | Your user ID isn't in `ALLOWED_USER_IDS` |
| No phone notifications | On desktop, set **User Settings → Notifications → Mobile Notification Delay** to the lowest value. On the phone, allow Discord notifications. |
| `invalid_grant` | Token expired (Gmail app left in Testing, or Outlook unused for 90 days). Reconnect the account. |
| Outlook `userAudience` / `AADSTS…` error | `MS_TENANT` doesn't match the app's supported account types |

## Free plan limits

- The cron runs every minute and posts about 20 mails per run in total, shared between accounts.
- KV allows 1,000 writes a day. The bot writes only on new mail and when tokens refresh, so up to about 5 accounts fits easily.
- Attachments are listed by name only. Open them in your mailbox.

## Security

- Tokens and secrets live only in Cloudflare secrets and KV, never in the repository.
- Anyone who can read the channel can read your mail, so use a private channel and set `ALLOWED_USER_IDS`.
- Keep `SETUP_KEY` private. You can revoke access anytime at https://myaccount.google.com/permissions or https://account.live.com/consent/Manage.

## Development

```bash
npm test
```

Bot text lives in [`src/i18n.js`](src/i18n.js). Thai is the source text and `EN` holds the English. The tests fail if a string has no translation.
