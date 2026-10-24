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
    seedDefaultSecurities(dbInstance);
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

    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      event_id TEXT UNIQUE NOT NULL,
      type TEXT NOT NULL,
      entity TEXT,
      payload TEXT NOT NULL,
      causation_id TEXT,
      correlation_id TEXT,
      code_sha TEXT,
      config_hash TEXT,
      occurred_at TEXT NOT NULL,
      known_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS facts (
      fact_id TEXT PRIMARY KEY,
      entity TEXT NOT NULL,
      metric TEXT NOT NULL,
      value TEXT NOT NULL,
      unit TEXT,
      as_of TEXT NOT NULL,
      known_at TEXT NOT NULL,
      source TEXT NOT NULL,
      source_tier INTEGER,
      quality TEXT NOT NULL,
      lineage TEXT
    );

    CREATE TABLE IF NOT EXISTS kill_switch_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      scope TEXT NOT NULL,
      reason TEXT NOT NULL,
      tripped_by TEXT NOT NULL,
      tripped_at TEXT NOT NULL,
      cleared_by TEXT,
      cleared_at TEXT
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_securities_symbol_exchange_uniq ON securities(symbol, exchange);
    CREATE INDEX IF NOT EXISTS idx_securities_name ON securities(name);
    CREATE INDEX IF NOT EXISTS idx_securities_country ON securities(country);
    CREATE INDEX IF NOT EXISTS idx_securities_sector ON securities(sector);
    CREATE INDEX IF NOT EXISTS idx_company_rel_symbol_kind ON company_relationships(company_symbol, kind);
    CREATE INDEX IF NOT EXISTS idx_events_type_seq ON events(type, seq);
    CREATE INDEX IF NOT EXISTS idx_events_entity_time ON events(entity, known_at);
    CREATE INDEX IF NOT EXISTS idx_facts_entity_metric_known ON facts(entity, metric, known_at);

    -- P5: Immutable append-only audit triggers
    CREATE TRIGGER IF NOT EXISTS trg_events_no_update
    BEFORE UPDATE ON events
    BEGIN
      SELECT RAISE(ABORT, 'events table is append-only: UPDATE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_events_no_delete
    BEFORE DELETE ON events
    BEGIN
      SELECT RAISE(ABORT, 'events table is append-only: DELETE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_pred_ledger_no_update
    BEFORE UPDATE ON prediction_ledger
    BEGIN
      SELECT RAISE(ABORT, 'prediction_ledger table is append-only: UPDATE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_pred_ledger_no_delete
    BEFORE DELETE ON prediction_ledger
    BEGIN
      SELECT RAISE(ABORT, 'prediction_ledger table is append-only: DELETE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_weight_changelog_no_update
    BEFORE UPDATE ON weight_changelog
    BEGIN
      SELECT RAISE(ABORT, 'weight_changelog table is append-only: UPDATE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_weight_changelog_no_delete
    BEFORE DELETE ON weight_changelog
    BEGIN
      SELECT RAISE(ABORT, 'weight_changelog table is append-only: DELETE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_kill_switch_no_update
    BEFORE UPDATE ON kill_switch_events
    WHEN OLD.cleared_at IS NOT NULL
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_events cleared rows cannot be modified: UPDATE prohibited');
    END;

    CREATE TRIGGER IF NOT EXISTS trg_kill_switch_no_delete
    BEFORE DELETE ON kill_switch_events
    BEGIN
      SELECT RAISE(ABORT, 'kill_switch_events table is append-only: DELETE prohibited');
    END;
  `);
}

function seedDefaultSecurities(db) {
  try {
    const existing = db.prepare("SELECT count(*) as count FROM securities").get()?.count || 0;
    if (existing > 0) return;

    const DEFAULT_SECURITIES = [
      // US Securities (XNAS, XNYS)
      { symbol: 'NVDA', name: 'NVIDIA Corporation', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'AAPL', name: 'Apple Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Consumer Electronics' },
      { symbol: 'MSFT', name: 'Microsoft Corporation', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'GOOGL', name: 'Alphabet Inc. Class A', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Communication Services', industry: 'Internet Content & Information' },
      { symbol: 'AMZN', name: 'Amazon.com, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Consumer Cyclical', industry: 'Internet Retail' },
      { symbol: 'META', name: 'Meta Platforms, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Communication Services', industry: 'Internet Content & Information' },
      { symbol: 'TSLA', name: 'Tesla, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
      { symbol: 'PLTR', name: 'Palantir Technologies Inc.', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'AMD', name: 'Advanced Micro Devices, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'INTC', name: 'Intel Corporation', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'AVGO', name: 'Broadcom Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'QCOM', name: 'QUALCOMM Incorporated', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'TXN', name: 'Texas Instruments Incorporated', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'ARM', name: 'Arm Holdings plc', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'ORCL', name: 'Oracle Corporation', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'CRM', name: 'Salesforce, Inc.', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Application' },
      { symbol: 'ADBE', name: 'Adobe Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'CSCO', name: 'Cisco Systems, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Communication Equipment' },
      { symbol: 'IBM', name: 'International Business Machines Corp.', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'NFLX', name: 'Netflix, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Communication Services', industry: 'Entertainment' },
      { symbol: 'UBER', name: 'Uber Technologies, Inc.', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Application' },
      { symbol: 'SNOW', name: 'Snowflake Inc.', exchange: 'XNYS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'PANW', name: 'Palo Alto Networks, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'CRWD', name: 'CrowdStrike Holdings, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Software Infrastructure' },
      { symbol: 'ASTS', name: 'AST SpaceMobile, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Technology', industry: 'Telecom Equipment' },
      { symbol: 'COIN', name: 'Coinbase Global, Inc.', exchange: 'XNAS', country: 'US', currency: 'USD', sector: 'Financial Services', industry: 'Financial Data & Stock Exchanges' },

      // India Securities (XNSE, XBOM)
      { symbol: 'TCS', name: 'Tata Consultancy Services Ltd.', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'INFY', name: 'Infosys Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'RELIANCE', name: 'Reliance Industries Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Energy', industry: 'Oil & Gas Refining & Marketing' },
      { symbol: 'HDFCBANK', name: 'HDFC Bank Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Financial Services', industry: 'Banks — Diversified' },
      { symbol: 'TATAMOTORS', name: 'Tata Motors Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Consumer Cyclical', industry: 'Auto Manufacturers' },
      { symbol: 'WIPRO', name: 'Wipro Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'HCLTECH', name: 'HCL Technologies Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'BHARTIARTL', name: 'Bharti Airtel Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Communication Services', industry: 'Telecom Services' },
      { symbol: 'ICICIBANK', name: 'ICICI Bank Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Financial Services', industry: 'Banks — Diversified' },
      { symbol: 'SBIN', name: 'State Bank of India', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Financial Services', industry: 'Banks — Diversified' },
      { symbol: 'LTIM', name: 'LTIMindtree Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },
      { symbol: 'TECHM', name: 'Tech Mahindra Limited', exchange: 'XNSE', country: 'IN', currency: 'INR', sector: 'Technology', industry: 'Information Technology Services' },

      // Global Securities
      { symbol: 'ASML', name: 'ASML Holding N.V.', exchange: 'XAMS', country: 'NL', currency: 'EUR', sector: 'Technology', industry: 'Semiconductor Equipment' },
      { symbol: 'TSM', name: 'Taiwan Semiconductor Manufacturing Co.', exchange: 'XNYS', country: 'TW', currency: 'USD', sector: 'Technology', industry: 'Semiconductors' },
      { symbol: 'BABA', name: 'Alibaba Group Holding Ltd.', exchange: 'XNYS', country: 'CN', currency: 'USD', sector: 'Consumer Cyclical', industry: 'Internet Retail' },
      { symbol: 'SAP', name: 'SAP SE', exchange: 'XETR', country: 'DE', currency: 'EUR', sector: 'Technology', industry: 'Software Application' },
      { symbol: 'SONY', name: 'Sony Group Corporation', exchange: 'XTKS', country: 'JP', currency: 'JPY', sector: 'Technology', industry: 'Consumer Electronics' },
      { symbol: 'TCEHY', name: 'Tencent Holdings Limited', exchange: 'XHKG', country: 'CN', currency: 'HKD', sector: 'Communication Services', industry: 'Internet Content & Information' }
    ];

    const stmt = db.prepare(`
      INSERT OR IGNORE INTO securities (symbol, name, exchange, country, currency, sector, industry, status, source, as_of)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 'seed', '2026-09-09')
    `);

    for (const sec of DEFAULT_SECURITIES) {
      stmt.run(sec.symbol, sec.name, sec.exchange, sec.country, sec.currency, sec.sector, sec.industry);
    }
    console.log(`[JARVIS DB] Seeded ${DEFAULT_SECURITIES.length} securities into universe.`);
  } catch (err) {
    console.warn('[JARVIS DB WARNING] Could not seed securities:', err.message);
  }
}

function querySecurities({ q = '', region = 'global', sector = '', limit = 50, offset = 0 } = {}) {
  const db = getDb();
  let sql = "SELECT * FROM securities WHERE status = 'active'";
  const params = [];

  if (region === 'us') {
    sql += " AND (country = 'US' OR exchange IN ('XNYS', 'XNAS'))";
  } else if (region === 'in') {
    sql += " AND (country = 'IN' OR exchange IN ('XNSE', 'XBOM'))";
  }

  if (sector && sector.trim() && sector !== 'all') {
    sql += ' AND sector = ?';
    params.push(sector.trim());
  }

  if (q && q.trim()) {
    const term = `%${q.trim().toUpperCase()}%`;
    sql += ' AND (symbol LIKE ? OR UPPER(name) LIKE ?)';
    params.push(term, term);
  }

  sql += ' ORDER BY symbol ASC LIMIT ? OFFSET ?';
  params.push(Math.min(10000, Math.max(1, limit)), Math.max(0, offset));

  return db.prepare(sql).all(...params);
}

function countSecurities({ q = '', region = 'global', sector = '' } = {}) {
  const db = getDb();
  let sql = "SELECT count(*) as count FROM securities WHERE status = 'active'";
  const params = [];

  if (region === 'us') {
    sql += " AND (country = 'US' OR exchange IN ('XNYS', 'XNAS'))";
  } else if (region === 'in') {
    sql += " AND (country = 'IN' OR exchange IN ('XNSE', 'XBOM'))";
  }

  if (sector && sector.trim() && sector !== 'all') {
    sql += ' AND sector = ?';
    params.push(sector.trim());
  }

  if (q && q.trim()) {
    const term = `%${q.trim().toUpperCase()}%`;
    sql += ' AND (symbol LIKE ? OR UPPER(name) LIKE ?)';
    params.push(term, term);
  }

  return db.prepare(sql).get(...params)?.count || 0;
}

function getDistinctSectors() {
  const db = getDb();
  try {
    const rows = db.prepare("SELECT DISTINCT sector FROM securities WHERE status = 'active' AND sector != '' ORDER BY sector ASC").all();
    return rows.map(r => r.sector);
  } catch (err) {
    return [];
  }
}

function getUniverseStats() {
  const db = getDb();
  const byRegion = db.prepare("SELECT country, count(*) as count FROM securities WHERE status = 'active' GROUP BY country").all();
  const byExchange = db.prepare("SELECT exchange, count(*) as count FROM securities WHERE status = 'active' GROUP BY exchange").all();
  const total = db.prepare("SELECT count(*) as count FROM securities WHERE status = 'active'").get()?.count || 0;
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
  let sql = "SELECT * FROM predictions WHERE status = 'resolved'";
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

function recordEvent({ type, entity = null, payload = {}, causationId = null, correlationId = null, codeSha = null, configHash = null, occurredAt = null, knownAt = null } = {}) {
  const db = getDb();
  const eventId = `evt_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  const occ = occurredAt || now;
  const knw = knownAt || now;
  const payloadStr = typeof payload === 'string' ? payload : JSON.stringify(payload);

  const stmt = db.prepare(`
    INSERT INTO events (event_id, type, entity, payload, causation_id, correlation_id, code_sha, config_hash, occurred_at, known_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(eventId, type, entity, payloadStr, causationId, correlationId, codeSha, configHash, occ, knw);
  return { event_id: eventId, type, entity, occurred_at: occ, known_at: knw };
}

function queryEvents({ type = null, entity = null, sinceSeq = 0, limit = 100 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM events WHERE seq > ?';
  const params = [Number(sinceSeq) || 0];

  if (type) {
    sql += ' AND type = ?';
    params.push(type);
  }
  if (entity) {
    sql += ' AND entity = ?';
    params.push(entity.toUpperCase());
  }

  sql += ' ORDER BY seq ASC LIMIT ?';
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));

  const rows = db.prepare(sql).all(...params);
  return rows.map(r => {
    let parsedPayload = {};
    try { parsedPayload = JSON.parse(r.payload); } catch (e) { parsedPayload = { raw: r.payload }; }
    return { ...r, payload: parsedPayload };
  });
}

function recordFact({ factId = null, entity, metric, value, unit = 'USD', asOf = null, knownAt = null, source = 'system', sourceTier = 1, quality = 'live', lineage = [] } = {}) {
  const db = getDb();
  const fid = factId || `fct_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const now = new Date().toISOString();
  const aOf = asOf || now;
  const kAt = knownAt || now;
  const valStr = typeof value === 'object' ? JSON.stringify(value) : String(value);
  const linStr = JSON.stringify(Array.isArray(lineage) ? lineage : []);

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO facts (fact_id, entity, metric, value, unit, as_of, known_at, source, source_tier, quality, lineage)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  stmt.run(fid, entity.toUpperCase(), metric, valStr, unit, aOf, kAt, source, Number(sourceTier) || 1, quality, linStr);
  return { fact_id: fid, entity: entity.toUpperCase(), metric, value, unit, as_of: aOf, known_at: kAt, source, source_tier: Number(sourceTier) || 1, quality };
}

function queryFacts({ entity = null, metric = null, asOfTime = null, limit = 50 } = {}) {
  const db = getDb();
  let sql = 'SELECT * FROM facts WHERE 1=1';
  const params = [];

  if (entity) {
    sql += ' AND entity = ?';
    params.push(entity.toUpperCase());
  }
  if (metric) {
    sql += ' AND metric = ?';
    params.push(metric);
  }
  if (asOfTime) {
    // Bitemporal filter: strictly known_at <= asOfTime
    sql += ' AND known_at <= ?';
    params.push(asOfTime);
  }

  sql += ' ORDER BY as_of DESC, known_at DESC LIMIT ?';
  params.push(Math.min(Math.max(Number(limit) || 50, 1), 200));

  return db.prepare(sql).all(...params);
}

function tripKillSwitch({ scope = 'global', reason = 'Manual emergency trigger', trippedBy = 'analyst' } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const stmt = db.prepare(`
    INSERT INTO kill_switch_events (scope, reason, tripped_by, tripped_at)
    VALUES (?, ?, ?, ?)
  `);
  const res = stmt.run(scope, reason, trippedBy, now);
  recordEvent({
    type: 'kill_switch.tripped',
    entity: scope,
    payload: { scope, reason, tripped_by: trippedBy, tripped_at: now, id: res.lastInsertRowid }
  });
  return { id: res.lastInsertRowid, scope, reason, tripped_by: trippedBy, tripped_at: now, status: 'tripped' };
}

function clearKillSwitch({ scope = 'global', clearedBy = 'operator', reason = 'Operational remediation completed' } = {}) {
  const db = getDb();
  const now = new Date().toISOString();
  const active = db.prepare('SELECT * FROM kill_switch_events WHERE scope = ? AND cleared_at IS NULL ORDER BY id DESC LIMIT 1').get(scope);
  if (!active) {
    return { scope, status: 'already_disarmed', message: 'No active kill switch found for scope.' };
  }
  db.prepare('UPDATE kill_switch_events SET cleared_by = ?, cleared_at = ? WHERE id = ?').run(clearedBy, now, active.id);
  recordEvent({
    type: 'kill_switch.cleared',
    entity: scope,
    payload: { id: active.id, scope, cleared_by: clearedBy, cleared_at: now, reason }
  });
  return { id: active.id, scope, status: 'cleared', cleared_by: clearedBy, cleared_at: now, reason };
}

function getKillSwitchState(scope = 'global') {
  const db = getDb();
  const active = db.prepare("SELECT * FROM kill_switch_events WHERE (scope = ? OR scope = 'global') AND cleared_at IS NULL ORDER BY id DESC LIMIT 1").get(scope);
  if (active) {
    return { armed: true, scope: active.scope, reason: active.reason, tripped_by: active.tripped_by, tripped_at: active.tripped_at };
  }
  return { armed: false, scope, status: 'disarmed' };
}

module.exports = {
  getDb,
  getJarvisDbPath,
  initSchema,
  querySecurities,
  countSecurities,
  getDistinctSectors,
  getUniverseStats,
  getSecurityBySymbol,
  getCompanyRelationships,
  getPredictionsPerformance,
  recordEvent,
  queryEvents,
  recordFact,
  queryFacts,
  tripKillSwitch,
  clearKillSwitch,
  getKillSwitchState
};
