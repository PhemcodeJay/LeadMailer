/**
 * LeadProcessor — parse and process bulk lead input.
 */
const { Validator } = require("./validator");
const { LeadClassifier } = require("./lead-classifier");

const MAX_LEADS_PER_SESSION = 10000;

class LeadProcessor {
  /**
   * Parse raw text into individual items.
   * @param {string} text
   * @returns {string[]}
   */
  static parseInput(text) {
    const items = String(text).split(/[,\n\t ;|]+/);
    return items
      .map((item) => item.trim())
      .filter((item) => item && item.length > 2);
  }

  /**
   * Parse CSV content into items.
   * @param {string} content
   * @returns {string[]}
   */
  static parseCsv(content) {
    try {
      const text = String(content);
      const items = [];
      const lines = text.split(/\r?\n/);
      for (const line of lines) {
        const cells = line.split(",");
        for (const cell of cells) {
          const cellValue = cell.trim();
          if (cellValue && (cellValue.includes("@") || /\d/.test(cellValue))) {
            items.push(cellValue);
          }
        }
      }
      return items.slice(0, MAX_LEADS_PER_SESSION);
    } catch {
      return [];
    }
  }

  /**
   * Process a batch of items and store valid leads.
   * @param {string[]} items
   * @param {string} sessionId
   * @param {import('./storage-manager').StorageManager} storage
   * @param {string} source
   * @param {string} remoteAddr
   * @returns {object}
   */
  static processBulk(items, sessionId, storage, source = "bulk", remoteAddr = "") {
    const results = { valid: [], invalid: [], total: items.length };
    let validCount = 0;

    for (const item of items) {
      if (item.length > 254) {
        results.invalid.push({ value: item.slice(0, 50) + "...", reason: "Too long" });
        continue;
      }

      const isEmail = item.includes("@") && item.includes(".");
      const isPhone = !isEmail && /[\+]?[\d\s\-\(\)\.]{10,}/.test(item);

      if (isEmail) {
        const validation = Validator.validateEmail(item);
        if (validation.valid) {
          const domain = LeadClassifier.extractDomain(validation.normalized);
          const priority = LeadClassifier.getPriority(validation.role);
          const score = LeadClassifier.getScore(validation.role);
          const inserted = storage.insertLead(
            sessionId,
            "email",
            validation.normalized,
            domain,
            validation.role,
            priority,
            score,
            source
          );
          if (inserted) {
            results.valid.push({
              value: validation.normalized,
              type: "email",
              role: validation.role,
              priority,
              score,
              domain,
            });
            validCount++;
          } else {
            results.invalid.push({ value: item, reason: "Duplicate" });
          }
        } else {
          results.invalid.push({ value: item, reason: "Invalid email format" });
        }
      } else if (isPhone) {
        const validation = Validator.validatePhone(item);
        if (validation.valid) {
          const inserted = storage.insertLead(
            sessionId,
            "phone",
            validation.normalized,
            "phone",
            "contact",
            "medium",
            0.85,
            source
          );
          if (inserted) {
            results.valid.push({
              value: validation.normalized,
              type: "phone",
              role: "contact",
              priority: "medium",
              score: 0.85,
              domain: "phone",
            });
            validCount++;
          } else {
            results.invalid.push({ value: item, reason: "Duplicate" });
          }
        } else {
          results.invalid.push({ value: item, reason: "Invalid phone number" });
        }
      } else {
        results.invalid.push({ value: item, reason: "Invalid format" });
      }
    }

    storage.updateSession(sessionId, "processed", remoteAddr || "unknown", validCount);
    return results;
  }
}

module.exports = { LeadProcessor, MAX_LEADS_PER_SESSION };