const { test } = require("node:test");
const assert = require("node:assert");
const { Validator } = require("../lib/validator");

test("validateEmail accepts valid emails", () => {
  const result = Validator.validateEmail("ceo@example.com");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.normalized, "ceo@example.com");
  assert.strictEqual(result.role, "executive");
});

test("validateEmail normalizes case", () => {
  const result = Validator.validateEmail("CEO@Example.COM");
  assert.strictEqual(result.valid, true);
  assert.strictEqual(result.normalized, "ceo@example.com");
});

test("validateEmail rejects invalid emails", () => {
  assert.strictEqual(Validator.validateEmail("not-an-email").valid, false);
  assert.strictEqual(Validator.validateEmail("missing@tld").valid, false);
  assert.strictEqual(Validator.validateEmail("").valid, false);
});

test("validatePhone accepts valid phone numbers", () => {
  const result = Validator.validatePhone("+1-234-567-8901");
  assert.strictEqual(result.valid, true);
  assert.ok(result.normalized.startsWith("+"));
});

test("validatePhone rejects invalid phone numbers", () => {
  assert.strictEqual(Validator.validatePhone("123").valid, false);
  assert.strictEqual(Validator.validatePhone("").valid, false);
});