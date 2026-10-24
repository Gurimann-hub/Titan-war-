const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');

async function getFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const port = srv.address().port;
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

async function waitForServer(url, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`${url}/api/bot/status`);
      if (res.ok) return true;
    } catch (e) {
      // retry
    }
    await new Promise(r => setTimeout(r, 150));
  }
  throw new Error(`Server failed to start at ${url} within ${timeoutMs}ms`);
}

async function main() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'titan-test-harness-'));
  
  // Copy seeded templates (e.g., users.xlsx) into tempDir so Excel auth tests work in isolation
  const sourceDataDir = process.env.TITAN_DATA_DIR || 'C:\\Users\\gurka\\.titan_data';
  const fallbackDataDir = path.join(__dirname, '..', 'data');
  const dirToCopy = fs.existsSync(sourceDataDir) ? sourceDataDir : fallbackDataDir;
  if (fs.existsSync(dirToCopy)) {
    fs.cpSync(dirToCopy, tempDir, { recursive: true });
  }

  const freePort = await getFreePort();
  const testUrl = `http://127.0.0.1:${freePort}`;

  const serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(freePort),
      TITAN_DATA_DIR: tempDir,
      NODE_ENV: 'test',
      MOCK_MODE: 'true'
    },
    stdio: 'ignore'
  });

  let exitCode = 1;
  try {
    await waitForServer(testUrl);

    const testsDir = path.join(__dirname, '..', 'tests');
    const allFiles = fs.readdirSync(testsDir)
      .filter(f => (f.endsWith('.test.js') || f.endsWith('-auth.js')) && !f.includes('playwright'))
      .sort()
      .map(f => path.join('tests', f));

    console.log(`[TEST HARNESS] Spawning automated server at ${testUrl}...`);
    console.log(`[TEST HARNESS] Isolated test data directory: ${tempDir}`);
    console.log(`[TEST HARNESS] Executing ${allFiles.length} test suites:`);
    allFiles.forEach(f => console.log(`  - ${f}`));

    const testProcess = spawnSync(process.execPath, ['--test', ...allFiles], {
      cwd: path.join(__dirname, '..'),
      env: {
        ...process.env,
        PORT: String(freePort),
        TEST_URL: testUrl,
        TITAN_DATA_DIR: tempDir,
        NODE_ENV: 'test'
      },
      stdio: 'inherit'
    });

    exitCode = testProcess.status ?? (testProcess.error ? 1 : 0);
  } catch (err) {
    console.error('[TEST HARNESS ERROR]', err.message);
    exitCode = 1;
  } finally {
    try {
      serverProcess.kill('SIGTERM');
    } catch (e) {}
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch (e) {}
    process.exit(exitCode);
  }
}

main();
