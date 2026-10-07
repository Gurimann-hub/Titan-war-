/**
 * TITAN WAR // KEYLESS REAL-TIME FINANCIAL & TECH NEWS AGGREGATOR
 * 
 * Production Security Standards:
 * 1. Zero Third-Party API Keys: Powered entirely by public Atom/RSS XML endpoints.
 * 2. SSRF Protection: Private, loopback, link-local, cloud metadata, and CGNAT IP validation.
 * 3. XXE Protection: Doctype/Entity stripping and safe regex XML node extraction.
 * 4. Resilient Multi-Tier Caching: In-memory TTL (5 minutes).
 * 5. Deterministic Offline Fallback: Curated institutional antitrust & compute intelligence.
 */

const http = require('http');
const https = require('https');
const dns = require('dns').promises;
const net = require('net');

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes cache

// Default public institutional RSS/Atom feeds (zero credentials required)
const DEFAULT_FEEDS = [
  {
    name: 'Yahoo Finance Tech Wire',
    category: 'Market Equities',
    url: 'https://finance.yahoo.com/news/rssindex'
  },
  {
    name: 'SEC EDGAR Real-Time Filings',
    category: 'Regulatory Dockets',
    url: 'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&type=10-K&count=15&output=atom'
  }
];

// Offline fallback dataset if internet or feeds are unreachable (deterministic fixed timestamps)
const FALLBACK_NEWS_ITEMS = [
  {
    id: 'news_fallback_1',
    title: 'NVIDIA B200 Hyperscaler Allocation Battle Accelerates as Cloud Margins Defend 75%',
    summary: 'Hyperscalers balance custom ASIC ramp against Blackwell deliveries as data center power constraints shift primary bottlenecks to substation hookups.',
    source: 'Financial Market Intelligence',
    url: 'https://finance.yahoo.com/quote/NVDA',
    publishedAt: '2026-09-09T12:00:00.000Z',
    category: 'Semiconductor',
    sentiment: 'bullish',
    mock: true
  },
  {
    id: 'news_fallback_2',
    title: 'Judge Mehta Remedies Proceedings: Chrome Divestiture Rejected; Distribution Contracts Under Injunction',
    summary: 'Department of Justice remedies phase focuses on non-exclusive partner revenue shares while court blocks mandatory Chrome browser breakup.',
    source: 'DOJ Litigation Docket',
    url: 'https://www.justice.gov/atr',
    publishedAt: '2026-09-09T11:00:00.000Z',
    category: 'Antitrust',
    sentiment: 'neutral',
    mock: true
  },
  {
    id: 'news_fallback_3',
    title: 'Amazon AWS Secures Multi-Gigawatt Nuclear Capacity to Fuel Enterprise Trainium2 Clusters',
    summary: 'Baseload energy contracts surge past $100/MWh as hyperscaler datacenter buildouts require co-located SMR and nuclear power generation.',
    source: 'Enterprise Cloud Intelligence',
    url: 'https://finance.yahoo.com/quote/AMZN',
    publishedAt: '2026-09-09T10:00:00.000Z',
    category: 'Datacenter & Energy',
    sentiment: 'bullish',
    mock: true
  },
  {
    id: 'news_fallback_4',
    title: 'Apple and European Commission Reach Preliminary Compliance Structure on €0.50 Core Technology Fee',
    summary: 'Executive Vice President Teresa Ribera signals alternative fee formulas for third-party marketplace operators under Digital Markets Act enforcement.',
    source: 'EU Competition Directorate',
    url: 'https://ec.europa.eu/competition',
    publishedAt: '2026-09-09T09:00:00.000Z',
    category: 'Antitrust',
    sentiment: 'cautionary',
    mock: true
  },
  {
    id: 'news_fallback_5',
    title: 'Meta Platforms Deploys Multimillion-Dollar Frontier RSU Grants to Retain Reasoning Model Scientists',
    summary: 'Talent compensation packages escalate across Silicon Valley as open-weights Llama infrastructure challenges closed proprietary APIs.',
    source: 'Frontier AI Research',
    url: 'https://finance.yahoo.com/quote/META',
    publishedAt: '2026-09-09T08:00:00.000Z',
    category: 'AI Talent',
    sentiment: 'bullish',
    mock: true
  }
];

let memoryCache = {
  timestamp: 0,
  items: []
};

// =========================================================================
// 1. SSRF MITIGATION: PRIVATE & LOOPBACK IP DETECTION
// =========================================================================

function isPrivateIp(ip) {
  if (!ip) return true;
  const clean = String(ip).trim().toLowerCase();

  // Handle IPv4-mapped IPv6 (e.g. ::ffff:127.0.0.1 or ::ffff:7f00:1)
  if (clean.startsWith('::ffff:') || clean.startsWith('0000:0000:0000:0000:0000:ffff:')) {
    const rest = clean.split('ffff:')[1];
    if (net.isIPv4(rest)) {
      return isPrivateIp(rest);
    }
    const hexParts = rest.split(':');
    if (hexParts.length === 2) {
      const p1 = parseInt(hexParts[0], 16);
      const p2 = parseInt(hexParts[1], 16);
      if (!isNaN(p1) && !isNaN(p2)) {
        const b1 = (p1 >> 8) & 0xff;
        const b2 = p1 & 0xff;
        const b3 = (p2 >> 8) & 0xff;
        const b4 = p2 & 0xff;
        return isPrivateIp(`${b1}.${b2}.${b3}.${b4}`);
      }
    }
    return true; // Block malformed mapped IPv6
  }

  // IPv4 Checks
  if (net.isIPv4(clean)) {
    const parts = clean.split('.').map(Number);
    // 0.0.0.0/8
    if (parts[0] === 0) return true;
    // 10.0.0.0/8
    if (parts[0] === 10) return true;
    // 100.64.0.0/10 (Carrier-Grade NAT RFC 6598: 100.64.0.0 - 100.127.255.255)
    if (parts[0] === 100 && parts[1] >= 64 && parts[1] <= 127) return true;
    // 127.0.0.0/8 (Loopback)
    if (parts[0] === 127) return true;
    // 169.254.0.0/16 (Link-Local & Cloud Metadata)
    if (parts[0] === 169 && parts[1] === 254) return true;
    // 172.16.0.0/12 (Private)
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    // 192.168.0.0/16 (Private)
    if (parts[0] === 192 && parts[1] === 168) return true;
    // Broadcast / Multicast (224.0.0.0+)
    if (parts[0] >= 224) return true;
    return false;
  }

  // IPv6 Checks
  if (net.isIPv6(clean)) {
    // :: (Unspecified)
    if (clean === '::' || clean === '0:0:0:0:0:0:0:0' || /^0+(::|:0+)*$/.test(clean)) return true;
    // ::1 (Loopback)
    if (clean === '::1' || clean === '0000:0000:0000:0000:0000:0000:0000:0001') return true;
    // fc00::/7 (Unique local)
    if (clean.startsWith('fc') || clean.startsWith('fd')) return true;
    // fe80::/10 (Link-local)
    if (clean.startsWith('fe8') || clean.startsWith('fe9') || clean.startsWith('fea') || clean.startsWith('feb') || clean.startsWith('fe80:')) return true;
    return false;
  }

  return true;
}

/**
 * Validates a feed URL against SSRF attacks before network dispatch.
 * @param {string} feedUrl 
 * @returns {Promise<{safe: boolean, reason?: string, ip?: string}>}
 */
async function validateFeedUrlSafe(feedUrl) {
  try {
    const parsed = new URL(feedUrl);
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
      return { safe: false, reason: 'Invalid protocol: only http/https allowed' };
    }

    const hostname = parsed.hostname.toLowerCase();
    if (hostname === 'localhost' || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
      return { safe: false, reason: 'Localhost and internal domains blocked' };
    }

    // Resolve DNS and check all returned IPs against private ranges
    const addresses = await dns.lookup(hostname, { all: true });
    for (const addr of addresses) {
      if (isPrivateIp(addr.address)) {
        return { safe: false, reason: `Resolved IP ${addr.address} belongs to blocked private/loopback range` };
      }
    }

    return { safe: true, ip: addresses[0]?.address };
  } catch (err) {
    return { safe: false, reason: `DNS resolution failed: ${err.message}` };
  }
}

// =========================================================================
// 2. XXE-SAFE XML PARSER (REGEX-BASED ZERO-ENTITY EXTRACTOR)
// =========================================================================

function stripEntitiesAndDoctype(xmlText) {
  if (!xmlText) return '';
  return xmlText
    .replace(/<!DOCTYPE[^>]*>/gi, '')
    .replace(/<!ENTITY[^>]*>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
}

function cleanText(raw) {
  if (!raw) return '';
  return raw
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseIsoDateSafe(rawDate) {
  if (!rawDate) return new Date().toISOString();
  try {
    const parsed = new Date(rawDate);
    if (isNaN(parsed.getTime())) {
      return new Date().toISOString();
    }
    return parsed.toISOString();
  } catch {
    return new Date().toISOString();
  }
}

function inferSentiment(text) {
  const lower = text.toLowerCase();
  const bullishKeywords = ['record', 'surge', 'growth', 'expands', 'beat', 'bullish', 'accelerates', 'all-time high', 'secures', 'deal'];
  const cautionaryKeywords = ['investigation', 'probe', 'subpoena', 'antitrust', 'decline', 'falls', 'loss', 'fine', 'remedies', 'drop', 'warning'];

  const bullHits = bullishKeywords.filter(k => lower.includes(k)).length;
  const bearHits = cautionaryKeywords.filter(k => lower.includes(k)).length;

  if (bullHits > bearHits) return 'bullish';
  if (bearHits > bullHits) return 'cautionary';
  return 'neutral';
}

/**
 * Parses Atom or RSS XML stream safely without invoking vulnerable XML entity evaluators.
 * @param {string} xmlText 
 * @param {string} defaultSource 
 * @param {string} defaultCategory 
 * @returns {Array<object>}
 */
function parseFeedXmlSafe(xmlText, defaultSource = 'RSS Feed', defaultCategory = 'Market Intel') {
  const sanitizedXml = stripEntitiesAndDoctype(xmlText);
  const items = [];

  // Match RSS <item>...</item>
  const rssItemRegex = /<item\b[^>]*>([\s\S]*?)<\/item>/gi;
  let match;

  while ((match = rssItemRegex.exec(sanitizedXml)) !== null) {
    const itemContent = match[1];
    const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(itemContent);
    const descMatch = /<(?:description|summary)\b[^>]*>([\s\S]*?)<\/(?:description|summary)>/i.exec(itemContent);
    const linkMatch = /<link\b[^>]*>([\s\S]*?)<\/link>/i.exec(itemContent);
    const dateMatch = /<(?:pubDate|dc:date)\b[^>]*>([\s\S]*?)<\/(?:pubDate|dc:date)>/i.exec(itemContent);

    const title = cleanText(titleMatch ? titleMatch[1] : '');
    const summary = cleanText(descMatch ? descMatch[1] : title);
    const link = (linkMatch ? linkMatch[1] : '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').trim();
    const rawDate = dateMatch ? cleanText(dateMatch[1]) : '';
    const pubDate = parseIsoDateSafe(rawDate);

    if (title) {
      items.push({
        id: `news_${Buffer.from(title.slice(0, 32)).toString('hex')}`,
        title,
        summary: summary || title,
        source: defaultSource,
        url: link.startsWith('http') ? link : 'https://finance.yahoo.com',
        publishedAt: pubDate,
        category: defaultCategory,
        sentiment: inferSentiment(title + ' ' + summary),
        mock: false
      });
    }
  }

  // If no RSS items found, check Atom <entry>...</entry>
  if (items.length === 0) {
    const atomEntryRegex = /<entry\b[^>]*>([\s\S]*?)<\/entry>/gi;
    while ((match = atomEntryRegex.exec(sanitizedXml)) !== null) {
      const entryContent = match[1];
      const titleMatch = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(entryContent);
      const summaryMatch = /<(?:summary|content)\b[^>]*>([\s\S]*?)<\/(?:summary|content)>/i.exec(entryContent);
      const linkMatch = /<link\b[^>]*href=["']([^"']+)["']/i.exec(entryContent);
      const updatedMatch = /<(?:updated|published)\b[^>]*>([\s\S]*?)<\/(?:updated|published)>/i.exec(entryContent);

      const title = cleanText(titleMatch ? titleMatch[1] : '');
      const summary = cleanText(summaryMatch ? summaryMatch[1] : title);
      const link = linkMatch ? linkMatch[1].trim() : '';
      const rawDate = updatedMatch ? cleanText(updatedMatch[1]) : '';
      const pubDate = parseIsoDateSafe(rawDate);

      if (title) {
        items.push({
          id: `news_${Buffer.from(title.slice(0, 32)).toString('hex')}`,
          title,
          summary: summary || title,
          source: defaultSource,
          url: link.startsWith('http') ? link : 'https://www.sec.gov',
          publishedAt: pubDate,
          category: defaultCategory,
          sentiment: inferSentiment(title + ' ' + summary),
          mock: false
        });
      }
    }
  }

  return items;
}

// =========================================================================
// 3. SECURE ASYNCHRONOUS FEED FETCHER
// =========================================================================

function fetchFeedHttp(url, timeoutMs = 4000, redirectCount = 0) {
  if (redirectCount > 3) {
    return Promise.reject(new Error('Too many redirects (max 3)'));
  }

  return validateFeedUrlSafe(url).then(check => {
    if (!check.safe) {
      throw new Error(`SSRF check failed: ${check.reason}`);
    }

    const pinnedIp = check.ip;
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const client = isHttps ? https : http;
    const userAgent = process.env.SEC_EDGAR_USER_AGENT || 'JARVIS-Dashboard contact@example.com';

    return new Promise((resolve, reject) => {
      const reqOptions = {
        protocol: parsed.protocol,
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + parsed.search,
        headers: {
          'User-Agent': userAgent,
          'Accept': 'application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.8'
        },
        timeout: timeoutMs
      };

      if (pinnedIp) {
        const family = net.isIPv6(pinnedIp) ? 6 : 4;
        reqOptions.lookup = (hostname, opts, cb) => {
          const callback = typeof opts === 'function' ? opts : cb;
          const options = (typeof opts === 'object' && opts !== null) ? opts : {};
          if (typeof callback === 'function') {
            if (options.all) {
              callback(null, [{ address: pinnedIp, family }]);
            } else {
              callback(null, pinnedIp, family);
            }
          }
        };
      }

      const req = client.get(reqOptions, (res) => {
        // Follow redirect (validate target hop and cap at 3)
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          try {
            const nextUrl = new URL(res.headers.location, url).toString();
            req.destroy();
            return fetchFeedHttp(nextUrl, timeoutMs, redirectCount + 1).then(resolve).catch(reject);
          } catch (e) {
            req.destroy();
            return reject(new Error(`Invalid redirect Location: ${res.headers.location}`));
          }
        }

        if (res.statusCode !== 200) {
          return reject(new Error(`Feed returned HTTP ${res.statusCode}`));
        }

        let data = '';
        res.on('data', chunk => {
          data += chunk;
          if (data.length > 512 * 1024) { // 512KB Max feed size
            req.destroy();
            resolve(data);
          }
        });
        res.on('end', () => resolve(data));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Feed request timed out'));
      });

      req.on('error', reject);
    });
  });
}

/**
 * Aggregates all configured public RSS feeds with SSRF and XXE guards, caching results.
 * @param {boolean} forceRefresh 
 * @returns {Promise<{cached: boolean, lastUpdated: string, items: Array<object>}>}
 */
async function getAggregatedNews(forceRefresh = false) {
  const now = Date.now();

  // Return cached result if still fresh
  if (!forceRefresh && memoryCache.items.length > 0 && (now - memoryCache.timestamp) < CACHE_TTL_MS) {
    return {
      cached: true,
      lastUpdated: new Date(memoryCache.timestamp).toISOString(),
      items: memoryCache.items
    };
  }

  const feeds = DEFAULT_FEEDS;
  const aggregated = [];

  for (const feed of feeds) {
    try {
      const xml = await fetchFeedHttp(feed.url);
      const parsedItems = parseFeedXmlSafe(xml, feed.name, feed.category);
      aggregated.push(...parsedItems);
    } catch (err) {
      console.warn(`[NEWS AGGREGATOR] Failed to fetch feed ${feed.name}:`, err.message);
    }
  }

  let finalItems;
  if (aggregated.length > 0) {
    finalItems = aggregated.slice(0, 20);
  } else {
    // Only fall back to synthetic offline items when live feeds fail or return nothing
    finalItems = FALLBACK_NEWS_ITEMS.map(i => ({ ...i, mock: true }));
  }

  // Update memory cache
  memoryCache = {
    timestamp: now,
    items: finalItems
  };

  return {
    cached: false,
    lastUpdated: new Date(now).toISOString(),
    items: finalItems
  };
}

module.exports = {
  getAggregatedNews,
  validateFeedUrlSafe,
  parseFeedXmlSafe,
  isPrivateIp,
  FALLBACK_NEWS_ITEMS
};
