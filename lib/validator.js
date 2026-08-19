/**
 * Validator — validates email addresses and phone numbers.
 */
const { LeadClassifier } = require("./lead-classifier");
const { parsePhoneNumberFromString } = require("libphonenumber-js");

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

class Validator {
  /**
   * Validate an email address.
   * @param {string} email
   * @returns {{valid: boolean, normalized?: string, role?: string}}
   */
  static validateEmail(email) {
    try {
      const normalized = String(email).trim().toLowerCase();
      if (!EMAIL_REGEX.test(normalized)) {
        return { valid: false };
      }
      const role = LeadClassifier.detectRole(normalized);
      return { valid: true, normalized, role };
    } catch {
      return { valid: false };
    }
  }

  /**
   * Validate a phone number.
   * @param {string} phone
   * @returns {{valid: boolean, normalized?: string}}
   */
  static validatePhone(phone) {
    try {
      const cleaned = String(phone).replace(/[\s\-()\.]/g, "").trim();
      if (cleaned.length < 7) {
        return { valid: false };
      }
      const parsed = parsePhoneNumberFromString(cleaned);
      if (parsed && parsed.isValid()) {
        return { valid: true, normalized: parsed.format("E.164") };
      }
      return { valid: false };
    } catch {
      return { valid: false };
    }
  }
}

module.exports = { Validator, EMAIL_REGEX };