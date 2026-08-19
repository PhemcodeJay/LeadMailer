const { test, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const request = require("supertest");
const { app, storage } = require("../app");

let tempDir;

beforeEach(() => {
  tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "leadmailer-api-test-"));
  storage.baseDir = tempDir;
  storage.dataDir = path.join(tempDir, "data");
  storage.templatesDir = path.join(tempDir, "data", "templates");
  storage.attachmentsDir = path.join(tempDir, "data", "attachments");
  storage.uploadsDir = path.join(tempDir, "data", "uploads");
  storage.configFile = path.join(tempDir, "data", "config.json");
  storage.blacklistFile = path.join(tempDir, "data", "blacklist.json");
  storage.campaignsFile = path.join(tempDir, "data", "MailerX.db");
  storage.leadDbPath = path.join(tempDir, "leads.db");
  for (const dir of [storage.dataDir, storage.templatesDir, storage.attachmentsDir, storage.uploadsDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  storage._initDefaultConfig();
  storage._initBlacklist();
  storage._initLeadDb();
});

afterEach(() => {
  if (storage.db) storage.db.close();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test("GET /health returns healthy", async () => {
  const res = await request(app).get("/health");
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.status, "healthy");
});

test("POST /api/text-validator validates emails", async () => {
  const res = await request(app)
    .post("/api/text-validator")
    .send({ text: "ceo@example.com, sales@company.com, invalid-email" });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
  assert.strictEqual(res.body.stats.valid, 2);
  assert.strictEqual(res.body.stats.invalid, 1);
});

test("POST /api/text-validator rejects empty text", async () => {
  const res = await request(app).post("/api/text-validator").send({ text: "" });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.body.error, "No text provided");
});

test("POST /api/templates saves and retrieves template", async () => {
  const saveRes = await request(app)
    .post("/api/templates")
    .send({ name: "test-template", content: "<h1>Hello {{name}}</h1>" });
  assert.strictEqual(saveRes.status, 200);
  assert.strictEqual(saveRes.body.success, true);

  const getRes = await request(app).get("/api/templates/test-template");
  assert.strictEqual(getRes.status, 200);
  assert.strictEqual(getRes.body.content, "<h1>Hello {{name}}</h1>");
});

test("GET /api/templates lists templates", async () => {
  await request(app).post("/api/templates").send({ name: "test1", content: "<p>Test</p>" });
  const res = await request(app).get("/api/templates");
  assert.strictEqual(res.status, 200);
  assert.ok(Array.isArray(res.body));
  assert.strictEqual(res.body.length, 1);
});

test("GET /api/config returns config", async () => {
  const res = await request(app).get("/api/config");
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.smtp);
  assert.ok(res.body.advanced);
});

test("POST /api/config saves config", async () => {
  const res = await request(app)
    .post("/api/config")
    .send({ smtp: { server: "smtp.gmail.com", port: 587, username: "test@example.com", password: "secret", use_tls: true, use_ssl: false } });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.success, true);
});

test("GET /api/blacklist returns empty list", async () => {
  const res = await request(app).get("/api/blacklist");
  assert.strictEqual(res.status, 200);
  assert.deepStrictEqual(res.body.items, []);
  assert.strictEqual(res.body.total, 0);
});

test("POST /api/blacklist adds emails", async () => {
  const res = await request(app)
    .post("/api/blacklist")
    .send({ emails: ["spam@example.com"] });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.body.added, 1);
});

test("GET /api/stats returns stats", async () => {
  const res = await request(app).get("/api/stats");
  assert.strictEqual(res.status, 200);
  assert.ok(res.body.total_leads >= 0);
  assert.ok(res.body.total_campaigns >= 0);
});