const test = require('node:test');
const assert = require('node:assert');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

test('Phase 1 Auth: Seeded Admin Login & Session Generation', async () => {
  // Test invalid login
  const badLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alex.mercer@titan.corp', password: 'WrongPassword' })
  });
  assert.strictEqual(badLoginRes.status, 401, 'Wrong password must return 401');
  const badLoginData = await badLoginRes.json();
  assert.strictEqual(badLoginData.success, false);

  // Test successful admin login
  const adminPass = process.env.HOST_PASSWORD || 'HostPass123!';
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'alex.mercer@titan.corp', password: adminPass })
  });
  assert.strictEqual(loginRes.status, 200, 'Admin login should succeed');
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true);
  assert.strictEqual(loginData.user.role, 'admin');

  // Verify Set-Cookie header contains titan_session with HttpOnly and SameSite
  const setCookie = loginRes.headers.get('set-cookie');
  assert.ok(setCookie, 'set-cookie header must be present');
  assert.ok(setCookie.includes('titan_session='), 'titan_session cookie must be set');
  assert.ok(setCookie.includes('HttpOnly'), 'Cookie must be HttpOnly');
  assert.ok(setCookie.includes('SameSite=Lax'), 'Cookie must be SameSite=Lax');

  // Extract session token from cookie
  const cookieMatch = setCookie.match(/titan_session=([^;]+)/);
  const sessionToken = cookieMatch ? cookieMatch[1] : null;
  assert.ok(sessionToken, 'Extracted session token');

  // Verify GET /api/auth/session validates cookie
  const sessionRes = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Cookie': `titan_session=${sessionToken}` }
  });
  assert.strictEqual(sessionRes.status, 200);
  const sessionData = await sessionRes.json();
  assert.strictEqual(sessionData.authenticated, true);
  assert.strictEqual(sessionData.user.email, 'alex.mercer@titan.corp');

  // Verify POST /api/auth/logout revokes session
  const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, {
    method: 'POST',
    headers: { 'Cookie': `titan_session=${sessionToken}` }
  });
  assert.strictEqual(logoutRes.status, 200);

  // Subsequent check should be unauthenticated
  const sessionAfterLogout = await fetch(`${BASE_URL}/api/auth/session`, {
    headers: { 'Cookie': `titan_session=${sessionToken}` }
  });
  assert.strictEqual(sessionAfterLogout.status, 401);
});

test('Phase 1 Auth: Offline Registration & Emergency Recovery Codes', async () => {
  const nonce = Date.now();
  const testUser = `analyst_${nonce}@titan.internal`;
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `Agent_${nonce}`,
      email: testUser,
      password: 'HardenPassword#2026'
    })
  });

  assert.strictEqual(regRes.status, 201, 'Registration should return 201 Created');
  const regData = await regRes.json();
  assert.strictEqual(regData.success, true);
  assert.ok(Array.isArray(regData.recoveryCodes), 'Must return 8 recovery codes');
  assert.strictEqual(regData.recoveryCodes.length, 8, 'Must return exactly 8 recovery codes');

  const recoveryCode = regData.recoveryCodes[0];
  assert.match(recoveryCode, /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Recovery code format must match XXXX-XXXX-XXXX');

  // Use recovery code to reset password
  const recoverRes = await fetch(`${BASE_URL}/api/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser,
      recoveryCode: recoveryCode,
      newPassword: 'BrandNewPassword#999'
    })
  });
  assert.strictEqual(recoverRes.status, 200, 'Password recovery with code should succeed');
  const recoverData = await recoverRes.json();
  assert.strictEqual(recoverData.success, true);

  // Attempting to reuse the exact same recovery code must fail (single-use)
  const reuseRes = await fetch(`${BASE_URL}/api/auth/recover`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: testUser,
      recoveryCode: recoveryCode,
      newPassword: 'AnotherPassword#888'
    })
  });
  assert.strictEqual(reuseRes.status, 400, 'Reusing burned recovery code must fail');

  // Login with new password should now succeed
  const loginNewRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: testUser, password: 'BrandNewPassword#999' })
  });
  assert.strictEqual(loginNewRes.status, 200, 'Login with new password must succeed');
});

test('Phase 1 Auth: Account Lockout After 5 Failed Attempts', async () => {
  const nonce = Date.now();
  const targetEmail = `lockout_${nonce}@titan.internal`;
  // Create user
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `Target_${nonce}`,
      email: targetEmail,
      password: 'CorrectPassword#123'
    })
  });
  assert.strictEqual(regRes.status, 201, 'User creation for lockout test must succeed');

  // Attempt 5 incorrect logins
  for (let i = 1; i <= 5; i++) {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: targetEmail, password: 'WrongPassword' })
    });
    assert.strictEqual(res.status, 401, `Failed attempt ${i} should return 401`);
  }

  // 6th attempt should be locked out (423 Locked)
  const lockedRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: targetEmail, password: 'WrongPassword' })
  });
  assert.strictEqual(lockedRes.status, 423, '6th attempt must be locked out with 423');
  const lockedData = await lockedRes.json();
  assert.ok(lockedData.message.includes('locked'), 'Lockout message must be returned');
});
