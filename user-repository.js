/**
 * TITAN WAR // USER REPOSITORY INTERFACE & EXCEL ADAPTER (users.xlsx)
 * 
 * Production Security & Reliability Standards (Brief 5.1):
 * 1. Interface abstraction: Swappable to SQLite / Postgres adapter.
 * 2. Excel safety: Atomic writes (temp file + rename), file lock against concurrent writes, daily backups.
 * 3. Secret hygiene: Password hashing via bcrypt (cost 12), plaintext never stored or logged.
 * 4. Progressive account lockout & recovery code single-use guarantees.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const XLSX = require('xlsx');

const DATA_DIR = process.env.TITAN_DATA_DIR ? path.resolve(process.env.TITAN_DATA_DIR) : path.join(__dirname, 'data');
const BACKUPS_DIR = path.join(DATA_DIR, 'backups');
const USERS_XLSX_PATH = path.join(DATA_DIR, 'users.xlsx');
const LOCK_FILE_PATH = path.join(DATA_DIR, 'users.xlsx.lock');

// In-process lock queue to prevent local concurrency conflicts
let localLockPromise = Promise.resolve();

class ExcelUserRepository {
  constructor(filePath = USERS_XLSX_PATH) {
    this.filePath = filePath;
    this.lockPath = LOCK_FILE_PATH;
    this.ensureDirectories();
  }

  ensureDirectories() {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(BACKUPS_DIR)) {
      fs.mkdirSync(BACKUPS_DIR, { recursive: true });
    }
  }

  /**
   * Acquire cross-process file lock with retry backoff and stale-lock recovery
   */
  async acquireLock(timeoutMs = 5000) {
    const startTime = Date.now();
    const staleThresholdMs = 10000;

    while (Date.now() - startTime < timeoutMs) {
      try {
        // wx flag: open for writing, fail if path exists
        const fd = fs.openSync(this.lockPath, 'wx');
        fs.writeSync(fd, JSON.stringify({ pid: process.pid, time: Date.now() }));
        fs.closeSync(fd);
        return;
      } catch (err) {
        if (err.code === 'EEXIST') {
          try {
            const stats = fs.statSync(this.lockPath);
            if (Date.now() - stats.mtimeMs > staleThresholdMs) {
              // Lock is stale from crashed process, remove and retry
              try { fs.unlinkSync(this.lockPath); } catch (_) {}
            }
          } catch (_) {}
          // Wait 30ms before retry
          await new Promise(r => setTimeout(r, 30));
        } else {
          throw err;
        }
      }
    }
    throw new Error('Timeout acquiring users.xlsx file lock');
  }

  releaseLock() {
    try {
      if (fs.existsSync(this.lockPath)) {
        fs.unlinkSync(this.lockPath);
      }
    } catch (_) {}
  }

  /**
   * Safe execution wrapper guaranteeing atomic lock acquisition and release
   */
  async withLock(action) {
    // Chain with local in-process queue
    const execute = async () => {
      await this.acquireLock();
      try {
        return await action();
      } finally {
        this.releaseLock();
      }
    };

    const nextPromise = localLockPromise.then(execute, execute);
    localLockPromise = nextPromise.catch(() => {});
    return nextPromise;
  }

  /**
   * Trigger daily backup if today's backup file doesn't already exist
   */
  maybePerformDailyBackup() {
    if (!fs.existsSync(this.filePath)) return;
    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const backupName = `users_${today}.xlsx`;
    const backupPath = path.join(BACKUPS_DIR, backupName);

    if (!fs.existsSync(backupPath)) {
      try {
        fs.copyFileSync(this.filePath, backupPath);
        console.log(`[USER REPOSITORY] Daily backup completed: ${backupName}`);
      } catch (err) {
        console.warn('[USER REPOSITORY] Daily backup failed:', err.message);
      }
    }
  }

  /**
   * Reads the Excel workbook or initializes a clean structure
   */
  readWorkbookRaw() {
    if (!fs.existsSync(this.filePath)) {
      return this.createEmptyWorkbook();
    }
    try {
      return XLSX.readFile(this.filePath, { cellDates: true });
    } catch (err) {
      console.error('[USER REPOSITORY] Error reading workbook, regenerating:', err.message);
      return this.createEmptyWorkbook();
    }
  }

  createEmptyWorkbook() {
    const wb = XLSX.utils.book_new();
    const usersWs = XLSX.utils.json_to_sheet([]);
    const recoveryWs = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, usersWs, 'Users');
    XLSX.utils.book_append_sheet(wb, recoveryWs, 'RecoveryCodes');
    return wb;
  }

  /**
   * Atomic write: writes to temp file first, then renames to target
   */
  writeWorkbookAtomic(wb) {
    const tempFile = `${this.filePath}.tmp.${process.pid}.${Date.now()}`;
    XLSX.writeFile(wb, tempFile, { bookType: 'xlsx' });
    fs.renameSync(tempFile, this.filePath);
    this.maybePerformDailyBackup();
  }

  getUsersFromWb(wb) {
    const ws = wb.Sheets['Users'];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  getRecoveryCodesFromWb(wb) {
    const ws = wb.Sheets['RecoveryCodes'];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  saveUsersAndRecovery(wb, users, recoveryCodes) {
    const usersWs = XLSX.utils.json_to_sheet(users);
    const recoveryWs = XLSX.utils.json_to_sheet(recoveryCodes);
    wb.Sheets['Users'] = usersWs;
    wb.Sheets['RecoveryCodes'] = recoveryWs;
    this.writeWorkbookAtomic(wb);
  }

  /**
   * Initialize user store and seed administrator account if empty
   */
  async init() {
    return this.withLock(async () => {
      this.maybePerformDailyBackup();
      const wb = this.readWorkbookRaw();
      let users = this.getUsersFromWb(wb);

      if (users.length === 0) {
        console.log('[USER REPOSITORY] Initializing empty users.xlsx with default Administrator...');
        const adminPassword = process.env.HOST_PASSWORD || 'HostPass123!';
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        const now = Date.now();

        const adminUser = {
          id: 'usr_94812',
          username: 'alex.mercer',
          email: 'alex.mercer@titan.corp',
          name: 'Alex Mercer',
          password_hash: passwordHash,
          role: 'admin',
          status: 'active',
          failed_attempts: 0,
          locked_until: 0,
          created_at: now,
          updated_at: now
        };
        users.push(adminUser);

        // Generate 8 recovery codes for the admin
        let recoveryCodes = this.getRecoveryCodesFromWb(wb);
        for (let i = 0; i < 8; i++) {
          const rawCode = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
          const codeHash = await bcrypt.hash(rawCode, 10);
          recoveryCodes.push({
            id: recoveryCodes.length + 1,
            user_id: adminUser.id,
            code_hash: codeHash,
            used: 0,
            created_at: now,
            used_at: 0
          });
        }

        this.saveUsersAndRecovery(wb, users, recoveryCodes);
      }
    });
  }

  async findByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => String(u.email || '').toLowerCase() === clean) || null;
  }

  async findByUsername(username) {
    if (!username) return null;
    const clean = String(username).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => String(u.username || '').toLowerCase() === clean) || null;
  }

  async findById(id) {
    if (!id) return null;
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => String(u.id) === String(id)) || null;
  }

  async findByIdentity(identity) {
    if (!identity) return null;
    const clean = String(identity).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => 
      String(u.email || '').toLowerCase() === clean || 
      String(u.username || '').toLowerCase() === clean ||
      String(u.id || '').toLowerCase() === clean
    ) || null;
  }

  async createUser({ username, email, password, name = '', role = 'user', status = 'active' }) {
    return this.withLock(async () => {
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanUsername = String(username).trim();
      const cleanName = name || cleanUsername;

      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);

      if (users.some(u => String(u.email || '').toLowerCase() === cleanEmail)) {
        const err = new Error('An account with this email address already exists.');
        err.code = 'EMAIL_EXISTS';
        throw err;
      }
      if (users.some(u => String(u.username || '').toLowerCase() === cleanUsername.toLowerCase())) {
        const err = new Error('This username is already registered.');
        err.code = 'USERNAME_EXISTS';
        throw err;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;
      const now = Date.now();

      const newUser = {
        id: userId,
        username: cleanUsername,
        email: cleanEmail,
        name: cleanName,
        password_hash: passwordHash,
        role: role === 'admin' ? 'admin' : 'user',
        status,
        failed_attempts: 0,
        locked_until: 0,
        created_at: now,
        updated_at: now
      };
      users.push(newUser);

      // Generate 8 emergency recovery codes
      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      const plainCodes = [];

      for (let i = 0; i < 8; i++) {
        const rawCode = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        plainCodes.push(rawCode);
        const codeHash = await bcrypt.hash(rawCode, 10);
        recoveryCodes.push({
          id: recoveryCodes.length + 1,
          user_id: userId,
          code_hash: codeHash,
          used: 0,
          created_at: now,
          used_at: 0
        });
      }

      this.saveUsersAndRecovery(wb, users, recoveryCodes);

      // Trigger optional outbound webhook
      this.dispatchOutboundRegistrationWebhook(newUser);

      return {
        user: {
          id: newUser.id,
          username: newUser.username,
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          status: newUser.status
        },
        recoveryCodes: plainCodes
      };
    });
  }

  async updateUser(id, updates) {
    return this.withLock(async () => {
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const index = users.findIndex(u => String(u.id) === String(id));
      if (index === -1) return null;

      const user = users[index];
      Object.assign(user, updates, { updated_at: Date.now() });
      users[index] = user;

      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      this.saveUsersAndRecovery(wb, users, recoveryCodes);
      return user;
    });
  }

  async verifyCredentials(identity, password) {
    const user = await this.findByIdentity(identity);
    if (!user) return null;

    const now = Date.now();
    if (user.locked_until && user.locked_until > now) {
      const remainingSeconds = Math.ceil((user.locked_until - now) / 1000);
      const lockErr = new Error(`Account temporarily locked. Try again in ${remainingSeconds} seconds.`);
      lockErr.isLocked = true;
      lockErr.remainingSeconds = remainingSeconds;
      throw lockErr;
    }

    if (user.status !== 'active') {
      const statusErr = new Error('Account suspended or pending review.');
      statusErr.status = user.status;
      throw statusErr;
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      await this.recordFailedAttempt(user.id);
      return null;
    }

    await this.resetFailedAttempts(user.id);
    return user;
  }

  async recordFailedAttempt(userId) {
    return this.withLock(async () => {
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const user = users.find(u => String(u.id) === String(userId));
      if (!user) return;

      const attempts = (Number(user.failed_attempts) || 0) + 1;
      const now = Date.now();
      let lockedUntil = 0;

      if (attempts >= 5) {
        const lockMinutes = attempts >= 10 ? 60 : 15;
        lockedUntil = now + (lockMinutes * 60 * 1000);
      }

      user.failed_attempts = attempts;
      user.locked_until = lockedUntil;
      user.updated_at = now;

      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      this.saveUsersAndRecovery(wb, users, recoveryCodes);
    });
  }

  async resetFailedAttempts(userId) {
    return this.withLock(async () => {
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const user = users.find(u => String(u.id) === String(userId));
      if (!user) return;

      user.failed_attempts = 0;
      user.locked_until = 0;
      user.updated_at = Date.now();

      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      this.saveUsersAndRecovery(wb, users, recoveryCodes);
    });
  }

  async verifyAndConsumeRecoveryCode(email, recoveryCode, newPassword) {
    return this.withLock(async () => {
      const cleanEmail = String(email).trim().toLowerCase();
      const cleanCode = String(recoveryCode).trim().toUpperCase();

      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const user = users.find(u => String(u.email || '').toLowerCase() === cleanEmail);
      if (!user) {
        throw new Error('No account found matching this email address.');
      }

      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      const userCodes = recoveryCodes.filter(c => String(c.user_id) === String(user.id) && Number(c.used) === 0);

      let matchedCode = null;
      for (const c of userCodes) {
        const valid = await bcrypt.compare(cleanCode, c.code_hash);
        if (valid) {
          matchedCode = c;
          break;
        }
      }

      if (!matchedCode) {
        throw new Error('Invalid or already consumed recovery code.');
      }

      // Burn code
      matchedCode.used = 1;
      matchedCode.used_at = Date.now();

      // Update password
      user.password_hash = await bcrypt.hash(newPassword, 12);
      user.failed_attempts = 0;
      user.locked_until = 0;
      user.updated_at = Date.now();

      this.saveUsersAndRecovery(wb, users, recoveryCodes);
      return { success: true, user };
    });
  }

  /**
   * Outbound signed webhook for new user registrations (Section 5.1)
   */
  dispatchOutboundRegistrationWebhook(user) {
    const webhookUrl = process.env.WEBHOOK_USER_REGISTER_URL;
    if (!webhookUrl) return; // Off by default

    const secret = process.env.WEBHOOK_SECRET || process.env.SESSION_SECRET || 'titan_webhook_secret';
    const payload = JSON.stringify({
      event: 'user.registered',
      timestamp: Date.now(),
      data: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.role
      }
    });

    const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');

    try {
      const url = new URL(webhookUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? require('https') : require('http');

      const req = client.request(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Titan-Signature': `sha256=${signature}`,
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 5000
      });

      req.on('error', (err) => {
        console.warn('[USER REPOSITORY] Webhook dispatch failed:', err.message);
      });
      req.write(payload);
      req.end();
    } catch (e) {
      console.warn('[USER REPOSITORY] Invalid webhook URL configuration:', e.message);
    }
  }
}

// Singleton repository instance
const userRepository = new ExcelUserRepository();

module.exports = {
  ExcelUserRepository,
  userRepository
};
