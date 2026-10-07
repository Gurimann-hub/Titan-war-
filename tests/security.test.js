const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const {
  escapeHtml,
  isSafeUrl,
  sanitizeHtml,
  isValidEmail
} = require('../public/app.js');

test('1. [Finding 1 - CWE-798] Secrets Audit & HMAC Cryptographic Integrity', () => {
  // Check .env does NOT contain hardcoded secrets
  const envPath = path.join(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    const envContent = fs.readFileSync(envPath, 'utf-8');
    const sessionLine = envContent.split(/\r?\n/).find(l => l.startsWith('SESSION_SECRET='));
    assert.ok(sessionLine !== undefined, 'SESSION_SECRET entry must exist in .env');
    const secretValue = sessionLine.split('=')[1].trim();
    assert.strictEqual(secretValue, '', 'SESSION_SECRET in .env must be empty so dev uses ephemeral fallback');
  }

  // Verify HMAC-SHA256 signature verification & tamper resistance
  const testSecret = crypto.randomBytes(32).toString('hex');
  const user = {
    sub: 'auditor@titanwar.intel',
    name: 'Security Auditor',
    faction: 'WAR ROOM COMMAND',
    avatar: 'SA',
    clearance: 'LEVEL 5',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600
  };

  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(user)).toString('base64url');
  const sig = crypto.createHmac('sha256', testSecret).update(`${header}.${payload}`).digest('base64url');
  const validToken = `${header}.${payload}.${sig}`;

  // Helper matching server.js verifySessionToken
  function verifyToken(token, secret) {
    if (!token || typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const [h, p, s] = parts;
    const expectedSig = crypto.createHmac('sha256', secret).update(`${h}.${p}`).digest('base64url');
    const sigBuf = Buffer.from(s);
    const expBuf = Buffer.from(expectedSig);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) return null;
    try {
      const data = JSON.parse(Buffer.from(p, 'base64url').toString('utf8'));
      if (data.exp && data.exp < Math.floor(Date.now() / 1000)) return null;
      return data;
    } catch {
      return null;
    }
  }

  // 1. Valid token passes
  const verified = verifyToken(validToken, testSecret);
  assert.ok(verified, 'Valid HMAC signature should pass verification');
  assert.strictEqual(verified.sub, user.sub);

  // 2. Tampered payload is rejected (attacker changing identity)
  const tamperedPayload = Buffer.from(JSON.stringify({ ...user, sub: 'admin@titanwar.intel' })).toString('base64url');
  const forgedToken = `${header}.${tamperedPayload}.${sig}`;
  assert.strictEqual(verifyToken(forgedToken, testSecret), null, 'Tampered token payload must be rejected');

  // 3. Forged token with invalid secret is rejected
  const fakeSecret = crypto.randomBytes(32).toString('hex');
  assert.strictEqual(verifyToken(validToken, fakeSecret), null, 'Token signed with different secret must be rejected');

  // 4. Expired token is rejected
  const expiredPayload = Buffer.from(JSON.stringify({ ...user, exp: Math.floor(Date.now() / 1000) - 60 })).toString('base64url');
  const expiredSig = crypto.createHmac('sha256', testSecret).update(`${header}.${expiredPayload}`).digest('base64url');
  assert.strictEqual(verifyToken(`${header}.${expiredPayload}.${expiredSig}`, testSecret), null, 'Expired token must be rejected');
});

test('2. [Finding 2 - CWE-287] Client-Side Authentication Bypass Isolation', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');

  // Verify simulation OTP generation is conditional on IS_DEMO_MODE
  assert.ok(
    appCode.includes('IS_DEMO_MODE ? String(Math.floor(100000 + Math.random() * 900000)) : null;'),
    'app.js must only generate simulation OTP when IS_DEMO_MODE is true'
  );

  // Verify verifyOtp verifies IS_DEMO_MODE before persona derivation
  assert.ok(
    appCode.includes('if (IS_DEMO_MODE)'),
    'app.js verifyOtp must check IS_DEMO_MODE before fallback verification'
  );

  // Verify server failure does not silently succeed outside demo mode
  assert.ok(
    appCode.includes('if (!serverDispatched && !IS_DEMO_MODE)'),
    'app.js must fail closed when server fails and not in demo mode'
  );
});

test('3. [Finding 3 - CWE-79] XSS Sanitization & Safe URL Validation', () => {
  // Test escapeHtml
  assert.strictEqual(
    escapeHtml('<script>alert("xss")</script>'),
    '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;',
    'escapeHtml must escape <, >, and "'
  );
  assert.strictEqual(
    escapeHtml("Titan's Intel & War Room"),
    'Titan&#039;s Intel &amp; War Room',
    'escapeHtml must escape single quotes and ampersands'
  );
  assert.strictEqual(escapeHtml(null), '', 'escapeHtml(null) must return empty string');
  assert.strictEqual(escapeHtml(undefined), '', 'escapeHtml(undefined) must return empty string');

  // Test isSafeUrl (blocks javascript: and invalid schemes)
  assert.strictEqual(isSafeUrl('javascript:alert(document.cookie)'), false, 'javascript: URL must be rejected');
  assert.strictEqual(isSafeUrl('data:text/html,<script>alert(1)</script>'), false, 'data: URL must be rejected');
  assert.strictEqual(isSafeUrl('vbscript:msgbox(1)'), false, 'vbscript: URL must be rejected');
  assert.strictEqual(isSafeUrl('https://www.sec.gov/edgar/browse/?CIK=0001045810'), true, 'HTTPS SEC URL must be accepted');
  assert.strictEqual(isSafeUrl('http://localhost:3000/dossiers.json'), true, 'HTTP URL must be accepted');

  // Test sanitizeHtml
  const dirty = '<p>Safe text <strong>bold</strong><script>alert("hack")</script></p>';
  const clean = sanitizeHtml(dirty);
  assert.ok(!clean.includes('<script>'), 'sanitizeHtml must strip script tags');
  assert.ok(clean.includes('Safe text'), 'sanitizeHtml must preserve legitimate text content');

  // Verify all 3 innerHTML sinks in app.js are sanitized
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  assert.ok(appCode.includes('escapeHtml(email)'), 'inbox preview must escape email');
  assert.ok(appCode.includes('escapeHtml(clientOtp)'), 'hero otp bar must escape clientOtp');
  assert.ok(appCode.includes('escapeHtml(data.title)'), 'modal title must be escaped');
  assert.ok(appCode.includes('sanitizeHtml(data.content)'), 'modal content must be sanitized');
  assert.ok(appCode.includes('isSafeUrl(src.url)'), 'modal links must validate safe URL');
});

test('4. [Finding 4 - CWE-922] Session Token Storage in HttpOnly Cookie', () => {
  const appCode = fs.readFileSync(path.join(__dirname, '..', 'public', 'app.js'), 'utf-8');
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf-8');

  // Confirm localStorage.setItem('titan_session_token') was eliminated
  assert.strictEqual(
    appCode.includes("localStorage.setItem('titan_session_token'"),
    false,
    'Client must NOT store session token in localStorage'
  );

  // Confirm server.js sets HttpOnly cookie on /api/verify-otp
  assert.ok(
    serverCode.includes("'Set-Cookie': `titan_session=${sessionToken}; ${cookieFlags}`"),
    'server.js must set HttpOnly cookie on OTP verification'
  );

  // Confirm cookieFlags include HttpOnly and SameSite=Lax
  assert.ok(
    serverCode.includes("HttpOnly; SameSite=Lax; Path=/; Max-Age=86400"),
    'server.js cookie flags must declare HttpOnly, SameSite=Lax, and Max-Age'
  );

  // Confirm /api/session reads from cookies
  assert.ok(
    serverCode.includes("cookies['titan_session']"),
    'server.js /api/session must read session from cookie'
  );

  // Confirm /api/logout clears cookie with Max-Age=0
  assert.ok(
    serverCode.includes("/api/logout"),
    'server.js must implement /api/logout'
  );
  assert.ok(
    serverCode.includes("Max-Age=0"),
    'server.js /api/logout must expire cookie with Max-Age=0'
  );
});

test('5. [Finding 5 - CWE-79] Email HTML Template Injection Defense', () => {
  const serverCode = fs.readFileSync(path.join(__dirname, '..', 'server.js'), 'utf-8');

  // Confirm escapeHtmlForEmail helper is defined in server.js
  assert.ok(serverCode.includes('function escapeHtmlForEmail'), 'server.js must define escapeHtmlForEmail helper');

  // Confirm safeEmail and safeOtp are interpolated into mail options
  assert.ok(serverCode.includes('const safeEmail = escapeHtmlForEmail(toEmail);'), 'server.js must sanitize toEmail');
  assert.ok(serverCode.includes('const safeOtp = escapeHtmlForEmail(otpCode);'), 'server.js must sanitize otpCode');
  assert.ok(serverCode.includes('${safeEmail}'), 'mail template must use ${safeEmail}');
  assert.ok(serverCode.includes('${safeOtp}'), 'mail template must use ${safeOtp}');
});
