/**
 * LeadMailer Suite — unified lead collection and email marketing platform.
 * Run with: node app.js
 */
const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const multer = require("multer");
const rateLimit = require("express-rate-limit");

const { StorageManager } = require("./lib/storage-manager");
const { LeadClassifier } = require("./lib/lead-classifier");
const { Validator } = require("./lib/validator");
const { WebExtractor } = require("./lib/web-extractor");
const { LeadProcessor } = require("./lib/lead-processor");
const { LeadSorter } = require("./lib/lead-sorter");
const { ExportManager } = require("./lib/export-manager");
const { MXResolver } = require("./lib/mx-resolver");
const { EmailSender } = require("./lib/email-sender");
const { TemplateRenderer } = require("./lib/template-renderer");
const { CampaignWorker } = require("./lib/campaign-worker");

const app = express();
const storage = new StorageManager();
const worker = new CampaignWorker(storage);

// ==================== MIDDLEWARE ====================
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.static(path.join(__dirname, "public")));

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

const limiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 500, standardHeaders: true, legacyHeaders: false });
const strictLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use("/api", limiter);

// ==================== LEADFORGE ROUTES ====================

// Create a new session
app.post("/api/create-session", (req, res) => {
  const sessionId = storage.createSession(req.ip);
  res.json({ session_id: sessionId });
});

// Validate text input
app.post("/api/text-validator", strictLimiter, (req, res) => {
  const data = req.body || {};
  const text = data.text || "";
  const sessionId = data.session_id || storage.createSession(req.ip);
  if (!text) return res.status(400).json({ error: "No text provided" });
  const items = LeadProcessor.parseInput(text);
  if (!items.length) return res.status(400).json({ error: "No valid items found" });
  const results = LeadProcessor.processBulk(items, sessionId, storage, "text", req.ip);
  res.json({
    success: true,
    session_id: sessionId,
    stats: { total: results.total, valid: results.valid.length, invalid: results.invalid.length },
    valid_preview: results.valid.slice(0, 20),
    invalid_preview: results.invalid.slice(0, 10),
  });
});

// Validate CSV upload
app.post("/api/csv-validator", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  const sessionId = req.body.session_id || storage.createSession(req.ip);
  const content = req.file.buffer.toString("utf8");
  const items = LeadProcessor.parseCsv(content);
  if (!items.length) return res.status(400).json({ error: "No valid data found" });
  const results = LeadProcessor.processBulk(items, sessionId, storage, "csv", req.ip);
  res.json({
    success: true,
    session_id: sessionId,
    stats: { total: results.total, valid: results.valid.length, invalid: results.invalid.length },
    valid_preview: results.valid.slice(0, 20),
    invalid_preview: results.invalid.slice(0, 10),
  });
});

// Web extractor
app.post("/api/web-extractor", async (req, res) => {
  const data = req.body || {};
  const urls = data.urls || [];
  const sessionId = data.session_id || storage.createSession(req.ip);
  if (!urls.length || urls.length > 20) {
    return res.status(400).json({ error: "Max 20 URLs allowed" });
  }
  const results = [];
  const concurrency = 3;
  const queue = [...urls];
  const workers = Array.from({ length: Math.min(concurrency, queue.length) }, async () => {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;
      const result = await WebExtractor.crawlUrl(url, storage, sessionId);
      results.push(result);
    }
  });
  await Promise.all(workers);
  res.json({
    success: true,
    session_id: sessionId,
    results,
    total_urls: urls.length,
    total_leads_found: results.reduce((sum, r) => sum + (r.contacts_found || 0), 0),
  });
});

// Sort leads
app.get("/api/sorter/:sessionId", (req, res) => {
  const sortType = req.query.type || "priority";
  if (!["priority", "role", "domain", "type"].includes(sortType)) {
    return res.status(400).json({ error: "Invalid sort type" });
  }
  const leads = storage.getLeads(req.params.sessionId);
  if (!leads.length) return res.status(404).json({ error: "No leads found" });
  const sorters = {
    priority: LeadSorter.sortByPriority,
    role: LeadSorter.sortByRole,
    domain: LeadSorter.sortByDomain,
    type: LeadSorter.sortByType,
  };
  const sortedData = sorters[sortType](leads);
  res.json({
    sort_type: sortType,
    groups: Object.fromEntries(Object.entries(sortedData).map(([k, v]) => [k, v.length])),
    leads: sortedData,
    total: leads.length,
  });
});

// Export leads
app.get("/api/export/:sessionId", (req, res) => {
  const formatType = req.query.format || "csv";
  const sortBy = req.query.sort_by || "priority";
  if (!["csv", "excel", "json"].includes(formatType)) {
    return res.status(400).json({ error: "Invalid format" });
  }
  let leads = storage.getLeads(req.params.sessionId);
  if (!leads.length) return res.status(404).json({ error: "No leads found" });
  const sorters = {
    priority: LeadSorter.sortByPriority,
    role: LeadSorter.sortByRole,
    domain: LeadSorter.sortByDomain,
  };
  if (sorters[sortBy]) {
    const sortedGroups = sorters[sortBy](leads);
    leads = Object.values(sortedGroups).flat();
  }
  if (formatType === "csv") {
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=leads_${req.params.sessionId}.csv`);
    res.send(ExportManager.toCsv(leads));
  } else if (formatType === "excel") {
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename=leads_${req.params.sessionId}.xlsx`);
    res.send(ExportManager.toExcel(leads));
  } else {
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", `attachment; filename=leads_${req.params.sessionId}.json`);
    res.send(ExportManager.toJson(leads));
  }
});

// Session management
app.get("/api/session/:sessionId", (req, res) => {
  const session = storage.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "Session not found" });
  res.json(session);
});

app.delete("/api/session/:sessionId", (req, res) => {
  if (storage.deleteSession(req.params.sessionId, req.ip)) {
    res.json({ success: true });
  } else {
    res.status(403).json({ error: "Unauthorized" });
  }
});

// Lead stats
app.get("/api/lead-stats", (req, res) => {
  res.json(storage.getLeadStats());
});

// ==================== MAILERX ROUTES ====================

// Templates
app.get("/api/templates", (req, res) => {
  res.json(storage.listTemplates());
});

app.get("/api/templates/:name", (req, res) => {
  const content = storage.getTemplate(req.params.name);
  if (content) return res.json({ name: req.params.name, content });
  res.status(404).json({ error: "Template not found" });
});

app.post("/api/templates", (req, res) => {
  try {
    const { name, content } = req.body || {};
    if (!name || !name.trim()) return res.status(400).json({ error: "Template name required" });
    if (storage.saveTemplate(name.trim(), content || "")) {
      res.json({ success: true, message: "Template saved" });
    } else {
      res.status(500).json({ error: "Failed to save template" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:name", (req, res) => {
  if (storage.deleteTemplate(req.params.name)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Template not found" });
  }
});

// Template attachments
app.get("/api/templates/:name/attachments", (req, res) => {
  res.json(storage.getTemplateAttachments(req.params.name));
});

app.post("/api/templates/:name/attachments", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    const filename = storage.saveTemplateAttachment(req.params.name, req.file);
    if (filename) {
      res.json({ success: true, filename });
    } else {
      res.status(400).json({ error: "Invalid file type" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/templates/:name/attachments/:filename", (req, res) => {
  if (storage.deleteTemplateAttachment(req.params.name, req.params.filename)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Attachment not found" });
  }
});

// Template preview
app.get("/api/templates/:name/preview", (req, res) => {
  const content = storage.getTemplate(req.params.name);
  if (content) {
    const rendered = TemplateRenderer.render(content, {
      name: "John Doe",
      email: "john@example.com",
      company: "Acme Inc",
      city: "New York",
      cta_url: "#",
      unsubscribe_url: "#",
    });
    res.type("html").send(rendered);
  } else {
    res.status(404).send("Template not found");
  }
});

// Recipient files
app.get("/api/recipient-files", (req, res) => {
  res.json(storage.listRecipientFiles());
});

app.post("/api/upload-csv", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    const filename = storage.saveRecipientFile(req.file, req.file.originalname);
    if (!filename) return res.status(500).json({ error: "Failed to save file" });
    const total = storage.countRecipients(filename);
    const sample = storage.getRecipientSample(filename, 5);
    res.json({ success: true, filename, total_rows: total, valid_rows: total, sample });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete("/api/recipient-files/:filename", (req, res) => {
  if (storage.deleteRecipientFile(req.params.filename)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "File not found" });
  }
});

app.get("/api/recipient-files/:filename/preview", (req, res) => {
  const limit = parseInt(req.query.limit) || 20;
  const recipients = storage.getRecipients(req.params.filename, limit);
  res.json({ recipients, count: recipients.length });
});

// Campaigns
app.get("/api/campaigns", (req, res) => {
  const campaigns = storage.loadCampaigns();
  for (const c of campaigns) {
    if (worker.activeCampaigns.has(c.id)) c.status = "running";
  }
  res.json({ campaigns });
});

app.delete("/api/campaigns/:campaignId", (req, res) => {
  worker.stopCampaign(req.params.campaignId);
  if (storage.deleteCampaign(req.params.campaignId)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Campaign not found" });
  }
});

app.post("/api/campaign/start", (req, res) => {
  try {
    const data = req.body || {};
    for (const field of ["recipients_file", "template", "subject"]) {
      if (!data[field]) return res.status(400).json({ error: `Missing field: ${field}` });
    }

    const config = storage.loadConfig();
    const advanced = config.advanced || {};
    const method = (advanced.method || "SMTP").toUpperCase();

    if (method === "SMTP") {
      const smtpHost = advanced.smtpHost || config.smtp?.server || "";
      if (!smtpHost) {
        return res.status(400).json({ error: "SMTP not configured - please setup SMTP settings first" });
      }
      if (advanced.useAuthentication !== false && !config.smtp?.password) {
        return res.status(400).json({ error: "SMTP password not set - please configure SMTP settings" });
      }
    }

    const templateContent = storage.getTemplate(data.template);
    if (!templateContent) return res.status(404).json({ error: "Template not found" });

    const recipientsCount = storage.countRecipients(data.recipients_file);
    if (recipientsCount === 0) {
      return res.status(400).json({ error: "No valid recipients found in file" });
    }

    const includeAttachments = advanced.includeAttachments !== false;
    const attachmentPaths = [];
    if (includeAttachments) {
      for (const attach of storage.getTemplateAttachments(data.template)) {
        const filePath = path.join(storage.attachmentsDir, safeName(data.template), attach.filename);
        if (fs.existsSync(filePath)) {
          attachmentPaths.push({
            filename: attach.filename,
            file_path: filePath,
            mime_type: attach.mime_type || "application/octet-stream",
          });
        }
      }
    }

    const campaignId = crypto.randomUUID().slice(0, 8);
    const campaign = {
      id: campaignId,
      name: data.campaign_name || `Campaign_${campaignId}`,
      subject: data.subject,
      status: "queued",
      recipients_file: data.recipients_file,
      template: data.template,
      reply_to: data.reply_to || "",
      has_attachments: attachmentPaths.length > 0,
      attachment_count: attachmentPaths.length,
      total_recipients: recipientsCount,
      created_at: new Date().toISOString(),
      stats: { sent: 0, failed: 0 },
      method,
    };
    storage.saveCampaign(campaign);

    if (data.rate_limit) {
      config.campaign.rate_limit = data.rate_limit;
    }

    const success = worker.startCampaign({
      campaignId,
      config,
      recipientsFile: data.recipients_file,
      templateContent,
      subject: data.subject,
      replyTo: data.reply_to || null,
      attachments: attachmentPaths.length ? attachmentPaths : null,
    });

    if (success) {
      res.json({ success: true, campaign_id: campaignId });
    } else {
      res.status(500).json({ error: "Failed to start campaign" });
    }
  } catch (err) {
    console.error(`Start campaign error: ${err.message}`);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/campaign/:campaignId/stop", (req, res) => {
  if (worker.stopCampaign(req.params.campaignId)) {
    res.json({ success: true });
  } else {
    res.status(404).json({ error: "Campaign not found or not running" });
  }
});

app.get("/api/campaign/:campaignId/results", (req, res) => {
  const result = worker.getCampaignStatus(req.params.campaignId);
  if (result) {
    res.json({ campaign_id: req.params.campaignId, summary: result });
  } else {
    res.status(404).json({ error: "Campaign not found" });
  }
});

// Stats
app.get("/api/stats", (req, res) => {
  const campaigns = storage.loadCampaigns();
  const emailsSent = campaigns.reduce((sum, c) => sum + (c.stats?.sent || 0), 0);
  const emailsFailed = campaigns.reduce((sum, c) => sum + (c.stats?.failed || 0), 0);
  const totalRecipients = campaigns.reduce((sum, c) => sum + (c.total_recipients || 0), 0);
  const deliveryRate = totalRecipients > 0 ? Math.round((emailsSent / totalRecipients) * 1000) / 10 : 0;
  const leadStats = storage.getLeadStats();
  res.json({
    emails_sent: emailsSent,
    emails_failed: emailsFailed,
    total_recipients: totalRecipients,
    total_campaigns: campaigns.length,
    active_campaigns: campaigns.filter((c) => c.status === "running").length,
    delivery_rate: deliveryRate,
    total_leads: leadStats.leads,
    lead_emails: leadStats.emails,
    lead_sessions: leadStats.sessions,
  });
});

// Analytics
app.get("/api/analytics", (req, res) => {
  const campaigns = storage.loadCampaigns();
  const dailyStats = {};
  for (const c of campaigns) {
    if (c.completed_at) {
      const date = c.completed_at.slice(0, 10);
      if (!dailyStats[date]) dailyStats[date] = { sent: 0, failed: 0 };
      dailyStats[date].sent += c.stats?.sent || 0;
      dailyStats[date].failed += c.stats?.failed || 0;
    }
  }
  res.json({
    total_campaigns: campaigns.length,
    daily_stats: Object.entries(dailyStats)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, stats]) => ({ date, sent: stats.sent, failed: stats.failed })),
  });
});

// Blacklist
app.get("/api/blacklist", (req, res) => {
  const items = storage.loadBlacklist();
  res.json({ items, total: items.length });
});

app.post("/api/blacklist", (req, res) => {
  const data = req.body || {};
  let emails = data.emails || [];
  if (typeof emails === "string") emails = [emails];
  const added = storage.addToBlacklist(emails);
  res.json({ success: true, added });
});

app.post("/api/blacklist/bulk", (req, res) => {
  const data = req.body || {};
  const added = storage.addToBlacklist(data.emails || []);
  res.json({ success: true, added });
});

app.delete("/api/blacklist", (req, res) => {
  const data = req.body || {};
  let emails = data.emails || [];
  if (typeof emails === "string") emails = [emails];
  const removed = storage.removeFromBlacklist(emails);
  res.json({ success: true, removed });
});

app.post("/api/blacklist/import", upload.single("file"), (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: "No file" });
    const content = req.file.buffer.toString("utf8");
    const emails = content
      .split(/\r?\n/)
      .map((line) => line.split(",")[0].trim())
      .filter((line) => line.includes("@"));
    const added = storage.addToBlacklist(emails);
    res.json({ success: true, new: added, total: storage.loadBlacklist().length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get("/api/blacklist/export", (req, res) => {
  const emails = storage.loadBlacklist();
  const csv = "email\n" + emails.map((e) => e).join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=blacklist.csv");
  res.send(csv);
});

// Config
app.get("/api/config", (req, res) => {
  const config = storage.loadConfig();
  if (config.smtp?.password) config.smtp.password = "***";
  if (config.advanced?.proxyPassword) config.advanced.proxyPassword = "***";
  res.json(config);
});

app.post("/api/config", (req, res) => {
  try {
    const newConfig = req.body || {};
    const current = storage.loadConfig();
    if (newConfig.smtp?.password === "***") {
      newConfig.smtp.password = current.smtp?.password || "";
    }
    if (newConfig.advanced?.proxyPassword === "***") {
      newConfig.advanced.proxyPassword = current.advanced?.proxyPassword || "";
    }
    if (storage.saveConfig(newConfig)) {
      res.json({ success: true });
    } else {
      res.status(500).json({ error: "Save failed" });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Test SMTP
app.post("/api/test-smtp", async (req, res) => {
  try {
    const config = req.body || {};
    const current = storage.loadConfig();
    if (config.smtp?.password === "***") {
      config.smtp.password = current.smtp?.password || "";
    }
    if (config.advanced?.proxyPassword === "***") {
      config.advanced.proxyPassword = current.advanced?.proxyPassword || "";
    }
    const sender = new EmailSender(config);
    const result = await sender.testConnection();
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

// MX lookup
app.post("/api/mx-lookup", async (req, res) => {
  try {
    const data = req.body || {};
    const domain = data.domain || "";
    if (!domain) return res.status(400).json({ error: "Domain required" });
    const mxServer = await MXResolver.getMxServer(domain);
    if (mxServer) {
      res.json({ success: true, mx_server: mxServer });
    } else {
      res.status(404).json({ success: false, message: `No MX record found for ${domain}` });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "healthy", timestamp: new Date().toISOString() });
});

// ==================== MAIN ====================
const PORT = parseInt(process.env.PORT) || 5000;

if (require.main === module) {
  app.listen(PORT, "0.0.0.0", () => {
    console.log("=".repeat(60));
    console.log("  LeadMailer Suite — Combined Lead + Email Platform");
    console.log("=".repeat(60));
    console.log("  Lead Collection: Text, CSV, Web Scraper");
    console.log("  Email Sending: SMTP | MX Direct");
    console.log(`  Running on: http://0.0.0.0:${PORT}`);
    console.log("=".repeat(60));
  });
}

module.exports = { app, storage, worker };

// Helper
function safeName(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");
}