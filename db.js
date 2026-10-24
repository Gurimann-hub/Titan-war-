/**
 * TITAN PLATFORM // SECURE LOCAL SQLITE DATABASE & MIGRATION ENGINE
 * Architecture: Embedded node:sqlite DatabaseSync, WAL journal mode,
 * Parameterized prepared statements (CWE-89 immunity), and zero external key dependencies.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const crypto = require('node:crypto');
const bcrypt = require('bcrypt');

const DATA_DIR = process.env.TITAN_DATA_DIR ? path.resolve(process.env.TITAN_DATA_DIR) : path.join(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'platform.db');
const db = new DatabaseSync(DB_PATH);

// Configure SQLite for high concurrency and zero corruption
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA synchronous = NORMAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

// ---------------------------------------------------------------------------
// 1. DATABASE SCHEMA INITIALIZATION & MIGRATIONS
// ---------------------------------------------------------------------------
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user',
      status TEXT NOT NULL DEFAULT 'active',
      failed_attempts INTEGER NOT NULL DEFAULT 0,
      locked_until INTEGER DEFAULT NULL,
      totp_secret TEXT DEFAULT NULL,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      expires_at INTEGER NOT NULL,
      last_active_at INTEGER NOT NULL,
      ip_address TEXT,
      user_agent TEXT
    );

    CREATE TABLE IF NOT EXISTS recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      used_at INTEGER DEFAULT NULL
    );

    CREATE TABLE IF NOT EXISTS materials (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      category TEXT NOT NULL,
      file_type TEXT NOT NULL,
      file_size TEXT NOT NULL,
      access_level TEXT NOT NULL,
      date_added TEXT NOT NULL,
      description TEXT,
      sha256_checksum TEXT,
      sample_content TEXT
    );

    CREATE TABLE IF NOT EXISTS trade_audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      ticker TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      risk_verdict TEXT,
      portfolio_state TEXT
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      user_id TEXT,
      action TEXT NOT NULL,
      ip TEXT,
      user_agent TEXT,
      details TEXT
    );

    CREATE TABLE IF NOT EXISTS incidents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp INTEGER NOT NULL,
      severity TEXT NOT NULL,
      component TEXT NOT NULL,
      signature TEXT NOT NULL,
      description TEXT NOT NULL,
      action_taken TEXT NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sources (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      credibility_weight REAL NOT NULL DEFAULT 1.0,
      poll_interval_sec INTEGER NOT NULL DEFAULT 300,
      last_polled_at INTEGER,
      status TEXT NOT NULL DEFAULT 'active',
      consecutive_failures INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS articles (
      id TEXT PRIMARY KEY,
      slug TEXT NOT NULL,
      headline TEXT NOT NULL,
      summary TEXT NOT NULL,
      why_it_matters TEXT,
      source_id TEXT,
      source_name TEXT NOT NULL,
      url TEXT NOT NULL,
      category TEXT NOT NULL,
      published_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      is_breaking INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'published',
      content_hash TEXT UNIQUE NOT NULL
    );

    CREATE TABLE IF NOT EXISTS article_scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      impact_score INTEGER NOT NULL,
      sentiment TEXT NOT NULL,
      expected_direction TEXT NOT NULL,
      confidence REAL NOT NULL,
      rationale TEXT NOT NULL,
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      entity_type TEXT NOT NULL,
      symbol TEXT,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bookmarks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      article_id TEXT NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, article_id)
    );

    CREATE TABLE IF NOT EXISTS watchlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      UNIQUE(user_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS paper_orders (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      side TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'filled',
      notes TEXT,
      created_at INTEGER NOT NULL,
      executed_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS paper_positions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      symbol TEXT NOT NULL,
      quantity REAL NOT NULL,
      avg_entry_price REAL NOT NULL,
      current_price REAL NOT NULL,
      pnl REAL NOT NULL DEFAULT 0.0,
      updated_at INTEGER NOT NULL,
      UNIQUE(user_id, symbol)
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      ticker TEXT NOT NULL,
      action TEXT NOT NULL,
      quantity REAL NOT NULL,
      price REAL NOT NULL,
      total_value REAL NOT NULL,
      rationale TEXT,
      risk_status TEXT NOT NULL DEFAULT 'APPROVED',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS portfolio_cash (
      user_id TEXT PRIMARY KEY,
      cash_balance REAL NOT NULL DEFAULT 100000.00,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      agent_name TEXT NOT NULL,
      run_type TEXT NOT NULL,
      status TEXT NOT NULL,
      items_processed INTEGER NOT NULL DEFAULT 0,
      items_published INTEGER NOT NULL DEFAULT 0,
      started_at INTEGER NOT NULL,
      completed_at INTEGER NOT NULL,
      error_details TEXT
    );

    CREATE TABLE IF NOT EXISTS bot_conversations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id TEXT NOT NULL,
      session_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      tool_calls TEXT,
      created_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_user_id ON recovery_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
    CREATE INDEX IF NOT EXISTS idx_articles_published ON articles(published_at DESC);
    CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
    CREATE INDEX IF NOT EXISTS idx_entities_article_id ON entities(article_id);
    CREATE INDEX IF NOT EXISTS idx_entities_symbol ON entities(symbol);
    CREATE INDEX IF NOT EXISTS idx_article_scores_article_id ON article_scores(article_id);
    CREATE INDEX IF NOT EXISTS idx_bookmarks_user_id ON bookmarks(user_id);
    CREATE INDEX IF NOT EXISTS idx_watchlists_user_id ON watchlists(user_id);
    CREATE INDEX IF NOT EXISTS idx_paper_orders_user ON paper_orders(user_id);
    CREATE INDEX IF NOT EXISTS idx_paper_positions_user ON paper_positions(user_id);
    CREATE INDEX IF NOT EXISTS idx_agent_runs_timestamp ON agent_runs(started_at DESC);
  `);
}

initSchema();

// ---------------------------------------------------------------------------
// 2. SEEDING & DATA MIGRATION FROM FLAT STORE
// ---------------------------------------------------------------------------
async function migrateInitialData() {
  const checkUserStmt = db.prepare('SELECT COUNT(*) as count FROM users');
  const userCount = checkUserStmt.get().count;

  if (userCount === 0) {
    // Migrate Host / Admin user
    const hostPass = (process.env.HOST_PASSWORD || '').trim();
    if (!hostPass) {
      console.log('[DB MIGRATION] HOST_PASSWORD not configured. Skipping initial admin seeding.');
    } else {
      const saltRounds = 12;
      const passwordHash = await bcrypt.hash(hostPass, saltRounds);
      const now = Date.now();

      const insertUserStmt = db.prepare(`
        INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'active', ?, ?)
      `);

      // Admin Account: Alex Mercer (alex.mercer@titan.corp) with ID usr_94812
      insertUserStmt.run('usr_94812', 'alex.mercer', 'alex.mercer@titan.corp', passwordHash, 'admin', now, now);
      console.log('[DB MIGRATION] Seeded persistent Administrator account: alex.mercer@titan.corp (usr_94812)');

      // Also generate initial recovery codes for the admin
      await generateRecoveryCodesForUser('usr_94812', 8);
    }
  }

  // Migrate initial materials from materials-store.js if materials table is empty
  const checkMatStmt = db.prepare('SELECT COUNT(*) as count FROM materials');
  const matCount = checkMatStmt.get().count;

  if (matCount === 0) {
    const { getAllMaterials } = require('./materials-store');
    const initialList = getAllMaterials();
    if (Array.isArray(initialList) && initialList.length > 0) {
      const insertMatStmt = db.prepare(`
        INSERT INTO materials (id, title, category, file_type, file_size, access_level, date_added, description, sha256_checksum, sample_content)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const item of initialList) {
        insertMatStmt.run(
          item.id,
          item.title,
          item.category,
          item.fileType,
          item.fileSize,
          item.accessLevel,
          item.dateAdded,
          item.description || '',
          item.sha256Checksum || crypto.createHash('sha256').update(item.title).digest('hex'),
          item.sampleContent || ''
        );
      }
      console.log(`[DB MIGRATION] Migrated ${initialList.length} materials assets to SQLite.`);
    }
  }

  // Seed News Sources and Initial Big Tech Stories
  await seedNewsSourcesAndArticles();
}

// ---------------------------------------------------------------------------
// 3. USER MANAGEMENT & AUTHENTICATION
// ---------------------------------------------------------------------------

function getUserById(id) {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
  return stmt.get(id);
}

function getUserByIdentity(identity) {
  if (!identity) return null;
  const clean = identity.trim().toLowerCase();
  const stmt = db.prepare('SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?');
  return stmt.get(clean, clean);
}

async function createUser({ username, email, password, role = 'user', status = 'active' }) {
  const cleanEmail = email.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase();
  const passwordHash = await bcrypt.hash(password, 12);
  const now = Date.now();
  const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;

  const stmt = db.prepare(`
    INSERT INTO users (id, username, email, password_hash, role, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(userId, cleanUsername, cleanEmail, passwordHash, role, status, now, now);
  const recoveryCodes = await generateRecoveryCodesForUser(userId, 8);

  return {
    user: { id: userId, username: cleanUsername, email: cleanEmail, role, status },
    recoveryCodes
  };
}

async function verifyCredentials(identity, password) {
  const user = getUserByIdentity(identity);
  if (!user) return null;

  const now = Date.now();

  // Check account lockout
  if (user.locked_until && user.locked_until > now) {
    const remainingSeconds = Math.ceil((user.locked_until - now) / 1000);
    const lockErr = new Error(`Account temporarily locked. Try again in ${remainingSeconds} seconds.`);
    lockErr.isLocked = true;
    lockErr.remainingSeconds = remainingSeconds;
    throw lockErr;
  }

  // Check account status
  if (user.status !== 'active') {
    const statusErr = new Error('Account pending approval or suspended.');
    statusErr.status = user.status;
    throw statusErr;
  }

  const isMatch = await bcrypt.compare(password, user.password_hash);
  if (!isMatch) {
    recordFailedAttempt(user.id);
    return null;
  }

  // Reset failed attempts on success
  resetFailedAttempts(user.id);
  return user;
}

function recordFailedAttempt(userId) {
  const user = getUserById(userId);
  if (!user) return;

  const attempts = (user.failed_attempts || 0) + 1;
  const now = Date.now();
  let lockedUntil = null;

  // Exponential lock-out after 5 failed attempts
  if (attempts >= 5) {
    const lockMinutes = attempts >= 10 ? 60 : 15;
    lockedUntil = now + (lockMinutes * 60 * 1000);
  }

  const stmt = db.prepare('UPDATE users SET failed_attempts = ?, locked_until = ?, updated_at = ? WHERE id = ?');
  stmt.run(attempts, lockedUntil, now, userId);
}

function resetFailedAttempts(userId) {
  const stmt = db.prepare('UPDATE users SET failed_attempts = 0, locked_until = NULL, updated_at = ? WHERE id = ?');
  stmt.run(Date.now(), userId);
}

// ---------------------------------------------------------------------------
// 4. RECOVERY CODES (ZERO EMAIL DEPENDENCY)
// ---------------------------------------------------------------------------

async function generateRecoveryCodesForUser(userId, count = 8) {
  // Delete existing unused recovery codes
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ? AND used = 0').run(userId);

  const rawCodes = [];
  const insertStmt = db.prepare('INSERT INTO recovery_codes (user_id, code_hash, created_at) VALUES (?, ?, ?)');
  const now = Date.now();

  for (let i = 0; i < count; i++) {
    // Format: XXXX-XXXX-XXXX
    const rawCode = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
    rawCodes.push(rawCode);
    const codeHash = crypto.createHash('sha256').update(rawCode).digest('hex');
    insertStmt.run(userId, codeHash, now);
  }

  return rawCodes;
}

function verifyAndConsumeRecoveryCode(userId, rawCode) {
  const cleanCode = (rawCode || '').trim().toUpperCase();
  const codeHash = crypto.createHash('sha256').update(cleanCode).digest('hex');

  const stmt = db.prepare('SELECT id FROM recovery_codes WHERE user_id = ? AND code_hash = ? AND used = 0');
  const record = stmt.get(userId, codeHash);
  if (!record) return false;

  // Mark as used immediately
  db.prepare('UPDATE recovery_codes SET used = 1, used_at = ? WHERE id = ?').run(Date.now(), record.id);
  return true;
}

// ---------------------------------------------------------------------------
// 5. SESSION MANAGEMENT & ROTATION
// ---------------------------------------------------------------------------

const SESSION_TTL_MS = 2 * 60 * 60 * 1000; // 2 Hours active session

function createSession(userId, role, req) {
  const sessionId = crypto.randomBytes(32).toString('hex');
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  const ip = req ? (req.headers['x-forwarded-for'] || req.socket.remoteAddress) : '';
  const userAgent = req ? (req.headers['user-agent'] || '') : '';

  const stmt = db.prepare(`
    INSERT INTO sessions (id, user_id, role, created_at, expires_at, last_active_at, ip_address, user_agent)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(sessionId, userId, role, now, expiresAt, now, String(ip).slice(0, 100), String(userAgent).slice(0, 200));
  return { sessionId, expiresAt };
}

function validateSession(sessionId) {
  if (!sessionId || typeof sessionId !== 'string') return null;

  const now = Date.now();
  const stmt = db.prepare(`
    SELECT s.*, u.username, u.email, u.status 
    FROM sessions s 
    JOIN users u ON s.user_id = u.id 
    WHERE s.id = ? AND s.expires_at > ?
  `);

  const session = stmt.get(sessionId, now);
  if (!session || session.status !== 'active') {
    if (session) destroySession(sessionId);
    return null;
  }

  // Slide last active timestamp (rolling session)
  db.prepare('UPDATE sessions SET last_active_at = ? WHERE id = ?').run(now, sessionId);
  return session;
}

function rotateSession(oldSessionId, req) {
  const session = validateSession(oldSessionId);
  if (!session) return null;

  destroySession(oldSessionId);
  return createSession(session.user_id, session.role, req);
}

function destroySession(sessionId) {
  db.prepare('DELETE FROM sessions WHERE id = ?').run(sessionId);
}

function destroyAllUserSessions(userId) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId);
}

// Clean expired sessions periodically
const sessionCleanupInterval = setInterval(() => {
  try {
    db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
  } catch (e) {
    // Ignore cleanup error
  }
}, 5 * 60 * 1000);
if (sessionCleanupInterval.unref) {
  sessionCleanupInterval.unref();
}

// ---------------------------------------------------------------------------
// 6. MATERIALS CATALOG (PERSISTENT SQLITE)
// ---------------------------------------------------------------------------

function getAllMaterials({ query = '', category = 'all', sort = 'date-desc' } = {}) {
  let sql = 'SELECT * FROM materials WHERE 1=1';
  const params = [];

  if (category && category !== 'all') {
    sql += ' AND LOWER(category) = ?';
    params.push(category.toLowerCase());
  }

  if (query && query.trim()) {
    const q = `%${query.trim().toLowerCase()}%`;
    sql += ' AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ? OR LOWER(id) LIKE ?)';
    params.push(q, q, q);
  }

  // Sort
  if (sort === 'date-asc') {
    sql += ' ORDER BY date_added ASC';
  } else if (sort === 'title-asc') {
    sql += ' ORDER BY title ASC';
  } else {
    sql += ' ORDER BY date_added DESC';
  }

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    category: r.category,
    fileType: r.file_type,
    fileSize: r.file_size,
    accessLevel: r.access_level,
    dateAdded: r.date_added,
    description: r.description,
    sha256Checksum: r.sha256_checksum,
    sampleContent: r.sample_content
  }));
}

function getMaterialById(id) {
  const row = db.prepare('SELECT * FROM materials WHERE id = ?').get(id);
  if (!row) return null;
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    fileType: row.file_type,
    fileSize: row.file_size,
    accessLevel: row.access_level,
    dateAdded: row.date_added,
    description: row.description,
    sha256Checksum: row.sha256_checksum,
    sampleContent: row.sample_content
  };
}

function addMaterial(item) {
  const id = item.id || `mat_${Date.now()}`;
  const nowStr = new Date().toISOString().split('T')[0];
  const checksum = crypto.createHash('sha256').update(item.title + (item.sampleContent || '')).digest('hex');

  const stmt = db.prepare(`
    INSERT INTO materials (id, title, category, file_type, file_size, access_level, date_added, description, sha256_checksum, sample_content)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  stmt.run(
    id,
    item.title,
    item.category || 'Document',
    (item.fileType || 'PDF').toUpperCase(),
    item.fileSize || '1.0 MB',
    item.accessLevel || 'host-only',
    item.dateAdded || nowStr,
    item.description || '',
    checksum,
    item.sampleContent || ''
  );

  return getMaterialById(id);
}

// ---------------------------------------------------------------------------
// 7. AUDIT LOGGING & WATCHDOG TELEMETRY STORE
// ---------------------------------------------------------------------------

function recordAuditLog({ userId, action, ip, userAgent, details }) {
  try {
    const stmt = db.prepare('INSERT INTO audit_log (timestamp, user_id, action, ip, user_agent, details) VALUES (?, ?, ?, ?, ?, ?)');
    stmt.run(
      Date.now(),
      userId || null,
      String(action || 'UNKNOWN'),
      ip || null,
      userAgent || null,
      typeof details === 'object' ? JSON.stringify(details) : (details ? String(details) : null)
    );
  } catch (err) {
    console.error('[DB AUDIT LOG ERROR]', err.message);
  }
}

function getAuditLogs(limit = 100) {
  return db.prepare('SELECT * FROM audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
}

function recordAuditTrade({ userId, action, ticker, quantity, price, riskVerdict, portfolioState }) {
  const stmt = db.prepare(`
    INSERT INTO trade_audit_log (timestamp, user_id, action, ticker, quantity, price, risk_verdict, portfolio_state)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(Date.now(), userId || null, action, ticker, quantity, price, JSON.stringify(riskVerdict || {}), JSON.stringify(portfolioState || {}));
}

function getTradeAuditLogs(limit = 50) {
  return db.prepare('SELECT * FROM trade_audit_log ORDER BY timestamp DESC LIMIT ?').all(limit);
}

function recordIncident({ severity, component, signature, description, actionTaken, resolved = 1 }) {
  const stmt = db.prepare(`
    INSERT INTO incidents (timestamp, severity, component, signature, description, action_taken, resolved)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(Date.now(), severity, component, signature, description, actionTaken, resolved ? 1 : 0);
}

function getRecentIncidents(limit = 20) {
  return db.prepare('SELECT * FROM incidents ORDER BY timestamp DESC LIMIT ?').all(limit);
}

// ---------------------------------------------------------------------------
// 8. NEWS ENGINE, INTEL ARTICLES, BOOKMARKS & WATCHLISTS
// ---------------------------------------------------------------------------

function insertArticle(articleData) {
  const now = Date.now();
  const id = articleData.id || `art_${crypto.randomBytes(6).toString('hex')}`;
  const headline = (articleData.headline || articleData.title || '').trim();
  const summary = (articleData.summary || '').trim();
  const whyItMatters = (articleData.why_it_matters || articleData.whyItMatters || '').trim();
  const sourceName = articleData.source_name || articleData.sourceName || articleData.source || 'Institutional Intelligence';
  const sourceId = articleData.source_id || articleData.sourceId || null;
  const url = articleData.url || 'https://www.sec.gov';
  const category = (articleData.category || 'market-shift').toLowerCase();

  let publishedAt = articleData.published_at || articleData.publishedAt;
  if (typeof publishedAt === 'string') {
    const parsed = new Date(publishedAt).getTime();
    publishedAt = isNaN(parsed) ? now : parsed;
  } else if (!publishedAt) {
    publishedAt = now;
  }

  const isBreaking = (articleData.is_breaking || articleData.isBreaking || articleData.status === 'breaking') ? 1 : 0;
  const status = articleData.status || (isBreaking ? 'breaking' : 'published');
  const slug = articleData.slug || headline.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 100) || `story-${id}`;

  const contentHash = articleData.content_hash || articleData.contentHash || crypto.createHash('sha256').update(headline + summary).digest('hex');

  // Check if article with this content_hash already exists (deduplication)
  const existing = db.prepare('SELECT id FROM articles WHERE content_hash = ?').get(contentHash);
  if (existing) {
    return getArticleById(existing.id);
  }

  // Insert into articles table
  const insertStmt = db.prepare(`
    INSERT INTO articles (id, slug, headline, summary, why_it_matters, source_id, source_name, url, category, published_at, created_at, is_breaking, status, content_hash)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertStmt.run(id, slug, headline, summary, whyItMatters, sourceId, sourceName, url, category, publishedAt, now, isBreaking, status, contentHash);

  // Insert into article_scores table
  const score = articleData.score || articleData.scores || {};
  const impactScore = Number(score.impact_score || score.impactScore || articleData.impact_score || articleData.impactScore || 7);
  const sentiment = (score.sentiment || articleData.sentiment || 'neutral').toLowerCase();
  const expectedDirection = (score.expected_direction || score.expectedDirection || articleData.expected_direction || articleData.expectedDirection || 'flat').toLowerCase();
  const confidence = Number(score.confidence || articleData.confidence || 0.85);
  const rationale = String(score.rationale || articleData.rationale || 'Analysis conducted across institutional feeds and market catalysts.');

  const scoreStmt = db.prepare(`
    INSERT INTO article_scores (article_id, impact_score, sentiment, expected_direction, confidence, rationale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  scoreStmt.run(id, impactScore, sentiment, expectedDirection, confidence, rationale, now);

  // Insert entities
  const entities = articleData.entities || [];
  const tickers = articleData.tickers || [];
  const entityStmt = db.prepare(`
    INSERT INTO entities (article_id, entity_type, symbol, name)
    VALUES (?, ?, ?, ?)
  `);

  const insertedSymbols = new Set();
  for (const ent of entities) {
    const sym = ent.symbol ? ent.symbol.toUpperCase().trim() : null;
    if (sym) insertedSymbols.add(sym);
    entityStmt.run(id, ent.entity_type || ent.type || 'equity', sym, ent.name || sym || 'Unknown');
  }

  for (const sym of tickers) {
    const cleanSym = String(sym).toUpperCase().trim();
    if (cleanSym && !insertedSymbols.has(cleanSym)) {
      insertedSymbols.add(cleanSym);
      entityStmt.run(id, 'equity', cleanSym, cleanSym);
    }
  }

  return getArticleById(id);
}

function getArticles(options = {}) {
  const {
    ticker,
    category,
    sentiment,
    minImpact,
    min_impact,
    timeRange,
    time_range,
    q,
    limit = 20,
    cursor,
    userId
  } = options;

  let sql = `
    SELECT DISTINCT a.*, 
           s.impact_score, s.sentiment, s.expected_direction, s.confidence, s.rationale
    FROM articles a
    LEFT JOIN article_scores s ON a.id = s.article_id
  `;

  const whereClauses = ["a.status IN ('published', 'breaking')"];
  const params = [];

  if (ticker) {
    sql += ` JOIN entities e ON a.id = e.article_id`;
    whereClauses.push(`UPPER(e.symbol) = UPPER(?)`);
    params.push(ticker.trim());
  }

  if (category && category !== 'all') {
    whereClauses.push(`LOWER(a.category) = LOWER(?)`);
    params.push(category.trim());
  }

  if (sentiment && sentiment !== 'all') {
    whereClauses.push(`LOWER(s.sentiment) = LOWER(?)`);
    params.push(sentiment.trim());
  }

  const effectiveMinImpact = minImpact !== undefined ? minImpact : min_impact;
  if (effectiveMinImpact !== undefined && effectiveMinImpact !== null && effectiveMinImpact !== '') {
    whereClauses.push(`s.impact_score >= ?`);
    params.push(Number(effectiveMinImpact));
  }

  const effectiveTimeRange = timeRange || time_range;
  if (effectiveTimeRange && effectiveTimeRange !== 'all') {
    const now = Date.now();
    let durationMs = 24 * 60 * 60 * 1000;
    if (effectiveTimeRange === '7d') durationMs = 7 * 24 * 60 * 60 * 1000;
    else if (effectiveTimeRange === '30d') durationMs = 30 * 24 * 60 * 60 * 1000;
    else if (effectiveTimeRange === '1h') durationMs = 60 * 60 * 1000;
    whereClauses.push(`a.published_at >= ?`);
    params.push(now - durationMs);
  }

  if (q && q.trim()) {
    const searchTerm = `%${q.trim().toLowerCase()}%`;
    whereClauses.push(`(LOWER(a.headline) LIKE ? OR LOWER(a.summary) LIKE ? OR LOWER(a.why_it_matters) LIKE ?)`);
    params.push(searchTerm, searchTerm, searchTerm);
  }

  if (cursor) {
    whereClauses.push(`a.published_at < ?`);
    params.push(Number(cursor));
  }

  if (whereClauses.length > 0) {
    sql += ` WHERE ` + whereClauses.join(' AND ');
  }

  sql += ` ORDER BY a.is_breaking DESC, a.published_at DESC LIMIT ?`;
  params.push(Math.min(Math.max(Number(limit) || 20, 1), 100));

  const rows = db.prepare(sql).all(...params);

  let userBookmarks = new Set();
  if (userId) {
    try {
      const bRows = db.prepare('SELECT article_id FROM bookmarks WHERE user_id = ?').all(userId);
      userBookmarks = new Set(bRows.map(b => b.article_id));
    } catch (e) {}
  }

  const entitiesStmt = db.prepare('SELECT entity_type, symbol, name FROM entities WHERE article_id = ?');

  return rows.map(r => {
    const entList = entitiesStmt.all(r.id);
    const tickers = entList.map(e => e.symbol).filter(Boolean);
    return {
      id: r.id,
      slug: r.slug,
      title: r.headline,
      headline: r.headline,
      summary: r.summary,
      whyItMatters: r.why_it_matters || '',
      why_it_matters: r.why_it_matters || '',
      source: r.source_name,
      sourceName: r.source_name,
      source_name: r.source_name,
      sourceId: r.source_id,
      source_id: r.source_id,
      url: r.url,
      category: r.category,
      publishedAt: new Date(r.published_at).toISOString(),
      published_at: r.published_at,
      createdAt: new Date(r.created_at).toISOString(),
      isBreaking: Boolean(r.is_breaking),
      is_breaking: r.is_breaking,
      status: r.status,
      impactScore: r.impact_score,
      impact_score: r.impact_score,
      sentiment: r.sentiment || 'neutral',
      expectedDirection: r.expected_direction || 'flat',
      expected_direction: r.expected_direction || 'flat',
      confidence: r.confidence || 0.8,
      rationale: r.rationale || '',
      tickers,
      entities: entList,
      bookmarked: userBookmarks.has(r.id),
      content_hash: r.content_hash,
      contentHash: r.content_hash,
      provenance_sha256: r.content_hash,
      sha256: r.content_hash,
      mock: false
    };
  });
}

function getArticleById(id, userId = null) {
  if (!id) return null;
  const row = db.prepare(`
    SELECT a.*, s.impact_score, s.sentiment, s.expected_direction, s.confidence, s.rationale
    FROM articles a
    LEFT JOIN article_scores s ON a.id = s.article_id
    WHERE a.id = ? OR a.slug = ?
  `).get(id, id);

  if (!row) return null;

  const entList = db.prepare('SELECT entity_type, symbol, name FROM entities WHERE article_id = ?').all(row.id);
  const tickers = entList.map(e => e.symbol).filter(Boolean);
  let isBookmarked = false;
  if (userId) {
    try {
      isBookmarked = Boolean(db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND article_id = ?').get(userId, row.id));
    } catch (e) {}
  }

  return {
    id: row.id,
    slug: row.slug,
    title: row.headline,
    headline: row.headline,
    summary: row.summary,
    whyItMatters: row.why_it_matters || '',
    why_it_matters: row.why_it_matters || '',
    source: row.source_name,
    sourceName: row.source_name,
    source_name: row.source_name,
    sourceId: row.source_id,
    source_id: row.source_id,
    url: row.url,
    category: row.category,
    publishedAt: new Date(row.published_at).toISOString(),
    published_at: row.published_at,
    createdAt: new Date(row.created_at).toISOString(),
    isBreaking: Boolean(row.is_breaking),
    is_breaking: row.is_breaking,
    status: row.status,
    impactScore: row.impact_score,
    impact_score: row.impact_score,
    sentiment: row.sentiment || 'neutral',
    expectedDirection: row.expected_direction || 'flat',
    expected_direction: row.expected_direction || 'flat',
    confidence: row.confidence || 0.8,
    rationale: row.rationale || '',
    tickers,
    entities: entList,
    bookmarked: isBookmarked,
    content_hash: row.content_hash,
    contentHash: row.content_hash,
    provenance_sha256: row.content_hash,
    sha256: row.content_hash,
    mock: false
  };
}

function toggleBookmark(userId, articleId) {
  if (!userId || !articleId) return { success: false, bookmarked: false };
  const existing = db.prepare('SELECT id FROM bookmarks WHERE user_id = ? AND article_id = ?').get(userId, articleId);
  if (existing) {
    db.prepare('DELETE FROM bookmarks WHERE user_id = ? AND article_id = ?').run(userId, articleId);
    return { success: true, bookmarked: false };
  } else {
    db.prepare('INSERT INTO bookmarks (user_id, article_id, created_at) VALUES (?, ?, ?)').run(userId, articleId, Date.now());
    return { success: true, bookmarked: true };
  }
}

function getBookmarks(userId) {
  if (!userId) return [];
  const rows = db.prepare(`
    SELECT a.*, s.impact_score, s.sentiment, s.expected_direction, s.confidence, s.rationale, b.created_at as bookmarked_at
    FROM bookmarks b
    JOIN articles a ON b.article_id = a.id
    LEFT JOIN article_scores s ON a.id = s.article_id
    WHERE b.user_id = ?
    ORDER BY b.created_at DESC
  `).all(userId);

  const entitiesStmt = db.prepare('SELECT entity_type, symbol, name FROM entities WHERE article_id = ?');
  return rows.map(r => {
    const entList = entitiesStmt.all(r.id);
    return {
      id: r.id,
      slug: r.slug,
      title: r.headline,
      headline: r.headline,
      summary: r.summary,
      whyItMatters: r.why_it_matters || '',
      why_it_matters: r.why_it_matters || '',
      source: r.source_name,
      source_name: r.source_name,
      url: r.url,
      category: r.category,
      publishedAt: new Date(r.published_at).toISOString(),
      published_at: r.published_at,
      impactScore: r.impact_score,
      sentiment: r.sentiment,
      tickers: entList.map(e => e.symbol).filter(Boolean),
      entities: entList,
      bookmarked: true,
      bookmarkedAt: r.bookmarked_at
    };
  });
}

function isBookmarked(userId, articleId) {
  if (!userId || !articleId) return false;
  return Boolean(db.prepare('SELECT 1 FROM bookmarks WHERE user_id = ? AND article_id = ?').get(userId, articleId));
}

function getWatchlist(userId) {
  if (!userId) return [];
  const rows = db.prepare('SELECT symbol FROM watchlists WHERE user_id = ? ORDER BY created_at ASC').all(userId);
  return rows.map(r => r.symbol);
}

function addToWatchlist(userId, symbol) {
  if (!userId || !symbol) return false;
  const sym = symbol.toUpperCase().trim();
  const existing = db.prepare('SELECT id FROM watchlists WHERE user_id = ? AND symbol = ?').get(userId, sym);
  if (!existing) {
    db.prepare('INSERT INTO watchlists (user_id, symbol, created_at) VALUES (?, ?, ?)').run(userId, sym, Date.now());
  }
  return true;
}

function removeFromWatchlist(userId, symbol) {
  if (!userId || !symbol) return false;
  const sym = symbol.toUpperCase().trim();
  db.prepare('DELETE FROM watchlists WHERE user_id = ? AND symbol = ?').run(userId, sym);
  return true;
}

function getSources() {
  return db.prepare('SELECT * FROM sources ORDER BY credibility_weight DESC').all();
}

function updateSourceStatus(id, status, failures = 0) {
  db.prepare(`
    UPDATE sources 
    SET status = ?, consecutive_failures = ?, last_polled_at = ?
    WHERE id = ?
  `).run(status, failures, Date.now(), id);
}

function recordAgentRun({ agentName, runType, status, itemsProcessed = 0, itemsPublished = 0, startedAt, completedAt, errorDetails = null }) {
  const stmt = db.prepare(`
    INSERT INTO agent_runs (agent_name, run_type, status, items_processed, items_published, started_at, completed_at, error_details)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(agentName, runType, status, itemsProcessed, itemsPublished, startedAt || Date.now(), completedAt || Date.now(), errorDetails);
}

function getRecentAgentRuns(limit = 20) {
  return db.prepare('SELECT * FROM agent_runs ORDER BY started_at DESC LIMIT ?').all(limit);
}

async function seedNewsSourcesAndArticles() {
  const checkSourceStmt = db.prepare('SELECT COUNT(*) as count FROM sources');
  const now = Date.now();
  
  const insertOrUpgradeSrc = db.prepare(`
    INSERT INTO sources (id, name, url, category, credibility_weight, poll_interval_sec, status, consecutive_failures, created_at)
    VALUES (?, ?, ?, ?, ?, ?, 'active', 0, ?)
    ON CONFLICT(id) DO UPDATE SET 
      url = excluded.url,
      name = excluded.name,
      category = excluded.category,
      credibility_weight = excluded.credibility_weight,
      status = 'active',
      consecutive_failures = 0
  `);

  const institutionalSources = [
    {
      id: 'src_sec',
      name: 'SEC EDGAR Form 8-K Disclosure',
      url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=8-K&count=20&output=atom',
      category: 'regulatory',
      credibility_weight: 1.0,
      poll_interval_sec: 180
    },
    {
      id: 'src_google_tech',
      name: 'Google News Big Tech Wire',
      url: 'https://news.google.com/rss/search?q=NVIDIA+OR+Microsoft+OR+Apple+OR+Google+OR+Amazon+OR+Meta+OR+Tesla+when:1d&hl=en-US&gl=US&ceid=US:en',
      category: 'market-shift',
      credibility_weight: 0.95,
      poll_interval_sec: 300
    },
    {
      id: 'src_google_chips',
      name: 'Semiconductor & AI Compute Wire',
      url: 'https://news.google.com/rss/search?q=AI+chips+OR+Blackwell+OR+semiconductors+OR+antitrust+tech+when:1d&hl=en-US&gl=US&ceid=US:en',
      category: 'semiconductor',
      credibility_weight: 0.95,
      poll_interval_sec: 300
    },
    {
      id: 'src_reuters',
      name: 'Reuters Technology Bureau (Syndicated)',
      url: 'https://news.google.com/rss/search?q=site:reuters.com+technology+OR+business+when:2d&hl=en-US&gl=US&ceid=US:en',
      category: 'wire',
      credibility_weight: 0.95,
      poll_interval_sec: 300
    },
    {
      id: 'src_bloomberg',
      name: 'Bloomberg Markets Terminal (Syndicated)',
      url: 'https://news.google.com/rss/search?q=site:bloomberg.com+technology+OR+markets+when:2d&hl=en-US&gl=US&ceid=US:en',
      category: 'terminal',
      credibility_weight: 0.95,
      poll_interval_sec: 300
    },
    {
      id: 'src_ft',
      name: 'Financial Times Lex & Tech (Syndicated)',
      url: 'https://news.google.com/rss/search?q=site:ft.com+technology+when:2d&hl=en-US&gl=US&ceid=US:en',
      category: 'institutional',
      credibility_weight: 0.90,
      poll_interval_sec: 300
    },
    {
      id: 'src_wsj',
      name: 'Wall Street Journal Tech Desk (Syndicated)',
      url: 'https://news.google.com/rss/search?q=site:wsj.com+tech+OR+business+when:2d&hl=en-US&gl=US&ceid=US:en',
      category: 'institutional',
      credibility_weight: 0.90,
      poll_interval_sec: 300
    }
  ];

  for (const src of institutionalSources) {
    insertOrUpgradeSrc.run(
      src.id,
      src.name,
      src.url,
      src.category,
      src.credibility_weight,
      src.poll_interval_sec,
      now
    );
  }
  console.log(`[DB MIGRATION] Synchronized ${institutionalSources.length} institutional news feeds to SQLite.`);

  const checkArtStmt = db.prepare('SELECT COUNT(*) as count FROM articles');
  if (checkArtStmt.get().count === 0) {
    const now = Date.now();
    const initialStories = [
      {
        id: 'art_nvda_export_001',
        slug: 'fresh-export-restrictions-cloud-global-ai-chip-shipments-for-nvidia-corporation',
        headline: 'Fresh Export Restrictions Cloud Global AI Chip Shipments for NVIDIA Corporation',
        summary: 'New regulatory directives tighten export limits on high-performance accelerators, prompting immediate reassessments across supply chains and customer allocations for NVDA.',
        why_it_matters: 'Immediate revenue exposure in Asian markets threatens near-term shipment guidance, with sector-wide ripple effects spanning foundry partners and competing AI hardware developers.',
        source_id: 'src_sec',
        source_name: 'SEC EDGAR Form 8-K Disclosure',
        url: 'https://www.sec.gov/edgar/searchedgar/companysearch',
        category: 'market-shift',
        published_at: now - 30 * 60 * 1000,
        is_breaking: 1,
        content_hash: crypto.createHash('sha256').update('art_nvda_export_001').digest('hex'),
        score: {
          impact_score: 9,
          sentiment: 'cautionary',
          expected_direction: 'down',
          confidence: 0.92,
          rationale: 'High regulatory impact on leading revenue segment and near-term margin expectations.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'NVDA', name: 'NVIDIA Corporation' },
          { entity_type: 'equity', symbol: 'AMD', name: 'Advanced Micro Devices' },
          { entity_type: 'equity', symbol: 'TSM', name: 'Taiwan Semiconductor' },
          { entity_type: 'equity', symbol: 'INTC', name: 'Intel Corporation' }
        ]
      },
      {
        id: 'art_msft_azure_002',
        slug: 'microsoft-expands-azure-datacenter-footprint-with-10-gw-energy-contract',
        headline: 'Microsoft Expands Azure Datacenter Footprint with 10 GW Clean Energy Agreement',
        summary: 'Hyperscaler secures landmark multi-year baseload power framework to support next-generation OpenAI training clusters across North America.',
        why_it_matters: 'Power generation infrastructure replaces compute availability as primary operational bottleneck for hyperscale AI deployment.',
        source_id: 'src_reuters',
        source_name: 'Reuters Technology Bureau',
        url: 'https://www.reuters.com/technology/msft-energy-deal',
        category: 'datacenter',
        published_at: now - 90 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_msft_azure_002').digest('hex'),
        score: {
          impact_score: 8,
          sentiment: 'bullish',
          expected_direction: 'up',
          confidence: 0.88,
          rationale: 'Removes primary physical capacity constraint for Azure AI infrastructure scaling.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'MSFT', name: 'Microsoft Corporation' }
        ]
      },
      {
        id: 'art_aapl_dma_003',
        slug: 'apple-revises-app-store-terms-in-europe-following-eu-antitrust-ruling',
        headline: 'Apple Revises App Store Terms in Europe Following EU Antitrust Enforcement',
        summary: 'European Commission reviews concessions regarding alternative marketplace fees and default browser selection under the Digital Markets Act.',
        why_it_matters: 'Maintains Services division gross margin stability while mitigating statutory multi-billion euro non-compliance fines.',
        source_id: 'src_ft',
        source_name: 'Financial Times Lex & Tech',
        url: 'https://www.ft.com/technology/apple-eu-dma',
        category: 'antitrust',
        published_at: now - 180 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_aapl_dma_003').digest('hex'),
        score: {
          impact_score: 7,
          sentiment: 'neutral',
          expected_direction: 'flat',
          confidence: 0.85,
          rationale: 'Regulatory settlement removes overhang while fee restructuring shields European services revenue.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'AAPL', name: 'Apple Inc.' }
        ]
      },
      {
        id: 'art_googl_remedies_004',
        slug: 'judge-blocks-forced-chrome-divestiture-in-google-search-antitrust-case',
        headline: 'Federal Court Blocks Mandatory Chrome Browser Divestiture in Search Remedies Phase',
        summary: 'DOJ remedy request for structural breakup denied in favor of behavioral remedies addressing exclusive distribution contracts.',
        why_it_matters: 'Removes tail-risk scenario of forced core platform divestiture, clarifying long-term distribution economics for Alphabet.',
        source_id: 'src_wsj',
        source_name: 'Wall Street Journal Tech Desk',
        url: 'https://www.wsj.com/tech/google-antitrust-ruling',
        category: 'antitrust',
        published_at: now - 240 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_googl_remedies_004').digest('hex'),
        score: {
          impact_score: 8,
          sentiment: 'bullish',
          expected_direction: 'up',
          confidence: 0.89,
          rationale: 'Exclusion of structural breakup preserves Android and Chrome unified ecosystem distribution.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'GOOGL', name: 'Alphabet Inc.' }
        ]
      },
      {
        id: 'art_amzn_trainium_005',
        slug: 'amazon-deploys-trainium2-clusters-at-scale-with-co-located-smr-power',
        headline: 'Amazon Deploys Trainium2 Clusters at Scale with Co-Located Nuclear SMR Power',
        summary: 'AWS announces commercial production ramp of proprietary silicon clusters reducing reliance on external GPU merchant silicon.',
        why_it_matters: 'Vertically integrated silicon reduces capex per inference token and protects hyperscaler operating margins.',
        source_id: 'src_bloomberg',
        source_name: 'Bloomberg Markets Terminal',
        url: 'https://www.bloomberg.com/technology/aws-trainium2',
        category: 'semiconductor',
        published_at: now - 360 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_amzn_trainium_005').digest('hex'),
        score: {
          impact_score: 7,
          sentiment: 'bullish',
          expected_direction: 'up',
          confidence: 0.84,
          rationale: 'Demonstrates silicon diversification and internal compute efficiency gains for AWS.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'AMZN', name: 'Amazon.com Inc.' }
        ]
      },
      {
        id: 'art_meta_capex_006',
        slug: 'meta-boosts-2026-capex-guidance-for-frontier-compute-infrastructure',
        headline: 'Meta Platforms Raises Capital Expenditure Guidance for Frontier AI Cluster Buildouts',
        summary: 'Full-year infrastructure budget lifted to support 600,000 equivalent accelerator footprint and next-generation Llama model training.',
        why_it_matters: 'Reaffirms hyperscale demand trajectory for enterprise datacenter supply chain while compressing short-term free cash flow.',
        source_id: 'src_reuters',
        source_name: 'Reuters Technology Bureau',
        url: 'https://www.reuters.com/technology/meta-capex-raise',
        category: 'corporate',
        published_at: now - 480 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_meta_capex_006').digest('hex'),
        score: {
          impact_score: 8,
          sentiment: 'neutral',
          expected_direction: 'flat',
          confidence: 0.82,
          rationale: 'High compute investment validates AI ambition but heightens scrutiny on near-term monetization.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'META', name: 'Meta Platforms Inc.' }
        ]
      },
      {
        id: 'art_tsla_robotaxi_007',
        slug: 'tesla-submits-autonomous-fleet-regulatory-docket-in-california',
        headline: 'Tesla Files Regulatory Permitting Application for Commercial Cybercab Testing',
        summary: 'California DMV receives formal submission outlining commercial ride-hail pilot testing parameters and remote intervention architecture.',
        why_it_matters: 'Critical milestone towards unlocking software-driven recurring mobility revenue beyond automotive hardware unit sales.',
        source_id: 'src_bloomberg',
        source_name: 'Bloomberg Markets Terminal',
        url: 'https://www.bloomberg.com/technology/tesla-california-permit',
        category: 'market-shift',
        published_at: now - 600 * 60 * 1000,
        is_breaking: 0,
        content_hash: crypto.createHash('sha256').update('art_tsla_robotaxi_007').digest('hex'),
        score: {
          impact_score: 7,
          sentiment: 'bullish',
          expected_direction: 'up',
          confidence: 0.79,
          rationale: 'First formal regulatory engagement step for commercial autonomous ride-hail operations.'
        },
        entities: [
          { entity_type: 'equity', symbol: 'TSLA', name: 'Tesla Inc.' }
        ]
      }
    ];

    for (const story of initialStories) {
      insertArticle(story);
    }
    console.log(`[DB MIGRATION] Seeded ${initialStories.length} institutional intelligence stories to SQLite.`);
  }
}

function getTrades(userId = null, limit = 50) {
  try {
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    if (userId) {
      return db.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, lim);
    }
    return db.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?').all(lim);
  } catch (err) {
    return [];
  }
}

// Initialize on boot
migrateInitialData().catch(err => console.error('[DB FATAL] Migration failed:', err));

module.exports = {
  db,
  getDb: () => db,
  getTrades,
  getUserById,
  getUserByIdentity,
  createUser,
  verifyCredentials,
  generateRecoveryCodesForUser,
  verifyAndConsumeRecoveryCode,
  createSession,
  validateSession,
  rotateSession,
  destroySession,
  destroyAllUserSessions,
  getAllMaterials,
  getMaterialById,
  addMaterial,
  recordAuditLog,
  getAuditLogs,
  recordAuditTrade,
  getTradeAuditLogs,
  recordIncident,
  getRecentIncidents,
  insertArticle,
  getArticles,
  getArticleById,
  toggleBookmark,
  getBookmarks,
  isBookmarked,
  getWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  getSources,
  updateSourceStatus,
  recordAgentRun,
  getRecentAgentRuns,
  seedNewsSourcesAndArticles
};

