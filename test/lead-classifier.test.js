const { test } = require("node:test");
const assert = require("node:assert");
const { LeadClassifier } = require("../lib/lead-classifier");

test("extractDomain extracts domain from email", () => {
  assert.strictEqual(LeadClassifier.extractDomain("ceo@example.com"), "example.com");
  assert.strictEqual(LeadClassifier.extractDomain("info@www.example.com"), "example.com");
  assert.strictEqual(LeadClassifier.extractDomain("no-at-sign"), "unknown");
});

test("detectRole identifies executive roles", () => {
  assert.strictEqual(LeadClassifier.detectRole("ceo@company.com"), "executive");
  assert.strictEqual(LeadClassifier.detectRole("cto@company.com"), "executive");
  assert.strictEqual(LeadClassifier.detectRole("vp.sales@company.com"), "executive");
});

test("detectRole identifies sales roles", () => {
  assert.strictEqual(LeadClassifier.detectRole("sales@company.com"), "sales");
  assert.strictEqual(LeadClassifier.detectRole("business.development@company.com"), "sales");
});

test("detectRole identifies marketing roles", () => {
  assert.strictEqual(LeadClassifier.detectRole("marketing@company.com"), "marketing");
  assert.strictEqual(LeadClassifier.detectRole("social.media@company.com"), "marketing");
});

test("detectRole identifies technical roles", () => {
  assert.strictEqual(LeadClassifier.detectRole("engineer@company.com"), "technical");
  assert.strictEqual(LeadClassifier.detectRole("devops@company.com"), "technical");
});

test("detectRole identifies personal emails", () => {
  assert.strictEqual(LeadClassifier.detectRole("john.doe@company.com"), "personal");
});

test("detectRole returns generic for unknown", () => {
  assert.strictEqual(LeadClassifier.detectRole("info@company.com"), "generic");
  assert.strictEqual(LeadClassifier.detectRole("not-an-email"), "generic");
});

test("getPriority returns correct priority", () => {
  assert.strictEqual(LeadClassifier.getPriority("executive"), "high");
  assert.strictEqual(LeadClassifier.getPriority("sales"), "medium");
  assert.strictEqual(LeadClassifier.getPriority("technical"), "low");
  assert.strictEqual(LeadClassifier.getPriority("unknown"), "low");
});

test("getScore returns correct score", () => {
  assert.strictEqual(LeadClassifier.getScore("executive"), 1.0);
  assert.strictEqual(LeadClassifier.getScore("sales"), 0.8);
  assert.strictEqual(LeadClassifier.getScore("generic"), 0.25);
});