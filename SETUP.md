# LeadMailer Suite — Setup Guide

A unified lead collection + email marketing platform. Combines LeadForge Pro (lead scraping/validation) with MailerX Pro Advanced (SMTP/MX email sending) in a single Node.js app.

---

## Requirements

- Node.js 18+
- npm

---

## Quick Start

### 1. Install dependencies

```bash
npm install
```

### 2. Run the app

```bash
node app.js
```

The app will be available at **http://localhost:5000** (or the port set by the `PORT` env var).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `5000` | Port the server listens on |

Set them before running:

```bash
PORT=8080 node app.js
```

---

## Data & Storage

All data is stored locally in the `data/` directory (auto-created on first run):

```
data/
├── config.json          # SMTP and advanced settings
├── MailerX.db           # Campaign records (JSON)
├── blacklist.json       # Suppression list
├── templates/           # HTML email templates (.html files)
├── attachments/         # Email attachments (per template)
└── uploads/             # Recipient CSV files
```

Lead session data is stored in `leads.db` (SQLite) in the project root.

> **Backup tip:** Copy the `data/` folder and `leads.db` to preserve all your data.

---

## SMTP Configuration

Go to **Settings** in the UI and fill in:

- **SMTP Server** — e.g. `smtp.gmail.com`, `smtp.sendgrid.net`
- **Port** — `587` (STARTTLS) or `465` (SSL)
- **Username / Password** — your SMTP credentials
- **From Name / From Email** — sender identity

Click **Test Connection** to verify before launching campaigns.

### Common SMTP providers

| Provider | Server | Port | Protocol |
|----------|--------|------|----------|
| Gmail | `smtp.gmail.com` | 587 | STARTTLS |
| Outlook / Hotmail | `smtp-mail.outlook.com` | 587 | STARTTLS |
| SendGrid | `smtp.sendgrid.net` | 587 | STARTTLS |
| AWS SES | `email-smtp.us-east-1.amazonaws.com` | 587 | STARTTLS |
| Mailgun | `smtp.mailgun.org` | 587 | STARTTLS |

> **Gmail note:** You must use an [App Password](https://support.google.com/accounts/answer/185833), not your regular password, if 2FA is enabled.

---

## Sending Methods

### SMTP (default)
Authenticated sending through your mail server. Works with any standard SMTP provider.

### MX Direct
Delivers directly to recipient mail servers by looking up their MX DNS records. No SMTP account needed.

---

## Recipient CSV Format

Upload CSVs in the **Recipients** tab. The `email` column is required; others are optional and used for template personalization.

```csv
email,name,company,city
john@example.com,John Smith,Acme Inc,New York
jane@company.com,Jane Doe,Tech Corp,San Francisco
```

---

## Email Templates

Templates are HTML files stored in `data/templates/`. Use these variables for personalization:

| Variable | Description |
|----------|-------------|
| `{{name}}` | Recipient's name |
| `{{email}}` | Recipient's email address |
| `{{company}}` | Recipient's company |
| `{{city}}` | Recipient's city |
| `{{cta_url}}` | Call-to-action link (set in Settings) |
| `{{unsubscribe_url}}` | Unsubscribe link (set in Settings) |

Conditional blocks are also supported:

```html
{% if company %}Working at {{company}}{% endif %}
```

---

## Lead Collection Workflow

1. **Collect** — use Text Input, CSV Upload, or Web Extractor
2. **Review** — leads are auto-classified by role and priority
3. **Sort** — sort by Priority / Role / Domain / Type in Lead Manager
4. **Export** — download as CSV, Excel, or JSON

### Lead priority levels

| Priority | Roles |
|----------|-------|
| **High** | executive, management |
| **Medium** | sales, marketing, finance, legal, contact |
| **Low** | technical, HR, support, admin, generic |

---

## Campaign Workflow

1. Create an email template in **Templates**
2. Upload a recipient CSV in **Recipients**
3. Configure SMTP in **Settings** → test the connection
4. Go to **Campaigns** → fill in the launch form → Start Campaign
5. Monitor progress in real time; stop any campaign at any time

---

## Testing

Run the test suite:

```bash
npm test
```

---

## Docker

Build and run in a container:

```bash
docker compose up
```

---

## File Reference

| File | Purpose |
|------|---------|
| `app.js` | Main Express server — backend + static frontend |
| `lib/` | Core business logic modules |
| `public/index.html` | Frontend UI |
| `test/` | Test suite |
| `leads.db` | SQLite database for leads and sessions (auto-created) |
| `data/` | All MailerX data: config, campaigns, templates, uploads |

---

## API Reference (Quick)

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/text-validator` | Validate pasted emails/phones |
| POST | `/api/csv-validator` | Validate uploaded CSV |
| POST | `/api/web-extractor` | Scrape URLs for contacts |
| GET | `/api/sorter/<session>` | Sort leads by type |
| GET | `/api/export/<session>` | Export leads (csv/excel/json) |
| GET | `/api/templates` | List email templates |
| POST | `/api/templates` | Save a template |
| POST | `/api/upload-csv` | Upload recipient CSV |
| POST | `/api/campaign/start` | Launch a campaign |
| POST | `/api/campaign/<id>/stop` | Stop a running campaign |
| GET | `/api/stats` | Combined dashboard stats |
| GET | `/api/blacklist` | Get blacklist |
| POST | `/api/config` | Save SMTP/advanced settings |
| POST | `/api/test-smtp` | Test SMTP connection |
| GET | `/health` | Health check |