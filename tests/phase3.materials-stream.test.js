const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('Phase 3: Materials HTML contains Live Intelligence Stream, Audio Briefing & Dossier UI Elements', async () => {
  const htmlPath = path.join(__dirname, '../public/materials.html');
  const html = fs.readFileSync(htmlPath, 'utf8');

  // Verify backward compatibility for repository assets & tests
  assert.ok(html.includes('Materials Repository'), 'Must contain Materials Repository heading');
  assert.ok(html.includes('Cloud Storage Quota'), 'Must contain Cloud Storage Quota metric');
  assert.ok(html.includes('id="materials-grid"'), 'Must contain materials-grid');
  assert.ok(html.includes('id="materials-table-body"'), 'Must contain materials-table-body');

  // Verify Phase 3 Live Stream Section
  assert.ok(html.includes('id="newsroom-stream-section"'), 'Must contain newsroom-stream-section');
  assert.ok(html.includes('class="stream-header-bar"'), 'Must contain stream-header-bar');
  assert.ok(html.includes('id="stream-status-pill"'), 'Must contain stream-status-pill');
  assert.ok(html.includes('id="btn-play-briefing"'), 'Must contain btn-play-briefing');
  assert.ok(html.includes('id="btn-force-refresh-news"'), 'Must contain btn-force-refresh-news');

  // Verify Breaking Alert Banner & Audio Player
  assert.ok(html.includes('id="breaking-alert-banner"'), 'Must contain breaking-alert-banner');
  assert.ok(html.includes('id="audio-briefing-bar"'), 'Must contain audio-briefing-bar');
  assert.ok(html.includes('id="audio-bars-viz"'), 'Must contain audio-bars-viz');

  // Verify Mode Tabs Switcher
  assert.ok(html.includes('id="tab-live-stream"'), 'Must contain tab-live-stream');
  assert.ok(html.includes('id="tab-saved-bookmarks"'), 'Must contain tab-saved-bookmarks');
  assert.ok(html.includes('id="tab-dossier-assets"'), 'Must contain tab-dossier-assets');

  // Verify Toolbar Filters
  assert.ok(html.includes('id="news-toolbar"'), 'Must contain news-toolbar');
  assert.ok(html.includes('id="news-search-input"'), 'Must contain news-search-input');
  assert.ok(html.includes('id="news-impact-select"'), 'Must contain news-impact-select');
  assert.ok(html.includes('id="news-ticker-pills"'), 'Must contain news-ticker-pills');
  assert.ok(html.includes('id="news-category-pills"'), 'Must contain news-category-pills');
  assert.ok(html.includes('id="news-sentiment-pills"'), 'Must contain news-sentiment-pills');

  // Verify Stream Cards Grid
  assert.ok(html.includes('id="news-stream-container"'), 'Must contain news-stream-container');

  // Verify Story Catalyst Dossier Modal
  assert.ok(html.includes('id="story-dossier-modal"'), 'Must contain story-dossier-modal');
  assert.ok(html.includes('id="dossier-modal-headline"'), 'Must contain dossier-modal-headline');
  assert.ok(html.includes('id="dossier-modal-rationale"'), 'Must contain dossier-modal-rationale');
  assert.ok(html.includes('id="dossier-provenance-grid"'), 'Must contain dossier-provenance-grid');
  assert.ok(html.includes('id="dossier-btn-jarvis"'), 'Must contain dossier-btn-jarvis');
});

test('Phase 3: Client Controller & CSS Styling Integrity', () => {
  const jsPath = path.join(__dirname, '../public/materials.js');
  const jsContent = fs.readFileSync(jsPath, 'utf8');

  // Verify client controller methods
  assert.ok(jsContent.includes('initNewsStream'), 'materials.js must define initNewsStream');
  assert.ok(jsContent.includes('connectNewsSSE'), 'materials.js must define connectNewsSSE');
  assert.ok(jsContent.includes('renderNewsFeed'), 'materials.js must define renderNewsFeed');
  assert.ok(jsContent.includes('toggleStoryBookmark'), 'materials.js must define toggleStoryBookmark');
  assert.ok(jsContent.includes('openStoryDossier'), 'materials.js must define openStoryDossier');
  assert.ok(jsContent.includes('startAudioBriefing'), 'materials.js must define startAudioBriefing');
  assert.ok(jsContent.includes('forceRefreshNews'), 'materials.js must define forceRefreshNews');

  const cssPath = path.join(__dirname, '../public/portal.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');

  // Verify key CSS rules
  assert.ok(cssContent.includes('.newsroom-stream-section'), 'portal.css must style newsroom-stream-section');
  assert.ok(cssContent.includes('.breaking-alert-banner'), 'portal.css must style breaking-alert-banner');
  assert.ok(cssContent.includes('.audio-briefing-bar'), 'portal.css must style audio-briefing-bar');
  assert.ok(cssContent.includes('.news-article-card'), 'portal.css must style news-article-card');
  assert.ok(cssContent.includes('.dossier-provenance-box'), 'portal.css must style dossier-provenance-box');
  assert.ok(cssContent.includes('.live-pulse-dot'), 'portal.css must style live-pulse-dot');
});

test('Phase 3: SSE Streaming Handshake & Keep-Alive Headers (/api/news/stream)', async () => {
  const streamRes = await new Promise((resolve, reject) => {
    const req = http.get(`${BASE_URL}/api/news/stream`, (res) => {
      resolve(res);
    });
    req.on('error', reject);
    req.setTimeout(4000, () => {
      req.destroy();
      resolve(null);
    });
  });

  assert.ok(streamRes, 'Server must respond to /api/news/stream');
  assert.strictEqual(streamRes.statusCode, 200, 'SSE stream must return status 200');

  const contentType = streamRes.headers['content-type'] || '';
  assert.ok(contentType.includes('text/event-stream'), 'Content-Type must be text/event-stream');

  const cacheControl = streamRes.headers['cache-control'] || '';
  assert.ok(cacheControl.includes('no-cache'), 'Cache-Control must be no-cache');

  // Collect initial handshake chunks
  const initialData = await new Promise((resolve) => {
    let chunks = '';
    streamRes.on('data', (chunk) => {
      chunks += chunk.toString();
      if (chunks.includes('event: connected') || chunks.length > 50) {
        streamRes.destroy();
        resolve(chunks);
      }
    });
    setTimeout(() => {
      streamRes.destroy();
      resolve(chunks);
    }, 1500);
  });

  assert.ok(
    initialData.includes('event: connected') || initialData.includes('handshake') || initialData.includes('ping') || initialData.length > 0,
    'SSE stream must emit initial connection handshake or data chunk'
  );
});

test('Phase 3: REST Intelligence API Querying & Provenance Retrieval (/api/news)', async () => {
  const res = await fetch(`${BASE_URL}/api/news`);
  assert.strictEqual(res.status, 200, 'GET /api/news must return 200 OK');

  const data = await res.json();
  const articles = data.articles || data.items || [];
  assert.ok(articles.length >= 7, `Expected at least 7 seeded stories, received ${articles.length}`);

  // Inspect the first article
  const firstArticle = articles[0];
  assert.ok(firstArticle.id, 'Article must have unique id');
  assert.ok(firstArticle.headline, 'Article must have headline');
  assert.ok(firstArticle.summary, 'Article must have summary');
  assert.ok(firstArticle.impact_score >= 1, 'Article must have valid impact score');
  assert.ok(firstArticle.sentiment, 'Article must have classified sentiment');

  // Inspect individual article detail endpoint
  const detailRes = await fetch(`${BASE_URL}/api/news/${firstArticle.id}`);
  assert.strictEqual(detailRes.status, 200, 'GET /api/news/:id must return 200 OK');
  const detailData = await detailRes.json();
  const articleObj = detailData.article || detailData.data || detailData;
  assert.strictEqual(articleObj.id, firstArticle.id);
  assert.ok(articleObj.provenance_sha256, 'Article must include provenance sha256 checksum');
});

test('Phase 3: Bookmarking Lifecycle & User Curation (/api/bookmarks)', async () => {
  // Authenticate first to acquire session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: 'alex.mercer@titan.corp',
      password: 'HostPass123!'
    })
  });
  assert.strictEqual(loginRes.status, 200, 'Host login must return 200');
  const sessionCookie = loginRes.headers.get('set-cookie')?.split(';')[0];
  assert.ok(sessionCookie, 'Must receive session cookie');

  // 1. Get initial bookmarks
  const listRes1 = await fetch(`${BASE_URL}/api/bookmarks`, {
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(listRes1.status, 200, 'GET /api/bookmarks must return 200 OK');
  const listData1 = await listRes1.json();
  const initialCount = (listData1.bookmarks || listData1.items || []).length;

  const testArticleId = 'art_nvda_export_001';

  // 2. Bookmark test article
  const addRes = await fetch(`${BASE_URL}/api/bookmarks`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({ article_id: testArticleId })
  });
  assert.strictEqual(addRes.status, 200, 'POST /api/bookmarks must return 200 OK');
  const addData = await addRes.json();
  assert.ok(addData.success, 'Bookmark toggle must succeed');

  // 3. Verify in bookmarks list
  const listRes2 = await fetch(`${BASE_URL}/api/bookmarks`, {
    headers: { 'Cookie': sessionCookie }
  });
  const listData2 = await listRes2.json();
  const bList = listData2.bookmarks || listData2.items || [];
  const found = bList.some(b => (b.article_id || b.id) === testArticleId);
  assert.ok(found, 'Bookmarked article must appear in bookmarks list');

  // 4. Toggle bookmark off
  const removeRes = await fetch(`${BASE_URL}/api/bookmarks`, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json',
      'Cookie': sessionCookie
    },
    body: JSON.stringify({ article_id: testArticleId })
  });
  assert.strictEqual(removeRes.status, 200);
  const removeData = await removeRes.json();
  assert.strictEqual(removeData.action, 'removed', 'Second toggle must remove bookmark');
});
