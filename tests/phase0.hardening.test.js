const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const path = require('node:path');
const jarvisDb = require('../jarvis-db');

const BASE_URL = 'http://localhost:3000';

test('M0 Hardening: Immutable triggers reject UPDATE and DELETE on append-only tables (P5)', () => {
  const db = jarvisDb.getDb();

  // 1. Events table immutability
  const event = jarvisDb.recordEvent({
    type: 'test.signal.emitted',
    entity: 'NVDA',
    payload: { score: 0.85, confidence: 0.92 }
  });
  assert.ok(event.event_id, 'Event should be recorded with an event_id');

  assert.throws(() => {
    db.prepare('UPDATE events SET payload = ? WHERE event_id = ?').run('{"tampered":true}', event.event_id);
  }, /events table is append-only: UPDATE prohibited/, 'UPDATE on events table must be aborted by trigger');

  assert.throws(() => {
    db.prepare('DELETE FROM events WHERE event_id = ?').run(event.event_id);
  }, /events table is append-only: DELETE prohibited/, 'DELETE on events table must be aborted by trigger');

  // 2. Prediction Ledger immutability
  const predId = `pred_test_${Date.now()}`;
  db.prepare(`
    INSERT INTO prediction_ledger (prediction_id, agent_source, timestamp, claim, resolution_deadline, confidence)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(predId, 'test_agent', new Date().toISOString(), '{"claim":"bullish"}', new Date().toISOString(), 0.8);

  assert.throws(() => {
    db.prepare('UPDATE prediction_ledger SET confidence = 0.99 WHERE prediction_id = ?').run(predId);
  }, /prediction_ledger table is append-only: UPDATE prohibited/, 'UPDATE on prediction_ledger must be aborted');

  assert.throws(() => {
    db.prepare('DELETE FROM prediction_ledger WHERE prediction_id = ?').run(predId);
  }, /prediction_ledger table is append-only: DELETE prohibited/, 'DELETE on prediction_ledger must be aborted');

  // 3. Kill Switch Events delete protection
  const tripped = jarvisDb.tripKillSwitch({ scope: 'test_scope', reason: 'Audit test trigger', trippedBy: 'audit_test' });
  assert.ok(tripped.id);

  assert.throws(() => {
    db.prepare('DELETE FROM kill_switch_events WHERE id = ?').run(tripped.id);
  }, /kill_switch_events table is append-only: DELETE prohibited/, 'DELETE on kill_switch_events must be aborted');

  // Clean up scope state via permitted clear operation
  jarvisDb.clearKillSwitch({ scope: 'test_scope', clearedBy: 'audit_cleanup', reason: 'Test completed' });
});

test('M0 Hardening: Production guard refuses to boot if MOCK_MODE=true in production', async () => {
  const child = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      ENV: 'prod',
      MOCK_MODE: 'true',
      PORT: '3991'
    }
  });

  let stderr = '';
  child.stderr.on('data', d => { stderr += d.toString(); });

  const exitCode = await new Promise(resolve => {
    child.on('close', code => resolve(code));
  });

  assert.strictEqual(exitCode, 1, 'Process must exit with error code 1 when MOCK_MODE is enabled in prod');
  assert.ok(stderr.includes('MOCK_MODE must be false when ENV=prod'), 'Must log fatal diagnostic error');
});

test('M0 Hardening: GET /api/chat is deprecated and blocked with 405 Method Not Allowed', async () => {
  const res = await fetch(`${BASE_URL}/api/chat?prompt=test`, { method: 'GET' });
  assert.strictEqual(res.status, 405, 'GET /api/chat should return 405 Method Not Allowed');
  assert.strictEqual(res.headers.get('allow'), 'POST');
  assert.strictEqual(res.headers.get('deprecation'), 'true');
  const body = await res.json();
  assert.strictEqual(body.code, 'METHOD_NOT_ALLOWED');
  assert.ok(body.message.includes('GET /api/chat is deprecated'));
});

test('M0 Hardening: POST /api/chat functions correctly with valid JSON payload', async () => {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'What is NVIDIA gross margin trajectory?' })
  });
  assert.strictEqual(res.status, 200);
  const data = await res.json();
  assert.ok(data.reply || data.response || data.message);
  assert.ok(data.disclaimer);
});

test('M0 Hardening: Quote provider serves Fact envelopes with provenance metadata (P2)', async () => {
  const res = await fetch(`${BASE_URL}/api/market/snapshot?tickers=NVDA,AAPL`);
  assert.strictEqual(res.status, 200);
  const json = await res.json();

  assert.ok(Array.isArray(json.data), 'json.data must be an array');
  assert.ok(Array.isArray(json.evidence), 'json.evidence must be present');
  assert.ok(json.meta, 'json.meta must be present');
  assert.ok(json.meta.disclaimer.includes('AI estimate — not financial advice'), 'Disclaimer must contain standard notice');

  const nvda = json.data.find(d => d.ticker === 'NVDA');
  assert.ok(nvda, 'NVDA must be present');
  assert.ok(nvda.fact_id, 'fact_id must be populated');
  assert.strictEqual(nvda.metric, 'px.last');
  assert.ok(typeof nvda.price === 'number');
  assert.ok(nvda.quality, 'quality must be populated');
  assert.ok(nvda.asOf || nvda.as_of);
});

test('M0 Hardening: Kill switch API (§10.6 / §14.2) trips, persists, and clears with audit trail', async () => {
  // 1. Check initial state
  const stateRes = await fetch(`${BASE_URL}/api/v2/kill-switch?scope=global`);
  assert.strictEqual(stateRes.status, 200);
  const stateJson = await stateRes.json();
  assert.ok(stateJson.data);

  // 2. Trip kill switch
  const tripRes = await fetch(`${BASE_URL}/api/v2/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'trip',
      scope: 'agent:sentiment_price',
      reason: 'Automated test trip',
      tripped_by: 'e2e_runner'
    })
  });
  assert.strictEqual(tripRes.status, 200);
  const tripJson = await tripRes.json();
  assert.strictEqual(tripJson.success, true);
  assert.strictEqual(tripJson.data.scope, 'agent:sentiment_price');

  // 3. Clear kill switch
  const clearRes = await fetch(`${BASE_URL}/api/v2/kill-switch`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'clear',
      scope: 'agent:sentiment_price',
      cleared_by: 'operator_admin',
      reason: 'Validation completed'
    })
  });
  assert.strictEqual(clearRes.status, 200);
  const clearJson = await clearRes.json();
  assert.strictEqual(clearJson.success, true);
  assert.strictEqual(clearJson.data.status, 'cleared');

  // 4. Verify audit event was recorded in events table
  const eventsRes = await fetch(`${BASE_URL}/api/v2/events?type=kill_switch.cleared`);
  assert.strictEqual(eventsRes.status, 200);
  const eventsJson = await eventsRes.json();
  assert.ok(eventsJson.data.length > 0, 'Kill switch clear event must be in events table');
});

test('M0 Hardening: Bitemporal facts store allows recording and querying as_of (P3)', async () => {
  const uniqueEntity = `TEST_CO_${Date.now()}`;
  const pastTime = '2026-01-01T00:00:00.000Z';
  const recentTime = '2026-06-01T00:00:00.000Z';

  jarvisDb.recordFact({
    factId: `fct_test_past_${Date.now()}`,
    entity: uniqueEntity,
    metric: 'fundamentals.pe_ratio',
    value: 18.5,
    unit: 'ratio',
    asOf: pastTime,
    knownAt: pastTime,
    source: 'test_sec_filing',
    sourceTier: 1
  });

  jarvisDb.recordFact({
    factId: `fct_test_recent_${Date.now()}`,
    entity: uniqueEntity,
    metric: 'fundamentals.pe_ratio',
    value: 24.2,
    unit: 'ratio',
    asOf: recentTime,
    knownAt: recentTime,
    source: 'test_sec_filing',
    sourceTier: 1
  });

  // Query as of pastTime: only the fact known at pastTime should be returned
  const factsPast = jarvisDb.queryFacts({ entity: uniqueEntity, metric: 'fundamentals.pe_ratio', asOfTime: pastTime });
  assert.strictEqual(factsPast.length, 1, 'Only one fact should be visible as of pastTime');
  assert.strictEqual(factsPast[0].value, '18.5');

  // Query as of recentTime: both facts known at recentTime should be visible
  const factsRecent = jarvisDb.queryFacts({ entity: uniqueEntity, metric: 'fundamentals.pe_ratio', asOfTime: recentTime });
  assert.strictEqual(factsRecent.length, 2, 'Both facts should be visible as of recentTime');
});
