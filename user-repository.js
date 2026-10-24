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

/**
 * Constant-time string comparison preventing timing side-channel attacks
 */
function safeTokenCompare(providedToken, storedToken) {
  if (!providedToken || !storedToken) return false;
  const a = String(providedToken).trim();
  const b = String(storedToken).trim();
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

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
    const pendingWs = XLSX.utils.json_to_sheet([]);
    const recoveryWs = XLSX.utils.json_to_sheet([]);
    XLSX.utils.book_append_sheet(wb, usersWs, 'Users');
    XLSX.utils.book_append_sheet(wb, usersWs, 'ApprovedUsers');
    XLSX.utils.book_append_sheet(wb, pendingWs, 'PendingUsers');
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
    const ws = wb.Sheets['ApprovedUsers'] || wb.Sheets['Users'];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  getPendingUsersFromWb(wb) {
    const ws = wb.Sheets['PendingUsers'];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  getRecoveryCodesFromWb(wb) {
    const ws = wb.Sheets['RecoveryCodes'];
    if (!ws) return [];
    return XLSX.utils.sheet_to_json(ws);
  }

  saveUsersAndRecovery(wb, users, recoveryCodes, pendingUsers = null) {
    const usersWs = XLSX.utils.json_to_sheet(users);
    const recoveryWs = XLSX.utils.json_to_sheet(recoveryCodes);
    wb.Sheets['Users'] = usersWs;
    wb.Sheets['ApprovedUsers'] = usersWs;
    wb.Sheets['RecoveryCodes'] = recoveryWs;
    if (pendingUsers !== null) {
      wb.Sheets['PendingUsers'] = XLSX.utils.json_to_sheet(pendingUsers);
    } else if (!wb.Sheets['PendingUsers']) {
      wb.Sheets['PendingUsers'] = XLSX.utils.json_to_sheet([]);
    }
    if (!wb.SheetNames.includes('Users')) wb.SheetNames.push('Users');
    if (!wb.SheetNames.includes('ApprovedUsers')) wb.SheetNames.push('ApprovedUsers');
    if (!wb.SheetNames.includes('PendingUsers')) wb.SheetNames.push('PendingUsers');
    if (!wb.SheetNames.includes('RecoveryCodes')) wb.SheetNames.push('RecoveryCodes');
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
      const adminEmail = (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'guri.mann.2307@gmail.com').trim();

      if (users.length === 0) {
        console.log(`[USER REPOSITORY] Initializing empty users.xlsx with default Administrator (${adminEmail})...`);
        const adminPassword = process.env.HOST_PASSWORD || 'HostPass123!';
        const passwordHash = await bcrypt.hash(adminPassword, 12);
        const now = Date.now();

        const adminUser = {
          Id: 'usr_94812',
          id: 'usr_94812',
          Username: 'guri.mann',
          username: 'guri.mann',
          Email: adminEmail,
          email: adminEmail,
          Name: 'Guri Mann',
          name: 'Guri Mann',
          PasswordHash: passwordHash,
          password_hash: passwordHash,
          Role: 'admin',
          role: 'admin',
          Status: 'active',
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
      } else {
        // If placeholder alex.mercer exists, migrate administrator identity to real admin email
        let updated = false;
        users.forEach(u => {
          if ((u.id === 'usr_94812' || u.Id === 'usr_94812') || String(u.email || u.Email || '').toLowerCase() === 'alex.mercer@titan.corp') {
            u.Email = adminEmail;
            u.email = adminEmail;
            u.Name = 'Guri Mann';
            u.name = 'Guri Mann';
            u.Username = 'guri.mann';
            u.username = 'guri.mann';
            updated = true;
          }
        });
        if (updated) {
          const recoveryCodes = this.getRecoveryCodesFromWb(wb);
          this.saveUsersAndRecovery(wb, users, recoveryCodes);
          console.log(`[USER REPOSITORY] Updated administrator identity in users.xlsx to: ${adminEmail}`);
        }
      }
    });
  }

  async findByEmail(email) {
    if (!email) return null;
    const clean = String(email).trim().toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'guri.mann.2307@gmail.com').trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => {
      const e = String(u.Email || u.email || '').toLowerCase();
      if (e === clean) return true;
      if (clean === 'alex.mercer@titan.corp' && (e === adminEmail || String(u.id || u.Id) === 'usr_94812')) return true;
      return false;
    }) || null;
  }

  async findByUsername(username) {
    if (!username) return null;
    const clean = String(username).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => {
      const un = String(u.Username || u.username || '').toLowerCase();
      if (un === clean) return true;
      if (clean === 'alex.mercer' && (un === 'guri.mann' || String(u.id || u.Id) === 'usr_94812')) return true;
      return false;
    }) || null;
  }

  async findById(id) {
    if (!id) return null;
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => String(u.Id || u.id) === String(id)) || null;
  }

  async findByIdentity(identity) {
    if (!identity) return null;
    const clean = String(identity).trim().toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'guri.mann.2307@gmail.com').trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => {
      const e = String(u.Email || u.email || '').toLowerCase();
      const un = String(u.Username || u.username || '').toLowerCase();
      const id = String(u.Id || u.id || '').toLowerCase();
      if (e === clean || un === clean || id === clean) return true;
      if ((clean === 'alex.mercer@titan.corp' || clean === 'alex.mercer') && (e === adminEmail || id === 'usr_94812')) return true;
      return false;
    }) || null;
  }

  findByIdentitySync(identity) {
    if (!identity) return null;
    const clean = String(identity).trim().toLowerCase();
    const adminEmail = (process.env.ADMIN_EMAIL || process.env.GMAIL_USER || 'guri.mann.2307@gmail.com').trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.find(u => {
      const e = String(u.Email || u.email || '').toLowerCase();
      const un = String(u.Username || u.username || '').toLowerCase();
      const id = String(u.Id || u.id || '').toLowerCase();
      if (e === clean || un === clean || id === clean) return true;
      if ((clean === 'alex.mercer@titan.corp' || clean === 'alex.mercer') && (e === adminEmail || id === 'usr_94812')) return true;
      return false;
    }) || null;
  }

  getAllUsersSafe() {
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    return users.map(u => ({
      id: u.id,
      username: u.username,
      name: u.name || u.username,
      email: u.email,
      role: u.role || 'user',
      status: u.status || 'active',
      created_at: u.created_at,
      failed_attempts: u.failed_attempts || 0
    }));
  }

  findPendingByIdentitySync(identity) {
    if (!identity) return null;
    const clean = String(identity).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const pending = this.getPendingUsersFromWb(wb);
    return pending.find(u => 
      String(u.email || '').toLowerCase() === clean || 
      String(u.username || '').toLowerCase() === clean ||
      String(u.id || '').toLowerCase() === clean
    ) || null;
  }

  async findPendingByIdentity(identity) {
    if (!identity) return null;
    const clean = String(identity).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const pending = this.getPendingUsersFromWb(wb);
    return pending.find(u => 
      String(u.email || '').toLowerCase() === clean || 
      String(u.username || '').toLowerCase() === clean ||
      String(u.id || '').toLowerCase() === clean
    ) || null;
  }

  async findPendingByToken(token) {
    if (!token) return null;
    const clean = String(token).trim();
    const wb = this.readWorkbookRaw();
    const pending = this.getPendingUsersFromWb(wb);
    return pending.find(u => {
      const stored = u.ApprovalToken || u.approval_token || '';
      return safeTokenCompare(clean, stored);
    }) || null;
  }

  getAllPendingUsers() {
    const wb = this.readWorkbookRaw();
    const pending = this.getPendingUsersFromWb(wb);
    return pending.map(u => ({
      id: u.Id || u.id,
      name: u.Name || u.name || u.username,
      username: u.Username || u.username,
      email: u.Email || u.email,
      role: u.Role || u.role || 'user',
      status: u.Status || u.status || 'pending',
      approval_token: u.ApprovalToken || u.approval_token,
      requested_at: u.RequestedAt || u.requested_at,
      token_expiry: u.TokenExpiry || u.token_expiry
    }));
  }

  /**
   * Helper to check user status by email across Approved and Pending containers
   */
  async getUserStatus(email) {
    if (!email) return { status: 'unknown' };
    const cleanEmail = String(email).trim().toLowerCase();
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    const pendingUsers = this.getPendingUsersFromWb(wb);

    const approved = users.find(u => String(u.Email || u.email || '').toLowerCase() === cleanEmail);
    if (approved) {
      return {
        status: 'approved',
        approved: true,
        user: {
          name: approved.Name || approved.name,
          email: approved.Email || approved.email,
          role: approved.Role || approved.role,
          approvedAt: approved.ApprovedAt || approved.approved_at
        }
      };
    }

    const pending = pendingUsers.find(u => String(u.Email || u.email || '').toLowerCase() === cleanEmail);
    if (pending) {
      return {
        status: 'pending',
        pending: true,
        user: {
          name: pending.Name || pending.name,
          email: pending.Email || pending.email,
          requestedAt: pending.RequestedAt || pending.requested_at
        }
      };
    }

    return { status: 'unknown', approved: false, pending: false };
  }

  getStorageStats() {
    const exists = fs.existsSync(this.filePath);
    let size = 0;
    let mtime = null;
    if (exists) {
      const stat = fs.statSync(this.filePath);
      size = stat.size;
      mtime = stat.mtime;
    }
    const wb = this.readWorkbookRaw();
    const users = this.getUsersFromWb(wb);
    const pending = this.getPendingUsersFromWb(wb);
    const recovery = this.getRecoveryCodesFromWb(wb);
    return {
      filePath: 'data/users.xlsx',
      absolutePath: this.filePath,
      exists,
      fileSizeBytes: size,
      fileSizeFormatted: `${(size / 1024).toFixed(1)} KB`,
      lastModified: mtime ? mtime.toISOString() : null,
      sheets: wb.SheetNames || ['ApprovedUsers', 'PendingUsers', 'RecoveryCodes'],
      totalUsers: users.length,
      totalApprovedUsers: users.length,
      totalPendingUsers: pending.length,
      totalRecoveryCodes: recovery.length,
      activeUsers: users.filter(u => (u.Status || u.status) === 'active').length
    };
  }

  /**
   * Creates a user in the PendingUsers sheet awaiting administrator approval
   * Required columns: Name, Email, PasswordHash, Status ("pending"), RequestedAt (ISO timestamp), ApprovalToken, TokenExpiry
   */
  async createPendingUser({ username, email, password, name = '', role = 'user' }) {
    return this.withLock(async () => {
      const cleanEmail = String(email || '').trim().toLowerCase();
      const cleanName = (name || username || '').trim();
      const cleanUsername = (username || cleanEmail.split('@')[0] || '').trim();

      const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!cleanEmail || !emailRegex.test(cleanEmail) || cleanEmail.length > 254) {
        const err = new Error('Valid email address required.');
        err.code = 'INVALID_EMAIL';
        throw err;
      }

      if (!cleanName) {
        const err = new Error('Full name is required.');
        err.code = 'INVALID_NAME';
        throw err;
      }

      if (!password || password.length < 8) {
        const err = new Error('Password must be at least 8 characters.');
        err.code = 'INVALID_PASSWORD';
        throw err;
      }

      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const pendingUsers = this.getPendingUsersFromWb(wb);

      if (users.some(u => String(u.Email || u.email || '').toLowerCase() === cleanEmail) ||
          pendingUsers.some(u => String(u.Email || u.email || '').toLowerCase() === cleanEmail)) {
        const err = new Error('An account with this email address already exists or is pending approval.');
        err.code = 'EMAIL_EXISTS';
        throw err;
      }

      if (cleanUsername && (
          users.some(u => String(u.Username || u.username || '').toLowerCase() === cleanUsername.toLowerCase()) ||
          pendingUsers.some(u => String(u.Username || u.username || '').toLowerCase() === cleanUsername.toLowerCase()))) {
        const err = new Error('This username is already registered or pending approval.');
        err.code = 'USERNAME_EXISTS';
        throw err;
      }

      // Cryptographically secure password hash with bcrypt (cost 12)
      const passwordHash = await bcrypt.hash(password, 12);

      // Generate cryptographically secure random token (32 bytes / 64 hex chars)
      const approvalToken = crypto.randomBytes(32).toString('hex');
      const now = Date.now();
      const requestedAt = new Date(now).toISOString();
      const tokenExpiry = new Date(now + 48 * 3600 * 1000).toISOString(); // 48 hours
      const userId = `usr_${crypto.randomBytes(6).toString('hex')}`;

      // Staged pending record matching exact required column schema:
      // Name, Email, PasswordHash, Status ("pending"), RequestedAt, ApprovalToken, TokenExpiry
      const newPending = {
        Name: cleanName,
        Email: cleanEmail,
        PasswordHash: passwordHash,
        Status: 'pending',
        RequestedAt: requestedAt,
        ApprovalToken: approvalToken,
        TokenExpiry: tokenExpiry,
        // Dual-cased aliases for internal backwards-compatibility with tests & queries
        id: userId,
        Id: userId,
        username: cleanUsername,
        Username: cleanUsername,
        name: cleanName,
        email: cleanEmail,
        password_hash: passwordHash,
        role: role === 'admin' ? 'admin' : 'user',
        Role: role === 'admin' ? 'admin' : 'user',
        status: 'pending_approval',
        approval_token: approvalToken,
        requested_at: requestedAt,
        token_expiry: tokenExpiry
      };

      pendingUsers.push(newPending);
      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      this.saveUsersAndRecovery(wb, users, recoveryCodes, pendingUsers);

      return {
        pendingUser: newPending,
        approvalToken
      };
    });
  }

  /**
   * Rollback helper: Removes pending user if approval email fails to dispatch
   */
  async removePendingUser(tokenOrEmail) {
    return this.withLock(async () => {
      const clean = String(tokenOrEmail || '').trim().toLowerCase();
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const pendingUsers = this.getPendingUsersFromWb(wb);

      const index = pendingUsers.findIndex(u => {
        const tokenMatch = safeTokenCompare(clean, u.ApprovalToken || u.approval_token || '');
        const emailMatch = String(u.Email || u.email || '').toLowerCase() === clean;
        return tokenMatch || emailMatch;
      });

      if (index !== -1) {
        const removed = pendingUsers.splice(index, 1)[0];
        const recoveryCodes = this.getRecoveryCodesFromWb(wb);
        this.saveUsersAndRecovery(wb, users, recoveryCodes, pendingUsers);
        return removed;
      }
      return null;
    });
  }

  /**
   * Approves a pending user, validates token and expiry, moves to ApprovedUsers container
   */
  async approveUser(tokenOrId) {
    return this.withLock(async () => {
      const clean = String(tokenOrId || '').trim();
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const pendingUsers = this.getPendingUsersFromWb(wb);

      const pendingIndex = pendingUsers.findIndex(u => {
        const tokenMatch = safeTokenCompare(clean, u.ApprovalToken || u.approval_token || '');
        const idMatch = String(u.Id || u.id || '') === clean;
        return tokenMatch || idMatch;
      });

      if (pendingIndex === -1) {
        // Check if already in approved container
        const alreadyApproved = users.find(u =>
          String(u.Id || u.id || '') === clean ||
          String(u.Email || u.email || '').toLowerCase() === clean.toLowerCase()
        );
        if (alreadyApproved) {
          return { approvedUser: alreadyApproved, alreadyApproved: true, recoveryCodes: [] };
        }
        const err = new Error('Invalid, expired or already used approval token.');
        err.code = 'NOT_FOUND';
        throw err;
      }

      const pending = pendingUsers[pendingIndex];

      // Validate token expiry (48 hours)
      const expiry = pending.TokenExpiry || pending.token_expiry;
      if (expiry && new Date(expiry).getTime() < Date.now()) {
        const err = new Error('This approval link has expired (48-hour limit exceeded).');
        err.code = 'TOKEN_EXPIRED';
        throw err;
      }

      // Invalidate token by removing from PendingUsers sheet (single-use)
      pendingUsers.splice(pendingIndex, 1);

      const now = Date.now();
      const approvedAtIso = new Date(now).toISOString();

      const approvedUser = {
        Id: pending.Id || pending.id || `usr_${crypto.randomBytes(6).toString('hex')}`,
        id: pending.Id || pending.id || `usr_${crypto.randomBytes(6).toString('hex')}`,
        Name: pending.Name || pending.name,
        name: pending.Name || pending.name,
        Username: pending.Username || pending.username || (pending.Email || pending.email).split('@')[0],
        username: pending.Username || pending.username || (pending.Email || pending.email).split('@')[0],
        Email: pending.Email || pending.email,
        email: pending.Email || pending.email,
        PasswordHash: pending.PasswordHash || pending.password_hash,
        password_hash: pending.PasswordHash || pending.password_hash,
        Role: pending.Role || pending.role || 'user',
        role: pending.Role || pending.role || 'user',
        Status: 'active',
        status: 'active',
        ApprovedAt: approvedAtIso,
        approved_at: now,
        RequestedAt: pending.RequestedAt || pending.requested_at || approvedAtIso,
        created_at: now,
        updated_at: now,
        failed_attempts: 0,
        locked_until: 0
      };

      // Push into Approved container
      users.push(approvedUser);

      // Generate 8 emergency recovery codes
      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      const plainCodes = [];
      for (let i = 0; i < 8; i++) {
        const rawCode = `${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        plainCodes.push(rawCode);
        const codeHash = await bcrypt.hash(rawCode, 10);
        recoveryCodes.push({
          id: recoveryCodes.length + 1,
          user_id: approvedUser.id,
          code_hash: codeHash,
          used: 0,
          created_at: now,
          used_at: 0
        });
      }

      this.saveUsersAndRecovery(wb, users, recoveryCodes, pendingUsers);
      this.dispatchOutboundRegistrationWebhook(approvedUser);

      return {
        approvedUser,
        recoveryCodes: plainCodes
      };
    });
  }

  /**
   * Rejects a user and removes them from PendingUsers
   */
  async rejectUser(tokenOrId, reason = 'Declined by Administrator') {
    return this.withLock(async () => {
      const clean = String(tokenOrId || '').trim();
      const wb = this.readWorkbookRaw();
      const users = this.getUsersFromWb(wb);
      const pendingUsers = this.getPendingUsersFromWb(wb);

      const pendingIndex = pendingUsers.findIndex(u => {
        const tokenMatch = safeTokenCompare(clean, u.ApprovalToken || u.approval_token || '');
        const idMatch = String(u.Id || u.id || '') === clean;
        return tokenMatch || idMatch;
      });

      if (pendingIndex === -1) {
        const err = new Error('Invalid, expired or already used approval token.');
        err.code = 'NOT_FOUND';
        throw err;
      }

      const rejected = pendingUsers.splice(pendingIndex, 1)[0];
      const recoveryCodes = this.getRecoveryCodesFromWb(wb);
      this.saveUsersAndRecovery(wb, users, recoveryCodes, pendingUsers);

      return {
        rejectedUser: rejected,
        reason
      };
    });
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
    // Check if user is currently in the Pending container awaiting admin Gmail approval
    const pending = await this.findPendingByIdentity(identity);
    if (pending) {
      const pendingErr = new Error('Your request is still awaiting admin approval.');
      pendingErr.isPending = true;
      pendingErr.status = 'pending_approval';
      throw pendingErr;
    }

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

    const userStatus = String(user.Status || user.status || 'active').toLowerCase();
    if (userStatus !== 'active') {
      const statusErr = new Error('Invalid credentials or not approved.');
      statusErr.status = userStatus;
      throw statusErr;
    }

    const passwordHash = user.PasswordHash || user.password_hash;
    const isMatch = await bcrypt.compare(password, passwordHash);
    if (!isMatch) {
      await this.recordFailedAttempt(user.Id || user.id);
      return null;
    }

    await this.resetFailedAttempts(user.Id || user.id);
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
