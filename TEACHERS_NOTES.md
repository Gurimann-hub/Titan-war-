# 🏛️ Teacher's Notes: Core Engineering Principles

These three non-negotiable architectural laws govern this codebase, all future features, and every deployment:

---

### Lesson 1: Secrets and truth stay on the server.
> *"Anything the browser can see, the visitor controls. Your OTP, your session and your 'payment' all failed this rule."*

- **The Law**: The client environment (browser DevTools, DOM, `localStorage`, JavaScript memory) is untrusted territory under full user/visitor control.
- **How It Applies Here**:
  - **Auth**: Never generate, verify, or preview one-time codes on the client. In a real system, OTP generation, rate limiting, and session verification belong exclusively on a hardened server or managed auth provider (Supabase, Clerk, Firebase).
  - **Sessions**: A `localStorage` flag is not security; cryptographically signed server tokens or HTTP-only cookies are required for authoritative identity.
  - **Payments**: Never simulate a transaction with `setTimeout` or handle raw card numbers. Real access requires hosted checkout sessions (Stripe, Razorpay, PayPal) and server-side webhook verification before granting clearance.
  - **Boundaries**: Keep `.env`, credentials, and server source files isolated from public directory roots.

---

### Lesson 2: Never display what didn't happen.
> *"Showing '$4.90 CHARGED' with no charge, or 'feed ACTIVE' with no feed, destroys trust faster than any bug."*

- **The Law**: Deceptive UI, fake success receipts, and artificial status indicators destroy product credibility faster than any crash or syntax error.
- **How It Applies Here**:
  - **Honest Labelling**: If an environment is a demo, label it clearly: `DEMO CLEARANCE • NO CHARGE ($0.00)`.
  - **No Fake Forms**: Eliminate credit card fields that do not process real payments.
  - **Telemetry Honesty**: Never show green "ONLINE" or "DISPATCHING" badges unless a live gateway is truly connected and active. When running offline or statically, declare `STATIC SHOWCASE / SIMULATION ACTIVE`.

---

### Lesson 3: Verify, then claim.
> *"If you sell intelligence, every fact needs a date and a source."*

- **The Law**: Stale facts, unverified rumors, and unsourced metrics ruin the value proposition of any intelligence product.
- **How It Applies Here**:
  - **Audit Timestamps**: Every dossier must carry a specific verification date (`Last Verified: October 2026`).
  - **Primary Sources**: Every legal, antitrust, or financial statement must cite authoritative public records (Court Dockets, European Commission official releases, SEC 10-K/8-K filings).
  - **Decoupled Data Pipeline**: Intelligence facts must live in structured data files (`/data/dossiers.json`), separated from presentation code so audits and factual updates can be verified systematically.
