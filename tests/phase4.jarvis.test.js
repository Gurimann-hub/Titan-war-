const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const jarvisTools = require('../jarvis-tools');
const {
  buildJarvisAnalystResponse,
  buildMarketOracleVerdict,
  MARKET_SNAPSHOTS,
  DISCLAIMER
} = require('../trading-assistant');
const db = require('../db');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('Phase 4: Quantitative Tool Registry & Definitions', () => {
  const tools = jarvisTools.TOOL_DEFINITIONS;
  assert.strictEqual(tools.length, 8, 'Must export exactly 8 callable tools');

  const toolNames = tools.map(t => t.name);
  const expectedTools = [
    'get_stock_price',
    'get_financial_metrics',
    'get_antitrust_docket',
    'get_news_catalysts',
    'calculate_position_size',
    'execute_paper_trade',
    'get_portfolio_summary',
    'get_risk_status'
  ];

  expectedTools.forEach(name => {
    assert.ok(toolNames.includes(name), `Registry must include tool: ${name}`);
  });

  tools.forEach(tool => {
    assert.ok(tool.description && tool.description.length > 10, `${tool.name} must have descriptive summary`);
    assert.strictEqual(tool.parameters.type, 'object', `${tool.name} schema must be an object`);
  });
});

test('Phase 4: Tool Execution Logic & Data Contracts', () => {
  // 1. get_stock_price
  const priceRes = jarvisTools.executeTool('get_stock_price', { ticker: 'NVDA' });
  assert.strictEqual(priceRes.success, true);
  assert.strictEqual(priceRes.data.ticker, 'NVDA');
  assert.ok(priceRes.data.price > 0, 'Price must be positive');
  assert.ok(priceRes.data.dayHigh >= priceRes.data.price, 'Day high must be >= price');
  assert.ok(priceRes.data.dayLow <= priceRes.data.price, 'Day low must be <= price');

  // 2. get_financial_metrics
  const metricRes = jarvisTools.executeTool('get_financial_metrics', { ticker: 'NVDA' });
  assert.strictEqual(metricRes.success, true);
  assert.strictEqual(metricRes.data.ticker, 'NVDA');
  assert.ok(metricRes.data.peRatio > 0, 'Must have P/E ratio');
  assert.ok(metricRes.data.evEbitda > 0, 'Must have EV/EBITDA');
  assert.ok(metricRes.data.capexGrowthPct > 0, 'Must have CapEx growth %');

  // 3. get_antitrust_docket
  const docketRes = jarvisTools.executeTool('get_antitrust_docket', { ticker: 'GOOGL' });
  assert.strictEqual(docketRes.success, true);
  assert.strictEqual(docketRes.data.ticker, 'GOOGL');
  assert.ok(Array.isArray(docketRes.data.jurisdictions));
  assert.ok(docketRes.data.activeInvestigations.length > 0, 'GOOGL must have antitrust investigations');

  // 4. get_news_catalysts
  const catRes = jarvisTools.executeTool('get_news_catalysts', { ticker: 'NVDA', limit: 3 });
  assert.strictEqual(catRes.success, true);
  assert.strictEqual(catRes.data.ticker, 'NVDA');
  assert.ok(Array.isArray(catRes.data.catalysts));

  // 5. calculate_position_size (complies with 10% position limit)
  const sizeRes = jarvisTools.executeTool('calculate_position_size', { ticker: 'NVDA', confidence: 0.85, stopLossPct: 0.05 });
  assert.strictEqual(sizeRes.success, true);
  assert.ok(sizeRes.data.recommendedAllocationPct <= 10.0, 'Recommended allocation must not exceed 10.0% NAV');
  assert.strictEqual(sizeRes.data.riskGuardValidation.positionCapCompliance, true);
  assert.strictEqual(sizeRes.data.riskGuardValidation.cashReserveCompliance, true);
  assert.ok(sizeRes.data.riskRewardRatio >= 1.5, 'Must satisfy minimum 1.5:1 reward to risk');

  // 6. get_portfolio_summary
  const portRes = jarvisTools.executeTool('get_portfolio_summary', {});
  assert.strictEqual(portRes.success, true);
  assert.ok(portRes.data.totalValue > 0, 'Portfolio totalValue must be positive');
  assert.ok(portRes.data.cash > 0, 'Portfolio cash must be positive');

  // 7. get_risk_status
  const riskRes = jarvisTools.executeTool('get_risk_status', {});
  assert.strictEqual(riskRes.success, true);
  assert.strictEqual(riskRes.data.maxSinglePositionCapPct, 10.0);
  assert.strictEqual(riskRes.data.maxDrawdownTolerancePct, 2.0);
  assert.strictEqual(riskRes.data.minCashReserveRequiredPct, 20.0);
});

test('Phase 4: RiskGuard Invariants Block Violating Orders', () => {
  // Reset portfolio to known nominal state
  jarvisTools.resetPortfolio();

  // Try to buy 5,000 shares of NVDA (~$640,000 order), far exceeding 10% NAV and cash
  const oversizedTrade = jarvisTools.execute_paper_trade('NVDA', 'BUY', 5000, null, 'Unconstrained test', 'test_user');
  assert.strictEqual(oversizedTrade.success, false, 'RiskGuard must reject oversized order');
  assert.strictEqual(oversizedTrade.status, 'REJECTED');
  assert.ok(
    oversizedTrade.reason === 'POSITION_LIMIT_EXCEEDED' || oversizedTrade.reason === 'INSUFFICIENT_CASH',
    `Reason must indicate invariant breach: ${oversizedTrade.reason}`
  );

  // Valid small order (1 share of NVDA ~$128.80) should succeed
  const validTrade = jarvisTools.execute_paper_trade('NVDA', 'BUY', 1, null, 'Compliant test buy', 'test_user');
  assert.strictEqual(validTrade.success, true, 'Compliant trade must be accepted');
  assert.strictEqual(validTrade.status, 'FILLED');
  assert.ok(validTrade.trade.id.startsWith('trd_'), 'Trade must have an ID');

  // Check trade persisted in SQLite
  const dbTrades = jarvisTools.getTrades('test_user', 10);
  assert.ok(dbTrades.length > 0, 'Trade must be recorded in SQLite trades table');
  const found = dbTrades.find(t => t.id === validTrade.trade.id);
  assert.ok(found, 'Executed trade ID must exist in SQLite ledger');
  assert.strictEqual(found.ticker, 'NVDA');
  assert.strictEqual(found.action, 'BUY');
});

test('Phase 4: Context-Injected Chat & Reasoning Transparency', () => {
  // Test 1: Catalyst Dossier Ingestion via articleId
  const articles = db.getArticles({ limit: 1 });
  assert.ok(articles.length > 0, 'Must have seeded articles in db');
  const testArticle = articles[0];

  const catalystChat = buildJarvisAnalystResponse('Provide trading implications for this event', null, {
    articleId: testArticle.id,
    ticker: testArticle.tickers[0] || 'NVDA'
  });

  assert.ok(catalystChat.includes('[STRATEGIC CATALYST DOSSIER INGESTION]'), 'Must include catalyst ingestion header');
  assert.ok(catalystChat.includes(testArticle.id), 'Must include article ID');
  assert.ok(catalystChat.includes('SHA-256 Provenance Checksum'), 'Must include cryptographic provenance verification');
  assert.ok(catalystChat.includes(DISCLAIMER), 'Must stamp mandatory compliance disclaimer');

  // Test 2: Tool-specific queries within chat
  const metricChat = buildJarvisAnalystResponse('Show me financial metrics and valuation for NVDA');
  assert.ok(metricChat.includes('[INSTITUTIONAL VALUATION & FINANCIAL METRICS]'), 'Must answer with valuation block');
  assert.ok(metricChat.includes(DISCLAIMER), 'Must stamp disclaimer');

  const antitrustChat = buildJarvisAnalystResponse('What are the antitrust investigations on GOOGL?');
  assert.ok(antitrustChat.includes('[ANTITRUST DOCKET & REGULATORY LITIGATION AUDIT]'), 'Must answer with antitrust audit');
  assert.ok(antitrustChat.includes(DISCLAIMER), 'Must stamp disclaimer');

  const portChat = buildJarvisAnalystResponse('Check my current paper portfolio holdings and cash');
  assert.ok(portChat.includes('[PAPER TRADING PORTFOLIO TELEMETRY]'), 'Must answer with portfolio telemetry');
  assert.ok(portChat.includes(DISCLAIMER), 'Must stamp disclaimer');

  // Test 3: Dialectical Thesis Format (Section 8.6 Reasoning Transparency)
  const dialecticalChat = buildJarvisAnalystResponse('Analyze NVDA long position');
  assert.ok(dialecticalChat.includes('Bull Case'), 'Must include Bull Case');
  assert.ok(dialecticalChat.includes('Bear Case'), 'Must include Bear Case');
  assert.ok(dialecticalChat.includes('Synthesis Verdict'), 'Must include Synthesis Verdict');
  assert.ok(dialecticalChat.includes('Conviction Score:'), 'Must include Conviction Score');
  assert.ok(dialecticalChat.includes('Invalidation Price:'), 'Must include Invalidation Price');
  assert.ok(dialecticalChat.includes(DISCLAIMER), 'Must stamp disclaimer');

  // Test 4: MarketOracle Dialectical Stock Verdict
  const verdict = buildMarketOracleVerdict('NVDA', 'Is packaging yield stable?', 'Bloomberg reports advanced packaging supply constraint easing');
  assert.strictEqual(verdict.ticker, 'NVDA');
  assert.ok(verdict.bull_thesis.score > 0, 'Bull thesis must have score');
  assert.ok(verdict.bear_thesis.score > 0, 'Bear thesis must have score');
  assert.ok(verdict.arbiter_decision.probability_percent > 0, 'Arbiter must have probability percent');
  assert.ok(verdict.conversational_chat_response.length > 10, 'Must include conversational_chat_response for frontend chat feed');
  assert.ok(verdict.disclaimer === DISCLAIMER, 'Verdict must include disclaimer');
});

test('Phase 4: REST API Endpoints Delivery', async () => {
  // 1. GET /api/jarvis/tools
  const toolsRes = await fetch(`${BASE_URL}/api/jarvis/tools`);
  assert.strictEqual(toolsRes.status, 200, 'GET /api/jarvis/tools should return 200');
  const toolsData = await toolsRes.json();
  assert.strictEqual(toolsData.success, true);
  assert.strictEqual(toolsData.count, 8);
  assert.strictEqual(toolsData.tools.length, 8);

  // 2. POST /api/jarvis/tools/execute
  const execRes = await fetch(`${BASE_URL}/api/jarvis/tools/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tool: 'get_financial_metrics',
      args: { ticker: 'MSFT' }
    })
  });
  assert.strictEqual(execRes.status, 200, 'Tool execute should return 200');
  const execData = await execRes.json();
  assert.strictEqual(execData.success, true);
  assert.strictEqual(execData.data.ticker, 'MSFT');

  // 3. POST /api/trade (Compliant Paper Buy)
  const tradeRes = await fetch(`${BASE_URL}/api/trade`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: 'MSFT',
      action: 'BUY',
      quantity: 1,
      rationale: 'API test trade'
    })
  });
  assert.strictEqual(tradeRes.status, 200, 'Valid trade should return 200');
  const tradeData = await tradeRes.json();
  assert.strictEqual(tradeData.success, true);
  assert.strictEqual(tradeData.status, 'FILLED');

  // 4. GET /api/trades
  const tradesListRes = await fetch(`${BASE_URL}/api/trades?all=true&limit=10`);
  assert.strictEqual(tradesListRes.status, 200, 'GET /api/trades should return 200');
  const tradesListData = await tradesListRes.json();
  assert.strictEqual(tradesListData.success, true);
  assert.ok(tradesListData.trades.length > 0, 'Trades array should not be empty');

  // 5. GET /api/risk/status
  const riskStatusRes = await fetch(`${BASE_URL}/api/risk/status`);
  assert.strictEqual(riskStatusRes.status, 200, 'GET /api/risk/status should return 200');
  const riskStatusData = await riskStatusRes.json();
  assert.strictEqual(riskStatusData.success, true);
  assert.strictEqual(riskStatusData.risk.maxSinglePositionCapPct, 10.0);
  assert.strictEqual(riskStatusData.risk.maxDrawdownTolerancePct, 2.0);

  // 6. POST /api/chat with deep-linked catalyst context
  const testArticleId = db.getArticles({ limit: 1 })[0]?.id || 'art_nvda_export_001';
  const chatRes = await fetch(`${BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'Analyze this catalyst docket',
      ticker: 'NVDA',
      articleId: testArticleId
    })
  });
  assert.strictEqual(chatRes.status, 200, 'POST /api/chat should return 200');
  const chatData = await chatRes.json();
  assert.ok(chatData.data.includes('[STRATEGIC CATALYST DOSSIER INGESTION]'), 'Chat response should contain catalyst ingestion');
  assert.ok(chatData.data.includes('SHA-256 Provenance Checksum'), 'Chat response should contain provenance verification');
  assert.ok(chatData.data.includes(DISCLAIMER), 'Chat response must contain compliance disclaimer');

  // 7. POST /api/chat/stock-verdict
  const verdictRes = await fetch(`${BASE_URL}/api/chat/stock-verdict`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      ticker: 'NVDA',
      user_query: 'Will Blackwell shipments beat Q3 expectations?',
      news_snippet: 'Packaging substrate availability expanded 18% month over month.'
    })
  });
  assert.strictEqual(verdictRes.status, 200, 'POST /api/chat/stock-verdict should return 200');
  const verdictData = await verdictRes.json();
  assert.strictEqual(verdictData.ticker, 'NVDA');
  assert.ok(verdictData.bull_thesis.score > 0);
  assert.ok(verdictData.bear_thesis.score > 0);
  assert.ok(verdictData.conversational_chat_response.length > 0);
});
