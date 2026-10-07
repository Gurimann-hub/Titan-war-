const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('Phase 2 Hardening: Strict Security Headers on HTML Delivery', async () => {
  const rootRes = await fetch(`${BASE_URL}/`);
  assert.strictEqual(rootRes.status, 200);

  // 1. Strict Transport Security (HSTS)
  const hsts = rootRes.headers.get('strict-transport-security');
  assert.ok(hsts, 'HSTS header must be present');
  assert.ok(hsts.includes('max-age=31536000'), 'HSTS must specify at least 1 year');
  assert.ok(hsts.includes('includeSubDomains'), 'HSTS must includeSubDomains');

  // 2. MIME sniffing protection
  assert.strictEqual(rootRes.headers.get('x-content-type-options'), 'nosniff');

  // 3. Clickjacking protection
  assert.strictEqual(rootRes.headers.get('x-frame-options'), 'DENY');

  // 4. Referrer Policy
  assert.strictEqual(rootRes.headers.get('referrer-policy'), 'strict-origin-when-cross-origin');

  // 5. Permissions Policy
  const permissions = rootRes.headers.get('permissions-policy');
  assert.ok(permissions, 'Permissions-Policy header must be present');
  assert.ok(permissions.includes('camera=()'), 'Camera must be restricted');
  assert.ok(permissions.includes('microphone=()'), 'Microphone must be restricted');

  // 6. Content Security Policy (Self-Contained, Zero External CDNs)
  const csp = rootRes.headers.get('content-security-policy') || '';
  assert.ok(csp, 'CSP must be present');
  assert.ok(csp.includes("default-src 'self'"), 'CSP must restrict default-src to self');
  assert.ok(!csp.includes('challenges.cloudflare.com'), 'CSP must not allow external cloudflare');
});

test('Phase 2 Hardening: Local Font Delivery & Zero Third-Party Font Links', async () => {
  // Test local fonts.css delivery
  const fontsCssRes = await fetch(`${BASE_URL}/fonts/fonts.css`);
  assert.strictEqual(fontsCssRes.status, 200, 'fonts.css should return 200');
  const fontsCssText = await fontsCssRes.text();
  assert.ok(fontsCssText.includes("@font-face"), 'fonts.css must declare @font-face');
  assert.ok(fontsCssText.includes("Cinzel"), 'fonts.css must define Cinzel');
  assert.ok(fontsCssText.includes("Plus Jakarta Sans"), 'fonts.css must define Plus Jakarta Sans');

  // Test local font binary delivery with caching
  const fontBinaryRes = await fetch(`${BASE_URL}/fonts/cinzel-600.ttf`);
  assert.strictEqual(fontBinaryRes.status, 200, 'Font binary should return 200');
  assert.ok(fontBinaryRes.headers.get('content-type').includes('font/'), 'Font should have font MIME type');
  assert.ok(fontBinaryRes.headers.get('cache-control').includes('public'), 'Font binary must be cached publicly');

  // Verify static HTML pages load local fonts and do NOT load external Cloudflare scripts
  const publicDir = path.join(__dirname, '..', 'public');
  const htmlFiles = ['index.html', 'login.html', 'materials.html'];

  for (const file of htmlFiles) {
    const content = fs.readFileSync(path.join(publicDir, file), 'utf8');
    assert.ok(content.includes('/fonts/fonts.css'), `${file} must link to local /fonts/fonts.css`);
    assert.ok(!content.includes('challenges.cloudflare.com'), `${file} must not load external cloudflare scripts`);
  }
});

test('Phase 2 Hardening: Trading Assistant Workstation Route & Isolation', async () => {
  // Static asset delivery for Trading Assistant bundle
  const assetRes = await fetch(`${BASE_URL}/trading-assistant/assets/index-DX773-IE.js`);
  assert.strictEqual(assetRes.status, 200, 'Trading assistant bundle must return 200');
  assert.strictEqual(assetRes.headers.get('x-content-type-options'), 'nosniff');

  // Static CSS delivery for Trading Assistant bundle
  const cssRes = await fetch(`${BASE_URL}/trading-assistant/assets/index-DBEPqIPN.css`);
  assert.strictEqual(cssRes.status, 200, 'Trading assistant CSS must return 200');
});
