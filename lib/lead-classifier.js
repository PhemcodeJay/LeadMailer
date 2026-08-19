/**
 * LeadClassifier — classifies leads by role, priority, and confidence score.
 */
const ROLE_PATTERNS = {
  executive: [
    /ceo|cfo|cto|coo|president|chair|director|vp|vice\.?president|owner|founder|partner|executive|managing\.director|board|chief/i,
  ],
  management: [
    /manager|head|lead|supervisor|coordinator|director\.of|senior\.manager|general\.manager/i,
  ],
  sales: [
    /sales|business\.development|bd|account\.executive|account\.manager|development|partnerships|sales\.rep|territory|channel/i,
  ],
  marketing: [
    /marketing|social\.media|digital|content|brand|pr|communications|seo|sem|growth|campaign/i,
  ],
  technical: [
    /engineer|developer|dev|architect|devops|sysadmin|it|support|helpdesk|programmer|qa|data|engineering/i,
  ],
  hr: [/hr|human\.resources|recruit|talent|people|hiring|personnel/i],
  finance: [
    /finance|accounting|accounts|treasury|tax|audit|controller|financial|budget|payroll/i,
  ],
  legal: [/legal|counsel|attorney|lawyer|compliance|regulatory|general\.counsel/i],
  support: [/customer|client\.support|client\.success|client\.service|cares/i],
  admin: [
    /admin|office|assistant|secretary|reception|front\.desk|clerical|coordinator/i,
  ],
  generic: [
    /info|contact|hello|team|careers|jobs|press|media|webmaster|inquiries|mail/i,
  ],
};

const ROLE_SCORES = {
  executive: 100,
  management: 85,
  sales: 80,
  marketing: 75,
  finance: 70,
  legal: 70,
  technical: 65,
  hr: 55,
  support: 45,
  admin: 35,
  contact: 50,
  personal: 40,
  generic: 25,
};

const PRIORITIES = {
  executive: "high",
  management: "high",
  sales: "medium",
  marketing: "medium",
  finance: "medium",
  legal: "medium",
  technical: "low",
  hr: "low",
  support: "low",
  admin: "low",
  contact: "medium",
  personal: "low",
  generic: "low",
};

class LeadClassifier {
  /**
   * Extract the domain from an email address.
   * @param {string} email
   * @returns {string}
   */
  static extractDomain(email) {
    try {
      if (email && email.includes("@")) {
        let domain = email.split("@")[1].toLowerCase();
        domain = domain.replace(/^(www\.|mail\.|email\.)/, "");
        return domain.slice(0, 63);
      }
    } catch {
      // fall through
    }
    return "unknown";
  }

  /**
   * Detect the role of an email address based on the local part.
   * @param {string} email
   * @returns {string}
   */
  static detectRole(email) {
    if (!email || !email.includes("@")) return "generic";
    const local = email.split("@")[0].toLowerCase();

    for (const [role, patterns] of Object.entries(ROLE_PATTERNS)) {
      for (const pattern of patterns) {
        if (pattern.test(local)) return role;
      }
    }

    const parts = local.split(/[._\-]/);
    if (
      parts.length >= 2 &&
      parts.slice(0, 2).every((p) => /^[a-z]{2,}$/.test(p))
    ) {
      return "personal";
    }
    return "generic";
  }

  /**
   * Get the priority for a role.
   * @param {string} role
   * @returns {string}
   */
  static getPriority(role) {
    return PRIORITIES[role] || "low";
  }

  /**
   * Get the confidence score (0-1) for a role.
   * @param {string} role
   * @returns {number}
   */
  static getScore(role) {
    return (ROLE_SCORES[role] || 25) / 100.0;
  }
}

module.exports = { LeadClassifier, ROLE_PATTERNS, ROLE_SCORES, PRIORITIES };