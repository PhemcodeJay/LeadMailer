/**
 * MXResolver — resolve MX records and hostnames.
 */
const dns = require("dns").promises;

class MXResolver {
  /**
   * Get the MX server for a domain.
   * @param {string} domain
   * @returns {Promise<string|null>}
   */
  static async getMxServer(domain) {
    try {
      const cleanDomain = String(domain)
        .toLowerCase()
        .trim()
        .split("@")
        .pop()
        .split("/")[0]
        .split(":")[0];

      const answers = await dns.resolveMx(cleanDomain);
      if (answers && answers.length > 0) {
        answers.sort((a, b) => a.priority - b.priority);
        return answers[0].exchange.replace(/\.$/, "");
      }
    } catch (err) {
      console.error(`MX lookup failed for ${domain}: ${err.message}`);
    }
    return null;
  }

  /**
   * Resolve a hostname to an IP address.
   * @param {string} hostname
   * @returns {Promise<string|null>}
   */
  static async resolveHost(hostname) {
    try {
      const result = await dns.lookup(hostname.trim());
      return result.address;
    } catch (err) {
      console.error(`Failed to resolve ${hostname}: ${err.message}`);
      return null;
    }
  }
}

module.exports = { MXResolver };