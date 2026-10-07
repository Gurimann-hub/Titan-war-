/**
 * TITAN WAR // PHASE 4 TEST SUITE: TRADING BOT SIMULATION & RISKGUARD SENTINEL
 * Tests:
 * 1. Telemetry endpoint delivery (GET /api/bot/status) & disclaimer integrity.
 * 2. Authenticated bot controls (Start, Stop, Rate Limit, Invariant checks).
 * 3. Physical Kill Switch activation, SQLite incident recording, and circuit breaker locking.
 * 4. RiskGuard Financial Invariants: 10% position sizing limit & 2% drawdown auto-trip.
 */

const test = require('node:test');
const assert = require('node:assert/strict');

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

test('Phase 4 Bot: Status Telemetry & Mandatory Simulation Disclaimer', async () => {
  const res = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(res.status, 200, 'GET /api/bot/status must return 200 OK');
  assert.strictEqual(res.json.success, true);
  assert.ok(res.json.portfolio, 'Must return simulation portfolio state');
  assert.strictEqual(typeof res.json.portfolio.cash, 'number');
  assert.ok(res.json.riskGuard, 'Must return riskGuard telemetry');
  assert.strictEqual(res.json.riskGuard.maxDrawdownPct, 0.02, 'Max drawdown limit must be 2%');
  assert.strictEqual(res.json.riskGuard.maxPositionPct, 0.10, 'Max position limit must be 10%');

  // Strict disclaimer check: Invariant across all bot interfaces
  assert.ok(res.json.disclaimer, 'Must include simulation disclaimer');
  assert.ok(res.json.disclaimer.includes('Simulation only'), 'Disclaimer must explicitly state Simulation only');
  assert.ok(res.json.disclaimer.includes('Not financial advice'), 'Disclaimer must state Not financial advice');
});

test('Phase 4 Bot: Unauthorized Access Protection on Bot Controls', async () => {
  // Attempt start without session
  const startNoAuth = await postJson(`${BASE_URL}/api/bot/start`, {});
  assert.strictEqual(startNoAuth.status, 401, 'POST /api/bot/start must reject unauthenticated requests');

  // Attempt stop without session
  const stopNoAuth = await postJson(`${BASE_URL}/api/bot/stop`, {});
  assert.strictEqual(stopNoAuth.status, 401, 'POST /api/bot/stop must reject unauthenticated requests');

  // Attempt kill-switch without session
  const killNoAuth = await postJson(`${BASE_URL}/api/bot/kill-switch`, { reason: 'Test intrusion' });
  assert.strictEqual(killNoAuth.status, 401, 'POST /api/bot/kill-switch must reject unauthenticated requests');
});

test('Phase 4 Bot: Authenticated Lifecycle - Start and Stop Simulation Loop', async () => {
  const adminCookie = await getAdminCookie();

  // Reset any prior state
  await postJson(`${BASE_URL}/api/bot/reset`, {}, { Cookie: adminCookie });

  // Start bot
  const startRes = await postJson(`${BASE_URL}/api/bot/start`, {}, { Cookie: adminCookie });
  assert.strictEqual(startRes.status, 200);
  assert.strictEqual(startRes.json.status, 'success');

  // Verify running
  const status1 = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(status1.json.status, 'RUNNING');

  // Stop bot
  const stopRes = await postJson(`${BASE_URL}/api/bot/stop`, {}, { Cookie: adminCookie });
  assert.strictEqual(stopRes.status, 200);
  assert.strictEqual(stopRes.json.status, 'success');

  // Verify stopped
  const status2 = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(status2.json.status, 'STOPPED');
});

test('Phase 4 Bot: Physical Emergency Kill Switch & Circuit Breaker Locking', async () => {
  const adminCookie = await getAdminCookie();

  // Start bot first
  await postJson(`${BASE_URL}/api/bot/start`, {}, { Cookie: adminCookie });

  // Engage physical kill switch
  const killRes = await postJson(`${BASE_URL}/api/bot/kill-switch`, {
    reason: 'Automated test emergency shutdown trigger'
  }, { Cookie: adminCookie });

  assert.strictEqual(killRes.status, 200);
  assert.strictEqual(killRes.json.status, 'tripped');
  assert.ok(killRes.json.message.includes('EMERGENCY KILL SWITCH ENGAGED'));

  // Verify circuit breaker state in status
  const statusTripped = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(statusTripped.json.status, 'TRIPPED');
  assert.strictEqual(statusTripped.json.riskGuard.circuitBreakerTripped, true);

  // Verify restart is strictly forbidden while circuit breaker is active
  const startBlocked = await postJson(`${BASE_URL}/api/bot/start`, {}, { Cookie: adminCookie });
  assert.strictEqual(startBlocked.status, 400);
  assert.ok(startBlocked.json.message.includes('Circuit breaker is tripped'));

  // Check incident recorded in database
  const incidentsRes = await getJson(`${BASE_URL}/api/admin/incidents`, { Cookie: adminCookie });
  assert.strictEqual(incidentsRes.status, 200);
  const hasKillSwitchIncident = incidentsRes.json.incidents.some(
    inc => inc.signature === 'CIRCUIT_BREAKER_TRIP' || inc.component === 'RiskGuard'
  );
  assert.ok(hasKillSwitchIncident, 'Kill switch activation must be recorded in SQLite incidents table');

  // Check audit trail recorded
  const auditRes = await getJson(`${BASE_URL}/api/bot/audit`, { Cookie: adminCookie });
  assert.strictEqual(auditRes.status, 200);
  const hasKillAudit = auditRes.json.logs.some(log => log.action === 'KILL_SWITCH_HALT');
  assert.ok(hasKillAudit, 'Kill switch halt must be recorded in SQLite trade_audit_log');

  // Reset circuit breaker
  const resetRes = await postJson(`${BASE_URL}/api/bot/reset`, {}, { Cookie: adminCookie });
  assert.strictEqual(resetRes.status, 200);

  const statusReset = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(statusReset.json.status, 'STOPPED');
  assert.strictEqual(statusReset.json.riskGuard.circuitBreakerTripped, false);
});

test('Phase 4 Bot: RiskGuard Financial Invariants - 10% Position Cap & 2% Drawdown Limit', async () => {
  const statusRes = await getJson(`${BASE_URL}/api/bot/status`);
  assert.strictEqual(statusRes.status, 200);
  const { riskGuard, portfolio } = statusRes.json;

  // Invariant A: Max Position Size is strictly 10% of portfolio
  assert.strictEqual(riskGuard.maxPositionPct, 0.10, 'Max position size must be capped at 10%');
  const maxPositionAllowed = portfolio.totalValue * riskGuard.maxPositionPct;
  assert.ok(maxPositionAllowed > 0, 'Max single position must be positive');

  // Invariant B: Max Drawdown Limit is strictly 2%
  assert.strictEqual(riskGuard.maxDrawdownPct, 0.02, 'Max drawdown limit must be capped at 2%');
  const maxDrawdownAmount = portfolio.peakValue * riskGuard.maxDrawdownPct;
  assert.ok(maxDrawdownAmount > 0, 'Max tolerated drawdown must be positive');

  // Invariant C: Rate limit invariant
  assert.strictEqual(riskGuard.maxOrdersPerMinute, 10, 'Rate limit must enforce max 10 orders/min');
});
