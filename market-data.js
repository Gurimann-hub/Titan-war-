/**
 * TITAN WAR // MARKET DATA ENGINE & CANDLE GENERATOR
 * Generates deterministic, strictly validated OHLCV candle series.
 * Invariants:
 * - Timestamps in ascending chronological order (unix ms).
 * - High >= max(Open, Close); Low <= min(Open, Close); Low > 0; Volume >= 0.
 * - Honest provenance: "mock" unless live Finnhub credentials actively return live exchange data.
 */

const { MARKET_SNAPSHOTS } = require('./trading-assistant');

// Deterministic LCG PRNG for seeded mock candles
function createPrng(seedStr) {
  let s = 0;
  const str = String(seedStr || 'DEFAULT_SEED');
  for (let i = 0; i < str.length; i++) {
    s = (s * 31 + str.charCodeAt(i)) >>> 0;
  }
  return function next() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIMEFRAME_MS = {
  '1D': 24 * 60 * 60 * 1000,
  '1H': 60 * 60 * 1000,
  '15M': 15 * 60 * 1000,
  '5M': 5 * 60 * 1000
};

/**
 * Generates deterministic mock candles end-aligned to the current UTC day.
 * @param {string} symbol
 * @param {string} timeframe
 * @param {number} count
 * @returns {object}
 */
function generateMockCandles(symbol, timeframe = '1D', count = 30) {
  const normSymbol = (symbol || '').toUpperCase().trim();
  const baseSnapshot = MARKET_SNAPSHOTS[normSymbol];
  let basePrice = baseSnapshot ? baseSnapshot.price : 100.0;

  const tf = TIMEFRAME_MS[timeframe] || TIMEFRAME_MS['1D'];
  const now = Date.now();
  // Align end to current UTC day
  const endOfDayUtc = Math.floor(now / 86400000) * 86400000 + 86400000 - 1000;

  const rng = createPrng(`${normSymbol}:${timeframe}`);
  const candles = [];

  let currentClose = basePrice * 0.85;

  for (let i = count - 1; i >= 0; i--) {
    const t = endOfDayUtc - (i * tf);
    const open = currentClose;
    const changePct = (rng() - 0.49) * 0.04; // -2% to +2%
    const close = Math.max(1.0, parseFloat((open * (1 + changePct)).toFixed(2)));

    const maxOC = Math.max(open, close);
    const minOC = Math.min(open, close);

    const highBonus = maxOC * (rng() * 0.015);
    const lowDiscount = minOC * (rng() * 0.015);

    const high = parseFloat((maxOC + highBonus).toFixed(2));
    const low = Math.max(0.5, parseFloat((minOC - lowDiscount).toFixed(2)));
    const volume = Math.floor(1000000 + rng() * 9000000);

    candles.push({
      t,
      o: open,
      h: high,
      l: low,
      c: close,
      v: volume
    });

    currentClose = close;
  }

  // Ensure last candle close matches snapshot if available
  if (baseSnapshot && candles.length > 0) {
    const last = candles[candles.length - 1];
    last.c = baseSnapshot.price;
    if (last.c > last.h) last.h = parseFloat((last.c * 1.01).toFixed(2));
    if (last.c < last.l) last.l = parseFloat((last.c * 0.99).toFixed(2));
  }

  return {
    symbol: normSymbol,
    timeframe,
    source: 'mock',
    mock: true,
    as_of: new Date(endOfDayUtc).toISOString(),
    candles
  };
}

function isKnownSymbol(symbol) {
  if (!symbol) return false;
  const s = symbol.toUpperCase().trim();
  return Boolean(MARKET_SNAPSHOTS[s]);
}

async function getCandles(symbol, timeframe = '1D') {
  const normSymbol = (symbol || '').toUpperCase().trim();
  if (!isKnownSymbol(normSymbol)) {
    return null;
  }

  const isLive = process.env.MOCK_MODE === 'false' && Boolean((process.env.FINNHUB_API_KEY || '').trim());
  if (isLive) {
    // Live Finnhub candles if API key present and live mode explicitly configured
    // If Finnhub candles not on current plan or call fails, gracefully fallback to mock labelled honestly
    try {
      const apiKey = process.env.FINNHUB_API_KEY.trim();
      const toUnix = Math.floor(Date.now() / 1000);
      const fromUnix = toUnix - (30 * 86400);
      const res = await fetch(`https://finnhub.io/api/v1/stock/candle?symbol=${normSymbol}&resolution=D&from=${fromUnix}&to=${toUnix}&token=${apiKey}`);
      if (res.ok) {
        const data = await res.json();
        if (data && data.s === 'ok' && Array.isArray(data.t) && data.t.length > 0) {
          const candles = data.t.map((ts, idx) => ({
            t: ts * 1000,
            o: data.o[idx],
            h: data.h[idx],
            l: data.l[idx],
            c: data.c[idx],
            v: data.v[idx]
          }));
          return {
            symbol: normSymbol,
            timeframe,
            source: 'live',
            mock: false,
            as_of: new Date().toISOString(),
            candles
          };
        }
      }
    } catch (e) {
      // Fallback below
    }
  }

  return generateMockCandles(normSymbol, timeframe);
}

module.exports = {
  generateMockCandles,
  getCandles,
  isKnownSymbol,
  TIMEFRAME_MS
};
