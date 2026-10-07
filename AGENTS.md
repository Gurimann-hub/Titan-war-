# Workspace Guidelines & Rules

## Secret & Credential Management
- **Never hardcode secrets** (passwords, private API keys, SMTP credentials, session tokens) in client-side code (`public/`, `.html`, `.js`, `.css`).
- Use **environment variables** loaded on the server via `process.env`.
- Document new environment variables in [`.env.example`](file:///c:/Users/gurka/OneDrive/Desktop/New%20folder%20%282%29/.env.example).
- Ensure client auto-fill utilities or demo helpers only populate non-sensitive identifiers (e.g., email address) and never expose static passwords in client script bundles.
