# Security & Secret Management Rules

## Core Rule: Secrets Never in Front-End Code
- **Zero Secrets in Client Code**: Never store or hardcode private credentials, API keys, passwords, database URLs, SMTP passwords, or session secrets in client-side files (`public/`, `src/`, HTML, CSS, JavaScript, or front-end templates).
- **Environment Variables**: All secrets and private credentials must reside exclusively in server-side environment variables (`.env`, `process.env`, or host environment) and must never be exposed or bundled into client payloads.
- **Client Sanitization**:
  - Auto-fill and preset buttons must never embed passwords in front-end script bundles or DOM attributes.
  - API responses and error messages must never leak credentials or passwords.
  - Only public keys (such as Cloudflare Turnstile Site Key) intended for client rendering may be exposed to the browser.
- **Configuration Templates**: Always document required environment variables in `.env.example` with blank or placeholder values. Never commit actual secret values into version control.
