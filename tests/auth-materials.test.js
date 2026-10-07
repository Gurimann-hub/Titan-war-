const test = require('node:test');
const assert = require('node:assert');
const http = require('http');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('1. Authentication Gate Delivery (/login & /auth)', async () => {
  const res = await fetch(`${BASE_URL}/login`);
  assert.strictEqual(res.status, 200, 'GET /login should return 200 OK');
  const text = await res.text();
  assert.ok(text.includes('Sign In to Repository'), 'Login page must include sign-in title');
  assert.ok(text.includes('redirection-engine'), 'Login page must contain Automated Redirection Engine container');
  assert.ok(text.includes('circular-timer-container'), 'Login page must contain circular countdown timer');
  assert.ok(text.includes('linear-progress-fill'), 'Login page must contain linear progress bar');
  assert.ok(text.includes('manual-fallback-anchor'), 'Login page must contain manual fallback link anchor');
});

test('2. Server Route Guard on Unauthenticated Direct Access (/materials)', async () => {
  // Test direct entry without authentication cookie
  const res = await fetch(`${BASE_URL}/materials`, {
    redirect: 'manual'
  });

  assert.strictEqual(res.status, 302, 'Unauthenticated /materials access must redirect with 302');
  const location = res.headers.get('location');
  assert.ok(location.includes('/login?returnUrl=/materials'), 'Redirect location must point to /login with returnUrl');

  const cacheHeader = res.headers.get('cache-control') || '';
  assert.ok(cacheHeader.includes('no-store'), 'Route guard redirect must enforce no-store cache control');
});

test('3. API Authentication Validation & Reject Invalid Submissions', async () => {
  // Missing fields
  const emptyRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
  assert.strictEqual(emptyRes.status, 400, 'Empty submission should return 400');

  // Short password (< 8 chars)
  const shortPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'alex.mercer@titan.corp', password: '123' })
  });
  assert.strictEqual(shortPassRes.status, 400, 'Short password should return 400');

  // Wrong password
  const wrongPassRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: 'alex.mercer@titan.corp', password: 'WrongPassword999!' })
  });
  assert.strictEqual(wrongPassRes.status, 401, 'Invalid password should return 401');
});

test('4. Successful Host Sign-In & Verification Payload Confirmation', async () => {
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      identity: 'alex.mercer@titan.corp',
      password: 'HostPass123!',
      rememberMe: true
    })
  });

  assert.strictEqual(loginRes.status, 200, 'Valid host sign-in must return 200 OK');
  const data = await loginRes.json();

  assert.strictEqual(data.status, 'success', 'Status must be success');
  assert.strictEqual(data.authenticated, true, 'authenticated flag must be true');
  assert.strictEqual(data.user.id, 'usr_94812', 'Host id must match usr_94812');
  assert.strictEqual(data.user.name, 'Alex Mercer', 'Host name must be Alex Mercer');
  assert.strictEqual(data.user.role, 'host', 'Host role must be host');
  assert.strictEqual(data.redirectTo, '/materials', 'redirectTo must be /materials');
  assert.ok(data.timestamp, 'Response must include ISO timestamp');

  // Check Set-Cookie
  const setCookie = loginRes.headers.get('set-cookie') || '';
  assert.ok(setCookie.includes('titan_session='), 'Response must issue titan_session cookie');
  assert.ok(setCookie.includes('HttpOnly'), 'Session cookie must be HttpOnly');

  // Extract session cookie for subsequent authenticated tests
  const sessionCookie = setCookie.split(';')[0];

  // Test 5: Verify /api/auth/session with issued cookie
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(sessionRes.status, 200, 'GET /api/auth/session with cookie should return 200');
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.authenticated, true);
  assert.strictEqual(sessionData.user.name, 'Alex Mercer');

  // Test 6: Access /materials WITH cookie passes Route Guard
  const materialsPageRes = await fetch(`${BASE_URL}/materials`, {
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(materialsPageRes.status, 200, 'Authenticated /materials access must return 200 OK');
  const pageHtml = await materialsPageRes.text();
  assert.ok(pageHtml.includes('Materials Repository'), 'Page must contain Materials Repository heading');
  assert.ok(pageHtml.includes('Cloud Storage Quota'), 'Page must contain Storage Metric widget');

  const matCacheHeader = materialsPageRes.headers.get('cache-control') || '';
  assert.ok(matCacheHeader.includes('no-store'), 'Protected materials page must enforce no-store header');

  // Test 7: GET /api/materials catalog listing
  const catalogRes = await fetch(`${BASE_URL}/api/materials`, {
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(catalogRes.status, 200, 'GET /api/materials should return 200');
  const catalogData = await catalogRes.json();
  assert.ok(catalogData.total >= 10, 'Repository must contain at least 10 assets');
  assert.ok(catalogData.storage, 'Repository must include storage metrics');
  assert.ok(catalogData.storage.usedFormatted, 'Storage metric must have human-readable format');

  // Test 8: Filter by category & search query
  const searchRes = await fetch(`${BASE_URL}/api/materials?query=Antitrust`, {
    headers: { 'Cookie': sessionCookie }
  });
  const searchData = await searchRes.json();
  assert.ok(searchData.materials.length > 0, 'Search query should return matching items');
  assert.ok(searchData.materials[0].title.includes('Antitrust'));

  // Test 9: Download asset endpoint
  const downloadRes = await fetch(`${BASE_URL}/api/materials/download/mat_001`, {
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(downloadRes.status, 200, 'Download endpoint should return 200 OK');
  const disposition = downloadRes.headers.get('content-disposition') || '';
  assert.ok(disposition.includes('attachment; filename='), 'Download must have attachment header');
  const downloadText = await downloadRes.text();
  assert.ok(downloadText.includes('TITAN WAR'), 'Downloaded file content must be populated');

  // Test 10: Session Logout
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Cookie': sessionCookie }
  });
  assert.strictEqual(logoutRes.status, 200, 'Logout should return 200');
  const logoutCookie = logoutRes.headers.get('set-cookie') || '';
  assert.ok(logoutCookie.includes('Max-Age=0'), 'Logout must expire cookie with Max-Age=0');
});
