const test = require('node:test');
const assert = require('node:assert');
const db = require('../db');
const {
  TrackerAgent,
  PredictorAgent,
  CommanderAgent,
  titleSimilarity,
  newsEngine
} = require('../news-engine');

test('Phase 2 News Engine: Institutional Sources & Articles Seeding in SQLite', () => {
  const sources = db.getSources();
  assert.ok(Array.isArray(sources), 'Sources must be an array');
  assert.ok(sources.length >= 5, `Expected at least 5 institutional sources, got ${sources.length}`);

  const sec = sources.find(s => s.id === 'src_sec');
  assert.ok(sec, 'SEC EDGAR source must be seeded');
  assert.strictEqual(sec.credibility_weight, 1.0);

  const articles = db.getArticles({ limit: 50 });
  assert.ok(Array.isArray(articles), 'Articles must be an array');
  assert.ok(articles.length >= 7, `Expected at least 7 initial Big Tech stories, got ${articles.length}`);

  // Validate the breaking NVDA export restriction story
  const nvdaStory = articles.find(a => a.id === 'art_nvda_export_001' || a.slug.includes('export-restrictions'));
  assert.ok(nvdaStory, 'Breaking NVDA export restrictions story must exist in SQLite');
  assert.strictEqual(nvdaStory.isBreaking, true, 'NVDA story must be flagged as breaking');
  assert.ok(nvdaStory.impactScore >= 9, 'NVDA story impact score must be 9');
  assert.ok(nvdaStory.tickers.includes('NVDA'), 'NVDA ticker must be present in story entities');
  assert.ok(nvdaStory.tickers.includes('AMD'), 'Spillover ticker AMD must be present');
});

test('Phase 2 News Engine: Multi-Dimensional Query Filtering (Ticker, Category, Sentiment, Impact)', () => {
  // 1. Ticker Filter
  const nvdaOnly = db.getArticles({ ticker: 'NVDA' });
  assert.ok(nvdaOnly.length > 0, 'Must return articles for NVDA');
  nvdaOnly.forEach(a => {
    assert.ok(a.tickers.includes('NVDA'), `Each article must include NVDA: got ${a.tickers}`);
  });

  // 2. Category Filter
  const marketShift = db.getArticles({ category: 'market-shift' });
  assert.ok(marketShift.length > 0, 'Must return articles for category market-shift');
  marketShift.forEach(a => {
    assert.strictEqual(a.category, 'market-shift');
  });

  // 3. Sentiment Filter
  const bullish = db.getArticles({ sentiment: 'bullish' });
  assert.ok(bullish.length > 0, 'Must return bullish articles');
  bullish.forEach(a => {
    assert.strictEqual(a.sentiment, 'bullish');
  });

  // 4. Min Impact Filter
  const highImpact = db.getArticles({ minImpact: 8 });
  assert.ok(highImpact.length > 0, 'Must return high impact articles (>=8)');
  highImpact.forEach(a => {
    assert.ok(a.impactScore >= 8, `Expected impact >= 8, got ${a.impactScore}`);
  });

  // 5. Text Search (q)
  const searchResults = db.getArticles({ q: 'export' });
  assert.ok(searchResults.length > 0, 'Must find articles matching "export"');
  assert.ok(
    searchResults[0].headline.toLowerCase().includes('export') ||
    searchResults[0].summary.toLowerCase().includes('export')
  );
});

test('Phase 2 News Engine: Tracker Agent Per-Source Circuit Breaker & Backoff', () => {
  const dummyBus = new (require('events').EventEmitter)();
  const tracker = new TrackerAgent(dummyBus);
  const testSourceId = 'test_source_circuit';

  // Initial state should be CLOSED
  let state = tracker.getCircuitState(testSourceId);
  assert.strictEqual(state.status, 'CLOSED');
  assert.strictEqual(state.failures, 0);
  assert.strictEqual(tracker.isSourceAvailable(testSourceId), true);

  // Record 4 failures -> Status DEGRADED but still available
  for (let i = 1; i <= 4; i++) {
    tracker.recordFailure(testSourceId, new Error(`HTTP 500 Failure ${i}`));
    assert.strictEqual(tracker.getCircuitState(testSourceId).failures, i);
  }
  assert.strictEqual(tracker.isSourceAvailable(testSourceId), true);

  // 5th failure trips circuit breaker OPEN
  tracker.recordFailure(testSourceId, new Error('HTTP 500 Failure 5'));
  assert.strictEqual(tracker.getCircuitState(testSourceId).status, 'OPEN');
  assert.strictEqual(tracker.isSourceAvailable(testSourceId), false, 'Trip circuit breaker must block source availability');

  // Success resets circuit breaker to CLOSED
  tracker.recordSuccess(testSourceId);
  assert.strictEqual(tracker.getCircuitState(testSourceId).status, 'CLOSED');
  assert.strictEqual(tracker.getCircuitState(testSourceId).failures, 0);
  assert.strictEqual(tracker.isSourceAvailable(testSourceId), true);
});

test('Phase 2 News Engine: Predictor Agent Entity Extraction & Analytical Scoring', () => {
  const dummyBus = new (require('events').EventEmitter)();
  const predictor = new PredictorAgent(dummyBus);

  // Test Entity Extraction
  const rawText = 'NVIDIA expands Blackwell server rack shipments to Microsoft Azure while Alphabet evaluates AMD alternatives.';
  const entities = predictor.extractEntities(rawText);
  const symbols = entities.map(e => e.symbol);

  assert.ok(symbols.includes('NVDA'), 'Must identify NVDA');
  assert.ok(symbols.includes('MSFT'), 'Must identify MSFT');
  assert.ok(symbols.includes('GOOGL'), 'Must identify GOOGL');
  assert.ok(symbols.includes('AMD'), 'Must identify AMD');

  // Test Sentiment Classification
  const bullText = 'Meta records surge in quarterly revenue and expands AI infrastructure partnerships.';
  const bullSentiment = predictor.classifySentiment(bullText);
  assert.strictEqual(bullSentiment.sentiment, 'bullish');
  assert.strictEqual(bullSentiment.expected_direction, 'up');

  const bearText = 'Department of Justice issues subpoena over antitrust remedies and slashes revenue sharing.';
  const bearSentiment = predictor.classifySentiment(bearText);
  assert.strictEqual(bearSentiment.sentiment, 'cautionary');
  assert.strictEqual(bearSentiment.expected_direction, 'down');

  // Test Impact Score Calculation
  const highImpact = predictor.calculateImpactScore('U.S. expands export controls on advanced AI chips', 4, 1.0);
  assert.ok(highImpact >= 8, `Expected high impact score >= 8, got ${highImpact}`);
});

test('Phase 2 News Engine: Commander Agent Deduplication & Quality Gates', () => {
  const dummyBus = new (require('events').EventEmitter)();
  const commander = new CommanderAgent(dummyBus);

  // Title similarity check
  const t1 = 'Fresh Export Restrictions Cloud Global AI Chip Shipments for NVIDIA Corporation';
  const t2 = 'Fresh Export Restrictions Cloud Global AI Chip Shipments for NVIDIA';
  const sim = titleSimilarity(t1, t2);
  assert.ok(sim >= 0.70, `Expected similarity >= 0.70, got ${sim}`);

  const diffTitle = 'Amazon Deploys Nuclear Energy Small Modular Reactors';
  assert.ok(titleSimilarity(t1, diffTitle) < 0.20, 'Completely different titles must have low similarity');

  // Quality gate test: Low credibility source must be dropped
  const lowCredStory = {
    headline: 'Unverified Anonymous Forum Post Claims Secret Merger',
    summary: 'Speculative rumors circulate online without official confirmation.',
    credibility_weight: 0.50, // Below 0.70 threshold
    confidence: 0.55,         // Below 0.60 threshold
    published_at: Date.now()
  };

  const result = commander.evaluateAndPublish(lowCredStory);
  assert.strictEqual(result, null, 'Story failing quality gate must be dropped by Commander');

  // Quality gate test: High quality story must be committed
  db.db.prepare("DELETE FROM articles WHERE headline LIKE '%Semiconductor Initiative Alpha%' OR headline LIKE '%TestStory%'").run();
  const uniqueId = `test_uniq_${Date.now()}`;
  const highQualityStory = {
    headline: `Wholly Distinct Federal Approval for Semiconductor Initiative Alpha ${uniqueId}`,
    summary: `Federal commission grants unconditional regulatory clearance for initiative ${uniqueId}.`,
    why_it_matters: 'Clears substantial regulatory obstacle for enterprise cloud expansion.',
    source_id: 'src_reuters',
    source_name: 'Reuters Technology Bureau',
    url: 'https://www.reuters.com/tech-alliance',
    category: 'corporate',
    credibility_weight: 0.95,
    confidence: 0.88,
    impact_score: 7,
    sentiment: 'bullish',
    expected_direction: 'up',
    published_at: Date.now(),
    entities: [{ entity_type: 'equity', symbol: 'MSFT', name: 'Microsoft Corporation' }],
    tickers: ['MSFT']
  };

  const committed = commander.evaluateAndPublish(highQualityStory);
  assert.ok(committed, 'High quality story must be committed to database');
  assert.ok(committed.id, 'Committed article must have unique ID');

  // Duplicate submission with identical content must be safely skipped
  const duplicateCommitted = commander.evaluateAndPublish(highQualityStory);
  assert.strictEqual(duplicateCommitted, null, 'Duplicate headline must be skipped by Commander');

  // Clean up test article
  if (committed) {
    db.db.prepare("DELETE FROM articles WHERE id = ?").run(committed.id);
  }
});

test('Phase 2 News Engine: User Bookmarks & Watchlists State Integrity', () => {
  const testUserId = `usr_test_${Date.now()}`;
  const articles = db.getArticles({ limit: 1 });
  assert.ok(articles.length > 0, 'Need at least one article for bookmark test');
  const articleId = articles[0].id;

  // 1. Initial bookmark status should be false
  assert.strictEqual(db.isBookmarked(testUserId, articleId), false);
  assert.strictEqual(db.getBookmarks(testUserId).length, 0);

  // 2. Toggle Bookmark ON
  const res1 = db.toggleBookmark(testUserId, articleId);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(res1.bookmarked, true);
  assert.strictEqual(db.isBookmarked(testUserId, articleId), true);

  const bookmarks = db.getBookmarks(testUserId);
  assert.strictEqual(bookmarks.length, 1);
  assert.strictEqual(bookmarks[0].id, articleId);

  // 3. Toggle Bookmark OFF
  const res2 = db.toggleBookmark(testUserId, articleId);
  assert.strictEqual(res2.success, true);
  assert.strictEqual(res2.bookmarked, false);
  assert.strictEqual(db.isBookmarked(testUserId, articleId), false);
  assert.strictEqual(db.getBookmarks(testUserId).length, 0);

  // 4. Watchlist Add / List / Remove
  assert.strictEqual(db.getWatchlist(testUserId).length, 0);

  db.addToWatchlist(testUserId, 'NVDA');
  db.addToWatchlist(testUserId, 'AAPL');
  const userWatchlist = db.getWatchlist(testUserId);
  assert.strictEqual(userWatchlist.length, 2);
  assert.ok(userWatchlist.includes('NVDA'));
  assert.ok(userWatchlist.includes('AAPL'));

  // Duplicate add should be idempotent
  db.addToWatchlist(testUserId, 'NVDA');
  assert.strictEqual(db.getWatchlist(testUserId).length, 2);

  db.removeFromWatchlist(testUserId, 'NVDA');
  const afterRemove = db.getWatchlist(testUserId);
  assert.strictEqual(afterRemove.length, 1);
  assert.strictEqual(afterRemove[0], 'AAPL');
});

test('Phase 2 News Engine: Agent Runs & Observability Telemetry', () => {
  const uniqueRunType = `rss_poll_${Date.now()}`;
  db.recordAgentRun({
    agentName: 'TrackerAgent',
    runType: uniqueRunType,
    status: 'success',
    itemsProcessed: 14,
    itemsPublished: 3,
    startedAt: Date.now(),
    completedAt: Date.now() + 50
  });

  const runs = db.getRecentAgentRuns(20);
  assert.ok(Array.isArray(runs), 'Runs must be an array');
  const targetRun = runs.find(r => r.run_type === uniqueRunType);
  assert.ok(targetRun, 'Must find the specifically recorded agent run');
  assert.strictEqual(targetRun.agent_name, 'TrackerAgent');
  assert.strictEqual(targetRun.status, 'success');
  assert.strictEqual(targetRun.items_processed, 14);
  assert.strictEqual(targetRun.items_published, 3);
});
