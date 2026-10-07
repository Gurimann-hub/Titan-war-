/**
 * TITAN WAR // ONE-TIME JARVIS DB MIGRATION / IMPORT SCRIPT
 * Copies rows from the root reference jarvis.db into data/jarvis.db.
 */

const { DatabaseSync } = require('node:sqlite');
const path = require('node:path');
const fs = require('node:fs');
const { getDb, getJarvisDbPath } = require('../jarvis-db');

function importJarvisDb() {
  const sourcePath = path.join(__dirname, '..', 'jarvis.db');
  const targetPath = getJarvisDbPath();

  if (!fs.existsSync(sourcePath)) {
    console.log(`[IMPORT] Source file ${sourcePath} not found. Skipping.`);
    return;
  }

  console.log(`[IMPORT] Migrating records from ${sourcePath} -> ${targetPath}...`);
  const srcDb = new DatabaseSync(sourcePath);
  const dstDb = getDb();

  const tables = [
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

  for (const table of tables) {
    try {
      const srcRows = srcDb.prepare(`SELECT * FROM "${table}"`).all();
      if (srcRows.length === 0) continue;

      const dstCount = dstDb.prepare(`SELECT count(*) as c FROM "${table}"`).get().c;
      if (dstCount > 0) {
        console.log(`[IMPORT] Table ${table} already contains ${dstCount} rows. Skipping to avoid duplicate import.`);
        continue;
      }

      const columns = Object.keys(srcRows[0]);
      const placeholders = columns.map(() => '?').join(', ');
      const colNames = columns.map(c => `"${c}"`).join(', ');
      const insertStmt = dstDb.prepare(`INSERT INTO "${table}" (${colNames}) VALUES (${placeholders})`);

      for (const row of srcRows) {
        const values = columns.map(c => row[c]);
        insertStmt.run(...values);
      }
      console.log(`[IMPORT] Successfully imported ${srcRows.length} rows into ${table}.`);
    } catch (err) {
      console.error(`[IMPORT ERROR] Failed importing table ${table}:`, err.message);
    }
  }

  console.log('[IMPORT] Migration complete.');
}

if (require.main === module) {
  importJarvisDb();
}

module.exports = { importJarvisDb };
