import test from "node:test";
import assert from "node:assert/strict";
import { apiError, explainError } from "../src/errors.js";
import { tr } from "../src/i18n.js";

const TH = tr({ LANGUAGE: "th" });
const EN = tr({ LANGUAGE: "en" });

test("502 explains a temporary server problem", () => {
  const m = explainError(apiError("Outlook", 502, "error code: 502"), EN);
  assert.match(m, /Why:\*\* Outlook is having a temporary server problem \(502\)/);
  assert.match(m, /Fix:/);
});

test("expired refresh token says to reconnect", () => {
  const m = explainError(apiError("Gmail", 400, "invalid_grant", { auth: true }), TH);
  assert.match(m, /หมดอายุ/);
  assert.match(m, /\/account add/);
});

test("404 says the mail is gone", () => {
  assert.match(explainError(apiError("Gmail", 404, "Not Found"), EN), /no longer exists/);
});

test("Discord missing permission", () => {
  const err = Object.assign(new Error("Discord API 403"), { service: "Discord", status: 403, code: "50013" });
  assert.match(explainError(err, EN), /permission/);
});

test("friendly errors pass through and unknown errors still show detail", () => {
  assert.equal(explainError(Object.assign(new Error("hi"), { friendly: true }), EN), "❌ hi");
  assert.match(explainError(new Error("boom"), EN), /Unknown cause[\s\S]*-# boom/);
});
