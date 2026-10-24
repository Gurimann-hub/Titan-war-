const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');

test('TITAN_DATA_DIR: db.js and jarvis-db.js honor TITAN_DATA_DIR override', () => {
  const customTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-honor-test-'));

  const script = `
    const db = require('./db');
    const jarvisDb = require('./jarvis-db');
    const fs = require('fs');
    const path = require('path');
    const targetDir = process.env.TITAN_DATA_DIR;
    const platformExists = fs.existsSync(path.join(targetDir, 'platform.db'));
    const jarvisInstance = jarvisDb.getDb();
    const jarvisExists = fs.existsSync(path.join(targetDir, 'jarvis.db'));
    console.log(JSON.stringify({ platformExists, jarvisExists }));
  `;

  const res = spawnSync(process.execPath, ['-e', script], {
    cwd: path.join(__dirname, '..'),
    env: {
      ...process.env,
      TITAN_DATA_DIR: customTempDir
    },
    encoding: 'utf8'
  });

  assert.strictEqual(res.status, 0, `Script failed with error: ${res.stderr}`);
  const lines = res.stdout.trim().split('\n');
  const jsonLine = lines.find(l => l.includes('"platformExists":'));
  assert.ok(jsonLine, `Could not find JSON line in stdout: ${res.stdout}`);
  const out = JSON.parse(jsonLine);
  assert.strictEqual(out.platformExists, true, 'platform.db must be created in custom TITAN_DATA_DIR');
  assert.strictEqual(out.jarvisExists, true, 'jarvis.db must be created in custom TITAN_DATA_DIR');

  // Clean up
  fs.rmSync(customTempDir, { recursive: true, force: true });
});

test('TITAN_DATA_DIR: Immutability triggers still pass at active TITAN_DATA_DIR', () => {
  const jarvisDb = require('../jarvis-db');
  const db = jarvisDb.getDb();

  // Test append-only trigger rejection on events table
  const event = jarvisDb.recordEvent({
    type: 'test.data_dir.verify',
    entity: 'NVDA',
    payload: { verified: true }
  });

  assert.throws(() => {
    db.prepare('UPDATE events SET payload = ? WHERE event_id = ?').run('{"tampered":true}', event.event_id);
  }, /events table is append-only: UPDATE prohibited/);

  assert.throws(() => {
    db.prepare('DELETE FROM events WHERE event_id = ?').run(event.event_id);
  }, /events table is append-only: DELETE prohibited/);
});
