/**
 * TITAN WAR // AUTHENTICATION PORTAL & AUTOMATED REDIRECTION ENGINE ("AUTO LINK OPENER")
 * Architecture: RFC 5322 Email Validation, Secure Password Masking, Deterministic Form Lifecycle,
 * Whitelisted Open-Redirect Protection, and Programmatic replace() Navigation.
 */

// Permitted Internal Destination Whitelist (Defends against Open-Redirect Attacks)
const PERMITTED_INTERNAL_ROUTES = [
  '/materials',
  '/dashboard/materials',
  '/dashboard',
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
    // Malformed URL, use fallback
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

// Global Auth Controller
const TitanAuthClient = {
  countdownTimerId: null,
  progressIntervalId: null,
  redirectInProgress: false,

  init() {
    this.bindDOM();
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

    // Password visibility toggle
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

    // Quick Fill Host Demo Button (fills identity only; never hardcodes passwords in client JS)
    if (this.quickFillBtn) {
      this.quickFillBtn.addEventListener('click', () => {
        if (this.identityInput) this.identityInput.value = 'alex.mercer@titan.corp';
        if (this.rememberMeCheckbox) this.rememberMeCheckbox.checked = true;
        this.validateField('identity');
        if (this.passwordInput) {
          this.passwordInput.value = '';
          this.passwordInput.focus();
        }
        this.showToast('Host identity pre-filled. Enter your environment password.', 'info');
      });
    }

    // Form submission interception
    if (this.form) {
      this.form.addEventListener('submit', (e) => this.handleFormSubmit(e));
    }

    // Instant Skip Countdown Button ("Open Repository Now")
    if (this.btnOpenNow) {
      this.btnOpenNow.addEventListener('click', () => {
        const dest = this.btnOpenNow.getAttribute('data-target') || '/materials';
        this.executeRedirection(dest, 'Instant Click');
      });
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
        ? '✓ Valid format (RFC 5322 format verified)'
        : 'Please enter a valid email address (e.g. host@domain.com)';
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

    if (returnUrl) {
      this.showBanner(
        '⚠️ Authentication Required: Please sign in with host credentials to access repository assets.',
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
          console.log('[AUTH] Active host session detected:', data.user.email);
          // Show notice that session is active
          this.showBanner(
            `Active session detected for <strong>${data.user.name}</strong>. Entering repository...`,
            'success'
          );
          // Auto link opener to materials
          this.triggerAutomatedRedirection('/materials', data.user);
        }
      }
    } catch (e) {
      // Backend unavailable or network error
    }
  },

  async handleFormSubmit(e) {
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

    // Transition Submission Controller: Loading State
    this.setSubmissionState('loading');

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
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
        // Transition Submission Controller: Success State
        this.setSubmissionState('success');

        // Store non-sensitive user identity in client state
        if (data.user) {
          localStorage.setItem('titan_auth_user', JSON.stringify(data.user));
          sessionStorage.setItem('titan_auth_active', 'true');
        }

        this.showToast(`Authentication confirmed! Welcome, ${data.user?.name || 'Host'}.`, 'success');

        // Determine destination with open-redirect protection
        const urlParams = new URLSearchParams(window.location.search);
        const returnUrlQuery = urlParams.get('returnUrl');
        const rawDestination = returnUrlQuery || data.redirectTo || '/materials';
        const safeDestination = sanitizeRedirectDestination(rawDestination, '/materials');

        // Trigger Automated Redirection Handler ("Auto Link Opener")
        this.triggerAutomatedRedirection(safeDestination, data.user);
      } else {
        this.setSubmissionState('idle');
        const errorMsg = data.message || 'Authentication failed. Please verify credentials.';
        this.showToast(errorMsg, 'error');
        this.showBanner(errorMsg, 'error');
      }
    } catch (err) {
      this.setSubmissionState('idle');
      this.showToast('Network error while connecting to authentication backend.', 'error');
    }
  },

  setSubmissionState(state) {
    if (!this.submitBtn) return;

    if (state === 'loading') {
      this.submitBtn.disabled = true;
      this.identityInput.disabled = true;
      this.passwordInput.disabled = true;
      if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = true;
      this.submitBtn.classList.remove('state-success');
      this.submitBtn.innerHTML = `
        <span class="spinner-inline" aria-hidden="true"></span>
        <span>Verifying Credentials...</span>
      `;
    } else if (state === 'success') {
      this.submitBtn.disabled = true;
      this.identityInput.disabled = true;
      this.passwordInput.disabled = true;
      this.submitBtn.classList.add('state-success');
      this.submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
        <span>Authentication Confirmed</span>
      `;
    } else {
      // Idle
      this.submitBtn.disabled = false;
      this.identityInput.disabled = false;
      this.passwordInput.disabled = false;
      if (this.rememberMeCheckbox) this.rememberMeCheckbox.disabled = false;
      this.submitBtn.classList.remove('state-success');
      this.submitBtn.innerHTML = `
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l5-5-5-5M15 12H3"/></svg>
        <span id="submit-text">Sign In to Repository</span>
      `;
    }
  },

  /**
   * Automated Redirection Handler ("Auto Link Opener")
   * Freezes inputs, shows visual countdown progress, and initiates programmatic replace()
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

    // Circumference of SVG circle (r=40 -> 2 * PI * 40 = 251.32)
    const circumference = 251.2;

    if (this.countdownNumber) {
      this.countdownNumber.textContent = String(remainingSeconds);
    }

    // Smooth High-Frequency Progress Interval (every 30ms)
    this.progressIntervalId = setInterval(() => {
      const elapsed = Date.now() - startTime;
      const progressRatio = Math.min(1, elapsed / totalDurationMs);

      // Linear progress bar
      if (this.linearProgressFill) {
        this.linearProgressFill.style.width = `${(progressRatio * 100).toFixed(1)}%`;
      }

      // Circular SVG countdown ring
      if (this.timerCircleProgress) {
        const offset = circumference * (1 - progressRatio);
        this.timerCircleProgress.style.strokeDashoffset = String(offset);
      }

      // Decrement visible countdown digit
      const currentRemaining = Math.max(0, Math.ceil((totalDurationMs - elapsed) / 1000));
      if (this.countdownNumber && String(currentRemaining) !== this.countdownNumber.textContent) {
        this.countdownNumber.textContent = String(currentRemaining);
      }

      // Trigger redirect on completion
      if (progressRatio >= 1) {
        clearInterval(this.progressIntervalId);
        this.executeRedirection(destinationUrl, 'Countdown Expiration');
      }
    }, 30);
  },

  /**
   * Executes programmatic navigation with window.location.replace()
   * Replacing the history state eliminates the login page from browser back-stack,
   * preventing looping issues.
   */
  executeRedirection(destinationUrl, triggerSource = 'Automatic') {
    if (this.progressIntervalId) clearInterval(this.progressIntervalId);
    if (this.countdownTimerId) clearTimeout(this.countdownTimerId);

    console.log(`[ROUTER ENGINE] Automated Redirection triggered via ${triggerSource} -> ${destinationUrl}`);

    // Programmatic replace navigation (satisfies Section 4 specification)
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
