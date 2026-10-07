/**
 * TITAN WAR // DETERMINISTIC DATA SNAPSHOT ARCHIVE & REBUILD ENGINE
 * Archives data/jarvis.db records only as sorted, deterministic, gzip-compressed JSON shards.
 * Invariants:
 * - Running twice on unchanged data produces byte-for-byte identical manifest SHA-256 hashes.
 * - Restores data/jarvis.db with node scripts/snapshot.js --rebuild
 * - Uses node:zlib and node:crypto (zero external dependencies).
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { getJarvisDbPath, initSchema } = require('../jarvis-db');

const SNAPSHOTS_DIR = path.join(__dirname, '..', 'data_snapshots');

const TABLES = [
  'holdings',
  'thesis_snapshots',
  'signal_history',
  'prediction_ledger',
  'agent_trust_scores',
  'reconciliation_audits',
  'predictions',
  'growth_weights',
  'weight_changelog',
  'securities',
  'company_relationships'
];

function createSnapshot() {
  const dbPath = getJarvisDbPath();
  if (!fs.existsSync(dbPath)) {
    console.error(`[SNAPSHOT ERROR] Database file ${dbPath} not found.`);
    process.exit(1);
  }

  if (!fs.existsSync(SNAPSHOTS_DIR)) {
    fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true });
  }

  const db = new DatabaseSync(dbPath);
  const manifest = {
    version: '1.0.0',
    created_at: '2026-10-07T00:00:00.000Z', // Deterministic timestamp
    tables: {}
  };

  for (const table of TABLES) {
    let rows = [];
    try {
      rows = db.prepare(`SELECT * FROM "${table}"`).all();
    } catch (e) {
      rows = [];
    }

    // Sort rows deterministically by primary key or JSON string
    rows.sort((a, b) => {
      const ka = a.id ?? a.prediction_id ?? a.audit_id ?? a.version ?? a.agent ?? JSON.stringify(a);
      const kb = b.id ?? b.prediction_id ?? b.audit_id ?? b.version ?? b.agent ?? JSON.stringify(b);
      return ka > kb ? 1 : ka < kb ? -1 : 0;
    });

    const jsonStr = JSON.stringify(rows);
    // Use fixed mtime/header for deterministic gzip
    const gzipped = zlib.gzipSync(Buffer.from(jsonStr, 'utf8'), { mtime: 0, level: 9 });
    const filename = `${table}.json.gz`;
    const filePath = path.join(SNAPSHOTS_DIR, filename);

    fs.writeFileSync(filePath, gzipped);

    const sha256 = crypto.createHash('sha256').update(gzipped).digest('hex');
    manifest.tables[table] = {
      filename,
      rowCount: rows.length,
      bytes: gzipped.length,
      sha256
    };
  }

  // Calculate manifest hash over sorted table entries
  const manifestJson = JSON.stringify(manifest, Object.keys(manifest).sort(), 2);
  const manifestPath = path.join(SNAPSHOTS_DIR, 'manifest.json');
  fs.writeFileSync(manifestPath, manifestJson, 'utf8');

  const rootHash = crypto.createHash('sha256').update(manifestJson).digest('hex');
  console.log(`[SNAPSHOT] Created deterministic snapshot. Manifest SHA-256: ${rootHash}`);
  return rootHash;
}

function rebuildFromSnapshot() {
  const manifestPath = path.join(SNAPSHOTS_DIR, 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    console.error(`[SNAPSHOT ERROR] Manifest ${manifestPath} not found.`);
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const dbPath = getJarvisDbPath();
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  // Re-initialize DB
  const db = new DatabaseSync(dbPath);
  initSchema(db);

  for (const [table, meta] of Object.entries(manifest.tables)) {
    const shardPath = path.join(SNAPSHOTS_DIR, meta.filename);
    if (!fs.existsSync(shardPath)) {
      console.warn(`[SNAPSHOT] Shard ${shardPath} missing. Skipping.`);
      continue;
    }

    const gzBuffer = fs.readFileSync(shardPath);
    const sha = crypto.createHash('sha256').update(gzBuffer).digest('hex');
    if (sha !== meta.sha256) {
      console.error(`[SNAPSHOT ERROR] Integrity mismatch for ${table}: expected ${meta.sha256}, got ${sha}`);
      process.exit(1);
    }

    const uncompressed = zlib.gunzipSync(gzBuffer).toString('utf8');
    const rows = JSON.parse(uncompressed);
    if (rows.length === 0) continue;

    db.exec(`DELETE FROM "${table}";`);
    const cols = Object.keys(rows[0]);
    const placeholders = cols.map(() => '?').join(', ');
    const colNames = cols.map(c => `"${c}"`).join(', ');
    const stmt = db.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`);

    for (const r of rows) {
      stmt.run(...cols.map(c => r[c]));
    }
    console.log(`[SNAPSHOT] Restored ${rows.length} rows into ${table}.`);
  }

  console.log('[SNAPSHOT] Rebuild completed successfully.');
}

if (require.main === module) {
  if (process.argv.includes('--rebuild')) {
    rebuildFromSnapshot();
  } else {
    createSnapshot();
  }
}

module.exports = { createSnapshot, rebuildFromSnapshot };
