const test = require('node:test');
const assert = require('node:assert');
const path = require('path');
const XLSX = require('xlsx');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
const dataDir = process.env.TITAN_DATA_DIR ? path.resolve(process.env.TITAN_DATA_DIR) : path.join(__dirname, '..', 'data');
const USERS_XLSX_PATH = path.join(dataDir, 'users.xlsx');

test('Excel Storage & Admin Gmail Approval Flow: Registration, Pending Staging, Rejection of Login, Admin Approval Push, and Container Verification', async () => {
  const nonce = Date.now();
  const externalUser = {
    name: `Field Applicant ${nonce}`,
    username: `applicant_${nonce}`,
    email: `applicant_${nonce}@titanwar.org`,
    password: 'SecurePassword#2026'
  };

  console.log(`\n======================================================`);
  console.log(`[TEST] 1. Registering new external user requiring Admin Gmail approval: ${externalUser.email}...`);

  // Step 1: Sign up user (External email -> Staged in PendingUsers sheet)
  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(externalUser)
  });

  assert.strictEqual(regRes.status, 201, 'Registration should return 201 Created');
  const regData = await regRes.json();
  assert.strictEqual(regData.success, true, 'Registration success flag should be true');
  assert.strictEqual(regData.status, 'pending_approval', 'Status must be pending_approval');
  assert.strictEqual(regData.requiresApproval, true, 'requiresApproval must be true');
  assert.ok(regData.approvalToken, 'Must generate cryptographic approval token');
  assert.strictEqual(regData.user.username, externalUser.username);
  assert.strictEqual(regData.user.email, externalUser.email);
  console.log(`[TEST] User staged in Pending container with Token: ${regData.approvalToken.slice(0, 15)}...`);

  // Step 2: Read users.xlsx directly to verify staging in PendingUsers sheet and absence from ApprovedUsers
  console.log(`[TEST] 2. Reading users.xlsx workbook from disk: ${USERS_XLSX_PATH}...`);
  const wb1 = XLSX.readFile(USERS_XLSX_PATH);
  assert.ok(wb1.SheetNames.includes('PendingUsers'), 'Workbook must contain PendingUsers sheet');
  assert.ok(wb1.SheetNames.includes('ApprovedUsers') || wb1.SheetNames.includes('Users'), 'Workbook must contain ApprovedUsers sheet');

  const pendingSheet1 = wb1.Sheets['PendingUsers'];
  const pendingUsers1 = XLSX.utils.sheet_to_json(pendingSheet1);
  const foundInPending1 = pendingUsers1.find(u => String(u.email).toLowerCase() === externalUser.email.toLowerCase());
  assert.ok(foundInPending1, 'Applicant must exist in PendingUsers sheet');
  assert.strictEqual(foundInPending1.username, externalUser.username);
  assert.ok(foundInPending1.password_hash.startsWith('$2'), 'Password hash must be salted bcrypt in PendingUsers');

  const approvedSheet1 = wb1.Sheets['ApprovedUsers'] || wb1.Sheets['Users'];
  const approvedUsers1 = XLSX.utils.sheet_to_json(approvedSheet1);
  const foundInApproved1 = approvedUsers1.find(u => String(u.email).toLowerCase() === externalUser.email.toLowerCase());
  assert.strictEqual(foundInApproved1, undefined, 'Applicant must NOT yet exist in ApprovedUsers container before admin approval');
  console.log(`[TEST] Verified: User is physically staged in PendingUsers sheet and blocked from ApprovedUsers sheet.`);

  // Step 3: Verify login is blocked while pending approval
  console.log(`[TEST] 3. Attempting login before administrator approval...`);
  const blockedLoginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: externalUser.email, password: externalUser.password })
  });
  assert.strictEqual(blockedLoginRes.status, 403, 'Login before approval must return 403 Forbidden');
  const blockedLoginData = await blockedLoginRes.json();
  assert.strictEqual(blockedLoginData.status, 'pending_approval');
  assert.strictEqual(blockedLoginData.pending, true);
  console.log(`[TEST] Login correctly blocked with status: ${blockedLoginData.status}. Message: "${blockedLoginData.message}"`);

  // Step 4: Check GET /api/auth/pending endpoint
  console.log(`[TEST] 4. Fetching pending users list via GET /api/auth/pending...`);
  const pendingListRes = await fetch(`${BASE_URL}/api/auth/pending`);
  assert.strictEqual(pendingListRes.status, 200);
  const pendingListData = await pendingListRes.json();
  assert.strictEqual(pendingListData.success, true);
  const foundInPendingApi = pendingListData.pendingUsers.find(u => u.email === externalUser.email);
  assert.ok(foundInPendingApi, 'User must appear in /api/auth/pending');
  assert.strictEqual(foundInPendingApi.approval_token, regData.approvalToken);

  // Step 5: Administrator accepts the user via POST /api/auth/approve
  console.log(`[TEST] 5. Administrator accepts application and pushes user into Approved container...`);
  const approveRes = await fetch(`${BASE_URL}/api/auth/approve`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token: regData.approvalToken, action: 'approve' })
  });
  assert.strictEqual(approveRes.status, 200, 'Approval must succeed with 200 OK');
  const approveData = await approveRes.json();
  assert.strictEqual(approveData.success, true);
  assert.strictEqual(approveData.status, 'approved');
  assert.ok(Array.isArray(approveData.recoveryCodes), 'Must generate recovery codes upon approval');
  assert.strictEqual(approveData.recoveryCodes.length, 8);
  console.log(`[TEST] User approved! Name: ${approveData.user.name}, ID: ${approveData.user.id}`);

  // Step 6: Verify physical file transition: removed from PendingUsers, added to ApprovedUsers
  console.log(`[TEST] 6. Verifying physical workbook transition in users.xlsx...`);
  const wb2 = XLSX.readFile(USERS_XLSX_PATH);
  const pendingSheet2 = wb2.Sheets['PendingUsers'];
  const pendingUsers2 = XLSX.utils.sheet_to_json(pendingSheet2);
  const foundInPending2 = pendingUsers2.find(u => String(u.email).toLowerCase() === externalUser.email.toLowerCase());
  assert.strictEqual(foundInPending2, undefined, 'User must be REMOVED from PendingUsers sheet after approval');

  const approvedSheet2 = wb2.Sheets['ApprovedUsers'] || wb2.Sheets['Users'];
  const approvedUsers2 = XLSX.utils.sheet_to_json(approvedSheet2);
  const foundInApproved2 = approvedUsers2.find(u => String(u.email).toLowerCase() === externalUser.email.toLowerCase());
  assert.ok(foundInApproved2, 'User must now exist in ApprovedUsers container');
  assert.strictEqual(foundInApproved2.status, 'active');
  assert.strictEqual(foundInApproved2.username, externalUser.username);
  console.log(`[TEST] Physical container migration verified! Stored in ApprovedUsers container.`);

  // Step 7: Login now succeeds and fetches credentials from ApprovedUsers container!
  console.log(`[TEST] 7. Logging in with credentials now that user is in ApprovedUsers container...`);
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity: externalUser.username, password: externalUser.password })
  });
  assert.strictEqual(loginRes.status, 200, 'Login must now succeed with 200 OK');
  const loginData = await loginRes.json();
  assert.strictEqual(loginData.success, true);
  assert.strictEqual(loginData.authenticated, true);
  assert.strictEqual(loginData.user.username, externalUser.username);
  assert.strictEqual(loginData.user.email, externalUser.email);
  assert.strictEqual(loginData.user.storageContainer, 'data/users.xlsx');
  console.log(`[TEST] Login successful! Fetched user: ${loginData.user.name} (@${loginData.user.username})`);

  // Step 8: Test storage stats endpoint GET /api/storage/info
  console.log(`[TEST] 8. Testing GET /api/storage/info returns dual container metrics...`);
  const infoRes = await fetch(`${BASE_URL}/api/storage/info`);
  assert.strictEqual(infoRes.status, 200);
  const infoData = await infoRes.json();
  assert.strictEqual(infoData.success, true);
  assert.ok(infoData.storage.totalApprovedUsers >= 1, 'Total approved users must be >= 1');
  assert.ok(Array.isArray(infoData.pendingUsers), 'Pending users array must be returned');

  console.log(`\n======================================================`);
  console.log(`[TEST] ALL ADMIN GMAIL AUTHENTICATION & CONTAINER TESTS PASSED!`);
  console.log(`======================================================\n`);
});

test('Internal Test Domain Registration: Auto-Approved directly into active container', async () => {
  const nonce = Date.now();
  const internalUser = {
    name: `Internal Officer ${nonce}`,
    username: `officer_${nonce}`,
    email: `officer_${nonce}@titan.internal`,
    password: 'InternalPassword#2026'
  };

  const regRes = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(internalUser)
  });

  assert.strictEqual(regRes.status, 201);
  const regData = await regRes.json();
  assert.strictEqual(regData.success, true);
  assert.strictEqual(regData.status, 'success');
  assert.strictEqual(regData.authenticated, true);
  assert.ok(Array.isArray(regData.recoveryCodes));
  assert.strictEqual(regData.recoveryCodes.length, 8);
});
