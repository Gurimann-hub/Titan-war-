const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');
const net = require('net');
const crypto = require('crypto');

function snapshotDir(dir) {
  if (!fs.existsSync(dir)) return {};
  const state = {};
  const entries = fs.readdirSync(dir);
  for (const f of entries) {
    const fullPath = path.join(dir, f);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const content = fs.readFileSync(fullPath);
        const hash = crypto.createHash('sha256').update(content).digest('hex');
        state[f] = {
          mtimeMs: stat.mtimeMs,
          mtime: stat.mtime.toISOString(),
          size: stat.size,
          sha256: hash
        };
      }
    } catch (e) {}
  }
  return state;
}

function verifyDirUnchanged(before, after, dirName) {
  const allKeys = Array.from(new Set([...Object.keys(before), ...Object.keys(after)])).sort();
  const deviations = [];
  for (const k of allKeys) {
    const b = before[k];
    const a = after[k];
    if (!b) {
      deviations.push(`File created in ${dirName}: ${k}`);
    } else if (!a) {
      deviations.push(`File deleted in ${dirName}: ${k}`);
    } else {
      if (b.sha256 !== a.sha256) {
        deviations.push(`File modified in ${dirName}: ${k} (sha256 before=${b.sha256} after=${a.sha256})`);
      }
      if (b.mtimeMs !== a.mtimeMs) {
        deviations.push(`File touched in ${dirName}: ${k} (mtime before=${b.mtime} after=${a.mtime})`);
      }
    }
  }
  return deviations;
}

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
  const permanentTitanDir = 'C:\\Users\\gurka\\.titan_data';
  
  // Snapshot C:\Users\gurka\.titan_data before any test execution
  const titanBeforeSnapshot = snapshotDir(permanentTitanDir);
  console.log(`[TEST HARNESS] Initial state of permanent ${permanentTitanDir}: ${Object.keys(titanBeforeSnapshot).length} files recorded.`);

  // Copy seeded templates into tempDir
  const sourceDataDir = process.env.TITAN_DATA_DIR || permanentTitanDir;
  const fallbackDataDir = path.join(__dirname, '..', 'data');
  const dirToCopy = fs.existsSync(sourceDataDir) ? sourceDataDir : fallbackDataDir;
  if (fs.existsSync(dirToCopy)) {
    fs.cpSync(dirToCopy, tempDir, { recursive: true });
  }

  const freePort = await getFreePort();
  const testUrl = `http://127.0.0.1:${freePort}`;

  let serverOutput = '';
  const serverProcess = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], {
    env: {
      ...process.env,
      PORT: String(freePort),
      TITAN_DATA_DIR: tempDir,
      NODE_ENV: 'test',
      MOCK_MODE: 'true'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  serverProcess.stdout.on('data', chunk => {
    serverOutput += chunk.toString();
  });
  serverProcess.stderr.on('data', chunk => {
    serverOutput += chunk.toString();
  });

  let exitCode = 1;
  try {
    await waitForServer(testUrl);

    // Verify server logged resolved TITAN_DATA_DIR and that it is strictly under os.tmpdir()
    const logMatch = serverOutput.match(/TITAN_DATA_DIR:\s*([^\r\n]+)/);
    if (!logMatch) {
      throw new Error(`Isolation check failed: Server did not log TITAN_DATA_DIR at startup.\nServer output:\n${serverOutput}`);
    }
    const resolvedPath = path.resolve(logMatch[1].trim());
    const expectedPrefix = path.resolve(os.tmpdir()).toLowerCase();
    if (!resolvedPath.toLowerCase().startsWith(expectedPrefix)) {
      throw new Error(`Isolation check failed: Server TITAN_DATA_DIR (${resolvedPath}) is not under os.tmpdir() (${expectedPrefix})`);
    }
    console.log(`[TEST HARNESS] Verified server TITAN_DATA_DIR is isolated under os.tmpdir(): ${resolvedPath}`);

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

    // Verify permanent C:\Users\gurka\.titan_data files are 100% unchanged
    const titanAfterSnapshot = snapshotDir(permanentTitanDir);
    const deviations = verifyDirUnchanged(titanBeforeSnapshot, titanAfterSnapshot, permanentTitanDir);
    if (deviations.length > 0) {
      console.error(`[ISOLATION BREACH] Files in ${permanentTitanDir} were modified during test run:`);
      deviations.forEach(d => console.error(`  - ${d}`));
      exitCode = 1;
    } else {
      console.log(`[ISOLATION VERIFIED] All files in ${permanentTitanDir} remained byte-for-byte unchanged across full test suite.`);
    }
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
