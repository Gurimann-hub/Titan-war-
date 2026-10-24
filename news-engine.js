/**
 * TITAN WAR // AUTONOMOUS MULTI-AGENT NEWS ENGINE & REAL-TIME EVENT STREAM
 * 
 * Topology:
 * 1. TrackerAgent: RSS/SEC feed ingestion with per-source circuit breaker,
 *    jittered exponential backoff, and strict SSRF/XXE validation.
 * 2. PredictorAgent: Normalization, entity/ticker extraction, sentiment classification,
 *    impact scoring (1-10 / 0-100), confidence/rationale calculation, credibility weighting.
 * 3. CommanderAgent: In-memory event bus, content deduplication (hash + Jaccard title similarity),
 *    quality gates (cred >= 0.70, conf >= 0.60), atomic SQLite commit, SSE subscriber dispatch,
 *    and provenance audit logging.
 */

const crypto = require('crypto');
const { EventEmitter } = require('events');
const db = require('./db');
const { fetchFeedHttp, parseFeedXmlSafe } = require('./news-aggregator');

// Event Bus Topics
const TOPIC_DISCOVERED = 'ITEM_DISCOVERED';
const TOPIC_PREDICTED = 'STORY_PREDICTED';
const TOPIC_COMMITTED = 'STORY_COMMITTED';
const TOPIC_REJECTED = 'STORY_REJECTED';

// Big Tech Entity Mapping & Disambiguation Rules
const TICKER_MAP = [
  { symbol: 'NVDA', name: 'NVIDIA Corporation', keywords: ['nvidia', 'nvda', 'blackwell', 'h100', 'b200', 'cuda', 'jensen huang'] },
  { symbol: 'MSFT', name: 'Microsoft Corporation', keywords: ['microsoft', 'msft', 'azure', 'satya nadella', 'openai'] },
  { symbol: 'AAPL', name: 'Apple Inc.', keywords: ['apple', 'aapl', 'iphone', 'app store', 'tim cook', 'dma'] },
  { symbol: 'GOOGL', name: 'Alphabet Inc.', keywords: ['google', 'alphabet', 'googl', 'goog', 'android', 'chrome', 'sundar pichai', 'deepmind'] },
  { symbol: 'AMZN', name: 'Amazon.com Inc.', keywords: ['amazon', 'amzn', 'aws', 'andy jassy', 'trainium', 'bedrock'] },
  { symbol: 'META', name: 'Meta Platforms Inc.', keywords: ['meta', 'facebook', 'instagram', 'mark zuckerberg', 'llama'] },
  { symbol: 'TSLA', name: 'Tesla Inc.', keywords: ['tesla', 'tsla', 'elon musk', 'cybercab', 'robotaxi', 'autopilot', 'fsd'] },
  { symbol: 'AMD', name: 'Advanced Micro Devices', keywords: ['amd', 'lisa su', 'mi300', 'radeon'] },
  { symbol: 'TSM', name: 'Taiwan Semiconductor', keywords: ['tsmc', 'tsm', 'taiwan semiconductor'] },
  { symbol: 'INTC', name: 'Intel Corporation', keywords: ['intel', 'intc', 'pat gelsinger'] }
];

const BULLISH_KEYWORDS = [
  'record', 'surge', 'growth', 'expands', 'beat', 'bullish', 'accelerates',
  'all-time high', 'secures', 'deal', 'agreement', 'approved', 'blocks mandatory',
  'denied breakup', 'milestone', 'unveils', 'capex raise', 'contract'
];

const CAUTIONARY_KEYWORDS = [
  'investigation', 'probe', 'subpoena', 'antitrust', 'decline', 'falls',
  'loss', 'fine', 'remedies', 'drop', 'warning', 'restrictions', 'ban',
  'tighten', 'cloud', 'lawsuit', 'cut', 'slashes', 'halts', 'export controls'
];

const HIGH_IMPACT_KEYWORDS = [
  'export controls', 'chip ban', 'antitrust', 'subpoena', 'injunction',
  'national security', 'earnings surprise', 'merger', 'layoffs', 'datacenter',
  'nuclear', 'smr', 'remedies', 'capex', 'divestiture', 'cybercab', 'robotaxi'
];

/**
 * Calculates word-level Jaccard similarity between two headline strings.
 */
function titleSimilarity(title1, title2) {
  if (!title1 || !title2) return 0;
  const words1 = new Set(title1.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  const words2 = new Set(title2.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2));
  if (words1.size === 0 || words2.size === 0) return 0;
  let intersection = 0;
  for (const w of words1) {
    if (words2.has(w)) intersection++;
  }
  const union = new Set([...words1, ...words2]).size;
  return intersection / union;
}

// ---------------------------------------------------------------------------
// 1. TRACKER AGENT: RSS/SEC Ingestion, Jittered Backoff & Circuit Breakers
// ---------------------------------------------------------------------------
class TrackerAgent {
  constructor(bus) {
    this.bus = bus;
    this.circuitBreakers = new Map(); // sourceId -> { failures: 0, openUntil: 0, status: 'CLOSED' }
  }

  getCircuitState(sourceId) {
    if (!this.circuitBreakers.has(sourceId)) {
      this.circuitBreakers.set(sourceId, { failures: 0, openUntil: 0, status: 'CLOSED' });
    }
    return this.circuitBreakers.get(sourceId);
  }

  recordSuccess(sourceId) {
    const cb = this.getCircuitState(sourceId);
    cb.failures = 0;
    cb.status = 'CLOSED';
    cb.openUntil = 0;
    db.updateSourceStatus(sourceId, 'active', 0);
  }

  recordFailure(sourceId, err) {
    const cb = this.getCircuitState(sourceId);
    cb.failures += 1;
    // Jittered exponential backoff: min 5s, max 5m, plus 0-1000ms jitter
    const backoffMs = Math.min(300000, 5000 * Math.pow(2, Math.min(cb.failures, 6))) + Math.floor(Math.random() * 1000);
    cb.openUntil = Date.now() + backoffMs;

    if (cb.failures >= 5) {
      cb.status = 'OPEN';
      db.updateSourceStatus(sourceId, 'degraded', cb.failures);
      console.warn(`[TRACKER CIRCUIT BREAKER] Source ${sourceId} tripped OPEN. Cooling down for ${Math.round(backoffMs / 1000)}s. Error:`, err.message);
    } else {
      cb.status = 'DEGRADED';
      db.updateSourceStatus(sourceId, 'active', cb.failures);
    }
  }

  isSourceAvailable(sourceId) {
    const cb = this.getCircuitState(sourceId);
    if (cb.status === 'OPEN') {
      if (Date.now() > cb.openUntil) {
        cb.status = 'HALF_OPEN';
        return true; // Allow one probe request
      }
      return false;
    }
    return true;
  }

  async pollSource(source) {
    if (!this.isSourceAvailable(source.id)) {
      return [];
    }

    try {
      const xml = await fetchFeedHttp(source.url, 4000);
      const items = parseFeedXmlSafe(xml, source.name, source.category);
      this.recordSuccess(source.id);

      for (const item of items) {
        this.bus.emit(TOPIC_DISCOVERED, {
          rawItem: item,
          source: {
            id: source.id,
            name: source.name,
            credibilityWeight: source.credibility_weight || 1.0,
            category: source.category
          }
        });
      }

      return items;
    } catch (err) {
      this.recordFailure(source.id, err);
      return [];
    }
  }

  async pollAll() {
    const sources = db.getSources();
    const results = [];
    for (const src of sources) {
      const items = await this.pollSource(src);
      results.push(...items);
    }
    return results;
  }
}

// ---------------------------------------------------------------------------
// 2. PREDICTOR AGENT: Entity Extraction, Sentiment, Impact & Rationale
// ---------------------------------------------------------------------------
class PredictorAgent {
  constructor(bus) {
    this.bus = bus;
    this.bus.on(TOPIC_DISCOVERED, ({ rawItem, source }) => {
      this.analyzeAndPredict(rawItem, source);
    });
  }

  extractEntities(text) {
    const lower = text.toLowerCase();
    const matched = [];
    const matchedSymbols = new Set();

    for (const ent of TICKER_MAP) {
      for (const kw of ent.keywords) {
        const regex = new RegExp(`\\b${kw}\\b`, 'i');
        if (regex.test(lower) && !matchedSymbols.has(ent.symbol)) {
          matchedSymbols.add(ent.symbol);
          matched.push({
            entity_type: 'equity',
            symbol: ent.symbol,
            name: ent.name
          });
          break;
        }
      }
    }
    return matched;
  }

  classifySentiment(text) {
    const lower = text.toLowerCase();
    let bullScore = 0;
    let bearScore = 0;

    for (const kw of BULLISH_KEYWORDS) {
      if (lower.includes(kw)) bullScore += 1;
    }
    for (const kw of CAUTIONARY_KEYWORDS) {
      if (lower.includes(kw)) bearScore += 1;
    }

    if (bullScore > bearScore) {
      return { sentiment: 'bullish', expected_direction: 'up' };
    } else if (bearScore > bullScore) {
      return { sentiment: 'cautionary', expected_direction: 'down' };
    }
    return { sentiment: 'neutral', expected_direction: 'flat' };
  }

  calculateImpactScore(text, entityCount, credibilityWeight) {
    const lower = text.toLowerCase();
    let baseScore = 5;

    // High impact keyword inspection
    let highImpactMatches = 0;
    for (const kw of HIGH_IMPACT_KEYWORDS) {
      if (lower.includes(kw)) highImpactMatches += 1;
    }

    if (highImpactMatches >= 2) baseScore += 3;
    else if (highImpactMatches === 1) baseScore += 2;

    // Cross-ticker industry ripple effect
    if (entityCount >= 3) baseScore += 2;
    else if (entityCount >= 2) baseScore += 1;

    // Scale by source institutional credibility
    const weighted = Math.round(baseScore * credibilityWeight);
    return Math.max(1, Math.min(10, weighted));
  }

  analyzeAndPredict(rawItem, source) {
    const textToAnalyze = `${rawItem.title} ${rawItem.summary || ''}`;
    const entities = this.extractEntities(textToAnalyze);
    const { sentiment, expected_direction } = this.classifySentiment(textToAnalyze);
    const credibilityWeight = source.credibilityWeight || 1.0;
    const impactScore = this.calculateImpactScore(textToAnalyze, entities.length, credibilityWeight);

    // Calculate analytical confidence (0.60 to 0.95)
    let confidence = 0.70;
    if (entities.length > 0) confidence += 0.10;
    if (credibilityWeight >= 0.95) confidence += 0.10;
    if (impactScore >= 8) confidence += 0.05;
    confidence = Math.min(0.95, parseFloat(confidence.toFixed(2)));

    // Generate analytical rationale and why-it-matters assessment
    const tickerSummary = entities.length > 0
      ? `affecting key equities (${entities.map(e => e.symbol).join(', ')})`
      : 'with broad tech sector implications';

    const whyItMatters = `Significant institutional development ${tickerSummary}, expected to drive near-term capital reallocation and volatility.`;
    const rationale = `Calculated impact score ${impactScore}/10 (${sentiment} sentiment) based on institutional corroboration from ${source.name}.`;

    const predictedStory = {
      headline: rawItem.title,
      summary: rawItem.summary || rawItem.title,
      why_it_matters: whyItMatters,
      source_id: source.id,
      source_name: source.name,
      url: rawItem.url || 'https://www.sec.gov',
      category: source.category || 'market-shift',
      published_at: rawItem.publishedAt || new Date().toISOString(),
      impact_score: impactScore,
      sentiment,
      expected_direction,
      confidence,
      rationale,
      credibility_weight: credibilityWeight,
      entities,
      tickers: entities.map(e => e.symbol)
    };

    this.bus.emit(TOPIC_PREDICTED, predictedStory);
    return predictedStory;
  }
}

// ---------------------------------------------------------------------------
// 3. COMMANDER AGENT: Deduplication, Quality Gate & Atomic Commit
// ---------------------------------------------------------------------------
class CommanderAgent {
  constructor(bus) {
    this.bus = bus;
    this.bus.on(TOPIC_PREDICTED, (predictedStory) => {
      this.evaluateAndPublish(predictedStory);
    });
  }

  evaluateAndPublish(story) {
    const startTime = Date.now();

    // 1. Quality Gate: Source Credibility >= 0.70 AND Confidence >= 0.60
    const credibility = story.credibility_weight !== undefined ? story.credibility_weight : 1.0;
    const confidence = story.confidence || 0.0;

    if (credibility < 0.70 || confidence < 0.60) {
      console.warn(`[COMMANDER QUALITY GATE REJECT] Dropped low conviction story "${story.headline}" (cred: ${credibility}, conf: ${confidence})`);
      this.bus.emit(TOPIC_REJECTED, { story, reason: 'QUALITY_GATE_FAILURE' });
      db.recordAgentRun({
        agentName: 'CommanderAgent',
        runType: 'quality_gate',
        status: 'rejected',
        itemsProcessed: 1,
        itemsPublished: 0,
        startedAt: startTime,
        completedAt: Date.now(),
        errorDetails: `Dropped story: credibility=${credibility}, confidence=${confidence}`
      });
      return null;
    }

    // 2. Content Deduplication (Hash Check + Jaccard Title Similarity)
    const contentHash = crypto.createHash('sha256').update(story.headline + story.summary).digest('hex');
    const existingByHash = db.db.prepare('SELECT id FROM articles WHERE content_hash = ? LIMIT 1').get(contentHash);
    if (existingByHash) {
      console.log(`[COMMANDER DEDUP] Skipped duplicate story by hash: "${story.headline}"`);
      return null;
    }
    const existingRecent = db.getArticles({ limit: 30 });

    for (const recent of existingRecent) {
      if (titleSimilarity(story.headline, recent.headline) >= 0.70) {
        console.log(`[COMMANDER DEDUP] Skipped duplicate story: "${story.headline}" (matches "${recent.headline}")`);
        return null;
      }
    }

    // 3. Editorial Governance: Flag breaking stories
    const isBreaking = story.impact_score >= 8 || story.is_breaking ? 1 : 0;

    // 4. Atomic SQLite Commit
    const committedArticle = db.insertArticle({
      headline: story.headline,
      summary: story.summary,
      why_it_matters: story.why_it_matters,
      source_id: story.source_id,
      source_name: story.source_name,
      url: story.url,
      category: story.category,
      published_at: story.published_at,
      is_breaking: isBreaking,
      status: isBreaking ? 'breaking' : 'published',
      content_hash: contentHash,
      score: {
        impact_score: story.impact_score,
        sentiment: story.sentiment,
        expected_direction: story.expected_direction,
        confidence: story.confidence,
        rationale: story.rationale
      },
      entities: story.entities,
      tickers: story.tickers
    });

    // 5. Audit Logging
    db.recordAgentRun({
      agentName: 'CommanderAgent',
      runType: 'publish_story',
      status: 'success',
      itemsProcessed: 1,
      itemsPublished: 1,
      startedAt: startTime,
      completedAt: Date.now()
    });

    // 6. Real-time Dispatch
    this.bus.emit(TOPIC_COMMITTED, committedArticle);
    return committedArticle;
  }
}

// ---------------------------------------------------------------------------
// 4. NEWS ENGINE ORCHESTRATOR & SSE DISPATCHER
// ---------------------------------------------------------------------------
class NewsEngine {
  constructor() {
    this.bus = new EventEmitter();
    this.bus.setMaxListeners(100);

    this.tracker = new TrackerAgent(this.bus);
    this.predictor = new PredictorAgent(this.bus);
    this.commander = new CommanderAgent(this.bus);

    this.sseSubscribers = new Set();
    this.pollIntervalId = null;

    // Broadcast committed stories to all connected SSE clients
    this.bus.on(TOPIC_COMMITTED, (article) => {
      this.broadcast('news_story', article);
    });
  }

  /**
   * Runs a complete ingestion, prediction, and editorial cycle across all feeds.
   */
  async runCycle() {
    const startTime = Date.now();
    let publishedCount = 0;
    const onCommitted = () => { publishedCount++; };
    this.bus.on(TOPIC_COMMITTED, onCommitted);

    try {
      const items = await this.tracker.pollAll();
      this.bus.off(TOPIC_COMMITTED, onCommitted);
      db.recordAgentRun({
        agentName: 'NewsEngine',
        runType: 'batch_cycle',
        status: 'success',
        itemsProcessed: items.length,
        itemsPublished: publishedCount,
        startedAt: startTime,
        completedAt: Date.now()
      });
      return { success: true, count: items.length, published: publishedCount };
    } catch (err) {
      this.bus.off(TOPIC_COMMITTED, onCommitted);
      db.recordAgentRun({
        agentName: 'NewsEngine',
        runType: 'batch_cycle',
        status: 'failed',
        itemsProcessed: 0,
        itemsPublished: publishedCount,
        startedAt: startTime,
        completedAt: Date.now(),
        errorDetails: err.message
      });
      return { success: false, error: err.message, published: publishedCount };
    }
  }

  /**
   * Directly inject and process a verified story (e.g. from Python Newsroom or API webhook).
   */
  publishDirect(story) {
    return this.commander.evaluateAndPublish(story);
  }

  /**
   * Registers an active Server-Sent Events HTTP response stream.
   */
  subscribe(res) {
    this.sseSubscribers.add(res);
    res.on('close', () => {
      this.sseSubscribers.delete(res);
    });
  }

  unsubscribe(res) {
    this.sseSubscribers.delete(res);
  }

  /**
   * Broadcasts a JSON message formatted for text/event-stream.
   */
  broadcast(eventType, payload) {
    const data = JSON.stringify(payload);
    const message = `event: ${eventType}\ndata: ${data}\n\n`;

    for (const client of this.sseSubscribers) {
      try {
        client.write(message);
      } catch (err) {
        this.sseSubscribers.delete(client);
      }
    }
  }

  getStatus() {
    return {
      running: this.pollIntervalId !== null,
      subscribers: this.sseSubscribers.size,
      circuitBreakers: Array.from(this.tracker.circuitBreakers.entries()).map(([src, state]) => ({
        sourceId: src,
        status: state.status,
        failures: state.failures,
        openUntil: state.openUntil
      }))
    };
  }
}

// Singleton Engine Instance
const newsEngine = new NewsEngine();

module.exports = {
  newsEngine,
  NewsEngine,
  TrackerAgent,
  PredictorAgent,
  CommanderAgent,
  titleSimilarity,
  TOPIC_DISCOVERED,
  TOPIC_PREDICTED,
  TOPIC_COMMITTED,
  TOPIC_REJECTED
};
