/**
 * TITAN WAR // AUTHENTICATION PORTAL & EXCEL STORAGE ENGINE (users.xlsx)
 * Features:
 * 1. Live Sign In & Sign Up with tab switching
 * 2. Excel Flat-Storage persistence (data/users.xlsx)
 * 3. Real-time data retrieval on login (Name, Username, Email, Role, ID, Status)
 * 4. Password strength meter and confirmation matching
 * 5. Emergency recovery codes vault (8 one-time cryptographic recovery keys)
 * 6. Live Excel Storage Container Inspector with direct spreadsheet download
 */

// Permitted Internal Destination Whitelist (Defends against Open-Redirect Attacks)
const PERMITTED_INTERNAL_ROUTES = [
  '/materials',
  '/dashboard/materials',
  '/dashboard',
  '/jarvis',
  '/trading-assistant',
  '/'
];

/**
 * Sanitizes target redirect destination to prevent open-redirect vulnerabilities
 * @param {string} targetUrl - Raw target from response or query
 * @param {string} fallback - Default safe fallback
 * @returns {string} Sanitized safe internal path
 */
function sanitizeRedirectDestination(targetUrl, fallback = '/materials') {
  if (!targetUrl || typeof targetUrl !== 'string') return fallback;

  const trimmed = targetUrl.trim();

  // Reject protocol-relative URLs (//malicious-site.com) and absolute schemes (https:, javascript:, data:)
  if (trimmed.startsWith('//') || /^[a-zA-Z][a-zA-Z\d+\-.]*:/.test(trimmed)) {
    console.warn('[SECURITY] Blocked potentially malicious redirect target:', trimmed);
    return fallback;
  }

  // Parse path component
  let pathname = trimmed;
  try {
    const url = new URL(trimmed, window.location.origin);
    pathname = url.pathname;
  } catch (e) {
    return fallback;
  }

  // Verify against internal route whitelist
  const isWhitelisted = PERMITTED_INTERNAL_ROUTES.some(route => pathname === route || pathname.startsWith('/materials'));
  if (isWhitelisted) {
    return pathname;
  }

  console.warn('[SECURITY] Target route not in permitted whitelist, reverting to safe fallback:', pathname);
  return fallback;
}

// RFC 5322 Compliant Email Validation Pattern
const RFC5322_EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

/**
 * Validates identity string (either RFC 5322 email or alphanum host username)
 * @param {string} identity
 * @returns {boolean}
 */
function validateIdentity(identity) {
  if (!identity || typeof identity !== 'string') return false;
  const trimmed = identity.trim();
  if (trimmed.includes('@')) {
    return RFC5322_EMAIL_REGEX.test(trimmed) && trimmed.length <= 254;
  }
  // Alphanumeric username (minimum 3 chars)
  return /^[a-zA-Z0-9_.-]{3,32}$/.test(trimmed);
}

/**
 * Validates password meets minimum 8-character security constraint
 * @param {string} password
 * @returns {boolean}
 */
function validatePassword(password) {
  return typeof password === 'string' && password.length >= 8;
}

/**
 * Evaluates password strength score (0 to 3)
 */
function calculatePasswordStrength(pass) {
  if (!pass || pass.length < 8) return 0;
  let score = 1;
  if (/[0-9]/.test(pass) && /[a-zA-Z]/.test(pass)) score++;
  if (/[^a-zA-Z0-9]/.test(pass) && pass.length >= 10) score++;
  return score;
}

// Global Auth Controller
const TitanAuthClient = {
  countdownTimerId: null,
  progressIntervalId: null,
  redirectInProgress: false,
  activeTab: 'signin',
  latestRecoveryCodes: [],
  cachedStorageUsers: [],

  init() {
    this.bindDOM();
    this.bindTabs();
    this.bindSignUp();
    this.bindStorageModal();
    this.parseURLParameters();
    this.checkExistingSession();
  },

  bindDOM() {
    this.form = document.getElementById('login-form');
    this.identityInput = document.getElementById('identity-input');
    this.passwordInput = document.getElementById('password-input');
    this.togglePasswordBtn = document.getElementById('toggle-password-btn');
    this.rememberMeCheckbox = document.getElementById('remember-me-checkbox');
    this.submitBtn = document.getElementById('submit-btn');
    this.submitText = document.getElementById('submit-text');
    this.identityFeedback = document.getElementById('identity-feedback');
    this.passwordFeedback = document.getElementById('password-feedback');
    this.quickFillBtn = document.getElementById('quick-fill-btn');
    this.bannerContainer = document.getElementById('banner-container');
    this.redirectionEngine = document.getElementById('redirection-engine');
    this.countdownNumber = document.getElementById('countdown-number');
    this.timerCircleProgress = document.getElementById('timer-circle-progress');
    this.linearProgressFill = document.getElementById('linear-progress-fill');
    this.btnOpenNow = document.getElementById('btn-open-now');
    this.manualFallbackAnchor = document.getElementById('manual-fallback-anchor');

    // Panels
    this.panelSignIn = document.getElementById('panel-signin');
    this.panelSignUp = document.getElementById('panel-signup');
    this.panelSignUpSuccess = document.getElementById('panel-signup-success');
    this.panelSignUpPending = document.getElementById('panel-signup-pending');
    this.panelAuthenticated = document.getElementById('panel-authenticated');

    const btnReturnFromPending = document.getElementById('btn-return-signin-from-pending');
    if (btnReturnFromPending) {
      btnReturnFromPending.addEventListener('click', () => {
        if (this.panelSignUpPending) this.panelSignUpPending.style.display = 'none';
        this.switchTab('signin');
      });
    }

    // Password visibility toggle on Sign In
    if (this.togglePasswordBtn && this.passwordInput) {
      this.togglePasswordBtn.addEventListener('click', () => {
        const isPassword = this.passwordInput.type === 'password';
        this.passwordInput.type = isPassword ? 'text' : 'password';
        this.togglePasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        this.togglePasswordBtn.innerHTML = isPassword
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    // Real-time input validation feedback
    if (this.identityInput) {
      this.identityInput.addEventListener('input', () => this.validateField('identity'));
    }
    if (this.passwordInput) {
      this.passwordInput.addEventListener('input', () => this.validateField('password'));
    }

    // Quick Fill Host Demo Button
    if (this.quickFillBtn) {
      this.quickFillBtn.addEventListener('click', () => {
        if (this.identityInput) this.identityInput.value = 'alex.mercer@titan.corp';
        if (this.rememberMeCheckbox) this.rememberMeCheckbox.checked = true;
        this.validateField('identity');
        if (this.passwordInput) {
          this.passwordInput.value = '';
          this.passwordInput.focus();
        }
        this.showToast('Host identity pre-filled. Enter your account password.', 'info');
      });
    }

    // Form submission interception
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleSignInSubmit(e));
    }

    // Instant Skip Countdown Button ("Open Repository Now")
    if (this.btnOpenNow) {
      this.btnOpenNow.addEventListener('click', () => {
        const dest = this.btnOpenNow.getAttribute('data-target') || '/materials';
        this.executeRedirection(dest, 'Instant Click');
      });
    }

    // Authenticated Profile Actions
    const btnSignoutProfile = document.getElementById('btn-signout-profile');
    if (btnSignoutProfile) {
      btnSignoutProfile.addEventListener('click', () => this.handleSignOut());
    }

    const btnInspectFromProfile = document.getElementById('btn-inspect-storage-from-profile');
    if (btnInspectFromProfile) {
      btnInspectFromProfile.addEventListener('click', () => this.openStorageModal());
    }
  },

  bindTabs() {
    this.tabSignInBtn = document.getElementById('tab-signin-btn');
    this.tabSignUpBtn = document.getElementById('tab-signup-btn');
    const switchToSignUpLink = document.getElementById('switch-to-signup-link');
    const switchToSignInLink = document.getElementById('switch-to-signin-link');
    const btnSignInAfterSignup = document.getElementById('btn-signin-after-signup');

    if (this.tabSignInBtn) {
      this.tabSignInBtn.addEventListener('click', () => this.switchTab('signin'));
    }
    if (this.tabSignUpBtn) {
      this.tabSignUpBtn.addEventListener('click', () => this.switchTab('signup'));
    }
    if (switchToSignUpLink) {
      switchToSignUpLink.addEventListener('click', () => this.switchTab('signup'));
    }
    if (switchToSignInLink) {
      switchToSignInLink.addEventListener('click', () => this.switchTab('signin'));
    }
    if (btnSignInAfterSignup) {
      btnSignInAfterSignup.addEventListener('click', () => this.switchTab('signin'));
    }
  },

  switchTab(tab) {
    this.activeTab = tab;
    if (this.tabSignInBtn) this.tabSignInBtn.classList.toggle('active', tab === 'signin');
    if (this.tabSignUpBtn) this.tabSignUpBtn.classList.toggle('active', tab === 'signup');

    if (this.panelSignIn) this.panelSignIn.style.display = tab === 'signin' ? 'block' : 'none';
    if (this.panelSignUp) this.panelSignUp.style.display = tab === 'signup' ? 'block' : 'none';
    if (this.panelSignUpSuccess) this.panelSignUpSuccess.style.display = 'none';
    if (this.panelSignUpPending) this.panelSignUpPending.style.display = 'none';
    if (this.panelAuthenticated) this.panelAuthenticated.style.display = 'none';
    if (this.redirectionEngine) this.redirectionEngine.style.display = 'none';

    const breadcrumbText = document.getElementById('breadcrumb-current-text');
    if (breadcrumbText) {
      breadcrumbText.textContent = tab === 'signup' ? 'Create Account' : 'Sign In Gate';
    }
  },

  bindSignUp() {
    this.signUpForm = document.getElementById('signup-form');
    this.regNameInput = document.getElementById('reg-name-input');
    this.regUsernameInput = document.getElementById('reg-username-input');
    this.regEmailInput = document.getElementById('reg-email-input');
    this.regPasswordInput = document.getElementById('reg-password-input');
    this.regConfirmInput = document.getElementById('reg-confirm-input');
    this.regSubmitBtn = document.getElementById('reg-submit-btn');
    this.regSubmitText = document.getElementById('reg-submit-text');
    this.toggleRegPasswordBtn = document.getElementById('toggle-reg-password-btn');
    this.regStrengthFill = document.getElementById('reg-strength-fill');
    this.regStrengthText = document.getElementById('reg-strength-text');
    this.regMatchIndicator = document.getElementById('reg-match-indicator');

    // Toggle Registration Password Visibility
    if (this.toggleRegPasswordBtn && this.regPasswordInput) {
      this.toggleRegPasswordBtn.addEventListener('click', () => {
        const isPassword = this.regPasswordInput.type === 'password';
        this.regPasswordInput.type = isPassword ? 'text' : 'password';
        this.toggleRegPasswordBtn.setAttribute('aria-label', isPassword ? 'Hide password' : 'Show password');
        this.toggleRegPasswordBtn.innerHTML = isPassword
          ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24M1 1l22 22"/></svg>`
          : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`;
      });
    }

    // Live Password Strength Meter
    if (this.regPasswordInput) {
      this.regPasswordInput.addEventListener('input', () => {
        const val = this.regPasswordInput.value;
        const score = calculatePasswordStrength(val);
        if (this.regStrengthFill) {
          this.regStrengthFill.className = 'password-meter-fill';
          if (score === 1) this.regStrengthFill.classList.add('weak');
          else if (score === 2) this.regStrengthFill.classList.add('medium');
          else if (score >= 3) this.regStrengthFill.classList.add('strong');
        }
        if (this.regStrengthText) {
          if (val.length === 0) this.regStrengthText.textContent = 'Strength: Minimum 8 chars required';
          else if (val.length < 8) this.regStrengthText.textContent = `Too short (${val.length}/8 chars)`;
          else if (score === 1) this.regStrengthText.textContent = 'Strength: Weak (Add numbers or symbols)';
          else if (score === 2) this.regStrengthText.textContent = 'Strength: Medium (Good password)';
          else this.regStrengthText.textContent = 'Strength: Strong (Excellent security)';
        }
        this.validateMatch();
      });
    }

    if (this.regConfirmInput) {
      this.regConfirmInput.addEventListener('input', () => this.validateMatch());
    }

    if (this.signUpForm) {
      this.signUpForm.addEventListener('submit', (e) => this.handleSignUpSubmit(e));
    }

    // Recovery Codes Actions
    const btnCopyCodes = document.getElementById('btn-copy-codes');
    if (btnCopyCodes) {
      btnCopyCodes.addEventListener('click', () => this.copyRecoveryCodes());
    }

    const btnDownloadCodes = document.getElementById('btn-download-codes');
    if (btnDownloadCodes) {
      btnDownloadCodes.addEventListener('click', () => this.downloadRecoveryCodesFile());
    }

    const btnContinueAfterSignup = document.getElementById('btn-continue-after-signup');
    if (btnContinueAfterSignup) {
      btnContinueAfterSignup.addEventListener('click', () => {
        window.location.href = '/materials';
      });
    }
  },

  validateMatch() {
    if (!this.regPasswordInput || !this.regConfirmInput || !this.regMatchIndicator) return;
    const p1 = this.regPasswordInput.value;
    const p2 = this.regConfirmInput.value;
    if (!p2) {
      this.regMatchIndicator.textContent = 'Matches Password';
      this.regMatchIndicator.style.color = 'var(--text-muted)';
      return;
    }
    if (p1 === p2) {
      this.regMatchIndicator.textContent = '✓ Passwords Match';
      this.regMatchIndicator.style.color = 'var(--emerald-accent)';
    } else {
      this.regMatchIndicator.textContent = '✕ Passwords Do Not Match';
      this.regMatchIndicator.style.color = 'var(--rose-accent)';
    }
  },

  async handleSignUpSubmit(e) {
    e.preventDefault();

    const name = (this.regNameInput?.value || '').trim();
    const username = (this.regUsernameInput?.value || '').trim();
    const email = (this.regEmailInput?.value || '').trim().toLowerCase();
    const password = this.regPasswordInput?.value || '';
    const confirmPassword = this.regConfirmInput?.value || '';

    if (!name) {
      this.showToast('Please enter your full name.', 'error');
      this.regNameInput?.focus();
      return;
    }

    if (!username || username.length < 3) {
      this.showToast('Username must be at least 3 characters long.', 'error');
      this.regUsernameInput?.focus();
      return;
    }

    if (!email || !RFC5322_EMAIL_REGEX.test(email)) {
      this.showToast('Please enter a valid email address.', 'error');
      this.regEmailInput?.focus();
      return;
    }

    if (!password || password.length < 8) {
      this.showToast('Password must be at least 8 characters long.', 'error');
      this.regPasswordInput?.focus();
      return;
    }

    if (password !== confirmPassword) {
      this.showToast('Password confirmation does not match.', 'error');
      this.regConfirmInput?.focus();
      return;
    }

    this.setSignUpSubmitting(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ name, username, email, password })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.success) {
        this.setSignUpSubmitting(false);

        // If administrator Gmail authentication is required before site access
        if (data.requiresApproval || data.status === 'pending_approval') {
          this.showToast('Registration submitted! Held in PendingUsers awaiting Administrator Gmail approval.', 'info');
          this.renderPendingApprovalScreen(data);
          return;
        }

        this.latestRecoveryCodes = data.recoveryCodes || [];

        // Save session cache in client storage
        if (data.user) {
          localStorage.setItem('titan_auth_user', JSON.stringify(data.user));
          sessionStorage.setItem('titan_auth_active', 'true');
        }

        this.showToast('Account successfully created & saved to users.xlsx!', 'success');
        this.renderSignUpSuccess(data.user, data.recoveryCodes);
      } else {
        this.setSignUpSubmitting(false);
        const errorMsg = data.message || (data.error && data.error.message) || 'Account creation failed.';
        this.showToast(errorMsg, 'error');
        this.showBanner(errorMsg, 'error');
      }
    } catch (err) {
      this.setSignUpSubmitting(false);
      this.showToast('Network error while saving account to Excel backend.', 'error');
    }
  },

  setSignUpSubmitting(loading) {
    if (!this.regSubmitBtn) return;
    this.regSubmitBtn.disabled = loading;
    if (this.regNameInput) this.regNameInput.disabled = loading;
    if (this.regUsernameInput) this.regUsernameInput.disabled = loading;
    if (this.regEmailInput) this.regEmailInput.disabled = loading;
    if (this.regPasswordInput) this.regPasswordInput.disabled = loading;
    if (this.regConfirmInput) this.regConfirmInput.disabled = loading;

    if (loading) {
      if (this.regSubmitText) this.regSubmitText.textContent = 'Writing to users.xlsx...';
    } else {
      if (this.regSubmitText) this.regSubmitText.textContent = 'Sign Up & Save to Excel';
    }
  },

  renderPendingApprovalScreen(data) {
    if (this.panelSignUp) this.panelSignUp.style.display = 'none';
    if (this.panelSignIn) this.panelSignIn.style.display = 'none';
    if (this.panelSignUpSuccess) this.panelSignUpSuccess.style.display = 'none';
    if (this.panelSignUpPending) this.panelSignUpPending.style.display = 'block';

    const user = data.user || {};
    const adminEmailEl = document.getElementById('pending-admin-email');
    const nameEl = document.getElementById('pending-name');
    const usernameEl = document.getElementById('pending-username');
    const emailEl = document.getElementById('pending-email');
    const devBox = document.getElementById('pending-dev-box');
    const devLink = document.getElementById('pending-dev-approve-link');

    if (adminEmailEl) adminEmailEl.textContent = data.adminEmail || 'Administrator Gmail';
    if (nameEl) nameEl.textContent = user.name || user.username || 'Applicant';
    if (usernameEl) usernameEl.textContent = `@${user.username || ''}`;
    if (emailEl) emailEl.textContent = user.email || '';

    if (data.approvalToken && devBox && devLink) {
      devBox.style.display = 'block';
      devLink.href = `/api/auth/approve?token=${encodeURIComponent(data.approvalToken)}&action=approve`;
    } else if (devBox) {
      devBox.style.display = 'none';
    }

    if (this.panelSignUpPending) {
      this.panelSignUpPending.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  renderSignUpSuccess(user, codes = []) {
    if (this.panelSignUp) this.panelSignUp.style.display = 'none';
    if (this.panelSignIn) this.panelSignIn.style.display = 'none';
    if (this.panelSignUpPending) this.panelSignUpPending.style.display = 'none';
    if (this.panelSignUpSuccess) this.panelSignUpSuccess.style.display = 'block';

    const nameEl = document.getElementById('reg-success-name');
    const usernameEl = document.getElementById('reg-success-username');
    const emailEl = document.getElementById('reg-success-email');
    const idEl = document.getElementById('reg-success-id');

    if (nameEl) nameEl.textContent = user.name || user.username;
    if (usernameEl) usernameEl.textContent = `@${user.username}`;
    if (emailEl) emailEl.textContent = user.email;
    if (idEl) idEl.textContent = user.id;

    const grid = document.getElementById('recovery-codes-grid');
    if (grid) {
      grid.innerHTML = '';
      codes.forEach(code => {
        const pill = document.createElement('div');
        pill.className = 'code-pill';
        pill.textContent = code;
        grid.appendChild(pill);
      });
    }

    if (this.panelSignUpSuccess) {
      this.panelSignUpSuccess.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  },

  copyRecoveryCodes() {
    if (!this.latestRecoveryCodes.length) {
      this.showToast('No recovery codes available to copy.', 'error');
      return;
    }
    const text = this.latestRecoveryCodes.join('\n');
    navigator.clipboard.writeText(text).then(() => {
      this.showToast('✓ 8 Recovery Codes copied to clipboard!', 'success');
    }).catch(() => {
      this.showToast('Could not access clipboard. Please copy manually.', 'error');
    });
  },

  downloadRecoveryCodesFile() {
    if (!this.latestRecoveryCodes.length) return;
    const content = `TITAN WAR RECOVERY CODES\nGenerated: ${new Date().toISOString()}\nStorage: data/users.xlsx\n\n${this.latestRecoveryCodes.join('\n')}\n\nKeep these codes offline in a secure place. Each code is single-use.`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `titan-recovery-codes-${Date.now()}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    this.showToast('Recovery codes downloaded as text file.', 'success');
  },

  // Storage Inspector Modal
  bindStorageModal() {
    this.storageModalOverlay = document.getElementById('storage-modal-overlay');
    this.btnOpenStorageModal = document.getElementById('btn-open-storage-modal');
    this.btnCloseStorageModal = document.getElementById('btn-close-storage-modal');
    this.btnRefreshStorage = document.getElementById('btn-refresh-storage');
    this.storageSearchInput = document.getElementById('storage-search-input');
    this.modalTabApproved = document.getElementById('modal-tab-approved');
    this.modalTabPending = document.getElementById('modal-tab-pending');
    this.containerApprovedWrapper = document.getElementById('container-approved-wrapper');
    this.containerPendingWrapper = document.getElementById('container-pending-wrapper');
    this.currentContainerTab = 'approved';

    if (this.btnOpenStorageModal) {
      this.btnOpenStorageModal.addEventListener('click', () => this.openStorageModal());
    }
    if (this.btnCloseStorageModal) {
      this.btnCloseStorageModal.addEventListener('click', () => this.closeStorageModal());
    }
    if (this.storageModalOverlay) {
      this.storageModalOverlay.addEventListener('click', (e) => {
        if (e.target === this.storageModalOverlay) this.closeStorageModal();
      });
    }
    if (this.btnRefreshStorage) {
      this.btnRefreshStorage.addEventListener('click', () => this.fetchStorageData());
    }
    if (this.storageSearchInput) {
      this.storageSearchInput.addEventListener('input', (e) => this.filterStorageTable(e.target.value));
    }

    if (this.modalTabApproved) {
      this.modalTabApproved.addEventListener('click', () => this.switchStorageTab('approved'));
    }
    if (this.modalTabPending) {
      this.modalTabPending.addEventListener('click', () => this.switchStorageTab('pending'));
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.storageModalOverlay?.classList.contains('active')) {
        this.closeStorageModal();
      }
    });
  },

  switchStorageTab(tab) {
    this.currentContainerTab = tab;
    if (this.modalTabApproved) this.modalTabApproved.classList.toggle('active', tab === 'approved');
    if (this.modalTabPending) this.modalTabPending.classList.toggle('active', tab === 'pending');

    if (this.containerApprovedWrapper) this.containerApprovedWrapper.style.display = tab === 'approved' ? 'block' : 'none';
    if (this.containerPendingWrapper) this.containerPendingWrapper.style.display = tab === 'pending' ? 'block' : 'none';
  },

  openStorageModal() {
    if (this.storageModalOverlay) {
      this.storageModalOverlay.classList.add('active');
      this.fetchStorageData();
    }
  },

  closeStorageModal() {
    if (this.storageModalOverlay) {
      this.storageModalOverlay.classList.remove('active');
    }
  },

  async fetchStorageData() {
    try {
      const res = await fetch('/api/storage/info');
      if (!res.ok) throw new Error('Failed to load storage info');
      const data = await res.json();
      const storage = data.storage || {};
      const users = data.users || [];
      const pendingUsers = data.pendingUsers || [];
      this.cachedStorageUsers = users;
      this.cachedPendingUsers = pendingUsers;

      // Update stat cards
      const statUsers = document.getElementById('modal-stat-users');
      const statPending = document.getElementById('modal-stat-pending');
      const statSize = document.getElementById('modal-stat-size');
      const statStatus = document.getElementById('modal-stat-status');
      const badgeApproved = document.getElementById('modal-badge-approved');
      const badgePending = document.getElementById('modal-badge-pending');

      const approvedCount = storage.totalApprovedUsers ?? users.length;
      const pendingCount = storage.totalPendingUsers ?? pendingUsers.length;

      if (statUsers) statUsers.textContent = approvedCount;
      if (statPending) statPending.textContent = pendingCount;
      if (statSize) statSize.textContent = storage.fileSizeFormatted || '77 KB';
      if (statStatus) statStatus.textContent = storage.exists ? 'ONLINE' : 'MISSING';
      if (badgeApproved) badgeApproved.textContent = approvedCount;
      if (badgePending) badgePending.textContent = pendingCount;

      // Update header button badge if present
      const btnStoreText = this.btnOpenStorageModal?.querySelector('span');
      if (btnStoreText) {
        btnStoreText.textContent = `Excel Store (${approvedCount} Approved, ${pendingCount} Pending)`;
      }

      this.renderStorageTable(users);
      this.renderPendingTable(pendingUsers);
    } catch (err) {
      const tbody = document.getElementById('storage-users-tbody');
      if (tbody) {
        tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--rose-accent); padding: 20px;">Could not fetch storage info: ${err.message}</td></tr>`;
      }
    }
  },

  renderStorageTable(users) {
    const tbody = document.getElementById('storage-users-tbody');
    if (!tbody) return;

    if (!users || users.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No registered accounts in ApprovedUsers container</td></tr>';
      return;
    }

    tbody.innerHTML = users.map(u => {
      const dateStr = u.created_at ? new Date(u.created_at).toLocaleDateString() : 'Seeded';
      const isHost = u.role === 'admin' || u.role === 'host';
      return `
        <tr>
          <td style="font-family: var(--font-mono); color: var(--gold-accent);">${u.id || '-'}</td>
          <td style="font-weight: 600;">${u.name || u.username || '-'}</td>
          <td style="color: var(--text-secondary);">@${u.username || '-'}</td>
          <td style="color: #38bdf8;">${u.email || '-'}</td>
          <td><span style="padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700; background: ${isHost ? 'rgba(207,168,86,0.15)' : 'rgba(255,255,255,0.06)'}; color: ${isHost ? 'var(--gold-accent)' : 'var(--text-secondary)'};">${(u.role || 'user').toUpperCase()}</span></td>
          <td><span style="color: var(--emerald-accent); font-weight: 600;">● Active (Authorized)</span></td>
          <td style="color: var(--text-muted);">${dateStr}</td>
        </tr>
      `;
    }).join('');
  },

  renderPendingTable(pendingUsers) {
    const tbody = document.getElementById('storage-pending-tbody');
    if (!tbody) return;

    if (!pendingUsers || pendingUsers.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 20px;">No applicants waiting in PendingUsers container. All reviewed!</td></tr>';
      return;
    }

    tbody.innerHTML = pendingUsers.map(u => {
      const dateStr = u.requested_at ? new Date(u.requested_at).toLocaleString() : 'Just now';
      return `
        <tr data-token="${u.approval_token || ''}" data-id="${u.id || ''}">
          <td style="font-family: var(--font-mono); color: var(--gold-accent);">${u.id || '-'}</td>
          <td style="font-weight: 600;">${u.name || u.username || '-'}</td>
          <td style="color: var(--text-secondary);">@${u.username || '-'}</td>
          <td style="color: #38bdf8;">${u.email || '-'}</td>
          <td><span style="background: rgba(245, 158, 11, 0.15); color: #f59e0b; padding: 2px 8px; border-radius: 4px; font-size: 0.7rem; font-weight: 700;">● Pending Gmail</span></td>
          <td style="color: var(--text-muted); font-size: 0.75rem;">${dateStr}</td>
          <td style="text-align: right; white-space: nowrap;">
            <button type="button" class="btn-action-approve" data-token="${u.approval_token}" data-name="${u.name || u.username}" style="background: #10b981; color: #fff; border: none; padding: 4px 10px; border-radius: 4px; font-size: 0.72rem; font-weight: 700; cursor: pointer; margin-right: 6px;">
              ✓ Accept & Push
            </button>
            <button type="button" class="btn-action-reject" data-token="${u.approval_token}" data-name="${u.name || u.username}" style="background: rgba(239, 68, 68, 0.2); color: #fca5a5; border: 1px solid rgba(239, 68, 68, 0.4); padding: 4px 8px; border-radius: 4px; font-size: 0.72rem; cursor: pointer;">
              ✕ Reject
            </button>
          </td>
        </tr>
      `;
    }).join('');

    // Attach click events
    tbody.querySelectorAll('.btn-action-approve').forEach(btn => {
      btn.addEventListener('click', () => {
        const token = btn.getAttribute('data-token');
        const name = btn.getAttribute('data-name');
        this.processAdminApproval(token, 'approve', name);
      });
    });

    tbody.querySelectorAll('.btn-action-reject').forEach(btn => {
      btn.addEventListener('click', () => {
        const token = btn.getAttribute('data-token');
        const name = btn.getAttribute('data-name');
        this.processAdminApproval(token, 'reject', name);
      });
    });
  },

  async processAdminApproval(token, action, name = 'User') {
    if (!token) return;
    try {
      this.showToast(`Processing ${action === 'approve' ? 'approval' : 'rejection'} for ${name}...`, 'info');
      const res = await fetch('/api/auth/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, action })
      });
      const data = await res.json();
      if (res.ok && data.success) {
        if (action === 'approve') {
          this.showToast(`✓ ${name} approved and pushed into ApprovedUsers container!`, 'success');
        } else {
          this.showToast(`✕ ${name} request declined and removed from pending container.`, 'info');
        }
        await this.fetchStorageData();
      } else {
        this.showToast(data.message || 'Operation failed.', 'error');
      }
    } catch (err) {
      this.showToast('Network error while processing approval.', 'error');
    }
  },

  filterStorageTable(query) {
    const clean = query.trim().toLowerCase();
    if (this.currentContainerTab === 'approved') {
      if (!this.cachedStorageUsers) return;
      if (!clean) {
        this.renderStorageTable(this.cachedStorageUsers);
        return;
      }
      const filtered = this.cachedStorageUsers.filter(u =>
        (u.name && u.name.toLowerCase().includes(clean)) ||
        (u.username && u.username.toLowerCase().includes(clean)) ||
        (u.email && u.email.toLowerCase().includes(clean)) ||
        (u.id && u.id.toLowerCase().includes(clean))
      );
      this.renderStorageTable(filtered);
    } else {
      if (!this.cachedPendingUsers) return;
      if (!clean) {
        this.renderPendingTable(this.cachedPendingUsers);
        return;
      }
      const filtered = this.cachedPendingUsers.filter(u =>
        (u.name && u.name.toLowerCase().includes(clean)) ||
        (u.username && u.username.toLowerCase().includes(clean)) ||
        (u.email && u.email.toLowerCase().includes(clean)) ||
        (u.id && u.id.toLowerCase().includes(clean))
      );
      this.renderPendingTable(filtered);
    }
  },

  validateField(field) {
    if (field === 'identity') {
      const val = this.identityInput.value.trim();
      if (!val) {
        this.identityInput.classList.remove('is-valid', 'is-invalid');
        this.identityFeedback.textContent = '';
        return false;
      }
      const isValid = validateIdentity(val);
      this.identityInput.classList.toggle('is-valid', isValid);
      this.identityInput.classList.toggle('is-invalid', !isValid);
      this.identityFeedback.className = `validation-feedback ${isValid ? 'success' : 'error'}`;
      this.identityFeedback.textContent = isValid
        ? '✓ Valid identity format'
        : 'Please enter a valid email or username';
      return isValid;
    }

    if (field === 'password') {
      const val = this.passwordInput.value;
      if (!val) {
        this.passwordInput.classList.remove('is-valid', 'is-invalid');
        this.passwordFeedback.textContent = '';
        return false;
      }
      const isValid = validatePassword(val);
      this.passwordInput.classList.toggle('is-valid', isValid);
      this.passwordInput.classList.toggle('is-invalid', !isValid);
      this.passwordFeedback.className = `validation-feedback ${isValid ? 'success' : 'error'}`;
      this.passwordFeedback.textContent = isValid
        ? `✓ Password constraint satisfied (${val.length} chars)`
        : `Minimum 8 characters required (${val.length}/8)`;
      return isValid;
    }

    return true;
  },

  parseURLParameters() {
    const urlParams = new URLSearchParams(window.location.search);
    const returnUrl = urlParams.get('returnUrl');
    const message = urlParams.get('message');
    const tabParam = urlParams.get('tab');

    if (tabParam === 'signup' || tabParam === 'register') {
      this.switchTab('signup');
    }

    if (returnUrl) {
      this.showBanner(
        '⚠️ Authentication Required: Please sign in or register to access repository assets.',
        'warning'
      );
    } else if (message === 'logged_out') {
      this.showBanner(
        '✓ Session Terminated: You have been safely logged out of the workspace.',
        'success'
      );
    }
  },

  showBanner(msg, type = 'warning') {
    if (!this.bannerContainer) return;
    this.bannerContainer.innerHTML = `
      <div class="portal-banner ${type}" role="alert">
        <span>${msg}</span>
      </div>
    `;
  },

  async checkExistingSession() {
    try {
      const res = await fetch('/api/auth/session', { credentials: 'same-origin' });
      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.user) {
          console.log('[AUTH] Active session detected from Excel storage:', data.user.email);
          const urlParams = new URLSearchParams(window.location.search);
          const stayParam = urlParams.get('stay') || urlParams.get('view');
          
          if (stayParam === '1' || stayParam === 'profile') {
            // Render profile directly without redirect
            this.renderAuthenticatedProfile(data.user);
          } else {
            this.showBanner(
              `Active session detected for <strong>${data.user.name || data.user.username}</strong>. Fetched from users.xlsx.`,
              'success'
            );
            this.renderAuthenticatedProfile(data.user);
          }
        }
      }
    } catch (e) {
      // Backend unavailable or network error
    }
  },

  async handleSignInSubmit(e) {
    e.preventDefault();

    const isIdentValid = this.validateField('identity');
    const isPassValid = this.validateField('password');

    if (!isIdentValid || !isPassValid) {
      this.showToast('Please correct form validation errors before submitting.', 'error');
      return;
    }

    const identity = this.identityInput.value.trim();
    const password = this.passwordInput.value;
    const rememberMe = this.rememberMeCheckbox ? this.rememberMeCheckbox.checked : false;

    this.setSubmissionState('loading');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          identity,
          email: identity,
          password,
          rememberMe
        })
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.status === 'success' && data.authenticated) {
        this.setSubmissionState('success');

        // Store non-sensitive user identity in client state
        if (data.user) {
          localStorage.setItem('titan_auth_user', JSON.stringify(data.user));
          sessionStorage.setItem('titan_auth_active', 'true');
        }

        const userName = data.user?.name || data.user?.username || 'Executive';
        this.showToast(`Authentication confirmed! Data fetched from users.xlsx. Welcome, ${userName}.`, 'success');

        // Render fetched user profile card
        this.renderAuthenticatedProfile(data.user);

        // Determine destination with open-redirect protection
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrlQuery = urlParams.get('returnUrl');
        const rawDestination = returnUrlQuery || data.redirectTo || '/materials';
        const safeDestination = sanitizeRedirectDestination(rawDestination, '/materials');

        // Trigger Automated Redirection Handler
        this.triggerAutomatedRedirection(safeDestination, data.user);
      } else {
        this.setSubmissionState('idle');
        if (data.pending || data.status === 'pending_approval') {
          const pendingMsg = data.message || 'Your account is currently held in the PendingUsers container awaiting administrator approval via Gmail.';
          this.showToast(pendingMsg, 'warning');
          this.showBanner(`⏳ <strong>Authentication Pending:</strong> ${pendingMsg}`, 'warning');
          return;
        }
        const errorMsg = data.message || (data.error && data.error.message) || 'Authentication failed. Please verify credentials.';
        this.showToast(errorMsg, 'error');
        this.showBanner(errorMsg, 'error');
      }
    } catch (err) {
      this.setSubmissionState('idle');
      this.showToast('Network error while connecting to authentication backend.', 'error');
    }
  },

  renderAuthenticatedProfile(user) {
    if (this.panelSignIn) this.panelSignIn.style.display = 'none';
    if (this.panelSignUp) this.panelSignUp.style.display = 'none';
    if (this.panelSignUpSuccess) this.panelSignUpSuccess.style.display = 'none';
    if (this.panelAuthenticated) this.panelAuthenticated.style.display = 'block';

    const avatarEl = document.getElementById('profile-avatar');
    const nameEl = document.getElementById('profile-name');
    const emailEl = document.getElementById('profile-email');
    const idEl = document.getElementById('profile-user-id');
    const usernameEl = document.getElementById('profile-username');
    const roleEl = document.getElementById('profile-role');
    const statusEl = document.getElementById('profile-status');
    const dateEl = document.getElementById('profile-created-date');

    const displayName = user.name || user.username || 'Host';
    if (avatarEl) avatarEl.textContent = (displayName).slice(0, 2).toUpperCase();
    if (nameEl) nameEl.textContent = displayName;
    if (emailEl) emailEl.textContent = user.email || 'alex.mercer@titan.corp';
    if (idEl) idEl.textContent = user.id || 'usr_94812';
    if (usernameEl) usernameEl.textContent = user.username ? `@${user.username}` : '@alex.mercer';
    if (roleEl) roleEl.textContent = (user.clearance || (user.role === 'admin' ? 'LEVEL 5 (ADMIN)' : 'LEVEL 2 (ANALYST)')).toUpperCase();
    if (statusEl) statusEl.textContent = (user.status || 'ACTIVE').toUpperCase();
    if (dateEl) {
      dateEl.textContent = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'Seeded Account';
    }
  },

  async handleSignOut() {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'same-origin' });
    } catch (_) {}
    localStorage.removeItem('titan_auth_user');
    sessionStorage.removeItem('titan_auth_active');
    this.showToast('Successfully signed out.', 'info');
    this.switchTab('signin');
    this.showBanner('✓ You have been signed out of your session.', 'success');
  },

  setSubmissionState(state) {
    if (!this.submitBtn) return;

    if (state === 'loading') {
      this.submitBtn.disabled = true;
      if (this.identityInput) this.identityInput.disabled = true;
      if (this.passwordInput) this.passwordInput.disabled = true;
      if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = true;
      this.submitBtn.classList.add('loading');
      if (this.submitText) this.submitText.textContent = 'Querying users.xlsx...';
    } else if (state === 'success') {
      this.submitBtn.disabled = true;
      this.submitBtn.classList.remove('loading');
      this.submitBtn.classList.add('confirmed');
      if (this.submitText) this.submitText.textContent = '✓ Verified & Fetched';
    } else {
      this.submitBtn.disabled = false;
      if (this.identityInput) this.identityInput.disabled = false;
      if (this.passwordInput) this.passwordInput.disabled = false;
      if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = false;
      this.submitBtn.classList.remove('loading', 'confirmed');
      if (this.submitText) this.submitText.textContent = 'Sign In & Fetch Data';
    }
  },

  /**
   * Automated Redirection Handler ("Auto Link Opener")
   */
  triggerAutomatedRedirection(destinationUrl, user) {
    if (this.redirectInProgress) return;
    this.redirectInProgress = true;

    // Freeze form inputs completely
    if (this.form) {
      const inputs = this.form.querySelectorAll('input, button');
      inputs.forEach(el => el.disabled = true);
    }

    // Reveal the Redirection Engine Card
    if (this.redirectionEngine) {
      this.redirectionEngine.style.display = 'block';
      this.redirectionEngine.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    if (this.btnOpenNow) {
      this.btnOpenNow.setAttribute('data-target', destinationUrl);
    }
    if (this.manualFallbackAnchor) {
      this.manualFallbackAnchor.href = destinationUrl;
      this.manualFallbackAnchor.addEventListener('click', (e) => {
        e.preventDefault();
        this.executeRedirection(destinationUrl, 'Manual Fallback Click');
      });
    }

    // 3-Second Visual Countdown Animation
    let remainingSeconds = 3;
    const totalDurationMs = 3000;
    const startTime = Date.now();
    const circumference = 251.2;

    if (this.countdownNumber) {
      this.countdownNumber.textContent = String(remainingSeconds);
    }

    this.progressIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(1, elapsed / totalDurationMs);

      if (this.linearProgressFill) {
        this.linearProgressFill.style.width = `${(progressRatio * 100).toFixed(1)}%`;
      }

      if (this.timerCircleProgress) {
        const offset = circumference * (1 - progressRatio);
        this.timerCircleProgress.style.strokeDashoffset = String(offset);
      }

      const currentRemaining = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
      if (this.countdownNumber && String(currentRemaining) !== this.countdownNumber.textContent) {
        this.countdownNumber.textContent = String(currentRemaining);
      }

      if (progressRatio >= 1) {
        clearInterval(this.progressIntervalId);
        this.executeRedirection(destinationUrl, 'Countdown Expiration');
      }
    }, 30);
  },

  executeRedirection(destinationUrl, triggerSource = 'Automatic') {
    if (this.progressIntervalId) clearInterval(this.progressIntervalId);
    if (this.countdownTimerId) clearTimeout(this.countdownTimerId);

    console.log(`[ROUTER ENGINE] Automated Redirection triggered via ${triggerSource} -> ${destinationUrl}`);
    window.location.replace(destinationUrl);
  },

  showToast(message, type = 'info') {
    let container = document.getElementById('toast-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'toast-container';
      container.className = 'toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('div');
    toast.className = `toast-item ${type}`;
    const icon = type === 'success' ? '✓' : type === 'error' ? '✕' : 'ℹ';
    toast.innerHTML = `
      <span style="font-weight: 700; color: var(--gold-accent);">${icon}</span>
      <span>${message}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('leaving');
      setTimeout(() => toast.remove(), 250);
    }, 4000);
  }
};

// Initialize once DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TitanAuthClient.init());
  } else {
    TitanAuthClient.init();
  }
}

// Module exports for unit testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    validateIdentity,
    validatePassword,
    sanitizeRedirectDestination,
    PERMITTED_INTERNAL_ROUTES
  };
}
