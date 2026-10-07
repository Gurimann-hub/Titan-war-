/**
 * TITAN WAR // PHASE 5 TEST SUITE: SRE AUTONOMOUS WATCHDOG SENTINEL
 * Tests:
 * 1. Public health & readiness probe delivery (GET /health).
 * 2. Protected SRE Watchdog status telemetry & Zero-API Policy audit (GET /api/watchdog/status).
 * 3. On-demand deep probe trigger (POST /api/watchdog/probe).
 * 4. Self-healing playbooks execution (WAL checkpoint & memory compaction) and SQLite incident audit.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function postJson(url, data, headers = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(data)
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, json };
}

async function getJson(url, headers = {}) {
  const res = await fetch(url, {
    method: 'GET',
    headers: { ...headers }
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, headers: res.headers, json };
}

async function getAdminCookie() {
  const loginRes = await postJson(`${BASE_URL}/api/auth/login`, {
    identity: 'alex.mercer@titan.corp',
    password: 'HostPass123!'
  });
  const setCookie = loginRes.headers.get('set-cookie');
  return setCookie ? setCookie.split(';')[0] : '';
}

test('Phase 5 Watchdog: Public Health & Liveness Probe', async () => {
  const res = await getJson(`${BASE_URL}/health`);
  assert.strictEqual(res.status, 200, 'GET /health must return 200 OK');
  assert.ok(res.json.status === 'healthy' || res.json.status === 'ok', 'Status must be healthy or ok');
  assert.strictEqual(typeof res.json.uptime, 'number');
  assert.strictEqual(typeof res.json.timestamp, 'string');
});

test('Phase 5 Watchdog: SRE Telemetry & Access Control Protection', async () => {
  // Unauthorized access attempt
  const unauth = await getJson(`${BASE_URL}/api/watchdog/status`);
  assert.strictEqual(unauth.status, 401, 'GET /api/watchdog/status must require authentication');

  // Authenticated SRE access
  const adminCookie = await getAdminCookie();
  const res = await getJson(`${BASE_URL}/api/watchdog/status`, { Cookie: adminCookie });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.json.success, true);
  assert.ok(typeof res.json.healthScore === 'number');
  assert.ok(res.json.healthScore >= 0 && res.json.healthScore <= 100);
  assert.ok(['HEALTHY', 'DEGRADED', 'CRITICAL'].includes(res.json.overallStatus));

  // Verify all 5 vital subsystem checks
  const comps = res.json.components;
  assert.ok(comps.database, 'Must monitor database');
  assert.strictEqual(comps.database.integrity, 'ok');
  assert.ok(comps.memory, 'Must monitor memory');
  assert.ok(comps.sessions, 'Must monitor sessions');
  assert.ok(comps.tradingBot, 'Must monitor trading bot sentinel');
  assert.ok(comps.newsFeed, 'Must monitor news feed freshness');

  // Verify Zero Third-Party API Key guarantee
  assert.strictEqual(res.json.policy, 'ZERO THIRD-PARTY API KEY POLICY');
});

test('Phase 5 Watchdog: On-Demand Deep Health Probe', async () => {
  const adminCookie = await getAdminCookie();

  const probeRes = await postJson(`${BASE_URL}/api/watchdog/probe`, {}, { Cookie: adminCookie });
  assert.strictEqual(probeRes.status, 200);
  assert.strictEqual(probeRes.json.success, true);

  const result = probeRes.json.result;
  assert.ok(result, 'Must return probe result');
  assert.ok(result.components.database.latencyMs >= 0, 'Database latency must be measured');
  assert.ok(result.components.memory.rssMb > 0, 'Process RSS memory must be reported');
});

test('Phase 5 Watchdog: Self-Healing Playbooks Execution & Incident Recording', async () => {
  const adminCookie = await getAdminCookie();

  const healRes = await postJson(`${BASE_URL}/api/watchdog/heal`, {}, { Cookie: adminCookie });
  assert.strictEqual(healRes.status, 200);
  assert.strictEqual(healRes.json.success, true);
  assert.ok(healRes.json.playbooks.database.success, 'Database healing playbook must succeed');

  // Verify incident logged in SQLite incidents table
  const incidentsRes = await getJson(`${BASE_URL}/api/admin/incidents`, { Cookie: adminCookie });
  assert.strictEqual(incidentsRes.status, 200);
  const incidents = incidentsRes.json.incidents;
  const hasWalIncident = incidents.some(inc => inc.signature === 'WAL_CHECKPOINT_TRUNCATE');
  assert.ok(hasWalIncident, 'Watchdog self-healing playbook must record incident in SQLite');

  // Verify incident appended to incidents.log on disk
  const logPath = path.join(__dirname, '..', 'data', 'incidents.log');
  assert.ok(fs.existsSync(logPath), 'data/incidents.log file must exist');
  const logContent = fs.readFileSync(logPath, 'utf8');
  assert.ok(logContent.includes('WAL_CHECKPOINT_TRUNCATE'), 'Log file must record WAL_CHECKPOINT_TRUNCATE');
});
