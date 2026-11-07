import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { EN, tr } from "../src/i18n.js";
import { mailButtons, mailEmbed, COMMANDS } from "../src/discord.js";
import gmail from "../src/providers/gmail.js";

const files = ["src/" , "src/providers/"].flatMap((d) => readdirSync(d).filter((f) => f.endsWith(".js") && f !== "i18n.js").map((f) => d + f));
const keys = new Set();
for (const f of files) {
  const src = readFileSync(f, "utf8");
  for (const m of src.matchAll(/\bT\(\s*(["'])((?:\.|(?!\1).)*)\1/g)) keys.add(JSON.parse('"' + m[2].replace(/\'/g, "'").replace(/"/g, '\\"') + '"'));
  for (const m of src.matchAll(/tr\(env\)\(\s*(["'])((?:\.|(?!\1).)*)\1/g)) keys.add(JSON.parse('"' + m[2].replace(/\'/g, "'").replace(/"/g, '\\"') + '"'));
}

test("every translated string in the code has an English version with the same {placeholders}", () => {
  assert.ok(keys.size > 60, `found only ${keys.size} strings`);
  const vars = (s) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort().join(",");
  for (const k of keys) {
    assert.ok(k in EN, `missing English for: ${k}`);
    assert.equal(vars(EN[k]), vars(k), `placeholder mismatch: ${k}`);
  }
});

test("LANGUAGE switches bot text; Thai is the default", () => {
  const en = tr({ LANGUAGE: "en" });
  const th = tr({});
  assert.equal(en("ยังไม่ได้อ่าน"), "ยังไม่ได้อ่าน", "unknown strings fall back to the original");
  assert.equal(en("✅ อ่านแล้ว โดย {who}", { who: "Wai" }), "✅ Marked read by Wai");
  assert.equal(th("✅ อ่านแล้ว โดย {who}", { who: "Wai" }), "✅ อ่านแล้ว โดย Wai");
  const labels = mailButtons(gmail, "abc", "https://x", "unread", { T: en })[0].components.map((b) => b.label);
  assert.deepEqual(labels, ["Read", "Reply", "Mark read", "Delete", "Open in Gmail"]);
  assert.match(mailEmbed(gmail, null, { from: "a@b.c" }, { T: en }).description, /^\*\*From:\*\* a@b\.c$/);
});

test("commands describe themselves in English with Thai localization", () => {
  const walk = (o) => {
    assert.ok(/^[\x00-\x7F…]+$/.test(o.description), `not English: ${o.description}`);
    assert.ok(o.description_localizations?.th, `no Thai for ${o.name}`);
    (o.options || []).forEach(walk);
  };
  COMMANDS.forEach(walk);
});
