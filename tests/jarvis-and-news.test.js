const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('JARVIS: Direct unauthenticated access to /dashboard succeeds and sets guest cookie', async () => {
  const res = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual' });
  assert.equal(res.status, 200, 'Expected /dashboard to respond with 200');
  const setCookie = res.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('titan_session='), 'Expected titan_session cookie to be issued for guest analyst');
  const html = await res.text();
  assert.ok(html.includes('JARVIS · Trading Intelligence'), 'Expected JARVIS terminal HTML');
  assert.ok(html.includes('/trading-assistant/assets/index-DX773-IE.js'), 'Expected absolute script path');
});

test('JARVIS: Direct unauthenticated access to /trading-assistant succeeds', async () => {
  const res = await fetch(`${BASE_URL}/trading-assistant`, { redirect: 'manual' });
  assert.equal(res.status, 200, 'Expected /trading-assistant to respond with 200');
  const html = await res.text();
  assert.ok(html.includes('<div id="root"></div>'));
});

test('JARVIS Contract: /api/universe returns items array, total, and pages for frontend', async () => {
  const res = await fetch(`${BASE_URL}/api/universe?region=us&page=1&limit=10`);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.ok(Array.isArray(data.items), 'items must be an Array to avoid React TypeError');
  assert.ok(data.items.length > 0, 'securities must not be empty');
  assert.ok(typeof data.total === 'number');
  assert.ok(typeof data.pages === 'number');

  const first = data.items[0];
  assert.ok(first.symbol, 'security must have symbol');
  assert.ok(first.name, 'security must have name');
  assert.ok(first.exchange, 'security must have exchange');
});

test('JARVIS Contract: /api/market/snapshot returns data array matching tp(u) shape', async () => {
  const res = await fetch(`${BASE_URL}/api/market/snapshot?tickers=NVDA,MSFT`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data), 'json.data must be an Array');
  assert.equal(json.data.length, 2);

  const nvda = json.data[0];
  assert.equal(nvda.ticker, 'NVDA');
  assert.equal(typeof nvda.price, 'number');
  assert.equal(typeof nvda.changePct, 'number');
  assert.equal(typeof nvda.marketCap, 'number');
  assert.equal(typeof nvda.peRatio, 'number');
  assert.ok(nvda.asOf, 'asOf must be present');
});

test('JARVIS Contract: /api/screens/profitable returns data array matching np(u) shape', async () => {
  const res = await fetch(`${BASE_URL}/api/screens/profitable?limit=10`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data), 'json.data must be an Array');
  assert.ok(json.data.length > 0);

  const row = json.data[0];
  assert.equal(typeof row.rank, 'number');
  assert.ok(row.ticker);
  assert.ok(row.company);
  assert.equal(typeof row.growthPct, 'number');
  assert.equal(typeof row.confidence, 'number');
  assert.ok(row.asOf);
});

test('JARVIS Contract: /api/portfolio returns positions array and totalValue matching lp(u) shape', async () => {
  const res = await fetch(`${BASE_URL}/api/portfolio`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.positions), 'json.positions must be an Array');
  assert.ok(Array.isArray(json.data.positions), 'json.data.positions must be an Array');
  assert.ok(typeof json.totalValue === 'number' || typeof json.total_value === 'number');
});

test('NEWS ENGINE: /api/news returns normalized arrays for homepage marquee and feeds', async () => {
  const res = await fetch(`${BASE_URL}/api/news`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.equal(json.success, true);
  assert.ok(Array.isArray(json.data), 'json.data must be an Array');
  assert.ok(Array.isArray(json.items), 'json.items must be an Array');
  assert.ok(json.total > 0, 'articles should be present');
});

test('NEWS ENGINE: Automated 6-hour scheduler status and on-demand trigger endpoints', async () => {
  // Test scheduler status endpoint
  const statusRes = await fetch(`${BASE_URL}/api/news/status`);
  assert.equal(statusRes.status, 200);
  const status = await statusRes.json();
  assert.equal(status.success, true);
  assert.equal(status.scheduler_active, true);
  assert.equal(status.interval_hours, 6, 'Scheduler must be configured for 6-hour recurring interval');

  // Test manual on-demand trigger
  const cycleRes = await fetch(`${BASE_URL}/api/news/cycle`, { method: 'POST' });
  assert.equal(cycleRes.status, 200);
  const cycle = await cycleRes.json();
  assert.equal(cycle.interval_hours, 6);
  assert.ok(cycle.status === 'completed' || cycle.status === 'skipped');
});

test('JARVIS WEBSOCKET: RFC 6455 upgrade and handshake across 5 channels', async () => {
  const channels = ['prices', 'rankings', 'news', 'portfolio', 'chat'];

  for (const ch of channels) {
    await new Promise((resolve, reject) => {
      const key = crypto.randomBytes(16).toString('base64');
      const parsed = new URL(BASE_URL);
      const req = http.request({
        host: parsed.hostname || 'localhost',
        port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
        path: `/ws/${ch}`,
        headers: {
          'Connection': 'Upgrade',
          'Upgrade': 'websocket',
          'Sec-WebSocket-Version': 13,
          'Sec-WebSocket-Key': key
        }
      });

      req.on('upgrade', (res, socket, head) => {
        assert.equal(res.statusCode, 101, `Channel /ws/${ch} must upgrade with 101 Switching Protocols`);
        socket.destroy();
        resolve();
      });

      req.on('error', reject);
      req.end();
    });
  }
});
