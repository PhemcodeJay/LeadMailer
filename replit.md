# LeadMailer Suite

A unified lead collection and email marketing platform combining LeadForge Pro v8.1 (lead collection) and MailerX Pro Advanced (email sending) into a single app with a dark-themed UI.

## Run & Operate

- `node app.js` — run the combined Express app (port 5000, or $PORT env var)
- Workflow: **LeadMailer Suite** (configured in Replit, runs `node app.js`)

## Stack

- Node.js 18+, Express 4
- SQLite (lead database: `leads.db`) via better-sqlite3
- JSON files (MailerX data: `data/` directory)
- Cheerio (web scraping), libphonenumber-js (phone validation)
- Nodemailer (SMTP sending), native DNS (MX lookups)
- xlsx (Excel export)

## Where things live

- `app.js` — main Express server (backend + static frontend)
- `lib/` — core business logic modules
- `public/index.html` — frontend UI
- `leads.db` — SQLite database for leads and sessions
- `data/config.json` — SMTP and advanced settings
- `data/MailerX.db` — campaign records (JSON)
- `data/templates/` — HTML email templates
- `data/attachments/` — email attachment files
- `data/uploads/` — recipient CSV files
- `data/blacklist.json` — blacklisted emails

## Features

**Lead Collection (LeadForge)**
- Text validator: paste emails/phones, validates and classifies by role and priority
- CSV validator: upload CSV, extracts and validates all contacts
- Web extractor: scrape contact details from any URL (up to 20 at once)
- Lead manager: sort by priority/role/domain/type, export as CSV/Excel/JSON

**Email Sending (MailerX Advanced)**
- Template editor: create HTML email templates with variable substitution (`{{name}}`, `{{company}}`, etc.)
- Attachment support per template
- Recipient CSV file management
- Campaign engine: sequential or concurrent sending with rate limiting
- SMTP / MX Direct sending methods
- Blacklist management
- SMTP connection testing

## Architecture decisions

- Modular `lib/` directory with focused business logic modules
- LeadForge uses SQLite (`leads.db`) for persistence; MailerX uses JSON files in `data/`
- Campaign workers run as async background tasks, tracked by `CampaignWorker`
- Express serves static frontend from `public/`
- Tests use Node's built-in test runner (`node:test`)

## User preferences

- Dark-themed, comprehensive UI with sidebar navigation
- All functionality accessible from a single page

## Gotchas

- Run `node app.js` from the workspace root (not from a subdirectory)
- The `data/` directory is auto-created on startup
- Password fields show `***` after save — this is intentional (preserved on re-save)
- MX Direct sending uses the native Node.js DNS module