/**
 * TITAN WAR // JARVIS ANALYTICS SQLITE DATABASE (WAL MODE)
 * Architecture: Embedded node:sqlite DatabaseSync, WAL journal mode, parameterized statements.
 * Manages securities, company relationships, predictions, signals, and weight calibration models.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');

function getJarvisDbPath() {
  if (process.env.JARVIS_DB_PATH) {
    return path.resolve(process.env.JARVIS_DB_PATH);
  }
  const dataDir = process.env.TITAN_DATA_DIR ? path.resolve(process.env.TITAN_DATA_DIR) : path.join(__dirname, 'data');
  return path.join(dataDir, 'jarvis.db');
}

let dbInstance = null;

function getDb() {
  if (!dbInstance) {
    const dbPath = getJarvisDbPath();
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    dbInstance = new DatabaseSync(dbPath);
    dbInstance.exec('PRAGMA journal_mode = WAL;');
    dbInstance.exec('PRAGMA synchronous = NORMAL;');
    dbInstance.exec('PRAGMA foreign_keys = ON;');
    dbInstance.exec('PRAGMA busy_timeout = 5000;');
    initSchema(dbInstance);
  }
  return dbInstance;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS holdings (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      entry_thesis TEXT NOT NULL,
      entry_date TEXT NOT NULL,
      entry_price REAL NOT NULL,
      position_size REAL NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS thesis_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      thesis TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS signal_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticker TEXT NOT NULL,
      agent TEXT NOT NULL,
      score REAL NOT NULL,
      payload TEXT NOT NULL,
      as_of TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS prediction_ledger (
      prediction_id TEXT PRIMARY KEY,
      agent_source TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      claim TEXT NOT NULL,
      resolution_deadline TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actual_outcome TEXT,
      hit INTEGER,
      miss_type TEXT,
      error_notes TEXT,
      corrective_instruction TEXT,
      confidence REAL NOT NULL DEFAULT 0.5,
      time_horizon TEXT NOT NULL DEFAULT '1-3d',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    );

    CREATE TABLE IF NOT EXISTS agent_trust_scores (
      agent TEXT PRIMARY KEY,
      trust_score REAL NOT NULL DEFAULT 1.0,
      total_claims INTEGER NOT NULL DEFAULT 0,
      hits INTEGER NOT NULL DEFAULT 0,
      misses INTEGER NOT NULL DEFAULT 0,
      last_updated TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS reconciliation_audits (
      audit_id TEXT PRIMARY KEY,
      run_timestamp TEXT NOT NULL,
      evaluated_count INTEGER NOT NULL,
      hit_count INTEGER NOT NULL,
      miss_count INTEGER NOT NULL,
      summary TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS predictions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      prediction_id TEXT UNIQUE NOT NULL,
      ticker TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      predicted_score REAL NOT NULL,
      predicted_move REAL NOT NULL,
      predicted_range_low REAL NOT NULL,
      predicted_range_high REAL NOT NULL,
      confidence REAL NOT NULL,
      horizon_hours INTEGER NOT NULL DEFAULT 24,
      weights_snapshot TEXT NOT NULL,
      weights_version TEXT NOT NULL DEFAULT 'v1.0.0',
      dominant_driver TEXT NOT NULL,
      input_signals TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      actual_pct_change REAL,
      hit INTEGER,
      directional_hit INTEGER,
      calibration_error REAL,
      resolved_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS growth_weights (
      version TEXT PRIMARY KEY,
      w_sentiment_velocity REAL NOT NULL,
      w_headline_volume REAL NOT NULL,
      w_price_volatility REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'active',
      is_live INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      promoted_at TEXT,
      changelog TEXT
    );

    CREATE TABLE IF NOT EXISTS weight_changelog (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      from_version TEXT NOT NULL,
      to_version TEXT NOT NULL,
      old_weights TEXT NOT NULL,
      new_weights TEXT NOT NULL,
      trigger_metrics TEXT NOT NULL,
      holdout_validation TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS securities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      symbol TEXT NOT NULL,
      name TEXT NOT NULL,
      exchange TEXT NOT NULL DEFAULT '',
      country TEXT NOT NULL DEFAULT '',
      currency TEXT NOT NULL DEFAULT 'USD',
      sector TEXT NOT NULL DEFAULT '',
      industry TEXT NOT NULL DEFAULT '',
      isin TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      source TEXT NOT NULL DEFAULT '',
      as_of TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS company_relationships (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      company_symbol TEXT NOT NULL,
      kind TEXT NOT NULL,
      target_name TEXT NOT NULL,
      target_symbol TEXT,
      ownership_pct REAL,
      country TEXT,
      category TEXT,
      revenue_share REAL,
      source_url TEXT,
      source_doc TEXT,
      as_of TEXT NOT NULL DEFAULT '',
      method TEXT NOT NULL DEFAULT 'reported',
      confidence REAL NOT NULL DEFAULT 1.0,
      is_listed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_securities_symbol_exchange_uniq ON securities(symbol, exchange);
    CREATE INDEX IF NOT EXISTS idx_securities_name ON securities(name);
    CREATE INDEX IF NOT EXISTS idx_securities_country ON securities(country);
    CREATE INDEX IF NOT EXISTS idx_securities_sector ON securities(sector);
    CREATE INDEX IF NOT EXISTS idx_company_rel_symbol_kind ON company_relationships(company_symbol, kind);
  `);
}

function querySecurities({ q = '', region = 'global', limit = 50, offset = 0 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM securities WHERE status = "active"';
  const params = [];

  if (region === 'us') {
    sql += ' AND (country = "US" OR exchange IN ("XNYS", "XNAS"))';
  } else if (region === 'in') {
    sql += ' AND (country = "IN" OR exchange IN ("XNSE", "XBOM"))';
  }

  if (q && q.trim()) {
    const term = `%${q.trim().toUpperCase()}%`;
    sql += ' AND (symbol LIKE ? OR UPPER(name) LIKE ?)';
    params.push(term, term);
  }

  sql += ' ORDER BY symbol ASC LIMIT ? OFFSET ?';
  params.push(Math.min(200, Math.max(1, limit)), Math.max(0, offset));

  return db.prepare(sql).all(...params);
}

function countSecurities({ q = '', region = 'global' } = {}) {
  const db = getDb();
  let sql = 'SELECT count(*) as count FROM securities WHERE status = "active"';
  const params = [];

  if (region === 'us') {
    sql += ' AND (country = "US" OR exchange IN ("XNYS", "XNAS"))';
  } else if (region === 'in') {
    sql += ' AND (country = "IN" OR exchange IN ("XNSE", "XBOM"))';
  }

  if (q && q.trim()) {
    const term = `%${q.trim().toUpperCase()}%`;
    sql += ' AND (symbol LIKE ? OR UPPER(name) LIKE ?)';
    params.push(term, term);
  }

  return db.prepare(sql).get(...params)?.count || 0;
}

function getUniverseStats() {
  const db = getDb();
  const byRegion = db.prepare('SELECT country, count(*) as count FROM securities WHERE status = "active" GROUP BY country').all();
  const byExchange = db.prepare('SELECT exchange, count(*) as count FROM securities WHERE status = "active" GROUP BY exchange').all();
  const total = db.prepare('SELECT count(*) as count FROM securities WHERE status = "active"').get()?.count || 0;
  return { total, byRegion, byExchange };
}

function getSecurityBySymbol(symbol) {
  const db = getDb();
  const s = (symbol || '').toUpperCase().trim();
  return db.prepare('SELECT * FROM securities WHERE symbol = ? LIMIT 1').get(s);
}

function getCompanyRelationships(symbol, kind = null) {
  const db = getDb();
  const s = (symbol || '').toUpperCase().trim();
  if (kind) {
    return db.prepare('SELECT * FROM company_relationships WHERE company_symbol = ? AND kind = ? ORDER BY id ASC').all(s, kind);
  }
  return db.prepare('SELECT * FROM company_relationships WHERE company_symbol = ? ORDER BY id ASC').all(s);
}

function getPredictionsPerformance({ ticker = '', days = 30 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM predictions WHERE status = "resolved"';
  const params = [];

  if (ticker && ticker.trim()) {
    sql += ' AND ticker = ?';
    params.push(ticker.trim().toUpperCase());
  }

  if (days && Number(days) > 0) {
    const cutoff = new Date(Date.now() - (Number(days) * 86400000)).toISOString();
    sql += ' AND timestamp >= ?';
    params.push(cutoff);
  }

  sql += ' ORDER BY timestamp ASC';
  const rows = db.prepare(sql).all(...params);

  if (rows.length === 0) {
    return {
      n: 0,
      directional_accuracy: 0.0,
      mean_abs_calibration_error: 0.0,
      series: []
    };
  }

  let cumulativeHits = 0;
  let totalCalibErr = 0;
  const series = [];

  rows.forEach((r, idx) => {
    const isHit = r.directional_hit === 1 ? 1 : 0;
    cumulativeHits += isHit;
    totalCalibErr += Math.abs(r.calibration_error || 0);
    const n = idx + 1;
    series.push({
      ts: r.resolved_at || r.timestamp,
      n,
      accuracy: parseFloat((cumulativeHits / n).toFixed(4))
    });
  });

  const n = rows.length;
  return {
    n,
    directional_accuracy: parseFloat((cumulativeHits / n).toFixed(4)),
    mean_abs_calibration_error: parseFloat((totalCalibErr / n).toFixed(4)),
    series
  };
}

module.exports = {
  getDb,
  getJarvisDbPath,
  initSchema,
  querySecurities,
  countSecurities,
  getUniverseStats,
  getSecurityBySymbol,
  getCompanyRelationships,
  getPredictionsPerformance
};
