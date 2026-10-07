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

    CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
    CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_user_id ON recovery_codes(user_id);
    CREATE INDEX IF NOT EXISTS idx_materials_category ON materials(category);
    CREATE INDEX IF NOT EXISTS idx_audit_log_timestamp ON audit_log(timestamp);
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

// Initialize on boot
migrateInitialData().catch(err => console.error('[DB FATAL] Migration failed:', err));

module.exports = {
  db,
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
  getRecentIncidents
};

