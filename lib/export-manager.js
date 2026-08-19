/**
 * ExportManager — export leads to CSV, Excel, or JSON.
 */
const XLSX = require("xlsx");

class ExportManager {
  /**
   * Convert leads to CSV string.
   * @param {Array<object>} leads
   * @returns {string}
   */
  static toCsv(leads) {
    const headers = ["type", "value", "domain", "role", "priority", "confidence_score", "source"];
    const rows = leads.map((lead) => [
      lead.type,
      lead.value,
      lead.domain,
      lead.role,
      lead.priority,
      `${Math.round((lead.confidence_score || 0) * 100)}%`,
      lead.source,
    ]);
    const csv = [headers.join(","), ...rows.map((row) => row.map(escapeCsv).join(","))].join("\n");
    return csv;
  }

  /**
   * Convert leads to Excel buffer.
   * @param {Array<object>} leads
   * @returns {Buffer}
   */
  static toExcel(leads) {
    const data = leads.map((l) => ({
      Type: l.type,
      Value: l.value,
      Domain: l.domain,
      Role: (l.role || "").toUpperCase(),
      Priority: (l.priority || "").toUpperCase(),
      Score: `${Math.round((l.confidence_score || 0) * 100)}%`,
      Source: l.source,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Leads");
    return XLSX.write(wb, { type: "buffer", bookType: "xlsx" });
  }

  /**
   * Convert leads to JSON string.
   * @param {Array<object>} leads
   * @returns {string}
   */
  static toJson(leads) {
    return JSON.stringify({ total: leads.length, leads }, null, 2);
  }
}

function escapeCsv(value) {
  const str = String(value ?? "");
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

module.exports = { ExportManager };