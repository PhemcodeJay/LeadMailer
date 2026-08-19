# Contributing to LeadMailer

Thank you for your interest in contributing to LeadMailer! This guide will help you get started.

## Development Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Run the app:**
   ```bash
   node app.js
   ```
   The app will be available at http://localhost:5000

3. **Run tests:**
   ```bash
   npm test
   ```

## Project Structure

```
├── app.js                 # Main Express server entry point
├── lib/                   # Core business logic modules
│   ├── lead-classifier.js # Lead role/priority classification
│   ├── validator.js       # Email/phone validation
│   ├── web-extractor.js   # Web scraping for contacts
│   ├── lead-processor.js  # Bulk lead processing
│   ├── lead-sorter.js     # Lead sorting
│   ├── export-manager.js  # CSV/Excel/JSON export
│   ├── mx-resolver.js     # DNS MX lookup
│   ├── storage-manager.js # Data persistence (SQLite + JSON)
│   ├── email-sender.js    # SMTP/MX email sending
│   ├── template-renderer.js # Template rendering
│   └── campaign-worker.js # Background campaign execution
├── public/                # Frontend static files
│   └── index.html         # Main UI
├── test/                  # Test suite
├── data/                  # Runtime data (auto-created)
├── Dockerfile             # Container setup
├── docker-compose.yml     # Container orchestration
└── Makefile               # Common tasks
```

## How to Contribute

### 1. Pick a Task

Look for `TODO` comments in the code or check the open issues. Common areas:

- **Lead classification improvements** — add new role patterns in `lib/lead-classifier.js`
- **Web extractor enhancements** — improve scraping in `lib/web-extractor.js`
- **Email sender features** — add proxy support, better error handling in `lib/email-sender.js`
- **UI improvements** — enhance the frontend in `public/index.html`
- **Test coverage** — add more tests in `test/`

### 2. Make Your Changes

- Write clean, well-documented code
- Follow the existing code style (CommonJS, JSDoc comments)
- Add tests for new functionality
- Run `npm test` to ensure all tests pass

### 3. Submit a Pull Request

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes with a clear message
4. Push to your fork
5. Open a pull request

## Code Style

- Use CommonJS (`require`/`module.exports`)
- Use JSDoc comments for all public functions
- Use 2-space indentation
- Use single quotes for strings
- Add semicolons
- Keep functions small and focused

## Testing

Run the test suite:
```bash
npm test
```

Tests use Node's built-in test runner (`node:test`) and cover:
- Lead classification
- Email/phone validation
- Template rendering
- Storage operations
- API endpoints

## Docker

Build and run in a container:
```bash
docker compose up
```

## Questions?

Open an issue or reach out to the maintainers. We're happy to help!