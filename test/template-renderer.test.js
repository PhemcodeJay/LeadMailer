const { test } = require("node:test");
const assert = require("node:assert");
const { TemplateRenderer } = require("../lib/template-renderer");

test("render replaces variables", () => {
  const result = TemplateRenderer.render("Hello {{name}}!", { name: "John" });
  assert.strictEqual(result, "Hello John!");
});

test("render replaces multiple variables", () => {
  const result = TemplateRenderer.render("{{name}} works at {{company}}", {
    name: "Jane",
    company: "Acme",
  });
  assert.strictEqual(result, "Jane works at Acme");
});

test("render handles if blocks when true", () => {
  const template = "{% if company %}Working at {{company}}{% endif %}";
  const result = TemplateRenderer.render(template, { company: "Acme" });
  assert.strictEqual(result, "Working at Acme");
});

test("render removes if blocks when false", () => {
  const template = "{% if company %}Working at {{company}}{% endif %}";
  const result = TemplateRenderer.render(template, { company: "" });
  assert.strictEqual(result, "");
});

test("render leaves unknown variables as-is", () => {
  const result = TemplateRenderer.render("Hello {{unknown}}!", { name: "John" });
  assert.strictEqual(result, "Hello {{unknown}}!");
});

test("render handles null values", () => {
  const result = TemplateRenderer.render("Hello {{name}}!", { name: null });
  assert.strictEqual(result, "Hello {{name}}!");
});