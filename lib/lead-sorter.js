/**
 * LeadSorter — sort leads by priority, role, domain, or type.
 */
class LeadSorter {
  /**
   * Sort leads by priority (high, medium, low).
   * @param {Array<object>} leads
   * @returns {object}
   */
  static sortByPriority(leads) {
    const groups = {};
    for (const lead of leads) {
      const key = lead.priority || "low";
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    const result = {};
    for (const key of ["high", "medium", "low"]) {
      if (groups[key]) result[key] = groups[key];
    }
    return result;
  }

  /**
   * Sort leads by role.
   * @param {Array<object>} leads
   * @returns {object}
   */
  static sortByRole(leads) {
    const groups = {};
    for (const lead of leads) {
      const key = lead.role || "generic";
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    const order = [
      "executive",
      "management",
      "sales",
      "marketing",
      "finance",
      "legal",
      "technical",
      "hr",
      "support",
      "admin",
      "contact",
      "personal",
      "generic",
    ];
    const result = {};
    for (const role of order) {
      if (groups[role]) result[role] = groups[role];
    }
    return result;
  }

  /**
   * Sort leads by domain (most leads first).
   * @param {Array<object>} leads
   * @returns {object}
   */
  static sortByDomain(leads) {
    const groups = {};
    for (const lead of leads) {
      const key = lead.domain || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    return Object.fromEntries(
      Object.entries(groups).sort((a, b) => b[1].length - a[1].length)
    );
  }

  /**
   * Sort leads by type (email/phone).
   * @param {Array<object>} leads
   * @returns {object}
   */
  static sortByType(leads) {
    const groups = {};
    for (const lead of leads) {
      const key = lead.type || "unknown";
      if (!groups[key]) groups[key] = [];
      groups[key].push(lead);
    }
    return groups;
  }
}

module.exports = { LeadSorter };