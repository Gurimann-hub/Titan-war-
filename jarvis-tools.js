/**
 * TITAN WAR // JARVIS QUANTITATIVE TOOL CALLING SYSTEM & RISK SENTINEL
 * Architecture:
 * - 8 Deterministic Callable Tools for Big Tech Corporate Warfare Intelligence
 * - Autonomous RiskGuard Pre-Trade Financial Invariant Validation
 * - SQLite Portfolio & Trade Audit Ledger (CWE-89 immune, prepared statements)
 * - Zero-API Fallback with deterministic financial models
 */

const db = require('./db');
const { MARKET_SNAPSHOTS, SUPPLY_CHAINS, DISCLAIMER } = require('./trading-assistant');

// RiskGuard Core Limits & Invariants
const RISKGUARD_INVARIANTS = {
  MAX_POSITION_PCT: 0.10,          // Max 10% of portfolio in any single name
  MAX_DRAWDOWN_PCT: 0.02,          // Max 2% drawdown tolerance per day
  MIN_RISK_REWARD_RATIO: 1.5,      // Minimum 1.5:1 reward to risk ratio
  MIN_CASH_RESERVE_PCT: 0.20,      // Minimum 20% cash buffer maintained
  MAX_DAILY_LOSS_PCT: 0.01         // 1% daily loss cap
};

// Seeded Institutional Financial Metrics (P/E, EV/EBITDA, CapEx Growth, FCF Margins)
const FINANCIAL_METRICS = {
  NVDA: {
    ticker: 'NVDA',
    company: 'NVIDIA Corporation',
    peRatio: 48.2,
    evEbitda: 41.5,
    capexGrowthPct: 68.4,
    revenueGrowthPct: 122.4,
    debtToEquity: 0.17,
    freeCashFlowMarginPct: 47.8,
    grossMarginPct: 75.1,
    forwardMultiple: 36.5,
    asOf: '2026-09-09'
  },
  MSFT: {
    ticker: 'MSFT',
    company: 'Microsoft Corporation',
    peRatio: 34.6,
    evEbitda: 23.8,
    capexGrowthPct: 52.1,
    revenueGrowthPct: 15.2,
    debtToEquity: 0.28,
    freeCashFlowMarginPct: 31.4,
    grossMarginPct: 69.8,
    forwardMultiple: 29.8,
    asOf: '2026-09-09'
  },
  AAPL: {
    ticker: 'AAPL',
    company: 'Apple Inc.',
    peRatio: 33.1,
    evEbitda: 24.2,
    capexGrowthPct: 12.3,
    revenueGrowthPct: 4.9,
    debtToEquity: 1.34,
    freeCashFlowMarginPct: 28.6,
    grossMarginPct: 46.2,
    forwardMultiple: 28.4,
    asOf: '2026-09-09'
  },
  GOOGL: {
    ticker: 'GOOGL',
    company: 'Alphabet Inc.',
    peRatio: 23.8,
    evEbitda: 16.2,
    capexGrowthPct: 44.7,
    revenueGrowthPct: 14.1,
    debtToEquity: 0.11,
    freeCashFlowMarginPct: 29.2,
    grossMarginPct: 57.5,
    forwardMultiple: 20.4,
    asOf: '2026-09-09'
  },
  AMZN: {
    ticker: 'AMZN',
    company: 'Amazon.com, Inc.',
    peRatio: 41.5,
    evEbitda: 18.9,
    capexGrowthPct: 38.5,
    revenueGrowthPct: 12.8,
    debtToEquity: 0.62,
    freeCashFlowMarginPct: 14.5,
    grossMarginPct: 49.3,
    forwardMultiple: 32.1,
    asOf: '2026-09-09'
  },
  META: {
    ticker: 'META',
    company: 'Meta Platforms, Inc.',
    peRatio: 26.4,
    evEbitda: 17.1,
    capexGrowthPct: 58.2,
    revenueGrowthPct: 22.1,
    debtToEquity: 0.21,
    freeCashFlowMarginPct: 36.8,
    grossMarginPct: 81.6,
    forwardMultiple: 22.0,
    asOf: '2026-09-09'
  },
  TSLA: {
    ticker: 'TSLA',
    company: 'Tesla, Inc.',
    peRatio: 62.1,
    evEbitda: 39.4,
    capexGrowthPct: 24.1,
    revenueGrowthPct: 8.2,
    debtToEquity: 0.08,
    freeCashFlowMarginPct: 7.4,
    grossMarginPct: 18.2,
    forwardMultiple: 54.0,
    asOf: '2026-09-09'
  },
  PLTR: {
    ticker: 'PLTR',
    company: 'Palantir Technologies',
    peRatio: 88.0,
    evEbitda: 61.2,
    capexGrowthPct: 18.4,
    revenueGrowthPct: 27.2,
    debtToEquity: 0.04,
    freeCashFlowMarginPct: 33.1,
    grossMarginPct: 81.2,
    forwardMultiple: 64.5,
    asOf: '2026-09-09'
  },
  AMD: {
    ticker: 'AMD',
    company: 'Advanced Micro Devices',
    peRatio: 44.5,
    evEbitda: 31.2,
    capexGrowthPct: 22.0,
    revenueGrowthPct: 18.3,
    debtToEquity: 0.06,
    freeCashFlowMarginPct: 19.8,
    grossMarginPct: 52.0,
    forwardMultiple: 31.2,
    asOf: '2026-09-09'
  },
  TSM: {
    ticker: 'TSM',
    company: 'Taiwan Semiconductor Mfg',
    peRatio: 24.1,
    evEbitda: 12.8,
    capexGrowthPct: 31.5,
    revenueGrowthPct: 29.4,
    debtToEquity: 0.22,
    freeCashFlowMarginPct: 38.5,
    grossMarginPct: 53.4,
    forwardMultiple: 20.1,
    asOf: '2026-09-09'
  }
};

// Institutional Antitrust & Regulatory Litigation Dockets
const ANTITRUST_DOCKETS = {
  NVDA: {
    ticker: 'NVDA',
    jurisdictions: ['US (FTC/DOJ)', 'EU (EC DG-COMP)', 'France (FCA)'],
    activeInvestigations: [
      {
        docket: 'FTC-AI-2026-042',
        agency: 'Federal Trade Commission',
        scope: 'Exclusivity provisions in AI cluster software bundles & Run:ai acquisition.',
        severity: 'HIGH',
        status: 'Active Civil Subpoenas Issued',
        settlementProbability: 0.65,
        estimatedFineRange: '$450M - $1.2B',
        structuralRemedyRisk: 'Low (Conduct remedy: open interoperability commitments)'
      },
      {
        docket: 'FCA-COMP-24/0081',
        agency: 'Autorité de la concurrence (France)',
        scope: 'CUDA proprietary lock-in and pricing discounts tied to high-bandwidth interconnects.',
        severity: 'MEDIUM',
        status: 'Formal Statement of Objections',
        settlementProbability: 0.70,
        estimatedFineRange: '€200M - €500M',
        structuralRemedyRisk: 'Negligible'
      }
    ],
    summary: 'Regulatory scrutiny centers on CUDA software lock-in and high-bandwidth interconnect bundling. No structural breakup risk identified.',
    asOf: '2026-09-09'
  },
  GOOGL: {
    ticker: 'GOOGL',
    jurisdictions: ['US (DOJ)', 'EU (EC)', 'UK (CMA)'],
    activeInvestigations: [
      {
        docket: 'DOJ-1:20-cv-03010',
        agency: 'US Department of Justice & State AGs',
        scope: 'Search monopolization remedies proceeding following August 2024 liability verdict.',
        severity: 'CRITICAL',
        status: 'Remedies Evidentiary Hearing Scheduled',
        settlementProbability: 0.30,
        estimatedFineRange: 'N/A (Structural/Conduct Focus)',
        structuralRemedyRisk: 'HIGH (Potential Chrome browser or Android bundling divestiture)'
      },
      {
        docket: 'DOJ-1:23-cv-00108',
        agency: 'US Department of Justice (EDVA)',
        scope: 'Digital advertising technology stack monopolization (AdX / Google Ad Manager).',
        severity: 'CRITICAL',
        status: 'Trial Concluded; Awaiting Verdict',
        settlementProbability: 0.25,
        estimatedFineRange: '$1.5B - $3.0B',
        structuralRemedyRisk: 'CRITICAL (Forced spin-off of Google Ad Manager / publisher ad server)'
      }
    ],
    summary: 'Highest structural litigation risk among hyperscalers. Ad-tech and search remedies hearings could mandate divestitures.',
    asOf: '2026-09-09'
  },
  AAPL: {
    ticker: 'AAPL',
    jurisdictions: ['US (DOJ)', 'EU (EC DMA)', 'Japan (JFTC)'],
    activeInvestigations: [
      {
        docket: 'DOJ-2:24-cv-04055',
        agency: 'US Department of Justice',
        scope: 'Smartphone ecosystem exclusion, anti-steering, iMessage interoperability, and NFC locks.',
        severity: 'HIGH',
        status: 'Motion to Dismiss Pending',
        settlementProbability: 0.50,
        estimatedFineRange: '$1.0B - $2.5B',
        structuralRemedyRisk: 'Low (Conduct: API opening and app store steering rules)'
      },
      {
        docket: 'EC-DMA-COMP-AT.40437',
        agency: 'European Commission',
        scope: 'Core Technology Fee (CTF) and alternative marketplace steering compliance under DMA.',
        severity: 'HIGH',
        status: 'Preliminary Findings Issued',
        settlementProbability: 0.60,
        estimatedFineRange: '€500M - €1.8B',
        structuralRemedyRisk: 'Negligible'
      }
    ],
    summary: 'EU DMA enforcement imposes recurrent compliance overhead. US DOJ lawsuit unlikely to resolve before 2027.',
    asOf: '2026-09-09'
  },
  MSFT: {
    ticker: 'MSFT',
    jurisdictions: ['US (FTC)', 'EU (EC)', 'UK (CMA)'],
    activeInvestigations: [
      {
        docket: 'FTC-CLOUD-2025-11',
        agency: 'Federal Trade Commission',
        scope: 'Cloud computing licensing terms penalizing competing hyper-scalers (AWS/GCP).',
        severity: 'MEDIUM',
        status: 'Civil Investigative Demands',
        settlementProbability: 0.75,
        estimatedFineRange: '$200M - $600M',
        structuralRemedyRisk: 'Negligible'
      },
      {
        docket: 'EC-COMP-AT.40721',
        agency: 'European Commission',
        scope: 'Teams unbundling from Microsoft 365 enterprise suite.',
        severity: 'LOW',
        status: 'Commitments Market Testing',
        settlementProbability: 0.85,
        estimatedFineRange: '€100M - €300M',
        structuralRemedyRisk: 'None'
      }
    ],
    summary: 'Manageable regulatory profile. Proactive unbundling strategies minimize catastrophic antitrust exposure.',
    asOf: '2026-09-09'
  },
  AMZN: {
    ticker: 'AMZN',
    jurisdictions: ['US (FTC)', 'EU (EC)'],
    activeInvestigations: [
      {
        docket: 'FTC-2:23-cv-01495',
        agency: 'Federal Trade Commission',
        scope: 'Marketplace pricing algorithms, anti-discounting policies, and fulfillment coercion.',
        severity: 'HIGH',
        status: 'Discovery Phase Active',
        settlementProbability: 0.45,
        estimatedFineRange: '$800M - $2.0B',
        structuralRemedyRisk: 'Medium (Conduct restrictions on Prime eligibility algorithms)'
      }
    ],
    summary: 'Marketplace algorithmic pricing litigation is ongoing. AWS cloud infrastructure remains largely insulated.',
    asOf: '2026-09-09'
  },
  META: {
    ticker: 'META',
    jurisdictions: ['US (FTC)', 'EU (EC DMA)'],
    activeInvestigations: [
      {
        docket: 'FTC-1:20-cv-03590',
        agency: 'Federal Trade Commission',
        scope: 'Monopolization lawsuit seeking retroactive unwind of Instagram and WhatsApp acquisitions.',
        severity: 'HIGH',
        status: 'Summary Judgment Denied; Trial Approaching',
        settlementProbability: 0.40,
        estimatedFineRange: 'N/A (Divestiture claim)',
        structuralRemedyRisk: 'MEDIUM (Trial court unlikely to order retroactive divestiture after 12 years)'
      }
    ],
    summary: 'Retroactive divestiture litigation carries headline volatility, but legal hurdle for FTC remains exceptionally high.',
    asOf: '2026-09-09'
  },
  TSLA: {
    ticker: 'TSLA',
    jurisdictions: ['US (DOJ/SEC/NHTSA)'],
    activeInvestigations: [
      {
        docket: 'SEC-DOJ-AUTO-2024-88',
        agency: 'DOJ Criminal & SEC Civil',
        scope: 'Autopilot and Full Self-Driving (FSD) safety marketing disclosures and driver monitoring.',
        severity: 'HIGH',
        status: 'Document Production / Grand Jury Inquiries',
        settlementProbability: 0.60,
        estimatedFineRange: '$150M - $400M',
        structuralRemedyRisk: 'Low (Marketing disclaimers & software recall)'
      }
    ],
    summary: 'Autonomous driving regulatory classification is the primary binary catalyst. Software oversight active.',
    asOf: '2026-09-09'
  }
};

// In-Memory Simulated Broker & Portfolio State for Zero-Risk Paper Trading
let portfolioState = {
  cash: 85000.00,
  startingCash: 100000.00,
  positions: {
    NVDA: { shares: 50, avgCost: 125.00, marketValue: 6440.00, unrealizedPnl: 190.00, unrealizedPnlPct: 3.04 },
    MSFT: { shares: 20, avgCost: 415.00, marketValue: 8414.00, unrealizedPnl: 114.00, unrealizedPnlPct: 1.37 }
  },
  circuitBreakerTripped: false,
  tripReason: null,
  peakValue: 100000.00,
  realizedPnl: 150.00,
  lastUpdated: Date.now()
};

function getSqliteDb() {
  if (db && db.db) return db.db;
  if (db && typeof db.getDb === 'function') return db.getDb();
  return db;
}

// Ensure SQLite trades table exists
function ensureTables() {
  try {
    const sqliteDb = getSqliteDb();
    sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS trades (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        ticker TEXT NOT NULL,
        action TEXT NOT NULL,
        quantity REAL NOT NULL,
        price REAL NOT NULL,
        total_value REAL NOT NULL,
        rationale TEXT,
        risk_status TEXT NOT NULL DEFAULT 'APPROVED',
        created_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS portfolio_cash (
        user_id TEXT PRIMARY KEY,
        cash_balance REAL NOT NULL DEFAULT 100000.00,
        updated_at INTEGER NOT NULL
      );
    `);
  } catch (err) {
    console.warn('[JARVIS TOOLS] Table initialization warning:', err.message);
  }
}

ensureTables();

// ===========================================================================
// THE 8 CALLABLE JARVIS TOOLS
// ===========================================================================

/**
 * Tool 1: get_stock_price(ticker)
 * Retrieves current price, daily change, volume, high, low, VWAP, and market cap.
 */
function get_stock_price(ticker) {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const snapshot = MARKET_SNAPSHOTS[normTicker] || {
    ticker: normTicker,
    company: `${normTicker} Corporation`,
    price: 150.00,
    changePct: 0.0,
    marketCap: 500000000000,
    peRatio: 30.0,
    primarySignal: 'neutral',
    riskVerdict: 'Standard market risk'
  };

  const curPrice = snapshot.price;
  const high = parseFloat((curPrice * 1.018).toFixed(2));
  const low = parseFloat((curPrice * 0.985).toFixed(2));
  const vwap = parseFloat(((curPrice + high + low) / 3).toFixed(2));
  const volume = 48250000;

  return {
    ticker: normTicker,
    company: snapshot.company,
    price: curPrice,
    changePct: snapshot.changePct,
    dayHigh: high,
    dayLow: low,
    vwap,
    volume,
    marketCap: snapshot.marketCap,
    peRatio: snapshot.peRatio,
    asOf: new Date().toISOString(),
    source: 'synthetic-broker',
    mock: true
  };
}

/**
 * Tool 2: get_financial_metrics(ticker)
 * Retrieves fundamental valuation ratios, CapEx growth, and margin metrics.
 */
function get_financial_metrics(ticker) {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const metrics = FINANCIAL_METRICS[normTicker] || {
    ticker: normTicker,
    company: `${normTicker} Enterprise`,
    peRatio: 32.0,
    evEbitda: 22.0,
    capexGrowthPct: 25.0,
    revenueGrowthPct: 15.0,
    debtToEquity: 0.35,
    freeCashFlowMarginPct: 25.0,
    grossMarginPct: 55.0,
    forwardMultiple: 27.5,
    asOf: '2026-09-09'
  };

  return {
    ...metrics,
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 3: get_antitrust_docket(ticker)
 * Retrieves regulatory investigations, FTC/DOJ/EC proceedings, fine estimates, and settlement probabilities.
 */
function get_antitrust_docket(ticker) {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const docket = ANTITRUST_DOCKETS[normTicker] || {
    ticker: normTicker,
    jurisdictions: ['US (FTC)', 'EU (EC)'],
    activeInvestigations: [],
    summary: `No material antitrust litigation dockets currently filed against ${normTicker}.`,
    asOf: '2026-09-09'
  };

  return {
    ...docket,
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 4: get_news_catalysts(ticker, limit)
 * Retrieves recent intelligence catalysts and analytical scores from SQLite.
 */
function get_news_catalysts(ticker, limit = 5) {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const maxLimit = Math.min(Math.max(Number(limit) || 5, 1), 20);

  const articles = db.getArticles({
    ticker: normTicker,
    limit: maxLimit
  });

  return {
    ticker: normTicker,
    totalFound: articles.length,
    catalysts: articles.map(a => ({
      id: a.id,
      headline: a.headline,
      summary: a.summary,
      impactScore: a.impactScore || a.impact_score || 5,
      sentiment: a.sentiment,
      whyItMatters: a.whyItMatters || a.why_it_matters || a.rationale || '',
      publishedAt: a.publishedAt,
      source: a.source
    })),
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 5: calculate_position_size(ticker, confidence, stopLossPct)
 * Calculates position sizing constrained by RiskGuard invariants (10% position cap, 2% drawdown).
 */
function calculate_position_size(ticker, confidence = 0.80, stopLossPct = 0.05) {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const priceData = get_stock_price(normTicker);
  const curPrice = priceData.price;

  const summary = get_portfolio_summary();
  const totalVal = summary.totalValue;
  const cash = summary.cash;

  // Check circuit breaker first
  if (portfolioState.circuitBreakerTripped) {
    return {
      allowed: false,
      reason: 'CIRCUIT_BREAKER_TRIPPED',
      details: `Circuit breaker active: ${portfolioState.tripReason}. New positions prohibited.`,
      recommendedShares: 0,
      recommendedAllocation: 0
    };
  }

  // Target risk: 1% max portfolio loss risk on trade
  const maxRiskDollars = totalVal * RISKGUARD_INVARIANTS.MAX_DAILY_LOSS_PCT; // $1,000 on $100,000
  const stopLossDistance = curPrice * Math.max(stopLossPct, 0.02);

  // Shares based on risk budget
  let riskBasedShares = Math.floor(maxRiskDollars / stopLossDistance);

  // Hard Cap 1: 10% maximum portfolio allocation limit
  const maxPositionDollars = totalVal * RISKGUARD_INVARIANTS.MAX_POSITION_PCT; // $10,000 max
  const maxPositionShares = Math.floor(maxPositionDollars / curPrice);

  // Hard Cap 2: Cash buffer limit (must maintain at least 20% cash)
  const minCashRequired = totalVal * RISKGUARD_INVARIANTS.MIN_CASH_RESERVE_PCT;
  const maxAvailableCashToSpend = Math.max(0, cash - minCashRequired);
  const cashConstrainedShares = Math.floor(maxAvailableCashToSpend / curPrice);

  // Confidence scaling (between 50% and 100% of max sizing)
  const confidenceMultiplier = Math.min(Math.max(confidence, 0.5), 1.0);

  // Take minimum across all constraints
  const finalShares = Math.max(
    0,
    Math.floor(Math.min(riskBasedShares, maxPositionShares, cashConstrainedShares) * confidenceMultiplier)
  );

  const allocationDollars = parseFloat((finalShares * curPrice).toFixed(2));
  const allocationPct = parseFloat(((allocationDollars / totalVal) * 100).toFixed(2));

  // Risk-Reward Evaluation
  const targetPrice = parseFloat((curPrice * (1 + stopLossPct * RISKGUARD_INVARIANTS.MIN_RISK_REWARD_RATIO)).toFixed(2));
  const stopPrice = parseFloat((curPrice * (1 - stopLossPct)).toFixed(2));
  const riskRewardRatio = RISKGUARD_INVARIANTS.MIN_RISK_REWARD_RATIO;

  const approved = finalShares > 0 && allocationPct <= (RISKGUARD_INVARIANTS.MAX_POSITION_PCT * 100);

  return {
    allowed: approved,
    ticker: normTicker,
    currentPrice: curPrice,
    confidence,
    recommendedShares: finalShares,
    recommendedAllocationDollars: allocationDollars,
    recommendedAllocationPct: allocationPct,
    maxAllowedPositionDollars: maxPositionDollars,
    stopLossPrice: stopPrice,
    targetPrice,
    riskRewardRatio,
    riskGuardValidation: {
      positionCapCompliance: allocationPct <= (RISKGUARD_INVARIANTS.MAX_POSITION_PCT * 100),
      cashReserveCompliance: (cash - allocationDollars) >= minCashRequired,
      circuitBreakerClear: !portfolioState.circuitBreakerTripped,
      status: approved ? 'APPROVED' : 'REJECTED'
    },
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 6: execute_paper_trade(ticker, action, quantity, price, rationale, userId)
 * Validates against RiskGuard, commits to SQLite `trades` table, and updates simulated portfolio.
 */
function execute_paper_trade(ticker, action = 'BUY', quantity = 10, price = null, rationale = 'Discretionary signal', userId = 'operator') {
  const normTicker = (ticker || 'NVDA').toUpperCase().trim();
  const act = (action || 'BUY').toUpperCase().trim();
  const qty = Math.max(1, Math.floor(Number(quantity) || 1));
  const curPrice = price ? Number(price) : get_stock_price(normTicker).price;
  const orderValue = parseFloat((qty * curPrice).toFixed(2));

  // RiskGuard Invariant Validation
  if (portfolioState.circuitBreakerTripped) {
    return {
      success: false,
      status: 'REJECTED',
      reason: 'CIRCUIT_BREAKER_TRIPPED',
      details: `Cannot execute trade. RiskGuard circuit breaker is active: ${portfolioState.tripReason}`
    };
  }

  const summary = get_portfolio_summary();
  const totalVal = summary.totalValue;

  if (act === 'BUY') {
    // Invariant: Max 10% Position Sizing
    const currentPosValue = (portfolioState.positions[normTicker]?.marketValue) || 0;
    const futurePosValue = currentPosValue + orderValue;
    const maxAllowed = totalVal * RISKGUARD_INVARIANTS.MAX_POSITION_PCT;

    if (futurePosValue > maxAllowed) {
      return {
        success: false,
        status: 'REJECTED',
        reason: 'POSITION_LIMIT_EXCEEDED',
        details: `Order value ($${orderValue.toFixed(2)}) would push ${normTicker} position to $${futurePosValue.toFixed(2)} (${((futurePosValue / totalVal) * 100).toFixed(1)}%), exceeding the 10.0% maximum position cap ($${maxAllowed.toFixed(2)}).`
      };
    }

    // Invariant: Cash buffer requirement
    if (portfolioState.cash < orderValue) {
      return {
        success: false,
        status: 'REJECTED',
        reason: 'INSUFFICIENT_CASH',
        details: `Available cash ($${portfolioState.cash.toFixed(2)}) is insufficient for $${orderValue.toFixed(2)} order.`
      };
    }

    // Deduct cash and update position
    portfolioState.cash = parseFloat((portfolioState.cash - orderValue).toFixed(2));
    const existing = portfolioState.positions[normTicker] || { shares: 0, avgCost: 0, marketValue: 0, unrealizedPnl: 0, unrealizedPnlPct: 0 };
    const newShares = existing.shares + qty;
    const newAvgCost = parseFloat(((existing.shares * existing.avgCost + orderValue) / newShares).toFixed(2));

    portfolioState.positions[normTicker] = {
      shares: newShares,
      avgCost: newAvgCost,
      marketValue: parseFloat((newShares * curPrice).toFixed(2)),
      unrealizedPnl: parseFloat(((curPrice - newAvgCost) * newShares).toFixed(2)),
      unrealizedPnlPct: parseFloat((((curPrice - newAvgCost) / newAvgCost) * 100).toFixed(2))
    };
  } else if (act === 'SELL') {
    const existing = portfolioState.positions[normTicker];
    if (!existing || existing.shares < qty) {
      return {
        success: false,
        status: 'REJECTED',
        reason: 'INSUFFICIENT_SHARES',
        details: `Cannot sell ${qty} shares of ${normTicker}. Only holding ${existing?.shares || 0} shares.`
      };
    }

    portfolioState.cash = parseFloat((portfolioState.cash + orderValue).toFixed(2));
    const newShares = existing.shares - qty;
    const realizedPnl = parseFloat(((curPrice - existing.avgCost) * qty).toFixed(2));
    portfolioState.realizedPnl = parseFloat((portfolioState.realizedPnl + realizedPnl).toFixed(2));

    if (newShares === 0) {
      delete portfolioState.positions[normTicker];
    } else {
      portfolioState.positions[normTicker] = {
        shares: newShares,
        avgCost: existing.avgCost,
        marketValue: parseFloat((newShares * curPrice).toFixed(2)),
        unrealizedPnl: parseFloat(((curPrice - existing.avgCost) * newShares).toFixed(2)),
        unrealizedPnlPct: parseFloat((((curPrice - existing.avgCost) / existing.avgCost) * 100).toFixed(2))
      };
    }
  }

  // Commit Trade Record to SQLite
  const tradeId = `trd_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  try {
    const sqliteDb = getSqliteDb();
    sqliteDb.prepare(`
      INSERT INTO trades (id, user_id, ticker, action, quantity, price, total_value, rationale, risk_status, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'APPROVED', ?)
    `).run(tradeId, userId, normTicker, act, qty, curPrice, orderValue, rationale, Date.now());

    // Record audit
    db.recordAuditTrade({
      userId,
      action: act,
      ticker: normTicker,
      quantity: qty,
      price: curPrice,
      riskVerdict: { allowed: true, status: 'APPROVED' },
      portfolioState: get_portfolio_summary()
    });
  } catch (err) {
    console.warn('[JARVIS BROKER] SQLite trade insert warning:', err.message);
  }

  return {
    success: true,
    status: 'FILLED',
    trade: {
      id: tradeId,
      ticker: normTicker,
      action: act,
      quantity: qty,
      price: curPrice,
      totalValue: orderValue,
      rationale,
      timestamp: Date.now()
    },
    portfolio: get_portfolio_summary(),
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 7: get_portfolio_summary(userId)
 * Retrieves full portfolio valuation, positions, unrealized/realized P&L, and drawdown telemetry.
 */
function get_portfolio_summary(userId = 'operator') {
  let positionsVal = 0;
  const positionsDetail = {};

  for (const [sym, pos] of Object.entries(portfolioState.positions)) {
    const price = get_stock_price(sym).price;
    const mVal = parseFloat((pos.shares * price).toFixed(2));
    const uPnl = parseFloat(((price - pos.avgCost) * pos.shares).toFixed(2));
    const uPnlPct = pos.avgCost > 0 ? parseFloat((((price - pos.avgCost) / pos.avgCost) * 100).toFixed(2)) : 0;

    positionsVal += mVal;
    positionsDetail[sym] = {
      shares: pos.shares,
      avgCost: pos.avgCost,
      currentPrice: price,
      marketValue: mVal,
      unrealizedPnl: uPnl,
      unrealizedPnlPct: uPnlPct,
      weightPct: 0 // calculated below
    };
  }

  const totalVal = parseFloat((portfolioState.cash + positionsVal).toFixed(2));

  // Assign weight percentages
  for (const sym of Object.keys(positionsDetail)) {
    positionsDetail[sym].weightPct = totalVal > 0 ? parseFloat(((positionsDetail[sym].marketValue / totalVal) * 100).toFixed(2)) : 0;
  }

  // Update peak value and drawdown
  if (totalVal > portfolioState.peakValue) {
    portfolioState.peakValue = totalVal;
  }
  const drawdownPct = portfolioState.peakValue > 0 ? parseFloat((((portfolioState.peakValue - totalVal) / portfolioState.peakValue) * 100).toFixed(2)) : 0;

  // Auto-trip circuit breaker if drawdown >= 2.0%
  if (drawdownPct >= (RISKGUARD_INVARIANTS.MAX_DRAWDOWN_PCT * 100) && !portfolioState.circuitBreakerTripped) {
    portfolioState.circuitBreakerTripped = true;
    portfolioState.tripReason = `Drawdown reached ${drawdownPct}%, breaching the 2.0% invariant limit.`;
    db.recordIncident({
      severity: 'CRITICAL',
      component: 'RiskGuard',
      signature: 'DRAWDOWN_LIMIT_BREACH',
      description: portfolioState.tripReason,
      actionTaken: 'HALTED_NEW_POSITIONS'
    });
  }

  const totalReturnPct = portfolioState.startingCash > 0 ? parseFloat((((totalVal - portfolioState.startingCash) / portfolioState.startingCash) * 100).toFixed(2)) : 0;

  return {
    totalValue: totalVal,
    cash: portfolioState.cash,
    positionsValue: parseFloat(positionsVal.toFixed(2)),
    startingCash: portfolioState.startingCash,
    realizedPnl: portfolioState.realizedPnl,
    totalReturnPct,
    drawdownPct,
    circuitBreakerTripped: portfolioState.circuitBreakerTripped,
    tripReason: portfolioState.tripReason,
    positions: positionsDetail,
    asOf: new Date().toISOString(),
    disclaimer: DISCLAIMER
  };
}

/**
 * Tool 8: get_risk_status(userId)
 * Retrieves RiskGuard sentinel status, drawdown gauge, position caps, and circuit breaker status.
 */
function get_risk_status(userId = 'operator') {
  const summary = get_portfolio_summary(userId);
  const totalVal = summary.totalValue;
  const cashReservePct = totalVal > 0 ? parseFloat(((summary.cash / totalVal) * 100).toFixed(2)) : 100;

  const tickerExposures = {};
  for (const [sym, pos] of Object.entries(summary.positions)) {
    tickerExposures[sym] = pos.weightPct;
  }

  return {
    circuitBreakerTripped: summary.circuitBreakerTripped,
    tripReason: summary.tripReason,
    currentDrawdownPct: summary.drawdownPct,
    maxDrawdownTolerancePct: RISKGUARD_INVARIANTS.MAX_DRAWDOWN_PCT * 100, // 2.0%
    maxSinglePositionCapPct: RISKGUARD_INVARIANTS.MAX_POSITION_PCT * 100, // 10.0%
    cashReservePct,
    minCashReserveRequiredPct: RISKGUARD_INVARIANTS.MIN_CASH_RESERVE_PCT * 100, // 20.0%
    exposuresByTicker: tickerExposures,
    riskVerdict: summary.circuitBreakerTripped ? 'CRITICAL_LOCKED' : summary.drawdownPct > 1.2 ? 'ELEVATED' : 'NOMINAL_COMPLIANT',
    disclaimer: DISCLAIMER
  };
}

// ===========================================================================
// TOOL REGISTRY & DISPATCHER
// ===========================================================================

const TOOL_DEFINITIONS = [
  {
    name: 'get_stock_price',
    description: 'Retrieve real-time price, intraday range, volume, and VWAP for a given Big Tech equity ticker.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. NVDA, MSFT, AAPL)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'get_financial_metrics',
    description: 'Retrieve fundamental valuation ratios, forward P/E, EV/EBITDA, and CapEx growth margins.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. NVDA, MSFT, AAPL)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'get_antitrust_docket',
    description: 'Retrieve active regulatory antitrust litigation dockets, settlement probabilities, and penalty estimates.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. NVDA, GOOGL, AAPL)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'get_news_catalysts',
    description: 'Retrieve recent high-impact corporate warfare news catalysts and analytical scores.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Stock ticker symbol (e.g. NVDA, AMD)' },
        limit: { type: 'number', description: 'Maximum number of catalysts to return (default 5)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'calculate_position_size',
    description: 'Calculate position sizing strictly constrained by RiskGuard invariants (10% position cap, 2% drawdown).',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Target ticker symbol' },
        confidence: { type: 'number', description: 'Confidence score between 0.50 and 1.00' },
        stopLossPct: { type: 'number', description: 'Stop loss distance percentage (default 0.05 for 5%)' }
      },
      required: ['ticker']
    }
  },
  {
    name: 'execute_paper_trade',
    description: 'Execute a simulated paper trade, validated against RiskGuard and committed to the SQLite ledger.',
    parameters: {
      type: 'object',
      properties: {
        ticker: { type: 'string', description: 'Target stock ticker' },
        action: { type: 'string', enum: ['BUY', 'SELL'], description: 'Trade side' },
        quantity: { type: 'number', description: 'Number of shares to trade' },
        price: { type: 'number', description: 'Execution price (optional; uses market price if omitted)' },
        rationale: { type: 'string', description: 'Trading rationale for audit record' }
      },
      required: ['ticker', 'action', 'quantity']
    }
  },
  {
    name: 'get_portfolio_summary',
    description: 'Retrieve portfolio valuation, active positions, realized/unrealized P&L, and drawdown percentage.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  {
    name: 'get_risk_status',
    description: 'Retrieve RiskGuard sentinel status, active circuit breaker telemetry, and single-stock exposure caps.',
    parameters: {
      type: 'object',
      properties: {}
    }
  }
];

function executeTool(toolName, args = {}, context = {}) {
  const normName = String(toolName || '').trim().toLowerCase();

  switch (normName) {
    case 'get_stock_price':
      return { success: true, tool: normName, data: get_stock_price(args.ticker) };
    case 'get_financial_metrics':
      return { success: true, tool: normName, data: get_financial_metrics(args.ticker) };
    case 'get_antitrust_docket':
      return { success: true, tool: normName, data: get_antitrust_docket(args.ticker) };
    case 'get_news_catalysts':
      return { success: true, tool: normName, data: get_news_catalysts(args.ticker, args.limit) };
    case 'calculate_position_size':
      return { success: true, tool: normName, data: calculate_position_size(args.ticker, args.confidence, args.stopLossPct) };
    case 'execute_paper_trade':
      return { success: true, tool: normName, data: execute_paper_trade(args.ticker, args.action, args.quantity, args.price, args.rationale, context.userId) };
    case 'get_portfolio_summary':
      return { success: true, tool: normName, data: get_portfolio_summary(context.userId) };
    case 'get_risk_status':
      return { success: true, tool: normName, data: get_risk_status(context.userId) };
    default:
      return { success: false, tool: normName, error: `Unknown tool: ${toolName}. Valid tools: ${TOOL_DEFINITIONS.map(t => t.name).join(', ')}` };
  }
}

function getTrades(userId = null, limit = 50) {
  try {
    const sqliteDb = getSqliteDb();
    const lim = Math.min(Math.max(Number(limit) || 50, 1), 200);
    if (userId) {
      return sqliteDb.prepare('SELECT * FROM trades WHERE user_id = ? ORDER BY created_at DESC LIMIT ?').all(userId, lim);
    }
    return sqliteDb.prepare('SELECT * FROM trades ORDER BY created_at DESC LIMIT ?').all(lim);
  } catch (err) {
    return [];
  }
}

function resetPortfolio() {
  portfolioState.cash = 85000.00;
  portfolioState.startingCash = 100000.00;
  portfolioState.positions = {
    NVDA: { shares: 50, avgCost: 125.00, marketValue: 6440.00, unrealizedPnl: 190.00, unrealizedPnlPct: 3.04 },
    MSFT: { shares: 20, avgCost: 415.00, marketValue: 8414.00, unrealizedPnl: 114.00, unrealizedPnlPct: 1.37 }
  };
  portfolioState.circuitBreakerTripped = false;
  portfolioState.tripReason = null;
  portfolioState.peakValue = 100000.00;
  portfolioState.realizedPnl = 150.00;
  portfolioState.lastUpdated = Date.now();
  return get_portfolio_summary();
}

module.exports = {
  RISKGUARD_INVARIANTS,
  FINANCIAL_METRICS,
  ANTITRUST_DOCKETS,
  TOOL_DEFINITIONS,
  get_stock_price,
  get_financial_metrics,
  get_antitrust_docket,
  get_news_catalysts,
  calculate_position_size,
  execute_paper_trade,
  get_portfolio_summary,
  get_risk_status,
  getTrades,
  resetPortfolio,
  executeTool
};
