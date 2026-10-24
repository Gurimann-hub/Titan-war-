const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const crypto = require('node:crypto');

const BASE_URL = 'http://localhost:3000';

test('JARVIS MULTI-STOCK: /api/market/snapshot returns snapshots for all tracked stocks', async () => {
  const allTickers = 'NVDA,MSFT,AAPL,GOOGL,AMZN,META,TSLA,PLTR,TSM,AMD';
  const res = await fetch(`${BASE_URL}/api/market/snapshot?tickers=${allTickers}`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.data), 'json.data must be an array');
  assert.equal(json.data.length, 10, 'Expected all 10 stocks in the list to have snapshots');

  const symbols = json.data.map(s => s.ticker);
  for (const expected of ['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'TSLA', 'PLTR', 'TSM', 'AMD']) {
    assert.ok(symbols.includes(expected), `Expected ${expected} in snapshot list`);
  }

  for (const s of json.data) {
    assert.equal(typeof s.price, 'number', `${s.ticker} must have numeric price`);
    assert.equal(typeof s.changePct, 'number', `${s.ticker} must have numeric changePct`);
    assert.ok(s.price > 0, `${s.ticker} price must be positive`);
  }
});

test('JARVIS WEBSOCKET: /ws/prices transmits multi-asset batch prices for all stocks simultaneously', async () => {
  await new Promise((resolve, reject) => {
    const key = crypto.randomBytes(16).toString('base64');
    const req = http.request({
      host: 'localhost',
      port: 3000,
      path: '/ws/prices',
      headers: {
        'Connection': 'Upgrade',
        'Upgrade': 'websocket',
        'Sec-WebSocket-Version': 13,
        'Sec-WebSocket-Key': key
      }
    });

    req.on('upgrade', (res, socket, head) => {
      let receivedBatch = false;

      socket.on('data', chunk => {
        try {
          // Parse WebSocket frames
          let offset = 2;
          if ((chunk[1] & 0x7f) === 126) offset = 4;
          else if ((chunk[1] & 0x7f) === 127) offset = 10;
          const payloadStr = chunk.slice(offset).toString('utf8');

          const json = JSON.parse(payloadStr);
          if (json.type === 'batch_prices' && Array.isArray(json.payload)) {
            assert.ok(json.payload.length >= 8, 'Expected simultaneous multi-asset batch prices');
            const tickers = json.payload.map(p => p.ticker);
            assert.ok(tickers.includes('NVDA'));
            assert.ok(tickers.includes('MSFT'));
            assert.ok(tickers.includes('AAPL'));
            receivedBatch = true;
            socket.destroy();
            resolve();
          }
        } catch (e) {
          // Keep reading frames until batch_prices arrives
        }
      });

      // Fail-safe timeout
      setTimeout(() => {
        socket.destroy();
        if (receivedBatch) resolve();
        else reject(new Error('Timeout waiting for multi-asset batch_prices WebSocket frame'));
      }, 5000);
    });

    req.on('error', reject);
    req.end();
  });
});

test('JARVIS NEWS INTEGRATION: /api/news provides primary ticker, sentiment and impact score', async () => {
  const res = await fetch(`${BASE_URL}/api/news`);
  assert.equal(res.status, 200);
  const json = await res.json();
  assert.ok(Array.isArray(json.items), 'items must be an Array');
  assert.ok(json.items.length > 0, 'articles should be populated');

  for (const item of json.items.slice(0, 5)) {
    assert.ok(item.ticker, 'Article must have primary ticker');
    assert.ok(item.headline, 'Article must have headline');
    assert.ok(item.sentiment, 'Article must have sentiment');
    assert.ok(['bullish', 'cautionary', 'bearish', 'neutral'].includes(item.sentiment.toLowerCase()), `Valid sentiment: ${item.sentiment}`);
    assert.equal(typeof item.impactScore, 'number', 'Article must have numeric impactScore');
  }
});

test('JARVIS NEWS IMPACT: POST /api/news/impact strictly effects stock price and changePct', async () => {
  // Get initial price of NVDA
  const snap1Res = await fetch(`${BASE_URL}/api/market/snapshot?tickers=NVDA`);
  const snap1Json = await snap1Res.json();
  const initialPrice = snap1Json.data[0].price;
  const initialChange = snap1Json.data[0].changePct;

  // Trigger bullish news impact on NVDA
  const impactRes = await fetch(`${BASE_URL}/api/news/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: 'NVDA',
      headline: 'Next-Gen Blackwell Hyperscaler Commitments Surge 40%',
      sentiment: 'bullish',
      impactScore: 9
    })
  });
  assert.equal(impactRes.status, 200);
  const impactJson = await impactRes.json();
  assert.equal(impactJson.success, true);
  assert.ok(impactJson.impact, 'Must return impact data');
  assert.equal(impactJson.impact.ticker, 'NVDA');
  assert.ok(impactJson.impact.deltaPct > 0, 'Bullish news must cause positive deltaPct');
  assert.ok(impactJson.impact.price > initialPrice, 'Price must increase after bullish catalyst');

  // Verify updated snapshot
  const snap2Res = await fetch(`${BASE_URL}/api/market/snapshot?tickers=NVDA`);
  const snap2Json = await snap2Res.json();
  const updatedPrice = snap2Json.data[0].price;
  assert.equal(updatedPrice, impactJson.impact.price, 'Snapshot price must match news-effected price');
});

test('JARVIS INTEGRATION ISOLATION: News impact does NOT alter portfolio balances or non-price data', async () => {
  // Portfolio before impact
  const port1Res = await fetch(`${BASE_URL}/api/portfolio`);
  const port1 = await port1Res.json();
  const valueBefore = port1.totalValue || port1.data.total_value;

  // Trigger impact on TSLA
  const impactRes = await fetch(`${BASE_URL}/api/news/impact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: 'TSLA',
      headline: 'DMV Permits Approved for Full Unsupervised Autonomous Testing',
      sentiment: 'bullish',
      impactScore: 8
    })
  });
  assert.equal(impactRes.status, 200);

  // Portfolio after impact
  const port2Res = await fetch(`${BASE_URL}/api/portfolio`);
  const port2 = await port2Res.json();
  const valueAfter = port2.totalValue || port2.data.total_value;

  // Total portfolio value is unchanged (only stock price and stock graph are affected!)
  assert.equal(valueAfter, valueBefore, 'Portfolio balance must remain isolated and untouched');
});
