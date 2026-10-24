/**
 * TITAN WAR // 5-AGENT TRADING BOT SIMULATION & RISKGUARD SENTINEL
 * Architecture:
 * - 5-Agent Collaborative AI Trading Framework:
 *   1. Agent 1 (Fundamental Analyst): Earnings reports, forecasts, analyst revisions & business health.
 *   2. Agent 2 (News & Sentiment Analyst): General company news, X (Twitter) pulse, and Bull vs Bear dialectics.
 *   3. Agent 3 (Technical Analyst): 200-Day SMA Trend Filter (slope > 0) + Rate of Change (ROC) Reset Consolidation (3-Month Horizon).
 *   4. Agent 4 (Catalyst & Event Tracker): Upcoming corporate catalysts (Dev Days, product launches, keynotes).
 *   5. Agent 5 (RiskGuard & Execution Arbiter): Order sizing, paper-trading ledger & physical kill switch.
 * - Autonomous RiskGuard & Physical Kill Switch (2% Drawdown Circuit Breaker, 10% Position Cap)
 * - Deterministic Paper-Trading Broker (100% Zero-Risk Simulation, $100,000 Starting Capital)
 * - Full SQLite Audit Trail (CWE-89 immune, node:sqlite prepared statements)
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { MARKET_SNAPSHOTS } = require('./trading-assistant');
const { generateMockCandles } = require('./market-data');

const DISCLAIMER = 'Simulation only. Zero real money transactions. Not financial advice.';

// RiskGuard Core Limits
const RISK_LIMITS = {
  STARTING_CASH: 100000.00,
  MAX_DRAWDOWN_PCT: 0.02,        // 2% Drawdown Circuit Breaker
  MAX_POSITION_PCT: 0.10,        // 10% Max Single Position Size of Total Portfolio
  MAX_ORDERS_PER_MINUTE: 10,     // Order Rate Limiting (High-frequency protection)
  ESTIMATED_FEE_PCT: 0.0005      // 0.05% simulated slippage / broker fee
};

const DATA_DIR = process.env.TITAN_DATA_DIR ? path.resolve(process.env.TITAN_DATA_DIR) : path.join(__dirname, 'data');
const INCIDENTS_LOG_PATH = path.join(DATA_DIR, 'incidents.log');

function appendIncidentsLog(entry) {
  try {
    const line = `[${new Date().toISOString()}] [${entry.severity}] [${entry.component}] [${entry.signature}] ${entry.description} -> ACTION: ${entry.actionTaken}\n`;
    fs.appendFileSync(INCIDENTS_LOG_PATH, line, 'utf8');
  } catch (err) {
    console.error('[RISKGUARD] Could not append to incidents.log:', err.message);
  }
}

// Seedable PRNG for deterministic tests (TRIAD_SEED; unset = time-seeded)
function createPrng(seedVal) {
  let s = 0;
  if (seedVal !== undefined && seedVal !== null && seedVal !== '') {
    const str = String(seedVal);
    for (let i = 0; i < str.length; i++) {
      s = (s * 31 + str.charCodeAt(i)) >>> 0;
    }
  } else {
    s = (Date.now() ^ (Math.random() * 0x100000000)) >>> 0;
  }
  return function nextRandom() {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const triadRng = createPrng(process.env.TRIAD_SEED);

// ---------------------------------------------------------------------------
// TRACKER AGENT: Market Universe & 200-Bar Historical Candlestick Buffer
// ---------------------------------------------------------------------------
class TrackerAgent {
  constructor(tickers) {
    // Focused 5-name universe default as advised by friend
    this.tickers = tickers || ['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN'];
    this.priceHistory = new Map();
    this.currentPrices = new Map();

    // Initialize each ticker with 250 historical bars (to compute 200-day SMA and slope)
    this.tickers.forEach(sym => {
      let initialCloses = [];
      try {
        const mockData = generateMockCandles(sym, '1D', 250);
        if (mockData && Array.isArray(mockData.candles) && mockData.candles.length >= 200) {
          initialCloses = mockData.candles.map(c => c.c);
        }
      } catch (e) {
        // Fallback synthetic generator
      }

      if (initialCloses.length < 250) {
        const base = MARKET_SNAPSHOTS[sym]?.price || 150.0;
        let p = base * 0.85;
        initialCloses = [];
        for (let i = 0; i < 250; i++) {
          const drift = 0.0006;
          const shock = (triadRng() - 0.49) * 0.015;
          p = Math.max(1.0, parseFloat((p * (1 + drift + shock)).toFixed(2)));
          initialCloses.push(p);
        }
        initialCloses[initialCloses.length - 1] = base;
      }

      const latestPrice = initialCloses[initialCloses.length - 1];
      this.currentPrices.set(sym, latestPrice);
      this.priceHistory.set(sym, initialCloses);
    });
  }

  tickMarket() {
    this.tickers.forEach(sym => {
      const cur = this.currentPrices.get(sym);
      const deltaPct = (triadRng() - 0.49) * 0.016;
      const nextPrice = Math.max(1.0, parseFloat((cur * (1 + deltaPct)).toFixed(2)));
      this.currentPrices.set(sym, nextPrice);

      const hist = this.priceHistory.get(sym);
      hist.push(nextPrice);
      if (hist.length > 300) hist.shift(); // retain up to 300 historical closes
    });
  }

  getPrice(ticker) {
    return this.currentPrices.get(ticker) || MARKET_SNAPSHOTS[ticker]?.price || 100.0;
  }

  getIndicators(ticker) {
    const hist = this.priceHistory.get(ticker) || [this.getPrice(ticker)];
    const cur = this.getPrice(ticker);
    const len = hist.length;

    // SMA 5
    const slice5 = hist.slice(-Math.min(5, len));
    const sma5 = slice5.reduce((a, b) => a + b, 0) / slice5.length;

    // SMA 20
    const slice20 = hist.slice(-Math.min(20, len));
    const sma20 = slice20.reduce((a, b) => a + b, 0) / slice20.length;

    // 200-DAY MOVING AVERAGE (Core Trend Filter)
    const sma200Period = Math.min(200, len);
    const slice200 = hist.slice(-sma200Period);
    const sma200 = slice200.reduce((a, b) => a + b, 0) / slice200.length;

    // 200-DAY SMA SLOPE: Check if 200 SMA is pointing upward
    let sma200Slope = 0.0;
    if (len >= 210) {
      const slice200Prev = hist.slice(-210, -10);
      const sma200Prev = slice200Prev.reduce((a, b) => a + b, 0) / slice200Prev.length;
      sma200Slope = parseFloat(((sma200 - sma200Prev) / 10).toFixed(4));
    } else if (len >= 30) {
      const prevHalf = hist.slice(0, Math.floor(len / 2));
      const smaHalf = prevHalf.reduce((a, b) => a + b, 0) / prevHalf.length;
      sma200Slope = parseFloat(((sma200 - smaHalf) / (len / 2)).toFixed(4));
    }

    const isAbove200Sma = cur > sma200;
    const is200SmaUpward = sma200Slope > 0;

    // RATE OF CHANGE (ROC) OVER 20 BARS & RESET CONSOLIDATION LOGIC
    const base20 = hist[Math.max(0, len - 21)] || cur;
    const roc20 = base20 > 0 ? (cur - base20) / base20 : 0;

    // Rolling peak ROC over recent 30-40 bars
    let peakRoc = roc20;
    for (let i = Math.max(20, len - 35); i < len; i++) {
      const b = hist[i - 20] || hist[0];
      const r = b > 0 ? (hist[i] - b) / b : 0;
      if (r > peakRoc) peakRoc = r;
    }

    // Friend's ROC Reset Condition:
    // ROC was previously higher (peakRoc >= +2.5%) and has now reset close to 0 (-1.5% <= roc20 <= +3.0%)
    // Signaling consolidation in an ongoing uptrend above the rising 200-SMA.
    const isRocReset = peakRoc >= 0.025 && roc20 >= -0.015 && roc20 <= 0.035;

    // Short-term Momentum (ROC 5)
    const base5 = slice5[0] || cur;
    const momentum = (cur - base5) / (base5 || 1);

    // RSI 14
    let rsi = 50.0;
    if (len >= 15) {
      let gains = 0;
      let losses = 0;
      for (let i = len - 14; i < len; i++) {
        const diff = hist[i] - hist[i - 1];
        if (diff > 0) gains += diff;
        else losses += Math.abs(diff);
      }
      const avgGain = gains / 14;
      const avgLoss = losses / 14;
      if (avgLoss === 0) rsi = 100;
      else {
        const rs = avgGain / avgLoss;
        rsi = 100 - (100 / (1 + rs));
      }
    }

    return {
      currentPrice: cur,
      sma5: parseFloat(sma5.toFixed(2)),
      sma20: parseFloat(sma20.toFixed(2)),
      sma200: parseFloat(sma200.toFixed(2)),
      sma200Slope: parseFloat(sma200Slope.toFixed(4)),
      isAbove200Sma,
      is200SmaUpward,
      roc20: parseFloat((roc20 * 100).toFixed(2)),
      peakRoc: parseFloat((peakRoc * 100).toFixed(2)),
      isRocReset,
      rsi: parseFloat(rsi.toFixed(1)),
      momentum: parseFloat(momentum.toFixed(4)),
      timeHorizon: '3-Month Trend'
    };
  }
}

// ---------------------------------------------------------------------------
// 1. AGENT 1: FUNDAMENTAL ANALYST AGENT (Earnings, Analysts & Guidance)
// ---------------------------------------------------------------------------
class FundamentalAgent {
  constructor() {
    this.name = 'Agent 1: Fundamental Analyst';
  }

  analyze(ticker) {
    const defaultFundamentals = {
      NVDA: { revGrowth: 122.4, fcfMargin: 47.8, forwardPe: 36.5, capexGrowth: 68.4 },
      MSFT: { revGrowth: 15.2, fcfMargin: 31.4, forwardPe: 29.8, capexGrowth: 52.1 },
      AAPL: { revGrowth: 4.9, fcfMargin: 28.6, forwardPe: 28.4, capexGrowth: 12.3 },
      GOOGL: { revGrowth: 14.1, fcfMargin: 29.2, forwardPe: 20.4, capexGrowth: 44.7 },
      AMZN: { revGrowth: 12.8, fcfMargin: 14.5, forwardPe: 32.1, capexGrowth: 38.5 },
      META: { revGrowth: 22.1, fcfMargin: 36.8, forwardPe: 22.0, capexGrowth: 58.2 },
      TSLA: { revGrowth: 8.5, fcfMargin: 12.0, forwardPe: 62.1, capexGrowth: 28.0 }
    };

    const metrics = defaultFundamentals[ticker] || { revGrowth: 15.0, fcfMargin: 25.0, forwardPe: 30.0, capexGrowth: 20.0 };
    let score = 0.70;
    if (metrics.revGrowth > 20) score += 0.15;
    if (metrics.fcfMargin > 25) score += 0.10;
    if (metrics.forwardPe > 60) score -= 0.15;

    score = Math.max(0.20, Math.min(0.95, score));
    const status = score >= 0.70 ? 'BULLISH' : score >= 0.50 ? 'NEUTRAL' : 'BEARISH';

    return {
      agent: this.name,
      ticker,
      score: parseFloat(score.toFixed(2)),
      status,
      metrics: {
        revenueGrowthYoY: `+${metrics.revGrowth}%`,
        fcfMarginPct: `${metrics.fcfMargin}%`,
        forwardMultiple: `${metrics.forwardPe}x`
      },
      analystForecastConsensus: score >= 0.70 ? 'Upward Revisions / Institutional Accumulation' : 'Neutral / Rangebound Target',
      headline: `Solid earnings conversion with ${metrics.fcfMargin}% FCF margin and +${metrics.revGrowth}% revenue growth.`
    };
  }
}

// ---------------------------------------------------------------------------
// 2. AGENT 2: NEWS & SENTIMENT AGENT (X / Twitter, Bull vs Bear Pulse)
// ---------------------------------------------------------------------------
class SentimentAgent {
  constructor() {
    this.name = 'Agent 2: News & Sentiment (X/Social)';
  }

  analyze(ticker) {
    const sentimentDatabase = {
      NVDA: { score: 0.85, bias: 'BULLISH', xPulse: 'High token generation volume and next-gen data center demand trending on X.' },
      MSFT: { score: 0.79, bias: 'BULLISH', xPulse: 'Enterprise Azure Copilot deployment cases dominating tech feeds on X.' },
      AAPL: { score: 0.74, bias: 'BULLISH', xPulse: 'Apple Intelligence beta engagement and ecosystem hardware cycles discussed on X.' },
      GOOGL: { score: 0.76, bias: 'BULLISH', xPulse: 'Custom TPU silicon benchmarks and Gemini enterprise integration trending positively.' },
      AMZN: { score: 0.78, bias: 'BULLISH', xPulse: 'AWS custom AI accelerator efficiency and retail margin expansion noted on X.' },
      META: { score: 0.81, bias: 'BULLISH', xPulse: 'Open-source Llama adoption and ad monetisation efficiency praise on X.' },
      TSLA: { score: 0.58, bias: 'NEUTRAL', xPulse: 'Robotaxi regulatory timelines counterbalanced by EV competitive margin debates on X.' }
    };

    const data = sentimentDatabase[ticker] || { score: 0.70, bias: 'NEUTRAL', xPulse: 'Steady institutional commentary on X.' };

    return {
      agent: this.name,
      ticker,
      score: data.score,
      sentiment: data.bias,
      xPulse: data.xPulse,
      bullCase: 'Durable infrastructure moat and expanding enterprise software token consumption.',
      bearCase: 'Antitrust litigation overhead and customer concentration scrutiny.',
      rationale: `Social discourse on X and institutional press indicate a net ${data.bias.toLowerCase()} stance (Conviction: ${Math.round(data.score * 100)}%).`
    };
  }
}

// ---------------------------------------------------------------------------
// 3. AGENT 3: TECHNICAL ANALYST AGENT (200 SMA + ROC Reset Strategy)
// ---------------------------------------------------------------------------
class TechnicalAgent {
  constructor(tracker) {
    this.name = 'Agent 3: Technical Analyst';
    this.tracker = tracker;
  }

  analyze(ticker) {
    const ind = this.tracker.getIndicators(ticker);
    let signal = 'HOLD';
    let confidence = 0.50;
    let rationale = '';

    // FRIEND'S EXACT STRATEGY CRITERIA:
    // 1. Price > 200-day moving average
    // 2. 200-day moving average is pointed upward (slope > 0)
    // 3. Rate of change (ROC) has reset close to 0 after being higher (Consolidation for 3-month trend)
    if (ind.isAbove200Sma && ind.is200SmaUpward && ind.isRocReset) {
      signal = 'BUY';
      confidence = Math.min(0.95, 0.74 + (ind.sma200Slope > 0 ? 0.08 : 0) + (ind.isAbove200Sma ? 0.08 : 0));
      rationale = `Bullish 3-Month Trend Setup: Price ($${ind.currentPrice}) > Rising 200-SMA ($${ind.sma200}, slope: +${ind.sma200Slope}/bar). ROC reset to ${ind.roc20}% (post-peak ${ind.peakRoc}%). Consolidated and ready for next leg higher.`;
    } else if (ind.isAbove200Sma && ind.is200SmaUpward && ind.roc20 > 3.5) {
      signal = 'HOLD';
      confidence = 0.65;
      rationale = `Macro uptrend intact (Price > Rising 200-SMA), but ROC (+${ind.roc20}%) is extended. Awaiting ROC reset to near 0 before adding.`;
    } else if (!ind.isAbove200Sma) {
      signal = 'SELL';
      confidence = Math.min(0.90, 0.70 + Math.abs(ind.momentum) * 10);
      rationale = `Trend Breakdown: Price ($${ind.currentPrice}) broke below 200-SMA ($${ind.sma200}). RiskGuard invalidation trigger.`;
    } else if (ind.sma200Slope < -0.05) {
      signal = 'SELL';
      confidence = 0.85;
      rationale = `Macro Degradation: 200-day SMA slope turned negative (${ind.sma200Slope}). Trend filter failed.`;
    } else if (ind.roc20 < -6.0) {
      signal = 'SELL';
      confidence = 0.82;
      rationale = `Momentum Failure: ROC (${ind.roc20}%) broke below consolidation floor (-6.0%).`;
    } else {
      signal = 'HOLD';
      confidence = 0.52;
      rationale = `Consolidating near 200-SMA ($${ind.sma200}). Trend slope: ${ind.sma200Slope >= 0 ? '+' : ''}${ind.sma200Slope}. Awaiting ROC reset confirmation.`;
    }

    return {
      agent: this.name,
      ticker,
      signal,
      confidence: parseFloat(confidence.toFixed(2)),
      rationale,
      price: ind.currentPrice,
      indicators: ind
    };
  }
}

// ---------------------------------------------------------------------------
// 4. AGENT 4: CATALYST & EVENT TRACKER AGENT (Dev Days, Product Keynotes)
// ---------------------------------------------------------------------------
class CatalystAgent {
  constructor() {
    this.name = 'Agent 4: Catalyst & Event Tracker';
  }

  analyze(ticker, technicalInd) {
    const upcomingCatalysts = {
      NVDA: { event: 'NVIDIA GTC & Blackwell Hyperscaler Delivery Milestone', timeframe: 'Next 3-6 weeks', impact: 9 },
      MSFT: { event: 'Microsoft Ignite Enterprise Copilot Expansion', timeframe: 'Next 4 weeks', impact: 8 },
      AAPL: { event: 'Apple Developer Day (WWDC) & Hardware Special Event', timeframe: 'Next 2-4 weeks', impact: 8 },
      GOOGL: { event: 'Google I/O & Gemini 2.0 Integration Day', timeframe: 'Next 5 weeks', impact: 8 },
      AMZN: { event: 'AWS re:Invent Custom Silicon Keynote', timeframe: 'Next 6 weeks', impact: 8 },
      META: { event: 'Meta Connect & Next-Gen Llama Ecosystem Keynote', timeframe: 'Next 4 weeks', impact: 8 },
      TSLA: { event: 'Tesla Autonomous Robotaxi Commercial Milestone Event', timeframe: 'Next 8 weeks', impact: 9 }
    };

    const cat = upcomingCatalysts[ticker] || { event: 'Quarterly Earnings & Strategic Analyst Day', timeframe: 'Upcoming', impact: 7 };
    const priceActingGreat = technicalInd.isAbove200Sma && technicalInd.is200SmaUpward;

    return {
      agent: this.name,
      ticker,
      upcomingEvent: cat.event,
      timeframe: cat.timeframe,
      impactScore: cat.impact,
      actingGreatLeadingIn: priceActingGreat,
      rationale: `${cat.event} scheduled (${cat.timeframe}). Stock is ${priceActingGreat ? 'acting great leading in (holding above rising 200-SMA)' : 'testing key technical support'}.`
    };
  }
}

// ---------------------------------------------------------------------------
// 5. PREDICTOR AGENT: 5-Agent Multi-Model Synthesis Engine
// ---------------------------------------------------------------------------
class PredictorAgent {
  constructor(tracker) {
    this.tracker = tracker;
    this.fundamentalAgent = new FundamentalAgent();
    this.sentimentAgent = new SentimentAgent();
    this.technicalAgent = new TechnicalAgent(this.tracker);
    this.catalystAgent = new CatalystAgent();
  }

  analyze(ticker) {
    const tech = this.technicalAgent.analyze(ticker);
    const fund = this.fundamentalAgent.analyze(ticker);
    const sent = this.sentimentAgent.analyze(ticker);
    const cata = this.catalystAgent.analyze(ticker, tech.indicators);

    let signal = tech.signal;
    let confidence = tech.confidence;
    let rationale = tech.rationale;

    // Multi-Agent Confluence Validation:
    // When Technical Agent flags BUY, verify Fundamental & Sentiment backing
    if (tech.signal === 'BUY') {
      if (fund.status === 'BEARISH') {
        signal = 'HOLD';
        confidence = 0.50;
        rationale = `Technical ROC reset active, but Agent 1 (Fundamental) flagged earnings risk. Gated.`;
      } else {
        confidence = Math.min(0.95, (tech.confidence * 0.50) + (fund.score * 0.30) + (sent.score * 0.20));
        rationale = `${tech.rationale} Supported by ${fund.analystForecastConsensus} and ${sent.sentiment} sentiment on X ahead of ${cata.upcomingEvent}.`;
      }
    }

    return {
      ticker,
      signal,
      confidence: parseFloat(confidence.toFixed(2)),
      rationale,
      price: tech.price,
      indicators: tech.indicators,
      fiveAgentReport: {
        agent1_fundamental: fund,
        agent2_sentiment_x: sent,
        agent3_technical_roc: tech,
        agent4_catalysts: cata,
        agent5_execution_status: 'Ready for RiskGuard pre-trade validation'
      }
    };
  }

  scanAll() {
    return this.tracker.tickers.map(sym => this.analyze(sym));
  }
}

// ---------------------------------------------------------------------------
// 6. COMMANDER AGENT: Order Sizing & Execution Decision (Agent 5 Executive)
// ---------------------------------------------------------------------------
class CommanderAgent {
  constructor(predictor, broker, riskGuard) {
    this.predictor = predictor;
    this.broker = broker;
    this.riskGuard = riskGuard;
  }

  proposeOrder() {
    const signals = this.predictor.scanAll();

    // Prioritize highest confidence actionable signal
    const actionable = signals
      .filter(s => s.signal === 'BUY' || s.signal === 'SELL')
      .sort((a, b) => b.confidence - a.confidence);

    if (actionable.length === 0) return null;

    const top = actionable[0];
    const portfolio = this.broker.getPortfolioState();
    const curPrice = top.price;

    if (top.signal === 'BUY') {
      // Allocate up to 5% of portfolio per new order (conservative pacing)
      const targetAllocation = portfolio.totalValue * 0.05;
      const quantity = Math.floor(targetAllocation / curPrice);
      if (quantity <= 0) return null;

      return {
        id: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        ticker: top.ticker,
        action: 'BUY',
        quantity,
        price: curPrice,
        confidence: top.confidence,
        rationale: top.rationale,
        timestamp: Date.now()
      };
    } else if (top.signal === 'SELL') {
      const pos = portfolio.positions[top.ticker];
      if (!pos || pos.quantity <= 0) return null;

      // Liquidate half or all of position on sell signal
      const quantity = Math.max(1, Math.floor(pos.quantity * 0.5));
      return {
        id: `ord_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
        ticker: top.ticker,
        action: 'SELL',
        quantity,
        price: curPrice,
        confidence: top.confidence,
        rationale: top.rationale,
        timestamp: Date.now()
      };
    }

    return null;
  }
}

// ---------------------------------------------------------------------------
// 7. RISKGUARD AGENT: Financial Safety Invariants & Kill Switch
// ---------------------------------------------------------------------------
class RiskGuardAgent {
  constructor(broker, dbClient = null) {
    this.broker = broker;
    this.dbClient = dbClient || db;
    this.circuitBreakerTripped = false;
    this.tripReason = null;
    this.orderTimestamps = [];
  }

  validateOrder(order) {
    const now = Date.now();

    // Invariant 1: Circuit breaker check
    if (this.circuitBreakerTripped) {
      return {
        allowed: false,
        reason: 'CIRCUIT_BREAKER_TRIPPED',
        details: `Trading locked due to: ${this.tripReason}`
      };
    }

    // Invariant 2: Order rate limit (10 orders per 60 seconds)
    this.orderTimestamps = this.orderTimestamps.filter(t => now - t < 60000);
    if (this.orderTimestamps.length >= RISK_LIMITS.MAX_ORDERS_PER_MINUTE) {
      return {
        allowed: false,
        reason: 'RATE_LIMIT_EXCEEDED',
        details: `Max ${RISK_LIMITS.MAX_ORDERS_PER_MINUTE} orders per minute reached.`
      };
    }

    const portfolio = this.broker.getPortfolioState();

    // Invariant 3: Portfolio Drawdown Breach Check (2% hard limit)
    if (portfolio.drawdownPct >= RISK_LIMITS.MAX_DRAWDOWN_PCT) {
      this.tripCircuitBreaker(
        `Portfolio drawdown reached ${(portfolio.drawdownPct * 100).toFixed(2)}%, breaching the ${RISK_LIMITS.MAX_DRAWDOWN_PCT * 100}% maximum tolerance.`
      );
      return {
        allowed: false,
        reason: 'DRAWDOWN_LIMIT_BREACHED',
        details: `Circuit breaker tripped. Max drawdown exceeded.`
      };
    }

    // Invariant 4: Max Single Position Limit (10% of portfolio)
    if (order.action === 'BUY') {
      const currentPosValue = portfolio.positions[order.ticker]?.marketValue || 0;
      const orderValue = order.quantity * order.price;
      const futurePosValue = currentPosValue + orderValue;
      const maxAllowedValue = portfolio.totalValue * RISK_LIMITS.MAX_POSITION_PCT;

      if (futurePosValue > maxAllowedValue) {
        return {
          allowed: false,
          reason: 'POSITION_LIMIT_EXCEEDED',
          details: `Position in ${order.ticker} would reach $${futurePosValue.toFixed(2)} ($${maxAllowedValue.toFixed(2)} max allowed / 10%).`
        };
      }

      // Check available cash
      const totalCost = orderValue * (1 + RISK_LIMITS.ESTIMATED_FEE_PCT);
      if (portfolio.cash < totalCost) {
        return {
          allowed: false,
          reason: 'INSUFFICIENT_SIMULATED_CASH',
          details: `Order requires $${totalCost.toFixed(2)}, available cash: $${portfolio.cash.toFixed(2)}.`
        };
      }
    }

    // Invariant 5: Sell Order Quantity Check
    if (order.action === 'SELL') {
      const currentQty = portfolio.positions[order.ticker]?.quantity || 0;
      if (currentQty < order.quantity) {
        return {
          allowed: false,
          reason: 'INSUFFICIENT_SHARES_HELD',
          details: `Cannot sell ${order.quantity} shares of ${order.ticker}; currently held: ${currentQty}.`
        };
      }
    }

    // All safety checks passed
    this.orderTimestamps.push(now);
    return { allowed: true, reason: 'APPROVED' };
  }

  tripCircuitBreaker(reason) {
    this.circuitBreakerTripped = true;
    this.tripReason = reason;

    // Record incident into platform SQLite db and log file
    const incidentData = {
      severity: 'CRITICAL',
      component: 'RiskGuard',
      signature: 'CIRCUIT_BREAKER_TRIP',
      description: reason,
      actionTaken: 'Autonomous Kill Switch engaged. Trading halted and positions frozen.',
      resolved: 0
    };

    try {
      if (this.dbClient && typeof this.dbClient.recordIncident === 'function') {
        this.dbClient.recordIncident(incidentData);
      }
      appendIncidentsLog(incidentData);
    } catch (err) {
      console.error('[RISKGUARD] Failed to log incident:', err.message);
    }

    console.warn(`[RISKGUARD CRITICAL] Circuit Breaker Tripped! Reason: ${reason}`);
  }

  reset(userId = 'admin') {
    this.circuitBreakerTripped = false;
    const oldReason = this.tripReason;
    this.tripReason = null;
    this.orderTimestamps = [];

    const incidentData = {
      severity: 'INFO',
      component: 'RiskGuard',
      signature: 'CIRCUIT_BREAKER_RESET',
      description: `Circuit breaker manually cleared by operator (${userId}). Previous trip reason: ${oldReason || 'Manual kill switch'}.`,
      actionTaken: 'Trading system reset to standby mode.',
      resolved: 1
    };

    try {
      if (this.dbClient && typeof this.dbClient.recordIncident === 'function') {
        this.dbClient.recordIncident(incidentData);
      }
      appendIncidentsLog(incidentData);
    } catch (err) {
      console.error('[RISKGUARD] Failed to log reset incident:', err.message);
    }

    return { success: true, message: 'Circuit breaker reset successfully. Trading in standby.' };
  }
}

// ---------------------------------------------------------------------------
// 8. SIMULATED BROKER: Paper-Trading & Portfolio Ledger
// ---------------------------------------------------------------------------
class SimulatedBroker {
  constructor(tracker, dbClient = null) {
    this.tracker = tracker;
    this.dbClient = dbClient || db;
    this.cash = RISK_LIMITS.STARTING_CASH;
    this.positions = {};
    this.peakValue = RISK_LIMITS.STARTING_CASH;
    this.realizedPnL = 0;
    this.tradeHistory = [];
  }

  getPortfolioState() {
    let positionsValue = 0;
    const enrichedPositions = {};

    for (const [ticker, pos] of Object.entries(this.positions)) {
      if (pos.quantity <= 0) continue;
      const currentPrice = this.tracker.getPrice(ticker);
      const marketValue = pos.quantity * currentPrice;
      const costBasis = pos.quantity * pos.avgPrice;
      const unrealizedPnL = marketValue - costBasis;
      const unrealizedPnLPct = costBasis > 0 ? (unrealizedPnL / costBasis) : 0;

      positionsValue += marketValue;
      enrichedPositions[ticker] = {
        ticker,
        quantity: pos.quantity,
        avgPrice: parseFloat(pos.avgPrice.toFixed(2)),
        currentPrice: parseFloat(currentPrice.toFixed(2)),
        marketValue: parseFloat(marketValue.toFixed(2)),
        unrealizedPnL: parseFloat(unrealizedPnL.toFixed(2)),
        unrealizedPnLPct: parseFloat((unrealizedPnLPct * 100).toFixed(2))
      };
    }

    const totalValue = parseFloat((this.cash + positionsValue).toFixed(2));
    if (totalValue > this.peakValue) {
      this.peakValue = totalValue;
    }

    const drawdownAmount = Math.max(0, this.peakValue - totalValue);
    const drawdownPct = this.peakValue > 0 ? (drawdownAmount / this.peakValue) : 0;

    return {
      cash: parseFloat(this.cash.toFixed(2)),
      positionsValue: parseFloat(positionsValue.toFixed(2)),
      totalValue,
      peakValue: parseFloat(this.peakValue.toFixed(2)),
      drawdownPct: parseFloat(drawdownPct.toFixed(4)),
      drawdownAmount: parseFloat(drawdownAmount.toFixed(2)),
      realizedPnL: parseFloat(this.realizedPnL.toFixed(2)),
      positions: enrichedPositions
    };
  }

  executeOrder(order, riskVerdict) {
    const fee = order.quantity * order.price * RISK_LIMITS.ESTIMATED_FEE_PCT;

    if (order.action === 'BUY') {
      const grossCost = order.quantity * order.price;
      const totalCost = grossCost + fee;
      this.cash -= totalCost;

      const existing = this.positions[order.ticker] || { quantity: 0, avgPrice: 0 };
      const totalQuantity = existing.quantity + order.quantity;
      const totalCostBasis = (existing.quantity * existing.avgPrice) + grossCost;
      const newAvgPrice = totalCostBasis / totalQuantity;

      this.positions[order.ticker] = {
        quantity: totalQuantity,
        avgPrice: newAvgPrice
      };
    } else if (order.action === 'SELL') {
      const grossProceeds = order.quantity * order.price;
      const netProceeds = grossProceeds - fee;
      this.cash += netProceeds;

      const existing = this.positions[order.ticker];
      if (existing) {
        const costBasis = order.quantity * existing.avgPrice;
        const pnl = grossProceeds - costBasis - fee;
        this.realizedPnL += pnl;

        existing.quantity -= order.quantity;
        if (existing.quantity <= 0) {
          delete this.positions[order.ticker];
        }
      }
    }

    const executedTrade = {
      ...order,
      executedAt: Date.now(),
      fee: parseFloat(fee.toFixed(2)),
      portfolioStateSnapshot: this.getPortfolioState()
    };

    this.tradeHistory.unshift(executedTrade);
    if (this.tradeHistory.length > 50) this.tradeHistory.pop();

    // Record into SQLite trade_audit_log
    try {
      if (this.dbClient && typeof this.dbClient.recordAuditTrade === 'function') {
        this.dbClient.recordAuditTrade({
          userId: 'triad_bot',
          action: order.action,
          ticker: order.ticker,
          quantity: order.quantity,
          price: order.price,
          riskVerdict,
          portfolioState: executedTrade.portfolioStateSnapshot
        });
      }
    } catch (err) {
      console.error('[SIMULATED BROKER] Failed to audit trade:', err.message);
    }

    return executedTrade;
  }
}

// ---------------------------------------------------------------------------
// 9. TRADING BOT ORCHESTRATOR & LIFECYCLE CONTROLLER
// ---------------------------------------------------------------------------
class TradingBotController {
  constructor(options = {}) {
    this.dbClient = options.db || db;
    this.tracker = options.tracker || new TrackerAgent();
    this.predictor = options.predictor || new PredictorAgent(this.tracker);
    this.broker = options.broker || new SimulatedBroker(this.tracker, this.dbClient);
    this.riskGuard = options.riskGuard || new RiskGuardAgent(this.broker, this.dbClient);
    this.commander = options.commander || new CommanderAgent(this.predictor, this.broker, this.riskGuard);

    this.status = 'STOPPED'; // 'STOPPED', 'RUNNING', 'TRIPPED'
    this.intervalId = null;
    this.startTime = null;
    this.lastTickTime = null;
    this.tickCount = 0;
  }

  start() {
    if (this.status === 'RUNNING') {
      return { success: true, message: 'Trading bot is already running.' };
    }

    if (this.riskGuard.circuitBreakerTripped) {
      return {
        success: false,
        status: 'error',
        message: `Cannot start bot: Circuit breaker is tripped (${this.riskGuard.tripReason}). Clear circuit breaker first.`
      };
    }

    this.status = 'RUNNING';
    if (!this.startTime) this.startTime = Date.now();

    // Start 3-second simulation tick loop (unref to avoid preventing process exit)
    this.intervalId = setInterval(() => this.tick(), 3000);
    if (this.intervalId.unref) {
      this.intervalId.unref();
    }

    return {
      success: true,
      status: 'success',
      message: '5-Agent Trading Bot simulation started in automated paper-trading mode.'
    };
  }

  stop() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    if (this.status !== 'TRIPPED') {
      this.status = 'STOPPED';
    }
    return {
      success: true,
      status: 'success',
      message: '5-Agent Trading Bot simulation stopped.'
    };
  }

  // Physical Kill Switch
  killSwitch(reason = 'Operator Manual Kill Switch Engaged', userId = 'operator') {
    this.stop();
    this.status = 'TRIPPED';
    this.riskGuard.tripCircuitBreaker(reason);

    // Record audit entry for emergency halt
    try {
      if (this.dbClient && typeof this.dbClient.recordAuditTrade === 'function') {
        this.dbClient.recordAuditTrade({
          userId: userId || 'kill_switch',
          action: 'KILL_SWITCH_HALT',
          ticker: 'ALL',
          quantity: 0,
          price: 0,
          riskVerdict: { allowed: false, reason: 'EMERGENCY_KILL_SWITCH', details: reason },
          portfolioState: this.broker.getPortfolioState()
        });
      }
    } catch (err) {
      console.error('[KILL SWITCH] Audit record failed:', err.message);
    }

    return {
      success: true,
      status: 'tripped',
      message: 'EMERGENCY KILL SWITCH ENGAGED. Trading simulation halted, state locked.',
      reason
    };
  }

  reset(userId = 'operator') {
    const res = this.riskGuard.reset(userId);
    this.status = 'STOPPED';
    return res;
  }

  tick() {
    if (this.status !== 'RUNNING') return;

    this.tickCount++;
    this.lastTickTime = Date.now();

    // 1. Advance market universe
    this.tracker.tickMarket();

    // 2. Pre-trade check: Check drawdown
    const portfolio = this.broker.getPortfolioState();
    if (portfolio.drawdownPct >= RISK_LIMITS.MAX_DRAWDOWN_PCT) {
      this.killSwitch(
        `Max Drawdown Violation: ${(portfolio.drawdownPct * 100).toFixed(2)}% exceeded ${RISK_LIMITS.MAX_DRAWDOWN_PCT * 100}% threshold.`,
        'system_riskguard'
      );
      return;
    }

    // 3. Propose and evaluate trade
    const order = this.commander.proposeOrder();
    if (!order) return;

    // 4. Validate order against RiskGuard invariants
    const check = this.riskGuard.validateOrder(order);
    if (!check.allowed) {
      // Record rejected trade in audit log
      try {
        if (this.dbClient && typeof this.dbClient.recordAuditTrade === 'function') {
          this.dbClient.recordAuditTrade({
            userId: 'triad_bot',
            action: `REJECTED_${order.action}`,
            ticker: order.ticker,
            quantity: order.quantity,
            price: order.price,
            riskVerdict: check,
            portfolioState: portfolio
          });
        }
      } catch (e) {
        // quiet catch
      }
      return;
    }

    // 5. Execute approved order
    this.broker.executeOrder(order, check);
  }

  getStatus() {
    const portfolio = this.broker.getPortfolioState();
    const signals = this.predictor.scanAll();

    return {
      success: true,
      status: this.status,
      mock: true,
      price_source: 'synthetic-candlestick-walk',
      activeStrategy: '5-Agent AI Confluence: 200-Day SMA Trend & ROC Reset Consolidation',
      timeHorizon: '3-Month Trend Riding',
      framework: {
        agent1_fundamental: 'Earnings, forecast revisions & free cash flow margins',
        agent2_sentiment_x: 'News, social sentiment pulse on X & Bull/Bear dialectics',
        agent3_technical_roc: 'Price > 200 SMA (slope > 0) + Rate of Change (ROC) reset to 0',
        agent4_catalysts: 'Upcoming Dev Days, product keynotes & relative strength verification',
        agent5_execution_risk: 'Paper broker, 10% position limit, 2% drawdown circuit breaker'
      },
      uptimeSeconds: this.startTime ? Math.floor((Date.now() - this.startTime) / 1000) : 0,
      lastTickAt: this.lastTickTime ? new Date(this.lastTickTime).toISOString() : null,
      tickCount: this.tickCount,
      riskGuard: {
        circuitBreakerTripped: this.riskGuard.circuitBreakerTripped,
        tripReason: this.riskGuard.tripReason,
        maxDrawdownPct: RISK_LIMITS.MAX_DRAWDOWN_PCT,
        maxPositionPct: RISK_LIMITS.MAX_POSITION_PCT,
        maxOrdersPerMinute: RISK_LIMITS.MAX_ORDERS_PER_MINUTE
      },
      portfolio,
      activeSignals: signals.slice(0, 5),
      recentTrades: this.broker.tradeHistory.slice(0, 10),
      disclaimer: DISCLAIMER
    };
  }
}

// Global Singleton Instance
const botInstance = new TradingBotController();

module.exports = {
  TradingBotController,
  TrackerAgent,
  PredictorAgent,
  CommanderAgent,
  RiskGuardAgent,
  SimulatedBroker,
  FundamentalAgent,
  SentimentAgent,
  TechnicalAgent,
  CatalystAgent,
  botInstance,
  RISK_LIMITS,
  DISCLAIMER
};
