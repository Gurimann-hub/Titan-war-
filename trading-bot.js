/**
 * TITAN WAR // TRIAD TRADING BOT SIMULATION & RISKGUARD SENTINEL
 * Architecture:
 * - Triad Multi-Agent Engine (Tracker, Predictor, Commander)
 * - Autonomous RiskGuard & Physical Kill Switch (2% Drawdown Circuit Breaker, 10% Position Cap)
 * - Deterministic Paper-Trading Broker (100% Zero-Risk Simulation, $100,000 Starting Capital)
 * - Zero Third-Party API Key Policy (Local technical analysis & deterministic pricing walk)
 * - Full SQLite Audit Trail (CWE-89 immune, node:sqlite prepared statements)
 */

const fs = require('fs');
const path = require('path');
const db = require('./db');
const { MARKET_SNAPSHOTS } = require('./trading-assistant');

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
// 1. TRACKER AGENT: Market Universe & Technical Analysis
// ---------------------------------------------------------------------------
class TrackerAgent {
  constructor(tickers) {
    this.tickers = tickers || ['NVDA', 'MSFT', 'AAPL', 'GOOGL', 'AMZN', 'META', 'TSLA'];
    this.priceHistory = new Map();
    this.currentPrices = new Map();

    // Initialize with baseline market snapshots
    this.tickers.forEach(sym => {
      const base = MARKET_SNAPSHOTS[sym]?.price || 150.0;
      this.currentPrices.set(sym, base);
      this.priceHistory.set(sym, [base]);
    });
  }

  // Deterministic or pseudo-random step walk
  tickMarket() {
    this.tickers.forEach(sym => {
      const cur = this.currentPrices.get(sym);
      // Small Gaussian-like walk [-0.8%, +0.8%] using seeded PRNG
      const deltaPct = (triadRng() - 0.49) * 0.016;
      const nextPrice = Math.max(1.0, parseFloat((cur * (1 + deltaPct)).toFixed(2)));
      this.currentPrices.set(sym, nextPrice);

      const hist = this.priceHistory.get(sym);
      hist.push(nextPrice);
      if (hist.length > 60) hist.shift(); // retain last 60 ticks
    });
  }

  getPrice(ticker) {
    return this.currentPrices.get(ticker) || MARKET_SNAPSHOTS[ticker]?.price || 100.0;
  }

  getIndicators(ticker) {
    const hist = this.priceHistory.get(ticker) || [this.getPrice(ticker)];
    const cur = this.getPrice(ticker);

    // SMA 5
    const len = hist.length;
    const slice5 = hist.slice(-Math.min(5, len));
    const sma5 = slice5.reduce((a, b) => a + b, 0) / slice5.length;

    // SMA 20
    const slice20 = hist.slice(-Math.min(20, len));
    const sma20 = slice20.reduce((a, b) => a + b, 0) / slice20.length;

    // Momentum (ROC 5)
    const base5 = slice5[0] || cur;
    const momentum = (cur - base5) / (base5 || 1);

    // RSI 14 (requires at least 15 samples so hist[i - 1] is never out of bounds)
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
      rsi: parseFloat(rsi.toFixed(1)),
      momentum: parseFloat(momentum.toFixed(4))
    };
  }
}

// ---------------------------------------------------------------------------
// 2. PREDICTOR AGENT: Alpha Signal Generation
// ---------------------------------------------------------------------------
class PredictorAgent {
  constructor(tracker) {
    this.tracker = tracker;
  }

  analyze(ticker) {
    const ind = this.tracker.getIndicators(ticker);
    let signal = 'HOLD';
    let confidence = 0.50;
    let rationale = 'Neutral moving-average convergence.';

    // Trend Following + Momentum Alpha
    if (ind.sma5 > ind.sma20 && ind.rsi < 68 && ind.momentum > 0.002) {
      signal = 'BUY';
      confidence = Math.min(0.92, 0.60 + Math.abs(ind.momentum) * 10);
      rationale = `Bullish SMA Golden Cross (SMA5: $${ind.sma5} > SMA20: $${ind.sma20}) with RSI at ${ind.rsi}.`;
    } else if (ind.sma5 < ind.sma20 || ind.rsi > 78 || ind.momentum < -0.005) {
      signal = 'SELL';
      confidence = Math.min(0.90, 0.60 + Math.abs(ind.momentum) * 10);
      rationale = `Bearish Momentum Fade (SMA5: $${ind.sma5} < SMA20: $${ind.sma20}) or Overbought RSI (${ind.rsi}).`;
    }

    return {
      ticker,
      signal,
      confidence: parseFloat(confidence.toFixed(2)),
      rationale,
      price: ind.currentPrice,
      indicators: ind
    };
  }

  scanAll() {
    return this.tracker.tickers.map(sym => this.analyze(sym));
  }
}

// ---------------------------------------------------------------------------
// 3. COMMANDER AGENT: Order Sizing & Execution Decision
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
// 4. RISKGUARD AGENT: Financial Safety Invariants & Kill Switch
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
// 5. SIMULATED BROKER: Paper-Trading & Portfolio Ledger
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
// 6. TRADING BOT ORCHESTRATOR & LIFECYCLE CONTROLLER
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
      message: 'Triad Trading Bot simulation started in automated paper-trading mode.'
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
      message: 'Triad Trading Bot simulation stopped.'
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
      price_source: 'synthetic-random-walk',
      activeStrategy: 'Triad Momentum & Structural Alpha',
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
  botInstance,
  RISK_LIMITS,
  DISCLAIMER
};
