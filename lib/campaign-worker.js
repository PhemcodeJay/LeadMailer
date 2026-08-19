/**
 * CampaignWorker — manages campaign execution in background.
 */
const { EmailSender } = require("./email-sender");
const { TemplateRenderer } = require("./template-renderer");

class CampaignWorker {
  /**
   * @param {import('./storage-manager').StorageManager} storage
   */
  constructor(storage) {
    this.storage = storage;
    this.activeCampaigns = new Map();
  }

  /**
   * Start a campaign in the background.
   * @param {object} params
   * @returns {boolean}
   */
  startCampaign({ campaignId, config, recipientsFile, templateContent, subject, replyTo = null, attachments = null }) {
    if (this.activeCampaigns.has(campaignId)) return false;

    const run = async () => {
      try {
        await this._runCampaign(campaignId, config, recipientsFile, templateContent, subject, replyTo, attachments);
      } catch (err) {
        console.error(`Campaign ${campaignId} crashed: ${err.message}`);
        this._markFailed(campaignId, err.message);
      } finally {
        this.activeCampaigns.delete(campaignId);
      }
    };

    // Start in background
    run();
    this.activeCampaigns.set(campaignId, { status: "running" });
    return true;
  }

  async _runCampaign(campaignId, config, recipientsFile, templateContent, subject, replyTo, attachments) {
    const storage = this.storage;
    const advanced = config.advanced || {};
    const useConcurrency = advanced.useConcurrency || false;
    const concurrencyLimit = advanced.concurrencyLimit || 5;

    const recipients = storage.getRecipients(recipientsFile);
    const blacklist = new Set(storage.loadBlacklist());
    const validRecipients = recipients.filter((r) => !blacklist.has(r.email.toLowerCase()));
    const total = validRecipients.length;

    const campaign = {
      id: campaignId,
      name: this._getCampaignName(campaignId),
      status: "running",
      started_at: new Date().toISOString(),
      total_recipients: total,
      stats: { sent: 0, failed: 0 },
    };
    storage.saveCampaign(campaign);

    const sender = new EmailSender(config);
    const campaignConfig = config.campaign || {};
    const rateLimit = campaignConfig.rate_limit || 5;
    const batchDelay = rateLimit > 0 && !useConcurrency ? 60000 / rateLimit : 0;

    let sent = 0;
    let failed = 0;

    const makeContext = (recipient) => ({
      name: recipient.name || "Valued Customer",
      email: recipient.email || "",
      company: recipient.company || "",
      city: recipient.city || "",
      cta_url: campaignConfig.cta_url || "#",
      unsubscribe_url: campaignConfig.unsubscribe_url || "#",
    });

    const sendOne = async (recipient) => {
      const ctx = makeContext(recipient);
      const result = await sender.sendEmail(
        recipient.email,
        TemplateRenderer.render(subject, ctx),
        TemplateRenderer.render(templateContent, ctx),
        attachments,
        replyTo
      );
      return result;
    };

    if (useConcurrency && concurrencyLimit > 1) {
      // Concurrent sending
      const queue = [...validRecipients];
      const workers = Array.from({ length: Math.min(concurrencyLimit, queue.length) }, async () => {
        while (queue.length > 0) {
          const recipient = queue.shift();
          if (!recipient) break;
          const result = await sendOne(recipient);
          if (result.success) sent++;
          else {
            failed++;
            console.warn(`Failed to send to ${recipient.email}: ${result.message}`);
          }
        }
      });
      await Promise.all(workers);
    } else {
      // Sequential sending with rate limiting
      for (let i = 0; i < validRecipients.length; i++) {
        if (this.activeCampaigns.get(campaignId)?.status === "stopped") break;
        const recipient = validRecipients[i];
        const result = await sendOne(recipient);
        if (result.success) sent++;
        else {
          failed++;
          console.warn(`Failed to send to ${recipient.email}: ${result.message}`);
        }
        if ((i + 1) % 10 === 0) {
          this._updateCampaignStats(campaignId, sent, failed);
        }
        if (batchDelay > 0) {
          await new Promise((resolve) => setTimeout(resolve, batchDelay));
        }
      }
    }

    const finalStatus = sent > 0 ? "completed" : "failed";
    storage.saveCampaign({
      id: campaignId,
      name: campaign.name,
      status: finalStatus,
      started_at: campaign.started_at,
      completed_at: new Date().toISOString(),
      total_recipients: total,
      stats: { sent, failed },
    });
    console.log(`Campaign ${campaignId} completed: ${sent} sent, ${failed} failed`);
  }

  _getCampaignName(campaignId) {
    const campaigns = this.storage.loadCampaigns();
    const found = campaigns.find((c) => c.id === campaignId);
    return found ? found.name : `Campaign_${campaignId}`;
  }

  _updateCampaignStats(campaignId, sent, failed) {
    const campaigns = this.storage.loadCampaigns();
    for (const c of campaigns) {
      if (c.id === campaignId) {
        c.stats = { sent, failed };
        this.storage.saveCampaign(c);
        break;
      }
    }
  }

  _markFailed(campaignId, error) {
    const campaigns = this.storage.loadCampaigns();
    for (const c of campaigns) {
      if (c.id === campaignId) {
        c.status = "failed";
        c.error = error;
        this.storage.saveCampaign(c);
        break;
      }
    }
  }

  /**
   * Stop a running campaign.
   * @param {string} campaignId
   * @returns {boolean}
   */
  stopCampaign(campaignId) {
    if (this.activeCampaigns.has(campaignId)) {
      this.activeCampaigns.set(campaignId, { status: "stopped" });
      return true;
    }
    return false;
  }

  /**
   * Get campaign status.
   * @param {string} campaignId
   * @returns {object|null}
   */
  getCampaignStatus(campaignId) {
    const campaigns = this.storage.loadCampaigns();
    return campaigns.find((c) => c.id === campaignId) || null;
  }
}

module.exports = { CampaignWorker };