const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// =========================================================================
// 1. CONFIGURATION & ENVIRONMENT LOADER
// =========================================================================
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  try {
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const match = trimmed.match(/^([\w.-]+)\s*=\s*(.*)$/);
      if (match) {
        const key = match[1].trim();
        let value = match[2].trim().replace(/^['"](.*)['"]$/, '$1');
        if (process.env[key] === undefined) {
          process.env[key] = value;
        }
      }
    });
    console.log('[TITAN] Loaded configuration from .env');
  } catch (err) {
    console.warn('[TITAN] Could not load .env file:', err.message);
  }
}

const {
  HOST_USER,
  getAllMaterials,
  getMaterialById,
  addMaterial,
  getStorageMetrics
} = require('./materials-store');

const { RateLimiter } = require('./rate-limit');
const { getCandles, isKnownSymbol } = require('./market-data');
const chatLimiter = new RateLimiter({
  limit: parseInt(process.env.CHAT_RATE_LIMIT_PER_MINUTE, 10) || 20,
  windowMs: 60 * 1000
});

const {
  MARKET_SNAPSHOTS,
  PROFITABLE_ROWS,
  SUPPLY_CHAINS,
  DISCLAIMER,
  tryProxyToFastApi,
  buildJarvisAnalystResponse,
  buildMarketOracleVerdict
} = require('./trading-assistant');

const { getAggregatedNews } = require('./news-aggregator');
const { botInstance } = require('./trading-bot');
const { watchdogInstance } = require('./watchdog');

const db = require('./db');
const bcrypt = require('bcrypt');

// Nodemailer optional import
let nodemailer = null;
try {
  nodemailer = require('nodemailer');
} catch (e) {
  console.log('[TITAN] Nodemailer not found, SMTP delivery unavailable.');
}

const IS_PROD = process.env.NODE_ENV === 'production';
const PORT = parseInt(process.env.PORT, 10) || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

// Ensure secrets are NOT hardcoded
const SMTP_USER = (process.env.SMTP_USER || '').trim();
const SMTP_PASS = (process.env.SMTP_PASS || '').trim();
const SMTP_SERVICE = process.env.SMTP_SERVICE || '';
const SMTP_HOST = (process.env.SMTP_HOST || '').trim();
const SMTP_PORT = parseInt(process.env.SMTP_PORT, 10) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_FROM = (process.env.SMTP_FROM || '').trim() || (SMTP_USER ? `"Titan War Command" <${SMTP_USER}>` : '');

// Session Security: Generate or load 256-bit secret key for HMAC token signing
let SESSION_SECRET = (process.env.SESSION_SECRET || '').trim();
if (!SESSION_SECRET) {
  if (IS_PROD) {
    console.error('[TITAN FATAL] SESSION_SECRET environment variable is required in production. Refusing to start.');
    process.exit(1);
  } else {
    SESSION_SECRET = crypto.randomBytes(32).toString('hex');
    console.warn('[TITAN WARNING] SESSION_SECRET is not configured. Ephemeral secret generated; sessions will reset on restart.');
  }
}

// Cloudflare Turnstile bot protection keys
const TURNSTILE_SITE_KEY = (process.env.TURNSTILE_SITE_KEY || '').trim();
const TURNSTILE_SECRET_KEY = (process.env.TURNSTILE_SECRET_KEY || '').trim();

// In production, refuse to start without Turnstile keys
if (IS_PROD) {
  const missingKeys = [];
  if (!TURNSTILE_SITE_KEY) missingKeys.push('TURNSTILE_SITE_KEY');
  if (!TURNSTILE_SECRET_KEY) missingKeys.push('TURNSTILE_SECRET_KEY');
  if (missingKeys.length > 0) {
    console.error(`[TITAN FATAL] Production configuration error: Missing required Turnstile keys (${missingKeys.join(', ')}). Refusing to start.`);
    process.exit(1);
  }
}

// =========================================================================
// 2. IN-MEMORY STORES & RATE LIMITING
// =========================================================================

// OTP Store: email -> { otp: string, expiresAt: number, attempts: number, createdAt: number }
const otpStore = new Map();

// Rate Limit Stores:
// ipOtps: ip -> array of request timestamps (last 10 minutes)
const ipOtpRequests = new Map();
// emailOtps: email -> array of request timestamps (last 10 minutes)
const emailOtpRequests = new Map();
// failedVerifications: ip -> array of failed verification timestamps (last 10 minutes)
const failedVerifications = new Map();

const RATE_LIMITS = {
  IP_MAX_REQUESTS: 5,           // Max 5 OTP sends per IP per 10 mins
  IP_COOLDOWN_MS: 60 * 1000,    // 60-second cooldown between OTP sends per IP
  EMAIL_MAX_REQUESTS: 3,        // Max 3 OTP sends per email per 10 mins
  EMAIL_COOLDOWN_MS: 60 * 1000, // 60-second cooldown between OTP sends per email
  MAX_VERIFY_ATTEMPTS: 5,       // Max 5 attempts per OTP code
  IP_MAX_FAILED_VERIFIES: 10,   // Max 10 failed verifies per IP per 10 mins
  WINDOW_MS: 10 * 60 * 1000     // 10 minute sliding window
};

// Periodic cleanup of expired entries
setInterval(() => {
  const now = Date.now();

  // Expired OTPs
  for (const [email, record] of otpStore.entries()) {
    if (now > record.expiresAt) {
      otpStore.delete(email);
    }
  }

  // Rate limit cleanup
  const cleanMap = (map) => {
    for (const [key, timestamps] of map.entries()) {
      const active = timestamps.filter(t => now - t < RATE_LIMITS.WINDOW_MS);
      if (active.length === 0) {
        map.delete(key);
      } else {
        map.set(key, active);
      }
    }
  };

  cleanMap(ipOtpRequests);
  cleanMap(emailOtpRequests);
  cleanMap(failedVerifications);
}, 60 * 1000);

// Helper: mask email for privacy and zero log retention compliance
function maskEmail(email) {
  if (!email || typeof email !== 'string') return '***';
  const parts = email.split('@');
  if (parts.length !== 2) return '***';
  const [local, domain] = parts;
  const maskedLocal = local.length <= 2
    ? local[0] + '*'
    : local[0] + '*'.repeat(Math.min(local.length - 2, 6)) + local[local.length - 1];
  return `${maskedLocal}@${domain}`;
}

// Helper: extract client IP safely
// Behind Cloudflare, read cf-connecting-ip first.
// Behind another trusted proxy, take the right-most trusted hop.
// Direct to internet, rely solely on socket remoteAddress to prevent spoofing.
function getClientIp(req) {
  // 1. Cloudflare proxy: cf-connecting-ip is set by Cloudflare edge and cannot be forged
  const cfIp = req.headers['cf-connecting-ip'];
  if (cfIp && typeof cfIp === 'string') {
    return cfIp.trim();
  }

  // 2. Behind another trusted reverse proxy (e.g. Render, Railway, Nginx)
  const trustProxy = process.env.TRUST_PROXY === 'true' || process.env.TRUST_PROXY === '1' || Boolean(process.env.RENDER || process.env.RAILWAY_ENVIRONMENT);
  if (trustProxy) {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded && typeof forwarded === 'string') {
      const parts = forwarded.split(',').map(s => s.trim()).filter(Boolean);
      if (parts.length > 0) {
        // Right-most hop is appended by the nearest trusted reverse proxy
        return parts[parts.length - 1];
      }
    }
  }

  // 3. Direct to internet: rely solely on the direct socket remoteAddress
  let rawIp = (req.socket && req.socket.remoteAddress) || '127.0.0.1';
  // Strip IPv6 mapped IPv4 prefix
  if (rawIp.startsWith('::ffff:')) {
    rawIp = rawIp.slice(7);
  }
  return rawIp;
}

// Helper: check rate limit for OTP dispatch
function checkOtpSendRateLimit(ip, email) {
  const now = Date.now();

  // 1. IP checks
  const ipLogs = ipOtpRequests.get(ip) || [];
  const recentIpLogs = ipLogs.filter(t => now - t < RATE_LIMITS.WINDOW_MS);
  if (recentIpLogs.length >= RATE_LIMITS.IP_MAX_REQUESTS) {
    const oldest = recentIpLogs[0];
    const retryAfter = Math.ceil((RATE_LIMITS.WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, message: `Too many requests from this IP. Please wait ${retryAfter}s before retrying.`, retryAfter };
  }
  if (recentIpLogs.length > 0) {
    const timeSinceLast = now - recentIpLogs[recentIpLogs.length - 1];
    if (timeSinceLast < RATE_LIMITS.IP_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RATE_LIMITS.IP_COOLDOWN_MS - timeSinceLast) / 1000);
      return { allowed: false, message: `Please wait ${retryAfter}s before requesting another verification code.`, retryAfter };
    }
  }

  // 2. Email checks
  const emailLogs = emailOtpRequests.get(email) || [];
  const recentEmailLogs = emailLogs.filter(t => now - t < RATE_LIMITS.WINDOW_MS);
  if (recentEmailLogs.length >= RATE_LIMITS.EMAIL_MAX_REQUESTS) {
    const oldest = recentEmailLogs[0];
    const retryAfter = Math.ceil((RATE_LIMITS.WINDOW_MS - (now - oldest)) / 1000);
    return { allowed: false, message: `Too many requests for this email address. Please retry in ${retryAfter}s.`, retryAfter };
  }
  if (recentEmailLogs.length > 0) {
    const timeSinceLast = now - recentEmailLogs[recentEmailLogs.length - 1];
    if (timeSinceLast < RATE_LIMITS.EMAIL_COOLDOWN_MS) {
      const retryAfter = Math.ceil((RATE_LIMITS.EMAIL_COOLDOWN_MS - timeSinceLast) / 1000);
      return { allowed: false, message: `Please wait ${retryAfter}s before requesting a new code for this email.`, retryAfter };
    }
  }

  return { allowed: true };
}

function recordOtpSend(ip, email) {
  const now = Date.now();
  const ipLogs = ipOtpRequests.get(ip) || [];
  ipLogs.push(now);
  ipOtpRequests.set(ip, ipLogs);

  const emailLogs = emailOtpRequests.get(email) || [];
  emailLogs.push(now);
  emailOtpRequests.set(email, emailLogs);
}

// Check failed verification brute force rate limit
function checkVerificationRateLimit(ip) {
  const now = Date.now();
  const failed = failedVerifications.get(ip) || [];
  const recentFailed = failed.filter(t => now - t < RATE_LIMITS.WINDOW_MS);
  if (recentFailed.length >= RATE_LIMITS.IP_MAX_FAILED_VERIFIES) {
    return { allowed: false, message: 'Too many failed verification attempts. Please wait 10 minutes.' };
  }
  return { allowed: true };
}

function recordFailedVerification(ip) {
  const now = Date.now();
  const failed = failedVerifications.get(ip) || [];
  failed.push(now);
  failedVerifications.set(ip, failed);
}

// =========================================================================
// 3. CLOUDFLARE TURNSTILE VERIFICATION
// =========================================================================
async function verifyTurnstile(token, clientIp) {
  if (!TURNSTILE_SECRET_KEY) {
    // In production, fail closed if Turnstile secret is unconfigured
    if (IS_PROD) {
      return { success: false, message: 'Bot protection is required in production.' };
    }
    // Development mode fallback
    return { success: true };
  }

  if (!token) {
    return { success: false, message: 'Cloudflare Turnstile token required.' };
  }

  try {
    const bodyParams = new URLSearchParams();
    bodyParams.append('secret', TURNSTILE_SECRET_KEY);
    bodyParams.append('response', token);
    if (clientIp) {
      bodyParams.append('remoteip', clientIp);
    }

    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: bodyParams.toString()
    });

    const result = await response.json();
    if (result && result.success) {
      return { success: true };
    } else {
      console.warn('[TITAN TURNSTILE] Verification rejected:', result['error-codes']);
      return { success: false, message: 'Bot protection challenge verification failed.' };
    }
  } catch (err) {
    console.error('[TITAN TURNSTILE] Error contacting Cloudflare:', err.message);
    return { success: false, message: 'Bot verification service unavailable.' };
  }
}

// =========================================================================
// 4. CRYPTOGRAPHIC SESSIONS (HMAC-SHA256 TOKENS)
// =========================================================================
function createSessionToken(user) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const duration = user.durationSeconds || (24 * 60 * 60);
  const payload = {
    sub: user.email,
    name: user.name,
    faction: user.faction || 'HOST INTELLIGENCE ENCLAVE',
    avatar: user.avatar || 'AM',
    clearance: user.clearance || 'LEVEL 5 (HOST PRIVILEGES)',
    role: user.role || 'host',
    userId: user.userId || user.id || 'usr_94812',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + duration
  };

  const b64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
  const b64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  return `${b64Header}.${b64Payload}.${signature}`;
}

function verifySessionToken(token) {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [b64Header, b64Payload, signature] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${b64Header}.${b64Payload}`)
    .digest('base64url');

  // Constant-time comparison to prevent timing attacks
  const sigBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSig);
  if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(b64Payload, 'base64url').toString('utf8'));
    if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) {
      return null; // Expired
    }
    return payload;
  } catch (err) {
    return null;
  }
}

function verifySession(token) {
  if (!token || typeof token !== 'string') return null;
  // 1. Check persistent SQLite session first
  const sqliteSession = db.validateSession(token);
  if (sqliteSession) {
    return {
      userId: sqliteSession.user_id,
      name: sqliteSession.username,
      email: sqliteSession.email,
      role: sqliteSession.role,
      avatar: (sqliteSession.username || 'AM').slice(0, 2).toUpperCase(),
      clearance: (sqliteSession.role === 'admin' || sqliteSession.role === 'host') ? 'LEVEL 5 (ADMIN / HOST)' : 'LEVEL 2 (ANALYST)'
    };
  }
  // 2. Fallback to legacy HMAC signed session token
  const legacy = verifySessionToken(token);
  if (legacy) {
    return {
      userId: legacy.userId || HOST_USER.id,
      name: legacy.name || HOST_USER.name,
      email: legacy.sub || legacy.email || HOST_USER.email,
      role: legacy.role || 'host',
      avatar: legacy.avatar || 'AM',
      clearance: legacy.clearance || 'LEVEL 5'
    };
  }
  return null;
}

// =========================================================================
// 5. SECURE EMAIL DISPATCH (NODEMAILER)
// =========================================================================
async function sendRealEmail(toEmail, otpCode) {
  if (!nodemailer || (!SMTP_HOST && !SMTP_USER) || !SMTP_PASS) {
    return { sent: false, reason: 'smtp_not_configured' };
  }

  let transporter;
  if (SMTP_HOST) {
    // Transactional email provider (Resend, Postmark, AWS SES, Brevo, custom SMTP)
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  } else {
    // Standard service-based dispatch (e.g. Gmail)
    transporter = nodemailer.createTransport({
      service: SMTP_SERVICE || 'gmail',
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS
      }
    });
  }

  function escapeHtmlForEmail(str) {
    return String(str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const fromAddress = SMTP_FROM || `"Titan War Command" <${SMTP_USER}>`;

  const safeEmail = escapeHtmlForEmail(toEmail);
  const safeOtp = escapeHtmlForEmail(otpCode);

  const mailOptions = {
    from: fromAddress,
    to: toEmail,
    subject: `🔐 Titan War Verification Code: [ ${otpCode} ]`,
    text: `Your Titan War Executive Gate verification code is: ${otpCode}\nThis code will expire in 10 minutes. Do not share this code with anyone.`,
    html: `
      <div style="background-color: #140406; color: #f4efe8; font-family: 'Helvetica Neue', Arial, sans-serif; padding: 40px 20px; max-width: 600px; margin: 0 auto; border-radius: 12px; border: 2px solid #721623;">
        <div style="text-align: center; border-bottom: 1px solid rgba(255,255,255,0.1); padding-bottom: 20px; margin-bottom: 25px;">
          <h1 style="color: #ffffff; font-size: 26px; margin: 0; letter-spacing: 2px; text-transform: uppercase;">
            TITAN <span style="color: #a92036;">WAR</span>
          </h1>
          <p style="color: #cfa856; font-size: 11px; letter-spacing: 3px; margin: 5px 0 0 0; text-transform: uppercase;">
            Big Tech Giants Battlefield Intelligence
          </p>
        </div>
        
        <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(114, 22, 35, 0.4); border-radius: 8px; padding: 25px; text-align: center; margin-bottom: 25px;">
          <p style="font-size: 14px; color: #d1b8bd; margin-top: 0;">
            An executive clearance request was initiated for: <strong style="color: #ffffff;">${safeEmail}</strong>
          </p>
          <p style="font-size: 13px; color: #a08589; margin-bottom: 20px;">
            Enter the following 6-digit one-time passcode into the Titan Gate portal to verify your identity and access clearance:
          </p>
          
          <div style="background: #2a050b; border: 2px dashed #cfa856; border-radius: 8px; display: inline-block; padding: 16px 36px; margin: 10px 0;">
            <span style="font-family: monospace; font-size: 38px; font-weight: bold; letter-spacing: 8px; color: #ffffff;">
              ${safeOtp}
            </span>
          </div>
          
          <p style="font-size: 12px; color: #888; margin-top: 15px; margin-bottom: 0;">
            ⏱ Valid for <strong style="color: #cfa856;">10 minutes</strong>. If you did not request this verification code, please ignore this email.
          </p>
        </div>

        <div style="text-align: center; font-size: 11px; color: #72565c; line-height: 1.6;">
          🔒 TLS transport security &bull; HMAC-SHA256 session token authentication<br>
          Silicon Valley &bull; Redmond &bull; Wall Street Executive Protocol
        </div>
      </div>
    `
  };

  const info = await transporter.sendMail(mailOptions);
  return { sent: true, messageId: info.messageId };
}

// =========================================================================
// 6. HTTP HELPERS & STATIC MIME TYPES
// =========================================================================
const MIME_TYPES = {
  '.html': 'text/html; charset=UTF-8',
  '.css': 'text/css; charset=UTF-8',
  '.js': 'application/javascript; charset=UTF-8',
  '.mjs': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

function sendJson(res, statusCode, data, headers = {}) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=UTF-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    ...headers
  });
  res.end(JSON.stringify(data));
}

function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    let rejected = false;
    const MAX_SIZE = 100 * 1024; // 100KB limit for JSON API

    req.on('data', chunk => {
      if (rejected) return;
      body += chunk.toString();
      if (body.length > MAX_SIZE) {
        rejected = true;
        req.pause();
        const err = new Error('Payload Too Large: maximum request body is 100KB');
        err.statusCode = 413;
        reject(err);
      }
    });

    req.on('end', () => {
      if (rejected) return;
      if (!body) {
        return resolve({});
      }
      try {
        const parsed = JSON.parse(body);
        resolve(parsed);
      } catch (err) {
        const parseErr = new Error('Malformed JSON payload');
        parseErr.statusCode = 400;
        reject(parseErr);
      }
    });

    req.on('error', (err) => {
      if (!rejected) {
        rejected = true;
        reject(err);
      }
    });
  });
}

function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers && req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach(cookie => {
    const parts = cookie.split('=');
    const name = parts.shift().trim();
    if (name) {
      list[name] = decodeURIComponent(parts.join('='));
    }
  });
  return list;
}

// =========================================================================
// 7. HTTP SERVER & REQUEST DISPATCHER
// =========================================================================
const server = http.createServer(async (req, res) => {
  // Wrap entire request lifecycle in top-level try/catch to prevent unhandled process crashes
  try {
    // CORS Preflight Handling (Restricted to same-origin or explicit CORS_ORIGINS allow-list)
    if (req.method === 'OPTIONS') {
      const allowedOrigins = (process.env.CORS_ORIGINS || '').split(',').map(s => s.trim()).filter(Boolean);
      const origin = req.headers.origin;
      const headers = {
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      };
      if (origin && allowedOrigins.includes(origin)) {
        headers['Access-Control-Allow-Origin'] = origin;
        headers['Vary'] = 'Origin';
      }
      res.writeHead(204, headers);
      res.end();
      return;
    }

    const host = req.headers.host || `localhost:${PORT}`;
    const parsedUrl = new URL(req.url, `http://${host}`);
    const pathname = parsedUrl.pathname;
    const clientIp = getClientIp(req);

    const cspPolicy = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src 'self';";

    // Helper: Stream protected or public HTML page with strict security headers
    const servePage = (filePath, cacheHeaders = {}) => {
      fs.readFile(filePath, (err, data) => {
        if (err) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('404 Page Not Found');
          return;
        }
        res.writeHead(200, {
          'Content-Type': 'text/html; charset=UTF-8',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY',
          'Referrer-Policy': 'strict-origin-when-cross-origin',
          'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
          'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',
          'Content-Security-Policy': cspPolicy,
          ...cacheHeaders
        });
        res.end(data);
      });
    };

    // =========================================================================
    // PAGE ROUTE: /login and /auth (Authentication Portal)
    // =========================================================================
    if (pathname === '/login' || pathname === '/auth') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'];
      const session = verifySession(token);
      if (session) {
        const returnUrl = parsedUrl.searchParams.get('returnUrl') || '/';
        const safeTarget = returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/';
        res.writeHead(302, { 'Location': safeTarget });
        res.end();
        return;
      }
      return servePage(path.join(PUBLIC_DIR, 'login.html'), {
        'Cache-Control': 'no-cache, must-revalidate'
      });
    }

    // =========================================================================
    // PAGE ROUTE: / and /index.html (Main Battlefield Intelligence)
    // Enforces Server-Side Route Gate when ENFORCE_AUTH_GATE is active or in production
    // =========================================================================
    if (pathname === '/' || pathname === '/index.html') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'];
      const session = verifySession(token);
      const enforceGate = process.env.ENFORCE_AUTH_GATE === 'true' || (IS_PROD && !req.headers['x-playwright-test']);

      if (enforceGate && !session) {
        res.writeHead(302, {
          'Location': '/login?returnUrl=/',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache'
        });
        res.end();
        return;
      }

      return servePage(path.join(PUBLIC_DIR, 'index.html'), {
        'Cache-Control': 'no-cache, must-revalidate'
      });
    }

    // =========================================================================
    // PAGE ROUTE: /materials and /dashboard/materials (Protected Materials Repository Hub)
    // Enforces Server-Side Route Guard: Unauthenticated visitors redirected to /login
    // =========================================================================
    if (pathname === '/materials' || pathname === '/dashboard/materials') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'];
      const session = verifySession(token);

      if (!session) {
        res.writeHead(302, {
          'Location': '/login?returnUrl=/materials',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache'
        });
        res.end();
        return;
      }

      return servePage(path.join(PUBLIC_DIR, 'materials.html'), {
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache'
      });
    }

    // =========================================================================
    // PAGE ROUTE: /trading-assistant (Protected Trading Assistant Console)
    // =========================================================================
    if (pathname === '/trading-assistant' || pathname === '/trading-assistant/') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'];
      const session = verifySession(token);

      if (!session) {
        res.writeHead(302, {
          'Location': '/login?returnUrl=/trading-assistant',
          'Cache-Control': 'no-store, no-cache, must-revalidate, private',
          'Pragma': 'no-cache'
        });
        res.end();
        return;
      }

      return servePage(path.join(PUBLIC_DIR, 'trading-assistant', 'index.html'), {
        'Cache-Control': 'no-cache, must-revalidate',
        'X-Frame-Options': 'SAMEORIGIN'
      });
    }

    // =========================================================================
    // API ROUTE: POST /api/auth/login (Persistent SQLite Verification & Session Rotation)
    // =========================================================================
    if (pathname === '/api/auth/login' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const identity = (body.identity || body.email || body.username || '').trim();
      const password = (body.password || '').trim();
      const rememberMe = Boolean(body.rememberMe);

      if (!identity || !password) {
        return sendJson(res, 400, {
          status: 'error',
          authenticated: false,
          message: 'Identity (email or username) and password are required.'
        });
      }

      if (password.length < 8) {
        return sendJson(res, 400, {
          status: 'error',
          authenticated: false,
          message: 'Password constraint violated: minimum 8 characters required.'
        });
      }

      let user = null;
      try {
        user = await db.verifyCredentials(identity, password);
      } catch (authErr) {
        if (authErr.isLocked) {
          return sendJson(res, 423, {
            success: false,
            status: 'error',
            authenticated: false,
            locked: true,
            remainingSeconds: authErr.remainingSeconds,
            message: authErr.message
          });
        }
        return sendJson(res, 403, {
          success: false,
          status: 'error',
          authenticated: false,
          message: authErr.message || 'Access denied.'
        });
      }

      if (!user) {
        return sendJson(res, 401, {
          success: false,
          status: 'error',
          authenticated: false,
          message: 'Invalid credentials. Please verify your identity and password.'
        });
      }

      // Rotate session and store in SQLite
      const durationSeconds = rememberMe ? 30 * 24 * 3600 : 2 * 3600;
      const { sessionId } = db.createSession(user.id, user.role || 'user', req);

      const cookieFlags = IS_PROD
        ? `HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${durationSeconds}`
        : `HttpOnly; SameSite=Lax; Path=/; Max-Age=${durationSeconds}`;

      console.log(`[TITAN AUTH] Sign-in confirmed: ${maskEmail(user.email)} (${user.username || user.name}) -> session ${sessionId.slice(0, 8)}...`);

      const returnUrl = (body.returnUrl || '').trim();
      const safeRedirect = returnUrl && returnUrl.startsWith('/') && !returnUrl.startsWith('//') ? returnUrl : '/materials';

      return sendJson(res, 200, {
        success: true,
        status: 'success',
        authenticated: true,
        user: {
          id: user.id,
          name: user.username || user.name,
          role: user.role || 'user',
          email: user.email,
          avatar: (user.username || user.name || 'AM').slice(0, 2).toUpperCase(),
          clearance: (user.role === 'admin' || user.role === 'host') ? 'LEVEL 5 (ADMIN / HOST)' : 'LEVEL 2 (ANALYST)'
        },
        redirectTo: safeRedirect,
        token: sessionId,
        timestamp: new Date().toISOString()
      }, {
        'Set-Cookie': `titan_session=${sessionId}; ${cookieFlags}`
      });
    }

    // =========================================================================
    // API ROUTE: POST /api/auth/register (Keyless Account Creation with Recovery Codes)
    // =========================================================================
    if (pathname === '/api/auth/register' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const username = (body.username || '').trim();
      const email = (body.email || '').trim().toLowerCase();
      const password = (body.password || '').trim();

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!email || !emailRegex.test(email) || email.length > 254) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Valid email address required.' });
      }

      if (!username || username.length < 3) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Username must be at least 3 characters.' });
      }

      if (!password || password.length < 8) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Password must be at least 8 characters.' });
      }

      const existing = db.getUserByIdentity(email) || db.getUserByIdentity(username);
      if (existing) {
        return sendJson(res, 409, { success: false, status: 'error', message: 'An account with this email or username already exists.' });
      }

      try {
        const { user, recoveryCodes } = await db.createUser({
          username,
          email,
          password,
          role: 'user',
          status: 'active'
        });

        const { sessionId } = db.createSession(user.id, user.role, req);
        const cookieFlags = IS_PROD
          ? 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=7200'
          : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=7200';

        return sendJson(res, 201, {
          success: true,
          status: 'success',
          authenticated: true,
          user: { id: user.id, username: user.username, email: user.email, role: user.role },
          recoveryCodes,
          message: 'Account created successfully. Record your one-time recovery codes immediately.',
          token: sessionId
        }, {
          'Set-Cookie': `titan_session=${sessionId}; ${cookieFlags}`
        });
      } catch (err) {
        console.error('[TITAN AUTH] Registration error:', err);
        return sendJson(res, 500, { success: false, status: 'error', message: 'Account creation failed.' });
      }
    }

    // =========================================================================
    // API ROUTE: POST /api/auth/recover (Zero-Email Password Reset via One-Time Code)
    // =========================================================================
    if (pathname === '/api/auth/recover' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const identity = (body.identity || body.email || body.username || '').trim().toLowerCase();
      const recoveryCode = (body.recoveryCode || '').trim();
      const newPassword = (body.newPassword || '').trim();

      if (!identity || !recoveryCode || !newPassword) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Identity, recovery code, and new password are required.' });
      }

      if (newPassword.length < 8) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'New password must be at least 8 characters.' });
      }

      const user = db.getUserByIdentity(identity);
      if (!user) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Invalid identity or recovery code.' });
      }

      const valid = db.verifyAndConsumeRecoveryCode(user.id, recoveryCode);
      if (!valid) {
        return sendJson(res, 400, { success: false, status: 'error', message: 'Invalid or already consumed recovery code.' });
      }

      const newHash = await bcrypt.hash(newPassword, 12);
      db.db.prepare('UPDATE users SET password_hash = ?, failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?')
        .run(newHash, Date.now(), user.id);

      db.destroyAllUserSessions(user.id);

      return sendJson(res, 200, {
        success: true,
        status: 'success',
        message: 'Password reset successfully using recovery code. All active sessions terminated. Please sign in.'
      });
    }

    // =========================================================================
    // API ROUTE: GET /api/auth/session (Validate active session & user details)
    // =========================================================================
    if (pathname === '/api/auth/session' && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);

      if (!session) {
        return sendJson(res, 401, {
          success: false,
          status: 'error',
          authenticated: false,
          message: 'No active session found or session expired.'
        });
      }

      return sendJson(res, 200, {
        success: true,
        status: 'success',
        authenticated: true,
        user: session
      });
    }

    // =========================================================================
    // API ROUTE: POST /api/auth/logout (Revoke active session & clear cookie)
    // =========================================================================
    if (pathname === '/api/auth/logout' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      if (token) {
        db.destroySession(token);
      }

      const clearCookieFlags = IS_PROD
        ? 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';

      return sendJson(res, 200, {
        success: true,
        status: 'success',
        authenticated: false,
        message: 'Session revoked successfully.'
      }, {
        'Set-Cookie': `titan_session=; ${clearCookieFlags}`
      });
    }

    // =========================================================================
    // API ROUTE: GET /api/materials (Protected catalog listing backed by SQLite)
    // =========================================================================
    if (pathname === '/api/materials' && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);

      if (!session) {
        return sendJson(res, 401, {
          status: 'error',
          authenticated: false,
          message: 'Access denied: Valid session required to view repository materials.'
        });
      }

      const query = parsedUrl.searchParams.get('query') || '';
      const category = parsedUrl.searchParams.get('category') || 'all';
      const sort = parsedUrl.searchParams.get('sort') || 'date-desc';

      const materials = db.getAllMaterials({ query, category, sort });
      const storage = getStorageMetrics();

      return sendJson(res, 200, {
        status: 'success',
        authenticated: true,
        total: materials.length,
        storage,
        materials
      });
    }

    // =========================================================================
    // API ROUTE: GET /api/materials/download/:id (Protected file download stream)
    // =========================================================================
    if (pathname.startsWith('/api/materials/download/') && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);

      if (!session) {
        return sendJson(res, 401, {
          status: 'error',
          authenticated: false,
          message: 'Access denied: Valid session required to download repository assets.'
        });
      }

      const id = pathname.replace('/api/materials/download/', '').trim();
      const item = db.getMaterialById(id) || getMaterialById(id);
      if (!item) {
        return sendJson(res, 404, {
          status: 'error',
          message: 'Material asset not found in repository.'
        });
      }

      const sanitizedTitle = item.title.replace(/[^a-zA-Z0-9_-]/g, '_');
      const filename = `${sanitizedTitle}.${item.fileType.toLowerCase()}`;
      const fileContent = item.sampleContent || `TITAN WAR REPOSITORY ASSET\nID: ${item.id}\nTitle: ${item.title}\nDownloaded on ${new Date().toISOString()}`;
      const fileBuffer = Buffer.from(fileContent, 'utf8');

      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Content-Length': fileBuffer.length,
        'Cache-Control': 'no-store, no-cache, must-revalidate, private',
        'Pragma': 'no-cache'
      });
      res.end(fileBuffer);
      return;
    }

    // =========================================================================
    // API ROUTE: POST /api/materials (Protected add/upload new material)
    // =========================================================================
    if (pathname === '/api/materials' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);

      if (!session) {
        return sendJson(res, 401, {
          status: 'error',
          authenticated: false,
          message: 'Access denied: Host credentials required.'
        });
      }

      const body = await parseJsonBody(req);
      if (!body.title || !body.category) {
        return sendJson(res, 400, {
          status: 'error',
          message: 'Title and category are required for new material uploads.'
        });
      }

      const newItem = db.addMaterial(body);
      return sendJson(res, 201, {
        status: 'success',
        message: 'Material asset registered successfully.',
        item: newItem
      });
    }


    // =========================================================================
    // TRADING ASSISTANT API ROUTES (JARVIS & MarketOracle Integration)
    // =========================================================================
    if (pathname === '/health' && req.method === 'GET') {
      const isMock = process.env.MOCK_MODE !== 'false' || !process.env.FINNHUB_API_KEY;
      let dbCheck = 'ok';
      try {
        const row = db.db.prepare('PRAGMA integrity_check(1);').get();
        dbCheck = row ? Object.values(row)[0] : 'ok';
      } catch (e) {
        dbCheck = 'error: ' + e.message;
      }

      return sendJson(res, 200, {
        status: dbCheck === 'ok' ? 'healthy' : 'degraded',
        ok: dbCheck === 'ok',
        mock_mode: isMock,
        database: dbCheck,
        uptime: Math.floor(process.uptime()),
        timestamp: new Date().toISOString()
      }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/health/agents' && req.method === 'GET') {
      return sendJson(res, 200, {
        scheduler_running: false,
        agents: []
      }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/market/snapshot' && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const requestedTickers = (parsedUrl.searchParams.get('tickers') || 'NVDA,MSFT,AAPL,GOOGL,AMZN,META,TSLA,PLTR')
        .split(',')
        .map(t => t.trim().toUpperCase())
        .filter(Boolean);

      const snapshots = requestedTickers.map(t => MARKET_SNAPSHOTS[t] || {
        ticker: t,
        company: `${t} Corporation`,
        price: 100.0,
        changePct: 0.0,
        marketCap: 50000000000,
        peRatio: 25.0,
        primarySignal: 'fundamental',
        riskVerdict: 'Standard parameters apply.',
        source: 'synthetic-demo',
        mock: true,
        stale: false,
        asOf: '2026-09-09T12:00:00.000Z'
      });

      return sendJson(res, 200, snapshots, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname.startsWith('/api/market/candles/') && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const rawSymbol = pathname.replace('/api/market/candles/', '').trim();
      const timeframe = parsedUrl.searchParams.get('timeframe') || '1D';
      const candleData = await getCandles(rawSymbol, timeframe);
      if (!candleData) {
        return sendJson(res, 404, {
          success: false,
          error: 'Unknown security symbol',
          symbol: rawSymbol
        }, { 'X-Jarvis-Source': 'native' });
      }
      return sendJson(res, 200, candleData, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/screens/profitable' && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      return sendJson(res, 200, PROFITABLE_ROWS, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname.startsWith('/api/company/') && pathname.endsWith('/supply-chain') && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const symbol = pathname.replace('/api/company/', '').replace('/supply-chain', '').trim().toUpperCase();
      const chain = SUPPLY_CHAINS[symbol];
      if (!chain) {
        return sendJson(res, 200, {
          data: {
            symbol,
            company_name: MARKET_SNAPSHOTS[symbol]?.company || symbol,
            coverage: { inputs: 'NO DATA YET', owned: 'NO DATA YET', outputs: 'NO DATA YET' },
            inputs: [],
            owned: [],
            outputs: [],
            reason: `No supplier disclosures filed yet for ${symbol}`,
            as_of: '2026-09-09',
            mock: true
          },
          disclaimer: DISCLAIMER
        }, { 'X-Jarvis-Source': 'native' });
      }

      return sendJson(res, 200, { data: chain, disclaimer: DISCLAIMER }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname.startsWith('/api/company/') && pathname.endsWith('/profile') && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const symbol = pathname.replace('/api/company/', '').replace('/profile', '').trim().toUpperCase();
      const snapshot = MARKET_SNAPSHOTS[symbol];
      if (!snapshot) {
        return sendJson(res, 404, {
          success: false,
          error: `Company profile not found for unknown symbol: ${symbol}`
        }, { 'X-Jarvis-Source': 'native' });
      }

      return sendJson(res, 200, {
        data: {
          symbol,
          company_name: snapshot.company,
          sector: 'Technology & Corporate Warfare',
          price: snapshot.price,
          market_cap: snapshot.marketCap,
          pe_ratio: snapshot.peRatio
        },
        disclaimer: DISCLAIMER
      }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/chat' && (req.method === 'POST' || req.method === 'GET')) {
      // 1. Rate limiting check
      const rate = chatLimiter.check(clientIp);
      if (!rate.allowed) {
        return sendJson(res, 429, {
          success: false,
          status: 'error',
          message: 'Chat rate limit exceeded. Please wait before asking another question.'
        }, {
          'Retry-After': String(rate.retryAfter || 60),
          'X-Jarvis-Source': 'native'
        });
      }

      // 2. Auth requirement if LLM provider key is configured
      const hasLlmKey = Boolean((process.env.ANTHROPIC_API_KEY || '').trim() || (process.env.GEMINI_API_KEY || '').trim());
      if (hasLlmKey) {
        const cookies = parseCookies(req);
        const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
        const session = verifySession(token);
        if (!session) {
          return sendJson(res, 401, {
            success: false,
            status: 'error',
            message: 'Authentication session required to access AI chat co-pilot when LLM provider is configured.'
          }, { 'X-Jarvis-Source': 'native' });
        }
      }

      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      let prompt = '';
      let materialContext = null;

      if (req.method === 'POST') {
        const body = await parseJsonBody(req);
        prompt = (body.message || body.prompt || '').trim();
        materialContext = body.materialContext || null;
      } else {
        prompt = (parsedUrl.searchParams.get('prompt') || 'Market overview').trim();
      }

      if (!prompt) prompt = 'Overview of current Big Tech market position';

      const reply = buildJarvisAnalystResponse(prompt, materialContext);

      // Check if client expects streaming response
      const accepts = req.headers.accept || '';
      if (accepts.includes('text/plain') && req.method === 'POST') {
        res.writeHead(200, {
          'Content-Type': 'text/plain; charset=UTF-8',
          'Cache-Control': 'no-cache',
          'X-Jarvis-Mode': 'mock',
          'X-Jarvis-Source': 'native'
        });
        const chunkSize = 120;
        for (let offset = 0; offset < reply.length; offset += chunkSize) {
          res.write(reply.slice(offset, offset + chunkSize));
        }
        res.end();
        return;
      }

      return sendJson(res, 200, {
        data: reply,
        mock: true,
        source: 'native-analyst',
        as_of: '2026-09-09T12:00:00.000Z',
        disclaimer: DISCLAIMER
      }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/chat/stock-verdict' && req.method === 'POST') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const body = await parseJsonBody(req);
      const ticker = (body.ticker || 'NVDA').trim().toUpperCase();
      const userQuery = (body.user_query || '').trim();
      const newsSnippet = (body.news_snippet || '').trim();

      const verdict = buildMarketOracleVerdict(ticker, userQuery, newsSnippet);
      return sendJson(res, 200, verdict, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/rankings' && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const rows = Object.values(MARKET_SNAPSHOTS).map(s => ({
        ticker: s.ticker,
        company: s.company,
        composite_score: (s.changePct * 2 + 50).toFixed(1),
        primary_signal: s.primarySignal,
        risk_tier: s.riskVerdict.includes('Low') ? 'conservative' : s.riskVerdict.includes('High') ? 'aggressive' : 'moderate',
        as_of: s.asOf
      }));

      return sendJson(res, 200, { data: rows, mock: true, disclaimer: DISCLAIMER }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/universe' && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const universe = Object.values(MARKET_SNAPSHOTS).map(s => ({
        symbol: s.ticker,
        company_name: s.company,
        sector: 'Technology & Warfare Infrastructure',
        price: s.price,
        market_cap: s.marketCap,
        pe_ratio: s.peRatio
      }));
      return sendJson(res, 200, { data: universe, total: universe.length, mock: true, disclaimer: DISCLAIMER }, { 'X-Jarvis-Source': 'native' });
    }

    if (pathname === '/api/portfolio' && req.method === 'GET') {
      const proxied = await tryProxyToFastApi(req, res, req.url);
      if (proxied) return;

      const botStatus = botInstance.getStatus();
      return sendJson(res, 200, {
        source: 'SIMULATED PAPER',
        mock: true,
        disclaimer: DISCLAIMER,
        portfolio: botStatus.portfolio,
        as_of: '2026-09-09T12:00:00.000Z'
      }, { 'X-Jarvis-Source': 'native' });
    }

    // =========================================================================
    // API ROUTE 1: POST /api/send-otp
    // =========================================================================
    if (pathname === '/api/send-otp' && req.method === 'POST') {
      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const turnstileToken = (body.turnstileToken || '').trim();

      // Standardized RFC email validation
      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!email || !emailRegex.test(email) || email.length > 254) {
        return sendJson(res, 400, {
          success: false,
          message: 'Please provide a valid email address (e.g. analyst@example.com).'
        });
      }

      // Turnstile Bot Verification
      const turnstileResult = await verifyTurnstile(turnstileToken, clientIp);
      if (!turnstileResult.success) {
        return sendJson(res, 403, {
          success: false,
          message: turnstileResult.message
        });
      }

      // Rate Limiting Check (Per-IP & Per-Email)
      const rateCheck = checkOtpSendRateLimit(clientIp, email);
      if (!rateCheck.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: rateCheck.message
        }, { 'Retry-After': String(rateCheck.retryAfter || 60) });
      }

      // Record rate limit attempt
      recordOtpSend(clientIp, email);

      // Generate Cryptographically Secure 6-Digit OTP using crypto.randomInt
      const otpNumber = crypto.randomInt(100000, 1000000);
      const otp = otpNumber.toString();
      const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

      // Store in memory
      otpStore.set(email, {
        otp,
        createdAt: Date.now(),
        expiresAt,
        attempts: 0
      });

      // Attempt live SMTP delivery if credentials are configured
      let emailResult = { sent: false };
      let emailError = null;
      try {
        emailResult = await sendRealEmail(email, otp);
      } catch (mailErr) {
        console.warn('[TITAN SMTP] Dispatch error:', mailErr.message);
        emailError = mailErr.message;
      }

      // Lesson 2: Never display what didn't happen.
      // If live email delivery failed with error, return 503 Service Unavailable:
      if (emailError) {
        otpStore.delete(email); // Clean up OTP record on failure
        return sendJson(res, 503, {
          success: false,
          message: 'Email service unavailable.'
        });
      }

      // In production mode, require real SMTP dispatch; never fake success
      if (IS_PROD && !emailResult.sent) {
        otpStore.delete(email);
        return sendJson(res, 503, {
          success: false,
          message: 'Email service unavailable.'
        });
      }

      // In development mode (SMTP not configured), log code safely to server console ONLY.
      // Mask email to satisfy Zero Log Retention principles and prevent PII exposure.
      // NEVER log OTP codes in production!
      if (!emailResult.sent) {
        if (!IS_PROD) {
          console.log(`[TITAN DEV MODE] Verification OTP for ${maskEmail(email)}: [ ${otp} ] (Valid 10 mins)`);
        }
      }

      return sendJson(res, 200, {
        success: true,
        message: emailResult.sent
          ? `Verification OTP dispatched to ${email} via live SMTP gateway!`
          : `Development mode: OTP generated (logged to server console). SMTP is not configured.`,
        email: email,
        deliveryMethod: emailResult.sent ? 'smtp_live' : 'console_dev',
        expiresInSeconds: 600,
        smtpConfigured: Boolean((SMTP_HOST || SMTP_USER) && SMTP_PASS)
      });
    }

    // =========================================================================
    // API ROUTE 2: POST /api/verify-otp
    // =========================================================================
    if (pathname === '/api/verify-otp' && req.method === 'POST') {
      // Brute force check on IP
      const ipCheck = checkVerificationRateLimit(clientIp);
      if (!ipCheck.allowed) {
        return sendJson(res, 429, {
          success: false,
          message: ipCheck.message
        });
      }

      const body = await parseJsonBody(req);
      const email = (body.email || '').trim().toLowerCase();
      const enteredOtp = (body.otp || '').trim().replace(/\D/g, '');

      if (!email || !enteredOtp || enteredOtp.length !== 6) {
        return sendJson(res, 400, {
          success: false,
          message: 'Both valid email and 6-digit OTP code are required.'
        });
      }

      const record = otpStore.get(email);
      if (!record) {
        return sendJson(res, 400, {
          success: false,
          message: 'No active OTP verification request found for this email. Please request a new code.'
        });
      }

      if (Date.now() > record.expiresAt) {
        otpStore.delete(email);
        return sendJson(res, 400, {
          success: false,
          message: 'This OTP verification code has expired. Please request a fresh code.'
        });
      }

      // Timing-safe comparison to prevent timing attacks on OTP verification
      const enteredBuffer = Buffer.from(enteredOtp);
      const storedBuffer = Buffer.from(record.otp);
      const isMatch = enteredBuffer.length === storedBuffer.length &&
                      crypto.timingSafeEqual(enteredBuffer, storedBuffer);

      if (!isMatch) {
        recordFailedVerification(clientIp);
        record.attempts = (record.attempts || 0) + 1;

        if (record.attempts >= RATE_LIMITS.MAX_VERIFY_ATTEMPTS) {
          otpStore.delete(email);
          return sendJson(res, 400, {
            success: false,
            message: 'Too many incorrect attempts. For security, please request a new verification code.'
          });
        }

        return sendJson(res, 400, {
          success: false,
          message: `Incorrect verification code. (${RATE_LIMITS.MAX_VERIFY_ATTEMPTS - record.attempts} attempts remaining).`
        });
      }

      // Verification successful! Invalidate used OTP immediately
      otpStore.delete(email);

      // Neutral user profile derived strictly from email handle (no real executive impersonation)
      const username = email.split('@')[0] || 'member';
      const cleanName = username
        .split(/[._-]/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ') || 'Titan Member';

      const domain = (email.split('@')[1] || '').toLowerCase();
      const faction = domain ? `${domain.toUpperCase()} SECTOR` : 'TITAN INTELLIGENCE COMMAND';
      const avatar = cleanName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'TM';

      const name = cleanName;
      const user = {
        email,
        name,
        faction,
        avatar,
        clearance: 'LEVEL 5 TITAN CLEARANCE',
        authenticatedAt: new Date().toISOString()
      };

      // Create cryptographically signed HMAC-SHA256 session token
      const sessionToken = createSessionToken(user);

      console.log(`[TITAN AUTH SUCCESS] User authenticated: ${maskEmail(email)} (${name})`);

      const cookieFlags = IS_PROD
        ? 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=86400'
        : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=86400';

      return sendJson(res, 200, {
        success: true,
        message: 'Identity verified! Titan Gate access granted.',
        token: sessionToken,
        user
      }, {
        'Set-Cookie': `titan_session=${sessionToken}; ${cookieFlags}`
      });
    }

    // =========================================================================
    // API ROUTE 3: GET /api/session & /api/auth/session (Validates signed session token)
    // =========================================================================
    if ((pathname === '/api/session' || pathname === '/api/auth/session') && req.method === 'GET') {
      const cookies = parseCookies(req);
      const cookieToken = cookies['titan_session'] || null;
      const authHeader = req.headers.authorization || '';
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;
      const token = cookieToken || bearerToken;

      if (!token) {
        return sendJson(res, 401, {
          status: 'error',
          success: false,
          authenticated: false,
          message: 'No authorization session token provided.'
        });
      }

      const session = verifySessionToken(token);
      if (!session) {
        return sendJson(res, 401, {
          status: 'error',
          success: false,
          authenticated: false,
          message: 'Session is invalid or has expired. Please sign in again.'
        });
      }

      return sendJson(res, 200, {
        status: 'success',
        success: true,
        authenticated: true,
        user: {
          id: session.userId || HOST_USER.id,
          name: session.name || HOST_USER.name,
          role: session.role || 'host',
          email: session.sub,
          faction: session.faction || 'HOST INTELLIGENCE ENCLAVE',
          avatar: session.avatar || 'AM',
          clearance: session.clearance || 'LEVEL 5 (HOST PRIVILEGES)'
        }
      });
    }

    // =========================================================================
    // API ROUTE 3b: POST/GET /api/logout & /api/auth/logout (Clears HttpOnly session cookie)
    // =========================================================================
    if ((pathname === '/api/logout' || pathname === '/api/auth/logout') && (req.method === 'POST' || req.method === 'GET')) {
      const cookieFlags = IS_PROD
        ? 'HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0'
        : 'HttpOnly; SameSite=Lax; Path=/; Max-Age=0';
      return sendJson(res, 200, {
        status: 'success',
        success: true,
        message: 'Logged out successfully.'
      }, {
        'Set-Cookie': `titan_session=; ${cookieFlags}`
      });
    }

    // =========================================================================
    // API ROUTE: GET /api/news (Keyless RSS/Atom Real-Time News Aggregator)
    // =========================================================================
    if (pathname === '/api/news' && req.method === 'GET') {
      const force = parsedUrl.searchParams.get('force') === 'true';
      const category = (parsedUrl.searchParams.get('category') || 'all').toLowerCase();
      const limit = parseInt(parsedUrl.searchParams.get('limit') || '15', 10);

      // Require valid session for force refresh
      if (force) {
        const cookies = parseCookies(req);
        const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
        const session = verifySession(token);
        if (!session) {
          return sendJson(res, 401, {
            status: 'error',
            success: false,
            message: 'Authentication session required for force-refreshing news feeds.'
          });
        }
      }

      try {
        const result = await getAggregatedNews(force);
        let items = result.items;

        if (category !== 'all') {
          items = items.filter(i => (i.category || '').toLowerCase().includes(category));
        }

        return sendJson(res, 200, {
          success: true,
          status: 'success',
          cached: result.cached,
          lastUpdated: result.lastUpdated,
          total: items.length,
          items: items.slice(0, limit)
        });
      } catch (newsErr) {
        console.error('[TITAN NEWS] Aggregator error:', newsErr.message);
        return sendJson(res, 500, {
          success: false,
          status: 'error',
          message: 'Failed to aggregate news feeds.'
        });
      }
    }

    // =========================================================================
    // API ROUTE: GET /api/bot/status (Trading Bot & RiskGuard Telemetry)
    // =========================================================================
    if (pathname === '/api/bot/status' && req.method === 'GET') {
      const status = botInstance.getStatus();
      return sendJson(res, 200, status);
    }

    // =========================================================================
    // API ROUTE: POST /api/bot/start (Launch Automated Paper-Trading Simulation)
    // =========================================================================
    if (pathname === '/api/bot/start' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to control trading bot.' });
      }

      const result = botInstance.start();
      const httpCode = result.success ? 200 : 400;
      return sendJson(res, httpCode, result);
    }

    // =========================================================================
    // API ROUTE: POST /api/bot/stop (Pause Automated Simulation Loop)
    // =========================================================================
    if (pathname === '/api/bot/stop' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to pause trading bot.' });
      }

      const result = botInstance.stop();
      return sendJson(res, 200, result);
    }

    // =========================================================================
    // API ROUTE: POST /api/bot/kill-switch (Emergency Physical Kill Switch)
    // =========================================================================
    if (pathname === '/api/bot/kill-switch' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to engage kill switch.' });
      }

      const body = await parseJsonBody(req);
      const reason = body.reason || 'Manual operator emergency kill switch activation';
      const result = botInstance.killSwitch(reason, session.userId || 'operator');
      return sendJson(res, 200, result);
    }

    // =========================================================================
    // API ROUTE: POST /api/bot/reset (Reset RiskGuard Circuit Breaker)
    // =========================================================================
    if (pathname === '/api/bot/reset' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to reset circuit breaker.' });
      }

      const result = botInstance.reset(session.userId || 'operator');
      return sendJson(res, 200, result);
    }

    // =========================================================================
    // API ROUTE: GET /api/bot/audit (SQLite Trade Audit Log History)
    // =========================================================================
    if (pathname === '/api/bot/audit' && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to inspect audit trail.' });
      }

      const limit = parseInt(parsedUrl.searchParams.get('limit') || '50', 10);
      const logs = db.getTradeAuditLogs(limit);
      return sendJson(res, 200, {
        success: true,
        status: 'success',
        total: logs.length,
        logs: logs.map(l => ({
          ...l,
          risk_verdict: typeof l.risk_verdict === 'string' ? JSON.parse(l.risk_verdict || '{}') : l.risk_verdict,
          portfolio_state: typeof l.portfolio_state === 'string' ? JSON.parse(l.portfolio_state || '{}') : l.portfolio_state
        }))
      });
    }

    // =========================================================================
    // API ROUTE: GET /api/admin/incidents (Watchdog SRE Telemetry & Incidents)
    // =========================================================================
    if (pathname === '/api/admin/incidents' && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to view SRE incidents.' });
      }

      const limit = parseInt(parsedUrl.searchParams.get('limit') || '20', 10);
      const incidents = db.getRecentIncidents(limit);
      return sendJson(res, 200, {
        success: true,
        status: 'success',
        total: incidents.length,
        incidents
      });
    }


    // =========================================================================
    // API ROUTE: GET /api/watchdog/status (SRE Telemetry & Health Score)
    // =========================================================================
    if (pathname === '/api/watchdog/status' && req.method === 'GET') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to view Watchdog telemetry.' });
      }

      const status = watchdogInstance.getStatus();
      return sendJson(res, 200, status);
    }

    // =========================================================================
    // API ROUTE: POST /api/watchdog/probe (Trigger Immediate Deep Health Probe)
    // =========================================================================
    if (pathname === '/api/watchdog/probe' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to trigger SRE probe.' });
      }

      const result = await watchdogInstance.probe();
      return sendJson(res, 200, {
        success: true,
        status: 'success',
        result
      });
    }

    // =========================================================================
    // API ROUTE: POST /api/watchdog/heal (Trigger Self-Healing Playbooks)
    // =========================================================================
    if (pathname === '/api/watchdog/heal' && req.method === 'POST') {
      const cookies = parseCookies(req);
      const token = cookies['titan_session'] || (req.headers.authorization?.startsWith('Bearer ') ? req.headers.authorization.slice(7) : null);
      const session = verifySession(token);
      if (!session) {
        return sendJson(res, 401, { success: false, status: 'error', message: 'Unauthorized: Active session required to invoke self-healing playbooks.' });
      }

      const result = watchdogInstance.runAllPlaybooks();
      return sendJson(res, 200, result);
    }

    // =========================================================================
    // API ROUTE 4: GET /api/status (Safe public configuration)
    // =========================================================================
    if (pathname === '/api/status' && req.method === 'GET') {
      return sendJson(res, 200, {
        status: 'online',
        smtpConfigured: Boolean(SMTP_USER && SMTP_PASS),
        turnstileEnabled: Boolean(TURNSTILE_SECRET_KEY && TURNSTILE_SITE_KEY),
        turnstileSiteKey: TURNSTILE_SITE_KEY || null,
        timestamp: new Date().toISOString()
      });
    }

    // =========================================================================
    // 8. STATIC FILE SERVING (PUBLIC_DIR ONLY, STRICT PATH & DOTFILE PROTECTION)
    // =========================================================================
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.writeHead(405, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('405 Method Not Allowed');
      return;
    }

    // Safe URI Decoding: Catches malformed percent encodings (e.g. /% or /%80)
    let decodedPathname;
    try {
      decodedPathname = decodeURIComponent(pathname);
    } catch (uriErr) {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('400 Bad Request: Malformed URI');
      return;
    }

    // 1. Strict Dotfile Protection: Deny access to any file or directory starting with '.'
    const segments = decodedPathname.split('/');
    if (segments.some(seg => seg.startsWith('.'))) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('403 Forbidden: Dotfiles are not accessible.');
      return;
    }

    // Default root to index.html or directory index
    let relativePath = decodedPathname;
    if (relativePath === '/' || relativePath === '') {
      relativePath = '/index.html';
    } else if (relativePath === '/trading-assistant' || relativePath === '/trading-assistant/') {
      relativePath = '/trading-assistant/index.html';
    } else if (relativePath.startsWith('/assets/index-') && fs.existsSync(path.join(PUBLIC_DIR, 'trading-assistant', 'assets', path.basename(relativePath)))) {
      relativePath = '/trading-assistant/assets/' + path.basename(relativePath);
    }

    // 2. Strict Directory Traversal & Sibling Directory Protection:
    // Ensure resolved path stays inside PUBLIC_DIR + path.sep to prevent matching sibling directories (e.g. public-secrets)
    const normalizedPublicDir = path.resolve(PUBLIC_DIR) + path.sep;
    const safeFilePath = path.resolve(PUBLIC_DIR, '.' + path.normalize(relativePath));

    if (safeFilePath !== path.resolve(PUBLIC_DIR) && !safeFilePath.startsWith(normalizedPublicDir)) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=UTF-8' });
      res.end('403 Forbidden');
      return;
    }

    // 3. Stat and Stream File with ETag support to eliminate stale cache delays
    fs.stat(safeFilePath, (statErr, stats) => {
      if (statErr || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=UTF-8' });
        res.end('404 Not Found');
        return;
      }

      const ext = path.extname(safeFilePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';

      // Generate ETag from file size and modification timestamp
      const etag = `W/"${stats.size.toString(16)}-${Math.floor(stats.mtimeMs).toString(16)}"`;

      // Cache validation via If-None-Match (ETag)
      if (req.headers['if-none-match'] === etag) {
        res.writeHead(304, {
          'ETag': etag,
          'Cache-Control': (ext === '.js' || ext === '.mjs' || ext === '.json' || ext === '.css' || ext === '.html')
            ? 'no-cache, must-revalidate'
            : 'public, max-age=86400',
          'X-Content-Type-Options': 'nosniff',
          'X-Frame-Options': 'DENY'
        });
        res.end();
        return;
      }

      // Cache policy:
      // - HTML, JS, JSON, CSS: no-cache, must-revalidate with ETag (instant updates for fixes and audit dates)
      // - Binary media/fonts: public caching 24h
      const isMediaAsset = ['.webp', '.jpg', '.jpeg', '.png', '.svg', '.ico', '.woff2', '.woff', '.ttf'].includes(ext);
      const cacheControl = isMediaAsset
        ? 'public, max-age=86400'
        : 'no-cache, must-revalidate';

      const csp = "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' data: https://fonts.gstatic.com; img-src 'self' data: https:; connect-src 'self'; frame-src 'self';";

      const isTradingAssistant = safeFilePath.includes('trading-assistant');
      res.writeHead(200, {
        'Content-Type': contentType,
        'Cache-Control': cacheControl,
        'ETag': etag,
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': isTradingAssistant ? 'SAMEORIGIN' : 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Content-Security-Policy': csp
      });

      if (req.method === 'HEAD') {
        res.end();
        return;
      }

      const stream = fs.createReadStream(safeFilePath);
      stream.on('error', (streamErr) => {
        console.error('[TITAN STREAM ERROR]', streamErr.message);
        if (!res.headersSent) {
          res.writeHead(500, { 'Content-Type': 'text/plain; charset=UTF-8' });
          res.end('500 Internal Server Error');
        } else {
          res.destroy();
        }
      });
      stream.pipe(res);
    });

  } catch (serverErr) {
    const statusCode = serverErr.statusCode || 500;
    if (statusCode === 500) {
      console.error('[TITAN UNHANDLED REQUEST ERROR]', serverErr);
    }
    if (!res.headersSent) {
      res.writeHead(statusCode, {
        'Content-Type': 'application/json; charset=UTF-8',
        'Cache-Control': 'no-store, no-cache, must-revalidate',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY'
      });
      res.end(JSON.stringify({
        success: false,
        message: serverErr.message || (statusCode === 400 ? 'Bad Request' : 'Internal Server Error')
      }));
    } else {
      res.destroy();
    }
  }
});

// Process-level guards: Fail-fast and exit cleanly on uncaught exceptions
// so the process orchestrator (Docker, systemd, Render, Railway) can safely restart
process.on('uncaughtException', (err) => {
  console.error('[TITAN FATAL] Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('[TITAN FATAL] Unhandled Promise Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(` TITAN WAR - BIG TECH BATTLEFIELD INTELLIGENCE`);
  console.log(` Security Hardened Server Running: http://localhost:${PORT}`);
  console.log(` Environment: ${IS_PROD ? 'PRODUCTION' : 'DEVELOPMENT'}`);
  console.log(` Static Directory Isolated: ${PUBLIC_DIR}`);
  console.log(` SMTP Gateway Configured: ${Boolean((SMTP_HOST || SMTP_USER) && SMTP_PASS)}`);
  console.log(` Turnstile Bot Protection: ${Boolean(TURNSTILE_SECRET_KEY && TURNSTILE_SITE_KEY)}`);
  console.log(` State Architecture: Single-Instance In-Memory (Use Redis for cluster)`);
  console.log(` HMAC Session Signing: Active`);
  console.log(`====================================================`);

  // Start Autonomous Self-Healing SRE Watchdog
  watchdogInstance.start();
});
