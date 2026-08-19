/**
 * WebExtractor — scrape contact details from websites.
 */
const axios = require("axios");
const cheerio = require("cheerio");

const USER_AGENTS = [
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36",
];

const EMAIL_REGEX = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_REGEX = /[\+]?[\d\s\-\(\)\.]{10,}/g;

class WebExtractor {
  /**
   * Extract emails and phone numbers from HTML content.
   * @param {string} html
   * @returns {{emails: string[], phones: string[]}}
   */
  static extractContacts(html) {
    const emails = new Set();
    const phones = new Set();

    const emailMatches = String(html).match(EMAIL_REGEX) || [];
    for (const email of emailMatches) {
      if (email.length < 100) emails.add(email.toLowerCase());
    }

    const phoneMatches = String(html).match(PHONE_REGEX) || [];
    for (const phone of phoneMatches) {
      if (phone.length > 8 && phone.length < 25) phones.add(phone.trim());
    }

    return { emails: [...emails], phones: [...phones] };
  }

  /**
   * Fetch a URL and return its HTML content.
   * @param {string} url
   * @param {number} timeout
   * @returns {Promise<string|null>}
   */
  static async safeRequest(url, timeout = 12000) {
    try {
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        url = "https://" + url;
      }
      const userAgent = USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
      const response = await axios.get(url, {
        timeout,
        headers: { "User-Agent": userAgent },
        validateStatus: (status) => status >= 200 && status < 300,
      });
      return response.data;
    } catch {
      return null;
    }
  }

  /**
   * Crawl a URL and extract contacts.
   * @param {string} url
   * @param {import('./storage-manager').StorageManager} storage
   * @param {string} sessionId
   * @returns {Promise<object>}
   */
  static async crawlUrl(url, storage, sessionId) {
    const result = {
      url,
      emails: [],
      phones: [],
      status: "error",
      contacts_found: 0,
    };

    const html = await WebExtractor.safeRequest(url);
    if (!html) return result;

    const { emails, phones } = WebExtractor.extractContacts(html);
    result.status = "success";
    result.contacts_found = emails.length + phones.length;

    // Store in database
    const { Validator } = require("./validator");
    const { LeadClassifier } = require("./lead-classifier");

    for (const email of emails.slice(0, 100)) {
      const validation = Validator.validateEmail(email);
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
          url
        );
        if (inserted) result.emails.push(validation.normalized);
      }
    }

    for (const phone of phones.slice(0, 100)) {
      const validation = Validator.validatePhone(phone);
      if (validation.valid) {
        const inserted = storage.insertLead(
          sessionId,
          "phone",
          validation.normalized,
          "phone",
          "contact",
          "medium",
          0.85,
          url
        );
        if (inserted) result.phones.push(validation.normalized);
      }
    }

    storage.recordWebRequest(sessionId, url, 200, result.contacts_found);
    return result;
  }
}

module.exports = { WebExtractor, EMAIL_REGEX, PHONE_REGEX, USER_AGENTS };