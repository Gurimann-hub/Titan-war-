# TITAN WAR // PRODUCTION PUBLISHING & SECURITY GUIDE

The **Titan War: Big Tech Battlefield Intelligence** application is designed with strict security separation between backend authentication services and static frontend assets in `public/`.

---

## 🚀 PATH A: 100% SELF-CONTAINED STATIC SHOWCASE (RECOMMENDED)

You can publish this project **immediately** to any static host with **zero server costs**, no database, and no live credentials:

### Compatible Static Edge Platforms:
- **Vercel**: Pre-configured in [`vercel.json`](vercel.json) with `outputDirectory: "public"`, `cleanUrls: true`, CSP, nosniff, and asset caching headers. Run `npx vercel` or connect your Git repository.
- **Netlify**: Pre-configured in [`netlify.toml`](netlify.toml) with `publish = "public"` and security headers. Run `npx netlify deploy --prod` or connect repository.
- **Cloudflare Pages**: Set build output directory to `public`.
- **GitHub Pages**: Deploy the `public/` directory via GitHub Actions or branch settings.

### What Makes Path A Work Statically:
1. **Interactive Client-Side Simulation**: 6-digit cryptographic PIN generation with a 10-minute countdown timer, 5-attempt rate-limit lockout, and immediate `delete-after-use` memory clearing.
2. **Decoupled Data Architecture**: All intelligence dossiers and regulatory citations (DOJ dockets, European Commission releases, SEC 10-K/8-K filings) are served statically from `/data/dossiers.json`.
3. **Asset-Free Web Audio Synthesizer**: Zero external audio downloads. All sound effects and chimes synthesize in-browser using the Web Audio API.
4. **Honest Demo Clearance**: No deceptive payment cards. Users immediately activate Level 5 Clearance in demo mode for $0.00 USD.
5. **Zero Log Retention & Zero Cookies**: No third-party tracking or personally identifiable storage.

---

## ⚙️ PATH B: PRODUCTION FULL-STACK NODE.JS DEPLOYMENT

If you choose to run live email dispatch and HMAC-SHA256 server-side sessions:

1. **Deploy to Node Host**: Connect your Git repository to **Render**, **Railway**, **Fly.io**, or an isolated VPS.
2. **Production Fail-Closed Guarantee**:
   In `NODE_ENV=production`, the server strictly validates all secrets on startup and refuses to launch if any are missing:
   - `SESSION_SECRET`: Persistent 32+ character hex string. (Never rely on ephemeral random generation across deploys).
   - `TURNSTILE_SITE_KEY` & `TURNSTILE_SECRET_KEY`: Bot protection keys from Cloudflare. Verification fails closed.
3. **Transactional Email vs Personal Gmail**:
   - **Personal Gmail Warning**: Gmail SMTP has a hard limit of ~500 recipients per day, lacks deliverability guarantees, and risks Google account suspension.
   - **Recommended Production Providers**: Use dedicated transactional gateways with your custom domain:
     - **Resend** (`smtp.resend.com:587`)
     - **Postmark** (`smtp.postmarkapp.com:587`)
     - **Amazon SES** (`email-smtp.<region>.amazonaws.com:587`)
     - **Brevo** (`smtp-relay.brevo.com:587`)
4. **State & Instance Constraints**:
   - The server maintains sliding-window rate limits and OTPs in in-memory Maps (`otpStore`, `ipOtpRequests`).
   - Run as a **single instance** (1 replica).
   - For horizontal clustering, multi-region or serverless environments, migrate state stores to **Redis** or **Upstash KV**.
5. **Reverse Proxy & IP Rate Limiting**:
   - If behind Cloudflare, the server automatically prioritizes `cf-connecting-ip`.
   - If behind Render/Railway/Nginx, set `TRUST_PROXY=true` to read the right-most trusted hop from `X-Forwarded-For`.
   - If direct to the internet, client-supplied `X-Forwarded-For` is ignored to prevent rate-limit spoofing.
6. **Smart Caching with ETag Revalidation**:
   - JavaScript, JSON, and CSS assets are served with `Cache-Control: no-cache, must-revalidate` and dynamic `ETag` generation.
   - Browsers revalidate instantaneously via HTTP 304, ensuring emergency security patches and dossier audit date updates reach users without delay.

---

## ⚠️ SECURITY CHECKLIST (CRITICAL)

1. **Strict Zero Log Retention & Privacy**:
   - Server logs automatically mask email handles (e.g. `a*****t@titanwar.intel`).
   - OTP codes are NEVER logged in production or returned in API responses.
2. **Fail-Fast Error Handling**:
   - Uncaught exceptions and unhandled promise rejections terminate the process with exit code 1 to allow container orchestrators to restart into a known-clean state.
3. **No Deceptive Claims (Lesson 2)**:
   - If email dispatch fails, the API returns HTTP 503 ("Email service unavailable") rather than falsely reporting success.
4. **No Deceptive Payments**:
   - The War Room clearance is explicitly implemented as a **Free Demonstration Clearance (Simulation Mode — No Charge)**. Raw card data is never accepted, requested, or processed.

---

## 📁 File Inventory & Architecture
- [`public/index.html`](public/index.html): Semantic 5-page interface with responsive layout, neutral email input, and transparent Demo Clearance.
- [`public/styles.css`](public/styles.css): White & Burgundy executive design system, R-to-L and T-to-D keyframes, and glassmorphism.
- [`public/app.js`](public/app.js): Unified client authentication controller, accessible modals, and Web Audio synthesizer.
- [`public/data/dossiers.json`](public/data/dossiers.json): Decoupled intelligence dossiers with verified audit dates and primary regulatory citations.
- [`public/assets/`](public/assets/): WebP battlefield and insignia artwork with responsive dimensions.
- [`server.js`](server.js): Secure Node.js server with isolated static serving from `public/`, rate limiting, Turnstile verification, and HMAC signed session authentication.
- [`vercel.json`](vercel.json): Vercel configuration with `outputDirectory: "public"`, `cleanUrls: true`, and security headers.
- [`netlify.toml`](netlify.toml): Netlify configuration with static asset publish path and security headers.
- [`tests/smoke.test.js`](tests/smoke.test.js): Comprehensive test suite testing static delivery, security boundaries, rate limiting, and cache revalidation.
- [`tests/playwright.smoke.spec.js`](tests/playwright.smoke.spec.js): Browser automation smoke tests verifying DOM rendering, modal focus traps, and 360px viewport responsiveness.
- [`.env.example`](.env.example): Environment variable template.
- [`.gitignore`](.gitignore): Protection rules preventing secret leakage.

