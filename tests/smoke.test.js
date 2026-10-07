const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('1. Static Asset Delivery and Smart Cache Headers', async () => {
  // Test HTML response
  const htmlRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(htmlRes.status, 200, 'HTML should return 200 OK');
  const htmlCache = htmlRes.headers.get('cache-control') || '';
  assert.ok(htmlCache.includes('no-cache'), 'HTML should send no-cache for instant updates');

  // Test CSS response and cache header with ETag
  const cssRes = await fetch(`${BASE_URL}/styles.css`);
  assert.strictEqual(cssRes.status, 200, 'CSS should return 200 OK');
  const cssCache = cssRes.headers.get('cache-control') || '';
  assert.ok(cssCache.includes('no-cache'), 'CSS should have no-cache header for instant updates');
  const cssEtag = cssRes.headers.get('etag');
  assert.ok(cssEtag, 'CSS should have an ETag header');

  // Test JS response and cache header with ETag
  const jsRes = await fetch(`${BASE_URL}/app.js`);
  assert.strictEqual(jsRes.status, 200, 'JS should return 200 OK');
  const jsCache = jsRes.headers.get('cache-control') || '';
  assert.ok(jsCache.includes('no-cache'), 'JS should have no-cache header for instant updates');
  const jsEtag = jsRes.headers.get('etag');
  assert.ok(jsEtag, 'JS should have an ETag header');

  // Test conditional request with ETag returns 304 Not Modified
  const js304Res = await fetch(`${BASE_URL}/app.js`, {
    headers: { 'If-None-Match': jsEtag }
  });
  assert.strictEqual(js304Res.status, 304, 'ETag match should return 304 Not Modified');

  // Test robots.txt
  const robotsRes = await fetch(`${BASE_URL}/robots.txt`);
  assert.strictEqual(robotsRes.status, 200, 'robots.txt should return 200');
  const robotsText = await robotsRes.text();
  assert.ok(robotsText.includes('Sitemap:'), 'robots.txt must declare sitemap location');

  // Test sitemap.xml
  const sitemapRes = await fetch(`${BASE_URL}/sitemap.xml`);
  assert.strictEqual(sitemapRes.status, 200, 'sitemap.xml should return 200');
  const sitemapText = await sitemapRes.text();
  assert.ok(sitemapText.includes('<urlset'), 'sitemap.xml must be valid xml');

  // Test favicon.svg
  const favRes = await fetch(`${BASE_URL}/assets/favicon.svg`);
  assert.strictEqual(favRes.status, 200, 'favicon.svg should return 200');
  assert.ok(favRes.headers.get('content-type').includes('image/svg+xml'), 'favicon should have image/svg+xml content-type');

  // Test WebP assets
  const heroRes = await fetch(`${BASE_URL}/assets/hero.webp`);
  assert.strictEqual(heroRes.status, 200, 'hero.webp should return 200');
  assert.ok(heroRes.headers.get('content-type').includes('image/webp'), 'hero should have image/webp content-type');

  const insigRes = await fetch(`${BASE_URL}/assets/insignia.webp`);
  assert.strictEqual(insigRes.status, 200, 'insignia.webp should return 200');
  assert.ok(insigRes.headers.get('content-type').includes('image/webp'), 'insignia should have image/webp content-type');
});

test('2. Security Hardening & Zero-Trust Directory Boundary', async () => {
  // .env must NEVER be accessible
  const envRes = await fetch(`${BASE_URL}/.env`);
  assert.ok(envRes.status === 403 || envRes.status === 404, `GET /.env must be forbidden/not found, got ${envRes.status}`);

  // server.js source must NEVER be accessible
  const serverRes = await fetch(`${BASE_URL}/server.js`);
  assert.ok(serverRes.status === 403 || serverRes.status === 404, `GET /server.js must be forbidden/not found, got ${serverRes.status}`);

  // Sibling folder access attempt must be rejected
  const siblingRes = await fetch(`${BASE_URL}/../public-secrets`);
  assert.ok(siblingRes.status === 403 || siblingRes.status === 404, 'Sibling folder access must be blocked');

  // Malformed URL must not crash server
  const malformedRes = await fetch(`${BASE_URL}/%`);
  assert.ok(malformedRes.status === 400 || malformedRes.status === 404, `Malformed URL should return 400/404, got ${malformedRes.status}`);

  // Malformed JSON body must return 400 Bad Request
  const badJsonRes = await fetch(`${BASE_URL}/api/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"unclosed": json'
  });
  assert.strictEqual(badJsonRes.status, 400, 'Malformed JSON payload must return 400 Bad Request');

  // Oversized body (>100KB) must return 413 Payload Too Large
  const hugePayload = JSON.stringify({ email: 'big@example.com', padding: 'X'.repeat(120 * 1024) });
  const oversizedRes = await fetch(`${BASE_URL}/api/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: hugePayload
  });
  assert.strictEqual(oversizedRes.status, 413, 'Oversized JSON payload must return 413 Payload Too Large');

  // Security Headers on Root
  const rootRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(rootRes.headers.get('x-content-type-options'), 'nosniff');
  assert.strictEqual(rootRes.headers.get('x-frame-options'), 'DENY');
  assert.ok(rootRes.headers.get('content-security-policy'), 'CSP header must be present');
});

test('3. API Status and Verification Endpoints', async () => {
  // /api/status endpoint
  const statusRes = await fetch(`${BASE_URL}/api/status`);
  assert.strictEqual(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.strictEqual(typeof statusData.smtpConfigured, 'boolean');
  assert.strictEqual(typeof statusData.turnstileEnabled, 'boolean');

  // /api/send-otp validation with bad email
  const badOtpRes = await fetch(`${BASE_URL}/api/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'not-an-email' })
  });
  assert.strictEqual(badOtpRes.status, 400, 'Invalid email should return 400 Bad Request');

  // /api/send-otp with valid email
  const testEmail = `test-${Date.now()}@titanwar.intel`;
  const goodOtpRes = await fetch(`${BASE_URL}/api/send-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail })
  });
  assert.strictEqual(goodOtpRes.status, 200, 'Valid email should return 200 OK');
  const otpData = await goodOtpRes.json();
  assert.strictEqual(otpData.success, true);
  assert.strictEqual(otpData.otpPreview, undefined, 'otpPreview must NOT be leaked to client');

  // Verify spoofed X-Forwarded-For cannot bypass IP rate limit cooldown
  const spoofRes = await fetch(`${BASE_URL}/api/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Forwarded-For': '198.51.100.42'
    },
    body: JSON.stringify({ email: `another-${Date.now()}@titanwar.intel` })
  });
  assert.strictEqual(spoofRes.status, 429, 'Spoofed X-Forwarded-For must NOT bypass client IP cooldown');

  // /api/verify-otp with incorrect OTP
  const badVerifyRes = await fetch(`${BASE_URL}/api/verify-otp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testEmail, otp: '000000' })
  });
  assert.strictEqual(badVerifyRes.status, 400, 'Wrong OTP should return 400');
  const verifyData = await badVerifyRes.json();
  assert.strictEqual(verifyData.success, false);
});

test('4. Accessibility, Markup, and Front-End Integrity', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf-8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');

  // No inline event handlers in index.html
  const inlineHandlerRegex = /\bon[a-z]+=["']/i;
  assert.strictEqual(inlineHandlerRegex.test(html), false, 'index.html must NOT contain inline onclick/onkeyup/onsubmit handlers');

  // Modals have role="dialog" and aria-modal="true"
  assert.ok(html.includes('id="intel-modal" class="intel-modal-backdrop hidden" role="dialog" aria-modal="true"'), 'intel-modal must have role="dialog" and aria-modal="true"');
  assert.ok(html.includes('id="smtp-setup-modal" class="intel-modal-backdrop hidden" role="dialog" aria-modal="true"'), 'smtp-setup-modal must have role="dialog" and aria-modal="true"');

  // OTP inputs on page 4 have accessible aria-labels
  assert.ok(html.includes('aria-label="Verification digit 1 of 6"'), 'OTP input 1 must have accessible label');
  assert.ok(html.includes('aria-label="Verification digit 6 of 6"'), 'OTP input 6 must have accessible label');

  // Audio defaults to OFF
  assert.ok(html.includes('Audio: <span id="audio-state">OFF</span>'), 'Audio must default to OFF in HTML');
  assert.ok(html.includes('class="audio-toggle-btn muted"'), 'Audio toggle button must have muted class');
  assert.ok(html.includes('aria-pressed="false"'), 'Audio toggle button must have aria-pressed="false"');

  // Zero alert() calls in client code
  assert.strictEqual(/\balert\s*\(/.test(js), false, 'app.js must not call alert()');

  // Cut to 2 font families
  assert.ok(html.includes('family=Cinzel:wght@600;700;800&family=Plus+Jakarta+Sans:wght@400;500;600;700&display=swap'), 'Fonts must be restricted to 2 curated families');

  // WebP images with width and height
  assert.ok(html.includes('src="assets/hero.webp" alt="Executive War Room Facing Off" class="hero-cinematic-img" width="1376" height="768"'), 'hero image must use .webp with width/height');
  assert.ok(html.includes('src="assets/insignia.webp"'), 'insignia must use .webp');

  // SEO tags
  assert.ok(html.includes('<link rel="canonical" href="https://titanwar.intel/">'), 'Canonical tag must exist');
  assert.ok(html.includes('<meta property="og:title"'), 'Open Graph tags must exist');
  assert.ok(html.includes('<meta name="twitter:card"'), 'Twitter card tags must exist');
  assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="assets/favicon.svg">'), 'Favicon link must exist');
  assert.ok(html.includes('application/ld+json'), 'Structured data JSON-LD must exist');

  // prefers-reduced-motion in CSS
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'), 'CSS must include prefers-reduced-motion media query');

  // Responsive breakpoints
  assert.ok(css.includes('@media (max-width: 480px)'), 'CSS must support mobile screens');
  assert.ok(css.includes('@media (max-width: 360px)'), 'CSS must support 360px viewport');

  // Decoupled architecture: Data loaded dynamically via loadDossiersData()
  assert.ok(js.includes('loadDossiersData'), 'app.js must dynamically load dossier data from JSON');
  assert.ok(!js.includes('end-to-end encrypted'), 'False claims like "end-to-end encrypted" must be dropped');

  // Verify legal documents exist in dossiers.json
  const dossiersJson = fs.readFileSync(path.join(__dirname, '..', 'public', 'data', 'dossiers.json'), 'utf-8');
  assert.ok(dossiersJson.includes('intel-privacy'), 'Legal documents must include Privacy Policy');
  assert.ok(dossiersJson.includes('intel-terms'), 'Legal documents must include Terms of Service');
  assert.ok(dossiersJson.includes('intel-refund'), 'Legal documents must include Demo & Refund Policy');
  assert.ok(dossiersJson.includes('intel-clearance'), 'Legal documents must include Security Clearance Protocol');
});

test('5. Content Credibility, Primary Sources & Verification Audits', async () => {
  // Test JSON data file delivery
  const jsonRes = await fetch(`${BASE_URL}/data/dossiers.json`);
  assert.strictEqual(jsonRes.status, 200, 'GET /data/dossiers.json should return 200 OK');
  assert.ok(jsonRes.headers.get('content-type').includes('application/json'), 'Content-Type must be application/json');

  const data = await jsonRes.json();
  assert.ok(data && data.dossiers, 'Data file must contain dossiers object');

  // Verify all dossiers have lastVerified and primarySources
  const dossierIds = Object.keys(data.dossiers);
  assert.ok(dossierIds.length >= 6, 'Must contain at least 6 core intelligence dossiers');

  dossierIds.forEach(id => {
    const item = data.dossiers[id];
    assert.ok(item.lastVerified, `Dossier ${id} must have lastVerified timestamp`);
    assert.ok(Array.isArray(item.primarySources), `Dossier ${id} must have primarySources array`);
    assert.ok(item.primarySources.length > 0, `Dossier ${id} must have at least one primary source`);
    item.primarySources.forEach(src => {
      assert.ok(src.title, `Source in ${id} must have title`);
      assert.ok(src.citation, `Source in ${id} must have citation`);
      assert.ok(src.url && src.url.startsWith('http'), `Source in ${id} must have valid URL`);
      assert.ok(src.type, `Source in ${id} must have type (e.g. Court Docket, SEC Form)`);
    });
  });

  // Dossier 2: Google vs DOJ - Judge Mehta remedies decision
  const d2 = data.dossiers['intel-2'];
  assert.ok(d2.content.includes('rejected the DOJ’s proposal to mandate a forced divestiture of the Chrome web browser'), 'Dossier 2 must state that Judge Mehta rejected Chrome forced sale');
  assert.ok(d2.content.includes('exclusive search distribution agreements'), 'Dossier 2 must describe injunction against exclusive agreements');
  assert.ok(d2.content.includes('non-exclusive'), 'Dossier 2 must clarify non-exclusive payments remain permissible');
  assert.ok(!d2.content.includes('18% profit hole'), 'Dossier 2 must not cite unsourced 18% profit hole');
  assert.ok(!d2.content.includes('structural separation of the Chrome browser'), 'Dossier 2 must not present Chrome separation as active remedy');

  // Dossier 5: Apple vs EU - Teresa Ribera
  const d5 = data.dossiers['intel-5'];
  assert.ok(d5.content.includes('Teresa Ribera'), 'Dossier 5 must name Teresa Ribera as EU competition chief');
  assert.ok(!d5.content.includes('Vestager'), 'Dossier 5 must not cite Margrethe Vestager as active chief');
  assert.ok(d5.content.includes('0.50 Core Technology Fee') || d5.content.includes('€0.50 Core Technology Fee'), 'Dossier 5 must verify €0.50 CTF fee structure');

  // Dossier 6: Waymo autonomous volume
  const d6 = data.dossiers['intel-6'];
  assert.ok(d6.content.includes('200,000 paid driverless passenger rides per week'), 'Dossier 6 must cite verified 200,000+ weekly rides');

  // Dossier 3: Frontier talent compensation
  const d3 = data.dossiers['intel-3'];
  assert.ok(d3.content.includes('$2M and $10M+') || d3.content.includes('$2M to $10M+'), 'Dossier 3 must accurately contextualize specialized RSU packages');

  // Ensure index.html does not contain stale names or claims
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  assert.ok(!html.includes('Vestager'), 'index.html must not cite Vestager as active chief');
  assert.ok(!html.includes('18% profit hole'), 'index.html must not cite 18% profit hole');
  assert.ok(html.includes('Teresa Ribera'), 'index.html must reference Teresa Ribera');
  assert.ok(html.includes('200,000 Weekly Rides'), 'index.html must reference 200,000+ weekly rides');
});

test('6. Preserved Core Tenets & Structural Standards', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const css = fs.readFileSync(path.join(__dirname, '..', 'public', 'styles.css'), 'utf-8');
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  const server = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf-8');
  const envExample = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf-8');

  // 1. White, Burgundy, and Gold Identity
  assert.ok(css.includes('--burgundy-primary: #58111a;'), 'CSS must define primary burgundy (#58111a)');
  assert.ok(css.includes('--accent-gold: #cfa856;'), 'CSS must define tech combatant gold (#cfa856)');
  assert.ok(css.includes('--color-white: #ffffff;'), 'CSS must define pure white (#ffffff)');
  assert.ok(html.includes('theme-burgundy-white'), 'HTML body must wear burgundy-white theme');

  // 2. Asset-Free Web Audio Design (Synthesizer via Web Audio API, no MP3s)
  assert.ok(js.includes('AudioContext'), 'app.js must use Web Audio API AudioContext');
  assert.ok(js.includes('createOscillator'), 'app.js must synthesize audio via createOscillator');
  assert.ok(js.includes('createGain'), 'app.js must modulate gain via createGain');
  assert.strictEqual(/\.mp3/i.test(js), false, 'app.js must not load external MP3 audio files');

  // 3. Moving Content Pause Buttons (Font-scale controls dropped with top strip per Task 1 specifications)
  assert.ok(html.includes('id="ticker-pause-btn"'), 'Horizontal ticker must have pause button');
  assert.ok(html.includes('id="vertical-pause-btn"'), 'Vertical feed must have pause button');
  assert.ok(js.includes('setFontScale'), 'app.js must implement setFontScale function');

  // 4. OTP Expiry, 5-Attempt Lockout, and Delete-After-Use
  assert.ok(server.includes('MAX_VERIFY_ATTEMPTS: 5'), 'server.js must enforce 5-attempt verify limit');
  assert.ok(server.includes('record.attempts >= RATE_LIMITS.MAX_VERIFY_ATTEMPTS'), 'server.js must lock out after max attempts');
  assert.ok(server.includes('Date.now() > record.expiresAt'), 'server.js must enforce OTP expiration');
  assert.ok(server.includes('otpStore.delete(email);'), 'server.js must delete OTP after use or lockout');

  // 5. autocomplete="one-time-code"
  const otpHeroMatch = html.match(/id="hero-otp-input"[^>]*autocomplete="one-time-code"/);
  assert.ok(otpHeroMatch, 'Hero OTP field must have autocomplete="one-time-code"');
  const otpDigitMatch = html.match(/id="otp-1"[^>]*autocomplete="one-time-code"/);
  assert.ok(otpDigitMatch, 'Page 4 OTP fields must have autocomplete="one-time-code"');

  // 6. Alt Text on All Images, lang="en", Single <h1>, and Clear .env.example
  assert.ok(html.startsWith('<!DOCTYPE html>\n<html lang="en">'), 'HTML must declare lang="en"');
  
  // Single <h1>
  const h1Matches = html.match(/<h1\b/gi) || [];
  assert.strictEqual(h1Matches.length, 1, 'Document must contain exactly one <h1> element');

  // Alt text on every <img> tag
  const imgTags = html.match(/<img\b[^>]*>/gi) || [];
  assert.ok(imgTags.length > 0, 'Document must have images');
  imgTags.forEach(tag => {
    assert.ok(/alt="[^"]+"/i.test(tag), `Image tag ${tag} must contain a non-empty alt attribute`);
  });

  // Clear .env.example
  assert.ok(envExample.includes('SMTP_SERVICE='), '.env.example must document SMTP_SERVICE');
  assert.ok(envExample.includes('SMTP_USER='), '.env.example must document SMTP_USER');
  assert.ok(envExample.includes('SMTP_PASS='), '.env.example must document SMTP_PASS');
  assert.ok(envExample.includes('SESSION_SECRET='), '.env.example must document SESSION_SECRET');
  assert.ok(envExample.includes('TURNSTILE_SITE_KEY='), '.env.example must document TURNSTILE_SITE_KEY');
});

test('7. Static Showcase Architecture & Edge Hosting Configuration', () => {
  const js = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'index.html'), 'utf-8');
  const netlify = fs.readFileSync(path.join(__dirname, '..', 'netlify.toml'), 'utf-8');
  const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf-8'));

  // Client-side simulation guarantees
  assert.ok(js.includes('maxAttempts: 5'), 'app.js client simulation must enforce 5-attempt limit');
  assert.ok(js.includes('TitanAuth.activeOtp = null;'), 'app.js client simulation must delete OTP after use');
  assert.ok(js.includes('deriveUserPersona'), 'app.js must provide client-side persona derivation');
  assert.ok(js.includes('checkSmtpStatus'), 'app.js must implement checkSmtpStatus');
  assert.ok(js.includes('openSmtpModal'), 'app.js must implement openSmtpModal');
  assert.ok(js.includes('closeSmtpModal'), 'app.js must implement closeSmtpModal');

  // Showcase UI labelling
  assert.ok(html.includes('[Showcase Demo]'), 'index.html title must reflect Showcase Demo');
  assert.ok(html.includes('INTERACTIVE SHOWCASE DEMO'), 'index.html must display INTERACTIVE SHOWCASE DEMO badge');

  // Netlify edge config
  assert.ok(netlify.includes('Content-Security-Policy'), 'netlify.toml must declare Content-Security-Policy');
  assert.ok(netlify.includes('nosniff'), 'netlify.toml must declare nosniff header');
  assert.ok(netlify.includes('X-Frame-Options'), 'netlify.toml must declare X-Frame-Options header');

  // Vercel edge config
  assert.strictEqual(vercel.outputDirectory, 'public', 'vercel.json must output from public directory');
  assert.strictEqual(vercel.cleanUrls, true, 'vercel.json must set cleanUrls to true');
  assert.ok(vercel.headers.length > 0, 'vercel.json must specify security headers');
});


