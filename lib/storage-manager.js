/**
 * StorageManager — handles all data persistence (SQLite for leads, JSON files for MailerX data).
 */
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { DatabaseSync } = require("node:sqlite");

const ALLOWED_ATTACHMENT_EXTENSIONS = new Set([
  ".jpg", ".jpeg", ".png", ".gif", ".pdf", ".doc", ".docx", ".zip", ".txt", ".xlsx", ".xls",
]);

class StorageManager {
  /**
   * @param {object} options
   * @param {string} [options.baseDir] - Base directory for data (defaults to cwd)
   * @param {string} [options.leadDbPath] - Path to leads SQLite database
   */
  constructor(options = {}) {
    this.baseDir = options.baseDir || process.cwd();
    this.dataDir = path.join(this.baseDir, "data");
    this.templatesDir = path.join(this.dataDir, "templates");
    this.attachmentsDir = path.join(this.dataDir, "attachments");
    this.uploadsDir = path.join(this.dataDir, "uploads");
    this.configFile = path.join(this.dataDir, "config.json");
    this.blacklistFile = path.join(this.dataDir, "blacklist.json");
    this.campaignsFile = path.join(this.dataDir, "MailerX.db");
    this.leadDbPath = options.leadDbPath || path.join(this.baseDir, "leads.db");

    // Ensure directories exist
    for (const dir of [this.dataDir, this.templatesDir, this.attachmentsDir, this.uploadsDir]) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this._initDefaultConfig();
    this._initBlacklist();
    this._initLeadDb();
  }

  // ==================== LEAD DATABASE (SQLite) ====================

  _initLeadDb() {
    this.db = new DatabaseSync(this.leadDbPath);
    this.db.exec("PRAGMA journal_mode = WAL");
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        status TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        user_ip TEXT,
        total_leads INTEGER DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        type TEXT,
        value TEXT UNIQUE,
        domain TEXT,
        role TEXT,
        priority TEXT,
        confidence_score REAL,
        source TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE TABLE IF NOT EXISTS web_requests (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT,
        url TEXT,
        status_code INTEGER,
        leads_found INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    // Add source column if missing (migration)
    const cols = this.db.prepare("PRAGMA table_info(leads)").all();
    if (!cols.some((c) => c.name === "source")) {
      this.db.exec('ALTER TABLE leads ADD COLUMN source TEXT DEFAULT "bulk"');
    }
  }

  /**
   * Create a new session.
   * @param {string} userIp
   * @returns {string} session ID
   */
  createSession(userIp = "") {
    const sessionId = crypto.randomUUID();
    this.db
      .prepare("INSERT INTO sessions (id, status, user_ip) VALUES (?, ?, ?)")
      .run(sessionId, "new", userIp);
    return sessionId;
  }

  /**
   * Update a session's status and lead count.
   */
  updateSession(sessionId, status, userIp, totalLeads) {
    this.db
      .prepare(
        "INSERT OR REPLACE INTO sessions (id, status, user_ip, total_leads) VALUES (?, ?, ?, ?)"
      )
      .run(sessionId, status, userIp, totalLeads);
  }

  /**
   * Insert a lead, returns true if inserted (not duplicate).
   */
  insertLead(sessionId, type, value, domain, role, priority, score, source) {
    try {
      const result = this.db
        .prepare(
          "INSERT OR IGNORE INTO leads (session_id, type, value, domain, role, priority, confidence_score, source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
        )
        .run(sessionId, type, value, domain, role, priority, score, source);
      return result.changes > 0;
    } catch {
      return false;
    }
  }

  /**
   * Record a web request.
   */
  recordWebRequest(sessionId, url, statusCode, leadsFound) {
    this.db
      .prepare(
        "INSERT INTO web_requests (session_id, url, status_code, leads_found) VALUES (?, ?, ?, ?)"
      )
      .run(sessionId, url, statusCode, leadsFound);
  }

  /**
   * Get leads for a session.
   * @param {string} sessionId
   * @returns {Array<object>}
   */
  getLeads(sessionId) {
    const rows = this.db
      .prepare(
        "SELECT type, value, domain, role, priority, confidence_score, source FROM leads WHERE session_id = ?"
      )
      .all(sessionId);
    return rows.map((r) => ({
      type: r.type,
      value: r.value,
      domain: r.domain || "unknown",
      role: r.role || "generic",
      priority: r.priority || "low",
      confidence_score: r.confidence_score || 0.5,
      source: r.source || "bulk",
    }));
  }

  /**
   * Get session info.
   * @param {string} sessionId
   * @returns {object|null}
   */
  getSession(sessionId) {
    const row = this.db
      .prepare("SELECT status, total_leads FROM sessions WHERE id = ?")
      .get(sessionId);
    if (!row) return null;
    const count = this.db
      .prepare("SELECT COUNT(*) as count FROM leads WHERE session_id = ?")
      .get(sessionId);
    return {
      session_id: sessionId,
      status: row.status,
      total_leads: count.count || row.total_leads || 0,
    };
  }

  /**
   * Delete a session and all its leads.
   * @param {string} sessionId
   * @param {string} userIp
   * @returns {boolean}
   */
  deleteSession(sessionId, userIp) {
    const owner = this.db
      .prepare("SELECT user_ip FROM sessions WHERE id = ?")
      .get(sessionId);
    if (!owner || owner.user_ip !== userIp) return false;
    this.db.prepare("DELETE FROM leads WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM web_requests WHERE session_id = ?").run(sessionId);
    this.db.prepare("DELETE FROM sessions WHERE id = ?").run(sessionId);
    return true;
  }

  /**
   * Get lead stats.
   * @returns {object}
   */
  getLeadStats() {
    const totalSessions = this.db.prepare("SELECT COUNT(*) as count FROM sessions").get().count;
    const totalLeads = this.db.prepare("SELECT COUNT(*) as count FROM leads").get().count;
    const totalEmails = this.db
      .prepare("SELECT COUNT(*) as count FROM leads WHERE type = 'email'")
      .get().count;
    const totalPhones = this.db
      .prepare("SELECT COUNT(*) as count FROM leads WHERE type = 'phone'")
      .get().count;
    const totalDomains = this.db
      .prepare("SELECT COUNT(DISTINCT domain) as count FROM leads WHERE domain NOT IN ('unknown', 'phone')")
      .get().count;
    return {
      sessions: totalSessions,
      leads: totalLeads,
      emails: totalEmails,
      phones: totalPhones,
      domains: totalDomains,
    };
  }

  // ==================== CONFIG ====================

  _getDefaultAdvanced() {
    return {
      method: "SMTP",
      useAuthentication: true,
      useProxy: false,
      proxyType: "SOCKS5",
      smtpHost: "",
      smtpPort: 587,
      smtpSecure: false,
      secureProtocol: "TLSv1_2_method",
      proxyHost: "",
      proxyPort: 1080,
      proxyUsername: "",
      proxyPassword: "",
      useConcurrency: false,
      concurrencyLimit: 5,
      includeAttachments: true,
      attachmentPath: "",
      ENABLE_ENCRYPTION: false,
      Encode_Attachment: false,
    };
  }

  _getDefaultConfig() {
    return {
      smtp: { server: "", port: 587, username: "", password: "", use_tls: true, use_ssl: false },
      email: { from_email: "", from_name: "LeadMailer Suite", reply_to: "" },
      campaign: {
        rate_limit: 5,
        max_emails_per_batch: 50,
        parallel_workers: 3,
        cta_url: "",
        unsubscribe_url: "",
      },
      advanced: this._getDefaultAdvanced(),
    };
  }

  _initDefaultConfig() {
    if (!fs.existsSync(this.configFile)) {
      this.saveConfig(this._getDefaultConfig());
    }
  }

  _initBlacklist() {
    if (!fs.existsSync(this.blacklistFile)) {
      fs.writeFileSync(
        this.blacklistFile,
        JSON.stringify({ emails: [], updated_at: new Date().toISOString() })
      );
    }
  }

  loadConfig() {
    try {
      if (fs.existsSync(this.configFile)) {
        const config = JSON.parse(fs.readFileSync(this.configFile, "utf8"));
        config.campaign = config.campaign || {};
        config.campaign.cta_url = config.campaign.cta_url || "";
        config.campaign.unsubscribe_url = config.campaign.unsubscribe_url || "";
        if (!config.advanced) {
          config.advanced = this._getDefaultAdvanced();
        } else {
          for (const [key, val] of Object.entries(this._getDefaultAdvanced())) {
            if (config.advanced[key] === undefined) config.advanced[key] = val;
          }
        }
        return config;
      }
    } catch (err) {
      console.error(`Failed to load config: ${err.message}`);
    }
    return this._getDefaultConfig();
  }

  saveConfig(config) {
    try {
      fs.writeFileSync(this.configFile, JSON.stringify(config, null, 2));
      return true;
    } catch (err) {
      console.error(`Failed to save config: ${err.message}`);
      return false;
    }
  }

  // ==================== TEMPLATES ====================

  listTemplates() {
    const templates = [];
    try {
      for (const file of fs.readdirSync(this.templatesDir)) {
        if (file.endsWith(".html")) {
          const filePath = path.join(this.templatesDir, file);
          const stat = fs.statSync(filePath);
          const templateName = file.replace(".html", "");
          const attachments = this.getTemplateAttachments(templateName);
          templates.push({
            name: templateName,
            filename: file,
            size_kb: Math.round(stat.size / 1024 * 10) / 10,
            modified: stat.mtimeMs,
            modified_str: formatDate(stat.mtime),
            attachments,
            attachment_count: attachments.length,
          });
        }
      }
    } catch (err) {
      console.error(`Failed to list templates: ${err.message}`);
    }
    return templates.sort((a, b) => b.modified - a.modified);
  }

  getTemplateAttachments(templateName) {
    const attachments = [];
    try {
      const templateAttachDir = path.join(this.attachmentsDir, safeName(templateName));
      if (fs.existsSync(templateAttachDir)) {
        for (const file of fs.readdirSync(templateAttachDir)) {
          const filePath = path.join(templateAttachDir, file);
          if (fs.statSync(filePath).isFile()) {
            const stat = fs.statSync(filePath);
            const ext = path.extname(file).toLowerCase();
            const isImage = [".jpg", ".jpeg", ".png", ".gif"].includes(ext);
            attachments.push({
              filename: file,
              size_kb: Math.round(stat.size / 1024 * 10) / 10,
              size_bytes: stat.size,
              type: isImage ? "image" : "document",
              mime_type: getMimeType(file),
              modified: stat.mtimeMs,
            });
          }
        }
      }
    } catch (err) {
      console.error(`Failed to get template attachments: ${err.message}`);
    }
    return attachments;
  }

  saveTemplateAttachment(templateName, file) {
    try {
      const safeTemplateName = safeName(templateName);
      const filename = safeName(file.originalname);
      if (!filename) return null;
      const ext = path.extname(filename).toLowerCase();
      if (!ALLOWED_ATTACHMENT_EXTENSIONS.has(ext)) return null;
      const templateAttachDir = path.join(this.attachmentsDir, safeTemplateName);
      fs.mkdirSync(templateAttachDir, { recursive: true });
      fs.writeFileSync(path.join(templateAttachDir, filename), file.buffer);
      return filename;
    } catch (err) {
      console.error(`Failed to save attachment: ${err.message}`);
      return null;
    }
  }

  deleteTemplateAttachment(templateName, filename) {
    try {
      const filePath = path.join(this.attachmentsDir, safeName(templateName), safeName(filename));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        const attachDir = path.join(this.attachmentsDir, safeName(templateName));
        if (fs.existsSync(attachDir) && fs.readdirSync(attachDir).length === 0) {
          fs.rmdirSync(attachDir);
        }
        return true;
      }
    } catch (err) {
      console.error(`Failed to delete attachment: ${err.message}`);
    }
    return false;
  }

  getTemplate(name) {
    try {
      const filePath = path.join(this.templatesDir, `${safeName(name)}.html`);
      if (fs.existsSync(filePath)) {
        return fs.readFileSync(filePath, "utf8");
      }
    } catch (err) {
      console.error(`Failed to get template ${name}: ${err.message}`);
    }
    return null;
  }

  saveTemplate(name, content) {
    try {
      const safeTemplateName = safeName(name);
      if (!safeTemplateName) return false;
      fs.writeFileSync(path.join(this.templatesDir, `${safeTemplateName}.html`), content, "utf8");
      return true;
    } catch (err) {
      console.error(`Failed to save template ${name}: ${err.message}`);
      return false;
    }
  }

  deleteTemplate(name) {
    try {
      const safeTemplateName = safeName(name);
      const templatePath = path.join(this.templatesDir, `${safeTemplateName}.html`);
      if (fs.existsSync(templatePath)) {
        fs.unlinkSync(templatePath);
      }
      const attachDir = path.join(this.attachmentsDir, safeTemplateName);
      if (fs.existsSync(attachDir)) {
        fs.rmSync(attachDir, { recursive: true, force: true });
      }
      return true;
    } catch (err) {
      console.error(`Failed to delete template ${name}: ${err.message}`);
      return false;
    }
  }

  // ==================== RECIPIENT FILES ====================

  listRecipientFiles() {
    const files = [];
    try {
      fs.mkdirSync(this.uploadsDir, { recursive: true });
      for (const file of fs.readdirSync(this.uploadsDir)) {
        if (file.endsWith(".csv")) {
          const filePath = path.join(this.uploadsDir, file);
          const stat = fs.statSync(filePath);
          const rowCount = this.countRecipients(file);
          files.push({
            name: file,
            display_name: file.replace(".csv", "").replace(/_/g, " "),
            size_mb: Math.round((stat.size / (1024 * 1024)) * 100) / 100,
            row_count: Math.max(0, rowCount),
            modified: stat.mtimeMs,
            modified_str: formatDate(stat.mtime),
          });
        }
      }
    } catch (err) {
      console.error(`Failed to list recipient files: ${err.message}`);
    }
    return files.sort((a, b) => b.modified - a.modified);
  }

  saveRecipientFile(fileData, originalFilename) {
    try {
      let safeFilename = safeName(originalFilename);
      if (!safeFilename.endsWith(".csv")) safeFilename += ".csv";
      const finalName = `${formatTimestamp(new Date())}_${safeFilename}`;
      fs.writeFileSync(path.join(this.uploadsDir, finalName), fileData.buffer);
      return finalName;
    } catch (err) {
      console.error(`Failed to save recipient file: ${err.message}`);
      return null;
    }
  }

  deleteRecipientFile(filename) {
    try {
      const filePath = path.join(this.uploadsDir, safeName(filename));
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        return true;
      }
    } catch (err) {
      console.error(`Failed to delete recipient file: ${err.message}`);
    }
    return false;
  }

  getRecipients(filename, limit = 100000) {
    const recipients = [];
    try {
      const filePath = path.join(this.uploadsDir, safeName(filename));
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        const lines = content.split(/\r?\n/);
        if (lines.length > 0) {
          const headers = lines[0].split(",").map((h) => h.trim().toLowerCase());
          const emailIdx = headers.indexOf("email");
          const nameIdx = headers.indexOf("name");
          const companyIdx = headers.indexOf("company");
          const cityIdx = headers.indexOf("city");
          if (emailIdx >= 0) {
            for (let i = 1; i < lines.length && recipients.length < limit; i++) {
              const cells = lines[i].split(",");
              const email = (cells[emailIdx] || "").trim().toLowerCase();
              if (email && email.includes("@")) {
                recipients.push({
                  email,
                  name: (cells[nameIdx] || "").trim() || email.split("@")[0],
                  company: (cells[companyIdx] || "").trim(),
                  city: (cells[cityIdx] || "").trim(),
                });
              }
            }
          }
        }
      }
    } catch (err) {
      console.error(`Failed to get recipients: ${err.message}`);
    }
    return recipients;
  }

  countRecipients(filename) {
    try {
      const filePath = path.join(this.uploadsDir, safeName(filename));
      if (fs.existsSync(filePath)) {
        const content = fs.readFileSync(filePath, "utf8");
        return Math.max(0, content.split(/\r?\n/).filter((l) => l.trim()).length - 1);
      }
    } catch {
      // ignore
    }
    return 0;
  }

  getRecipientSample(filename, limit = 10) {
    return this.getRecipients(filename, limit);
  }

  // ==================== CAMPAIGNS ====================

  loadCampaigns() {
    try {
      if (fs.existsSync(this.campaignsFile)) {
        return JSON.parse(fs.readFileSync(this.campaignsFile, "utf8")).campaigns || [];
      }
    } catch (err) {
      console.error(`Failed to load campaigns: ${err.message}`);
    }
    return [];
  }

  saveCampaign(campaign) {
    try {
      const campaigns = this.loadCampaigns();
      const existingIdx = campaigns.findIndex((c) => c.id === campaign.id);
      if (existingIdx >= 0) {
        campaigns[existingIdx] = campaign;
      } else {
        campaigns.push(campaign);
      }
      fs.writeFileSync(this.campaignsFile, JSON.stringify({ campaigns }, null, 2));
      return true;
    } catch (err) {
      console.error(`Failed to save campaign: ${err.message}`);
      return false;
    }
  }

  deleteCampaign(campaignId) {
    try {
      const campaigns = this.loadCampaigns().filter((c) => c.id !== campaignId);
      fs.writeFileSync(this.campaignsFile, JSON.stringify({ campaigns }, null, 2));
      return true;
    } catch (err) {
      console.error(`Failed to delete campaign: ${err.message}`);
      return false;
    }
  }

  // ==================== BLACKLIST ====================

  loadBlacklist() {
    try {
      if (fs.existsSync(this.blacklistFile)) {
        return JSON.parse(fs.readFileSync(this.blacklistFile, "utf8")).emails || [];
      }
    } catch {
      // ignore
    }
    return [];
  }

  saveBlacklist(emails) {
    try {
      fs.writeFileSync(
        this.blacklistFile,
        JSON.stringify(
          { emails: [...new Set(emails)].sort(), updated_at: new Date().toISOString() },
          null,
          2
        )
      );
      return true;
    } catch (err) {
      console.error(`Failed to save blacklist: ${err.message}`);
      return false;
    }
  }

  addToBlacklist(emails) {
    const current = this.loadBlacklist();
    const newEmails = emails
      .filter((e) => e && e.includes("@"))
      .map((e) => e.toLowerCase().trim());
    this.saveBlacklist([...current, ...newEmails]);
    return newEmails.length;
  }

  removeFromBlacklist(emails) {
    const current = this.loadBlacklist();
    const toRemove = new Set(emails.map((e) => e.toLowerCase().trim()));
    const updated = current.filter((e) => !toRemove.has(e));
    this.saveBlacklist(updated);
    return current.length - updated.length;
  }

  close() {
    if (this.db) this.db.close();
  }
}

// ==================== HELPERS ====================

function safeName(name) {
  return String(name || "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^_+|_+$/g, "");
}

function formatDate(date) {
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatTimestamp(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".png": "image/png",
    ".gif": "image/gif",
    ".pdf": "application/pdf",
    ".doc": "application/msword",
    ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ".zip": "application/zip",
    ".txt": "text/plain",
    ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    ".xls": "application/vnd.ms-excel",
  };
  return mimeTypes[ext] || "application/octet-stream";
}

module.exports = { StorageManager, ALLOWED_ATTACHMENT_EXTENSIONS };