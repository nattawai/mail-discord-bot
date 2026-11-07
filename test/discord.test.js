import test from "node:test";
import assert from "node:assert/strict";
import { mailButtons, readViewButtons, existingLink } from "../src/discord.js";
import gmail from "../src/providers/gmail.js";

const valid = (rows) => rows.flatMap((r) => r.components).forEach((b) => {
  assert.equal(b.type, 2, "every component is a button");
  if (b.style === 5) { assert.ok(b.url); assert.equal(b.custom_id, undefined); }
  else { assert.ok(b.custom_id && b.custom_id.length <= 100); assert.equal(b.url, undefined); }
});

test("button rows are valid Discord buttons", () => {
  for (const s of ["unread", "read", "trashed"]) valid(mailButtons(gmail, "abc", "https://x", s));
  valid(readViewButtons(gmail, "abc", "https://x"));
  valid(mailButtons(gmail, "abc", undefined));
  assert.equal(existingLink({ components: mailButtons(gmail, "abc", "https://x") }), "https://x");
});
