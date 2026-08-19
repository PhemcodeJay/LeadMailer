const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { StorageManager } = require("../lib/storage-manager");

let tempDir;
let storage;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leadmailer-test-"));
  storage = new StorageManager({ baseDir: tempDir });
});

afterEach(() => {
  if (storage) storage.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("creates data directories on init", () => {
  assert.ok(fs.existsSync(path.join(tempDir, "data")));
  assert.ok(fs.existsSync(path.join(tempDir, "data", "templates")));
  assert.ok(fs.existsSync(path.join(tempDir, "data", "uploads")));
  assert.ok(fs.existsSync(path.join(tempDir, "data", "attachments")));
});

test("creates default config", () => {
  const config = storage.loadConfig();
  assert.ok(config.smtp);
  assert.ok(config.email);
  assert.ok(config.campaign);
  assert.ok(config.advanced);
  assert.strictEqual(config.smtp.port, 587);
});

test("creates and retrieves sessions", () => {
  const sessionId = storage.createSession("127.0.0.1");
  assert.ok(sessionId);
  const session = storage.getSession(sessionId);
  assert.strictEqual(session.status, "new");
  assert.strictEqual(session.total_leads, 0);
});

test("inserts and retrieves leads", () => {
  const sessionId = storage.createSession("127.0.0.1");
  const inserted = storage.insertLead(sessionId, "email", "ceo@example.com", "example.com", "executive", "high", 1.0, "test");
  assert.strictEqual(inserted, true);
  const leads = storage.getLeads(sessionId);
  assert.strictEqual(leads.length, 1);
  assert.strictEqual(leads[0].value, "ceo@example.com");
  assert.strictEqual(leads[0].role, "executive");
});

test("prevents duplicate leads", () => {
  const sessionId = storage.createSession("127.0.0.1");
  storage.insertLead(sessionId, "email", "ceo@example.com", "example.com", "executive", "high", 1.0, "test");
  const second = storage.insertLead(sessionId, "email", "ceo@example.com", "example.com", "executive", "high", 1.0, "test");
  assert.strictEqual(second, false);
  assert.strictEqual(storage.getLeads(sessionId).length, 1);
});

test("saves and loads templates", () => {
  assert.ok(storage.saveTemplate("welcome", "<h1>Hello {{name}}</h1>"));
  const content = storage.getTemplate("welcome");
  assert.strictEqual(content, "<h1>Hello {{name}}</h1>");
  assert.strictEqual(storage.listTemplates().length, 1);
});

test("deletes templates", () => {
  storage.saveTemplate("welcome", "<h1>Hello</h1>");
  assert.ok(storage.deleteTemplate("welcome"));
  assert.strictEqual(storage.getTemplate("welcome"), null);
});

test("manages blacklist", () => {
  const added = storage.addToBlacklist(["spam@example.com"]);
  assert.strictEqual(added, 1);
  assert.deepStrictEqual(storage.loadBlacklist(), ["spam@example.com"]);
  const removed = storage.removeFromBlacklist(["spam@example.com"]);
  assert.strictEqual(removed, 1);
  assert.deepStrictEqual(storage.loadBlacklist(), []);
});

test("saves and loads campaigns", () => {
  const campaign = { id: "abc123", name: "Test Campaign", status: "queued", stats: { sent: 0, failed: 0 } };
  assert.ok(storage.saveCampaign(campaign));
  const campaigns = storage.loadCampaigns();
  assert.strictEqual(campaigns.length, 1);
  assert.strictEqual(campaigns[0].id, "abc123");
});

test("deletes campaigns", () => {
  storage.saveCampaign({ id: "abc123", name: "Test" });
  assert.ok(storage.deleteCampaign("abc123"));
  assert.strictEqual(storage.loadCampaigns().length, 0);
});

test("gets lead stats", () => {
  const sessionId = storage.createSession("127.0.0.1");
  storage.insertLead(sessionId, "email", "ceo@example.com", "example.com", "executive", "high", 1.0, "test");
  storage.insertLead(sessionId, "phone", "+12345678901", "phone", "contact", "medium", 0.85, "test");
  const stats = storage.getLeadStats();
  assert.strictEqual(stats.leads, 2);
  assert.strictEqual(stats.emails, 1);
  assert.strictEqual(stats.phones, 1);
  assert.strictEqual(stats.sessions, 1);
});