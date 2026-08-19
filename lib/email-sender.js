/**
 * EmailSender — sends emails via SMTP or MX Direct.
 */
const nodemailer = require("nodemailer");
const { MXResolver } = require("./mx-resolver");

class EmailSender {
  /**
   * @param {object} config - Full config object
   */
  constructor(config) {
    this.config = config;
    this.advanced = config.advanced || {};
  }

  /**
   * Create a nodemailer transport based on config.
   * @returns {object|null}
   */
  _createTransport() {
    const smtpConfig = this.config.smtp || {};
    const advanced = this.advanced;
    const smtpHost = advanced.smtpHost || smtpConfig.server || "";
    const smtpPort = advanced.smtpPort || smtpConfig.port || 587;
    const smtpSecure = advanced.smtpSecure || smtpConfig.use_ssl || false;

    if (!smtpHost) return null;

    const transportOptions = {
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      tls: { rejectUnauthorized: false },
    };

    const useAuth = advanced.useAuthentication !== false;
    if (useAuth && smtpConfig.username && smtpConfig.password) {
      transportOptions.auth = {
        user: smtpConfig.username,
        pass: smtpConfig.password,
      };
    }

    return nodemailer.createTransport(transportOptions);
  }

  /**
   * Send an email.
   * @param {string} toEmail
   * @param {string} subject
   * @param {string} htmlContent
   * @param {Array<object>} [attachments]
   * @param {string} [replyTo]
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async sendEmail(toEmail, subject, htmlContent, attachments = null, replyTo = null) {
    const method = (this.advanced.method || "SMTP").toUpperCase();
    const emailConfig = this.config.email || {};
    const smtpConfig = this.config.smtp || {};
    const fromAddr = emailConfig.from_email || smtpConfig.username || "";
    const fromName = emailConfig.from_name || "LeadMailer Suite";

    if (!fromAddr) {
      return { success: false, message: "Sender email not configured" };
    }

    const mailOptions = {
      from: `"${fromName}" <${fromAddr}>`,
      to: toEmail,
      subject,
      html: htmlContent,
    };

    if (replyTo) mailOptions.replyTo = replyTo;

    if (attachments && this.advanced.includeAttachments !== false) {
      mailOptions.attachments = attachments
        .filter((a) => a.file_path && require("fs").existsSync(a.file_path))
        .map((a) => ({
          filename: a.filename,
          path: a.file_path,
          contentType: a.mime_type,
        }));
    }

    try {
      if (method === "MX") {
        return await this._sendViaMx(mailOptions, fromAddr, toEmail);
      }

      // SMTP method
      const transport = this._createTransport();
      if (!transport) {
        return { success: false, message: "SMTP server not configured" };
      }
      await transport.sendMail(mailOptions);
      transport.close();
      return { success: true, message: "Sent successfully" };
    } catch (err) {
      if (err.code === "EAUTH") {
        return { success: false, message: "SMTP authentication failed - check username/password" };
      }
      if (err.code === "ECONNECTION") {
        return { success: false, message: "Cannot connect to SMTP server - check server/port" };
      }
      return { success: false, message: err.message };
    }
  }

  /**
   * Send via MX direct (no SMTP server needed).
   */
  async _sendViaMx(mailOptions, fromAddr, toEmail) {
    const domain = toEmail.split("@").pop().toLowerCase();
    const mxServer = await MXResolver.getMxServer(domain);
    if (!mxServer) {
      return { success: false, message: `No MX record found for ${domain}` };
    }

    const transport = nodemailer.createTransport({
      host: mxServer,
      port: 25,
      secure: false,
      tls: { rejectUnauthorized: false },
    });

    await transport.sendMail(mailOptions);
    transport.close();
    return { success: true, message: `Sent via MX (${mxServer})` };
  }

  /**
   * Test the SMTP connection.
   * @returns {Promise<{success: boolean, message: string}>}
   */
  async testConnection() {
    const method = (this.advanced.method || "SMTP").toUpperCase();
    if (method === "MX") {
      const mx = await MXResolver.getMxServer("gmail.com");
      return mx
        ? { success: true, message: `MX lookup working - found ${mx}` }
        : { success: false, message: "MX lookup failed" };
    }

    try {
      const transport = this._createTransport();
      if (!transport) {
        return { success: false, message: "SMTP server not configured" };
      }
      await transport.verify();
      transport.close();
      return { success: true, message: "Connection successful - SMTP is ready" };
    } catch (err) {
      if (err.code === "EAUTH") {
        return { success: false, message: "Authentication failed - wrong username or password" };
      }
      return { success: false, message: err.message };
    }
  }
}

module.exports = { EmailSender };