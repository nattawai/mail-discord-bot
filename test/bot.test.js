import test from "node:test";
import assert from "node:assert/strict";
import { chunkText, mentionOf } from "../src/bot.js";
import { COMMANDS, commandOptions, mailEmbed, optionValue } from "../src/discord.js";
import gmail from "../src/providers/gmail.js";

test("notification layout: subject title, logo : full email, sender", () => {
  const e = mailEmbed(gmail, { emoji: "<:mail_gmail:1>", email: "me@gmail.com", label: "งาน" }, { subject: "สวัสดี", from: "Bob <b@x.com>", date: "Sat, 7 Nov 2026 10:15:00 +0000" });
  assert.equal(e.title, "สวัสดี");
  assert.equal(e.description, "<:mail_gmail:1> : **me@gmail.com**  ·  งาน\n**ผู้ส่ง:** Bob <b@x.com>");
  assert.equal(e.timestamp, "2026-11-07T10:15:00.000Z");
  assert.ok(!e.fields);
});

test("subcommand options are read through nesting", () => {
  const it = { data: { name: "account", options: [{ type: 1, name: "rename", options: [{ type: 3, name: "account", value: "g2", focused: true }, { type: 3, name: "name", value: "งาน" }] }] } };
  assert.deepEqual(commandOptions(it).sub, "rename");
  assert.equal(optionValue(it, "name"), "งาน");
  assert.equal(optionValue({ data: { options: [{ name: "account", value: "o" }] } }, "account"), "o");
});

test("long mail is split into <=4000-char chunks without losing text", () => {
  const text = Array.from({ length: 900 }, (_, i) => `บรรทัดที่ ${i} ทดสอบข้อความยาว`).join("\n");
  const chunks = chunkText(text, 4000);
  assert.ok(chunks.length > 1);
  assert.ok(chunks.every((c) => c.length <= 4000));
  assert.equal(chunks.join("\n"), text);
});

test("commands are valid shapes", () => {
  const names = COMMANDS.map((c) => c.name);
  assert.deepEqual(names, ["send", "inbox", "clear", "account"]);
  const acct = COMMANDS.find((c) => c.name === "account");
  assert.deepEqual(acct.options.map((o) => o.name), ["list", "add", "rename", "remove"]);
  for (const c of COMMANDS) assert.ok(c.description.length <= 100);
  assert.equal(mentionOf({ ALLOWED_USER_IDS: "1,2" }).text, "<@1> <@2> ");
});
