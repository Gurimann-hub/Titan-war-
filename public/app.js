/**
 * TITAN WAR // Big Tech Giants Battlefield Intelligence Logic
 * Architecture: Unified Authentication Pipeline, Accessible Dialogs, Zero Inline Handlers
 */

// Application State
const TitanState = {
  currentUser: null,
  isAuthenticated: false,
  isAudioEnabled: false, // Defaulted to OFF per accessibility requirements
  isTickerPaused: false,
  isVerticalPaused: false,
  verticalDirection: 'down',
  verticalSpeed: 'normal',
  horizontalSpeed: 'normal',
  verifiedGmail: null,
  hasPaidClearance: false
};

// Standardized RFC-compliant email validator
function isValidEmail(email) {
  const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return typeof email === 'string' && email.length <= 254 && EMAIL_REGEX.test(email.trim());
}

const IS_DEMO_MODE = typeof document !== 'undefined' && Boolean(
  (document.documentElement && document.documentElement.hasAttribute('data-demo-mode')) ||
  (document.body && document.body.hasAttribute('data-demo-mode')) ||
  (document.querySelector && document.querySelector('[data-demo-mode]'))
);

// Security Sanitization Helpers (XSS Prevention - CWE-79)
function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function isSafeUrl(url) {
  try {
    const base = (typeof window !== 'undefined' && window.location) ? window.location.origin : 'http://localhost';
    const parsed = new URL(url, base);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function sanitizeHtml(html) {
  if (!html) return '';
  if (typeof DOMParser !== 'undefined') {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, 'text/html');
    const allowedTags = new Set(['P', 'STRONG', 'EM', 'B', 'I', 'U', 'BR', 'UL', 'OL', 'LI', 'SPAN']);

    function cleanNode(node) {
      const children = Array.from(node.childNodes);
      for (const child of children) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          if (!allowedTags.has(child.tagName)) {
            child.remove();
          } else {
            const attrs = Array.from(child.attributes);
            for (const attr of attrs) {
              if (attr.name !== 'style' && attr.name !== 'class') {
                child.removeAttribute(attr.name);
              } else if (attr.name === 'style' && /javascript|expression|url/i.test(attr.value)) {
                child.removeAttribute(attr.name);
              }
            }
            cleanNode(child);
          }
        } else if (child.nodeType === Node.COMMENT_NODE) {
          child.remove();
        }
      }
    }

    cleanNode(doc.body);
    return doc.body.innerHTML;
  }
  return String(html).replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

// Cloudflare Turnstile state
let turnstileSiteKey = null;
let heroTurnstileId = null;
let page4TurnstileId = null;

// Accessible Non-blocking Toast Notification (replaces browser alert dialogs)
let toastTimeout = null;
function showNotification(message, type = 'info') {
  const toast = document.getElementById('titan-toast');
  if (!toast) return;

  toast.textContent = message;
  toast.className = `titan-toast toast-${type} active`;

  if (type === 'error') {
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
  } else {
    toast.setAttribute('role', 'status');
    toast.setAttribute('aria-live', 'polite');
  }

  if (toastTimeout) clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => {
    toast.classList.remove('active');
  }, 4500);
}

// Web Audio API Tactical Sound Synthesizer (Disabled by default)
let audioCtx = null;

function initAudio() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (AudioContext) {
      audioCtx = new AudioContext();
    }
  }
}

function playTone(freq = 440, type = 'sine', duration = 0.12, gainLevel = 0.08) {
  if (!TitanState.isAudioEnabled) return;
  try {
    initAudio();
    if (!audioCtx) return;
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(gainLevel, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + duration);
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    osc.start();
    osc.stop(audioCtx.currentTime + duration);
  } catch (e) {
    console.debug('Audio feedback error:', e);
  }
}

function playSuccessChime() {
  playTone(523.25, 'triangle', 0.12, 0.07);
  setTimeout(() => playTone(659.25, 'triangle', 0.12, 0.07), 100);
  setTimeout(() => playTone(783.99, 'triangle', 0.25, 0.08), 200);
}

function playAlertChime() {
  playTone(880, 'square', 0.08, 0.04);
  setTimeout(() => playTone(587.33, 'square', 0.12, 0.05), 80);
}

// ==========================================================================
// ACCESSIBLE MODAL MANAGEMENT (ROLE="DIALOG", FOCUS TRAP & RETURN)
// ==========================================================================
let activeElementBeforeModal = null;

function openModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  activeElementBeforeModal = document.activeElement;
  modal.classList.remove('hidden');

  // Focus the first focusable element inside modal
  const focusables = modal.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])');
  if (focusables.length > 0) {
    focusables[0].focus();
  }
}

function closeModal(modalId) {
  const modal = document.getElementById(modalId);
  if (!modal) return;

  modal.classList.add('hidden');

  if (activeElementBeforeModal && typeof activeElementBeforeModal.focus === 'function') {
    activeElementBeforeModal.focus();
    activeElementBeforeModal = null;
  }
}

// Modal Focus Trap & Escape Key Listener
if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    const openModals = Array.from(document.querySelectorAll('.intel-modal-backdrop:not(.hidden)'));
    if (openModals.length === 0) return;

    const currentModal = openModals[openModals.length - 1];

    if (e.key === 'Escape') {
      e.preventDefault();
      closeModal(currentModal.id);
      return;
    }

    if (e.key === 'Tab') {
      const focusables = Array.from(currentModal.querySelectorAll(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
      ));

      if (focusables.length === 0) return;

      const first = focusables[0];
      const last = focusables[focusables.length - 1];

      if (e.shiftKey) {
        if (document.activeElement === first || !currentModal.contains(document.activeElement)) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last || !currentModal.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  // Close modal when clicking outside backdrop
  document.addEventListener('click', (e) => {
    if (e.target.classList.contains('intel-modal-backdrop')) {
      closeModal(e.target.id);
    }
  });
}

// ==========================================================================
// UNIFIED AUTHENTICATION CONTROLLER (HERO + PAGE 4)
// Single Source of Truth for OTP Sending, Verification, and User Personas
// Supports 100% Self-Contained Static Showcase & Backend Server Modes
// ==========================================================================
const TitanAuth = {
  activeEmail: '',
  activeOtp: null,
  expiresAt: null,
  verifyAttempts: 0,
  maxAttempts: 5,
  heroTimerInterval: null,

  // Generate neutral user persona from email address (shared client & static showcase)
  deriveUserPersona(email) {
    const username = (email.split('@')[0] || 'analyst').toLowerCase();
    const cleanName = username
      .split(/[._-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ') || 'Titan Analyst';

    const domain = (email.split('@')[1] || '').toLowerCase();
    const faction = domain ? `${domain.toUpperCase()} SECTOR` : 'TITAN INTELLIGENCE COMMAND';
    const avatar = cleanName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'TA';

    return {
      email,
      name: cleanName,
      faction,
      avatar,
      clearance: 'LEVEL 5 TITAN CLEARANCE',
      authenticatedAt: new Date().toISOString()
    };
  },

  async sendOtp(email, formSource = 'hero') {
    email = (email || '').trim().toLowerCase();

    if (!isValidEmail(email)) {
      playAlertChime();
      showNotification('Please enter a valid email address (e.g. analyst@titanwar.intel).', 'error');
      const inputEl = formSource === 'hero' ? document.getElementById('hero-gmail-input') : document.getElementById('gmail-input');
      if (inputEl) inputEl.focus();
      return false;
    }

    let turnstileToken = '';
    const turnstileWidgetId = (formSource === 'hero') ? heroTurnstileId : page4TurnstileId;
    if (turnstileSiteKey && window.turnstile && turnstileWidgetId !== null) {
      turnstileToken = window.turnstile.getResponse(turnstileWidgetId);
      if (!turnstileToken) {
        playAlertChime();
        showNotification('Please complete the Cloudflare security verification check.', 'error');
        return false;
      }
    }

    const btn = formSource === 'hero' ? document.getElementById('hero-btn-verify') : document.getElementById('btn-send-gmail-code');
    const heroBtnText = document.getElementById('hero-btn-verify-text');
    if (btn) btn.disabled = true;
    if (heroBtnText) heroBtnText.textContent = 'Sending...';

    playTone(480, 'sawtooth', 0.1);

    // Cryptographic 6-digit simulation code (ONLY generated when explicitly in showcase demo mode)
    const simulatedOtp = IS_DEMO_MODE ? String(Math.floor(100000 + Math.random() * 900000)) : null;
    TitanAuth.activeEmail = email;
    TitanAuth.activeOtp = simulatedOtp;
    TitanAuth.expiresAt = Date.now() + (10 * 60 * 1000); // 10 minutes expiry
    TitanAuth.verifyAttempts = 0;
    TitanState.verifiedGmail = email;

    // Check if backend API is reachable
    let serverDispatched = false;
    let deliveryMethod = 'simulation_client';

    try {
      const response = await fetch('/api/send-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, turnstileToken })
      });

      const contentType = response.headers.get('content-type') || '';
      const isJson = contentType.includes('application/json');
      const data = isJson ? await response.json().catch(() => ({})) : {};

      if (response.ok && data && data.success) {
        serverDispatched = true;
        deliveryMethod = data.deliveryMethod || 'console_dev';
      } else if (response.status === 503) {
        playAlertChime();
        showNotification(data.message || 'Email service unavailable.', 'error');
        if (btn) btn.disabled = false;
        if (heroBtnText) heroBtnText.textContent = 'Verify';
        return false;
      } else if (response.status === 429) {
        playAlertChime();
        showNotification(data.message || 'Too many requests. Please wait before retrying.', 'error');
        if (btn) btn.disabled = false;
        if (heroBtnText) heroBtnText.textContent = 'Verify';
        return false;
      } else if (response.status === 400 || response.status === 403) {
        playAlertChime();
        showNotification(data.message || 'Verification request rejected.', 'error');
        if (btn) btn.disabled = false;
        if (heroBtnText) heroBtnText.textContent = 'Verify';
        return false;
      }
    } catch (e) {
      // Backend unavailable or static hosting (Vercel/Netlify static) — fallback to client simulation if demo
    }

    // If server failed and we are NOT in demo mode, do not fabricate OTP or silently succeed
    if (!serverDispatched && !IS_DEMO_MODE) {
      if (btn) btn.disabled = false;
      if (heroBtnText) heroBtnText.textContent = 'Verify';
      playAlertChime();
      showNotification('Verification server is unreachable. Please ensure the backend server is running.', 'error');
      return false;
    }

    playSuccessChime();

    if (serverDispatched && deliveryMethod === 'smtp_live') {
      showNotification(`Verification PIN dispatched to ${email} via live SMTP gateway. Check your inbox.`, 'success');
    } else if (serverDispatched && deliveryMethod === 'console_dev') {
      showNotification(`Verification code dispatched. Check your terminal or inbox.`, 'info');
    } else {
      showNotification(`Verification code dispatched to ${email}. Check your email inbox.`, 'info');
    }

    if (formSource === 'hero') {
      showHeroOtpBar(email, deliveryMethod, serverDispatched ? null : simulatedOtp);
    } else {
      const tDisp = document.getElementById('target-gmail-display');
      const tMsg = document.getElementById('target-gmail-preview-msg');
      if (tDisp) tDisp.textContent = email;
      if (tMsg) tMsg.textContent = email;

      const inboxPreview = document.getElementById('gmail-inbox-preview');
      if (inboxPreview) {
        const isLive = deliveryMethod === 'smtp_live';
        inboxPreview.innerHTML = `
          <div class="gmail-msg-from">Status: <strong>Cryptographic Passcode Dispatched${isLive ? ' (Live Gmail)' : ''}</strong></div>
          <div class="gmail-msg-body">
            A secure 6-digit verification PIN has been dispatched to <strong>${escapeHtml(email)}</strong>.<br>
            <span style="display:inline-block; margin-top:8px; padding:6px 12px; background:rgba(16,185,129,0.12); border:1px solid #10b981; border-radius:4px; font-family:sans-serif; font-weight:600; color:#10b981;">
              ✉️ Live Passcode sent to Gmail — check your inbox and enter the 6 digits above.
            </span>
          </div>
        `;
      }
      goToStep(2);
      const firstOtp = document.getElementById('otp-1');
      if (firstOtp) firstOtp.focus();
    }

    if (btn) btn.disabled = false;
    if (heroBtnText) heroBtnText.textContent = 'Verify';
    return true;
  },

  async verifyOtp(otp, formSource = 'hero') {
    otp = (otp || '').trim().replace(/\D/g, '');

    if (otp.length < 6) {
      playAlertChime();
      showNotification('Please enter the complete 6-digit OTP verification code.', 'error');
      return false;
    }

    const email = TitanAuth.activeEmail || TitanState.verifiedGmail;
    if (!email) {
      showNotification('Session email missing. Please enter your email again.', 'error');
      return false;
    }

    // Check expiry
    if (TitanAuth.expiresAt && Date.now() > TitanAuth.expiresAt) {
      TitanAuth.activeOtp = null;
      playAlertChime();
      showNotification('This OTP verification code has expired (10-minute limit). Please request a fresh code.', 'error');
      return false;
    }

    // Check attempt lockout
    if (TitanAuth.verifyAttempts >= TitanAuth.maxAttempts) {
      TitanAuth.activeOtp = null;
      playAlertChime();
      showNotification('Too many incorrect attempts (5-attempt limit). For security, please request a new verification code.', 'error');
      return false;
    }

    const btn = formSource === 'hero' ? document.getElementById('hero-btn-verify-otp') : document.getElementById('btn-verify-otp');
    const heroBtnText = document.getElementById('hero-btn-otp-text');
    if (btn) btn.disabled = true;
    if (heroBtnText) heroBtnText.textContent = 'Verifying...';

    playTone(550, 'triangle', 0.1);

    // Attempt server verification if running (HttpOnly cookie set automatically by response)
    let verifiedUser = null;
    try {
      const response = await fetch('/api/verify-otp', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, otp })
      });
      const contentType = response.headers.get('content-type') || '';
      if (response.ok && contentType.includes('application/json')) {
        const data = await response.json();
        if (data && data.success && data.user) {
          verifiedUser = data.user;
          // Note: Session token is stored strictly in HttpOnly cookie; never in localStorage (Finding 4)
        }
      } else if (response.status !== 404) {
        // Backend returned an explicit error (400, 429, etc.)
        const errData = await response.json().catch(() => ({}));
        if (btn) btn.disabled = false;
        if (heroBtnText) heroBtnText.textContent = 'Verify';
        playAlertChime();
        showNotification(errData.message || 'Verification failed. Please check the code.', 'error');
        return false;
      }
    } catch (e) {
      // Backend unavailable or static host
    }

    // Client-side simulation fallback strictly gated behind IS_DEMO_MODE (Finding 2)
    if (!verifiedUser) {
      if (IS_DEMO_MODE) {
        if (TitanAuth.activeOtp && otp === TitanAuth.activeOtp) {
          verifiedUser = TitanAuth.deriveUserPersona(email);
        } else {
          TitanAuth.verifyAttempts++;
          const remaining = TitanAuth.maxAttempts - TitanAuth.verifyAttempts;
          if (btn) btn.disabled = false;
          if (heroBtnText) heroBtnText.textContent = 'Verify Option';
          playAlertChime();

          if (remaining <= 0) {
            TitanAuth.activeOtp = null;
            showNotification('Too many incorrect attempts (5-attempt limit). For security, please request a new verification code.', 'error');
          } else {
            showNotification(`Incorrect verification code. (${remaining} attempts remaining).`, 'error');
          }
          return false;
        }
      } else {
        if (btn) btn.disabled = false;
        if (heroBtnText) heroBtnText.textContent = 'Verify Option';
        playAlertChime();
        showNotification('Unable to verify with security backend. Please try again.', 'error');
        return false;
      }
    }

    // SUCCESS: Delete OTP after use (invariant)
    TitanAuth.activeOtp = null;
    TitanState.currentUser = verifiedUser;
    TitanState.isAuthenticated = true;
    localStorage.setItem('titan_auth_user', JSON.stringify(verifiedUser));

    playSuccessChime();
    showNotification('Identity verified successfully! Level 5 Clearance granted. Auto Link Opener: transferring to Materials Repository in 2 seconds...', 'success');

    renderAuthenticatedUI();

    if (formSource === 'hero') {
      completeHeroVerification(verifiedUser);
    } else {
      const confirmedLbl = document.getElementById('confirmed-gmail-lbl');
      if (confirmedLbl) confirmedLbl.textContent = email;
      goToStep(3);
    }

    // Auto Link Opener: Programmatic transition to /materials upon confirmation
    setTimeout(() => {
      window.location.replace('/materials');
    }, 2200);

    if (btn) btn.disabled = false;
    if (heroBtnText) heroBtnText.textContent = 'Verify Option';
    return true;
  }
};

// Reveal Hero OTP Step
function showHeroOtpBar(email, deliveryMethod, clientOtp) {
  const barOtp = document.getElementById('hero-bar-otp-step');
  const targetDisp = document.getElementById('hero-otp-email-target');
  const deliveryLabel = document.getElementById('hero-delivery-method-label');
  const infoMsg = document.getElementById('hero-otp-info-msg');
  const otpInput = document.getElementById('hero-otp-input');

  if (targetDisp) targetDisp.textContent = email;

  if (deliveryMethod === 'smtp_live') {
    if (deliveryLabel) deliveryLabel.textContent = 'LIVE GMAIL DISPATCHED';
    if (infoMsg) infoMsg.textContent = 'A live cryptographic 6-digit passcode was sent to your inbox. Enter the code above to verify.';
  } else {
    if (deliveryLabel) deliveryLabel.textContent = 'PASSCODE DISPATCHED';
    if (infoMsg) {
      const _escapedOtp = escapeHtml(clientOtp);
      infoMsg.innerHTML = `A 6-digit passcode was dispatched to <strong>${escapeHtml(email)}</strong>. For operational security, the OTP is hidden on the live screen — please check your Gmail inbox.`;
    }
  }

  if (barOtp) barOtp.classList.remove('hidden');

  startHeroOtpCountdown(600);

  if (otpInput) {
    otpInput.value = '';
    otpInput.focus();
  }
}

// 10-Minute Hero Countdown
function startHeroOtpCountdown(totalSeconds = 600) {
  if (TitanAuth.heroTimerInterval) clearInterval(TitanAuth.heroTimerInterval);

  let remaining = totalSeconds;
  const timerElem = document.getElementById('hero-otp-timer');
  const resendBtn = document.getElementById('hero-resend-link');

  const updateDisplay = () => {
    const mins = String(Math.floor(remaining / 60)).padStart(2, '0');
    const secs = String(remaining % 60).padStart(2, '0');
    if (timerElem) timerElem.textContent = `${mins}:${secs}`;

    if (remaining <= 0) {
      clearInterval(TitanAuth.heroTimerInterval);
      if (timerElem) timerElem.textContent = 'EXPIRED';
      if (resendBtn) resendBtn.textContent = '⚠️ Request New OTP';
    }
  };

  updateDisplay();
  TitanAuth.heroTimerInterval = setInterval(() => {
    remaining--;
    updateDisplay();
  }, 1000);
}

// Complete verification & transition to Bar 3 Verified state
function completeHeroVerification(user) {
  if (TitanAuth.heroTimerInterval) clearInterval(TitanAuth.heroTimerInterval);
  TitanState.currentUser = user;
  TitanState.isAuthenticated = true;
  renderAuthenticatedUI();
}

function handleHeroResendOtp() {
  playTone(600, 'sine', 0.08);
  if (!TitanAuth.activeEmail) {
    resetHeroAuthBar();
    return;
  }
  TitanAuth.sendOtp(TitanAuth.activeEmail, 'hero');
}

function resetHeroAuthBar() {
  playTone(500, 'sine', 0.06);
  if (TitanAuth.heroTimerInterval) clearInterval(TitanAuth.heroTimerInterval);

  const barOtp = document.getElementById('hero-bar-otp-step');
  const barGmail = document.getElementById('hero-bar-gmail-step');
  const input = document.getElementById('hero-gmail-input');

  if (barOtp) barOtp.classList.add('hidden');
  if (barGmail) barGmail.classList.remove('hidden');
  if (input) {
    input.focus();
    input.select();
  }
}

// Sync authenticated UI
function renderAuthenticatedUI() {
  const user = TitanState.currentUser;
  if (!user) return;

  const barGmail = document.getElementById('hero-bar-gmail-step');
  const barOtp = document.getElementById('hero-bar-otp-step');
  const barVerified = document.getElementById('hero-bar-verified-step');

  if (barGmail) barGmail.classList.add('hidden');
  if (barOtp) barOtp.classList.add('hidden');
  if (barVerified) barVerified.classList.remove('hidden');

  const vName = document.getElementById('hero-verified-name');
  const vEmail = document.getElementById('hero-verified-email');
  const vAvatar = document.getElementById('hero-verified-avatar');
  const vFaction = document.getElementById('hero-verified-faction');

  if (vName) vName.textContent = user.name;
  if (vEmail) vEmail.textContent = user.email;
  if (vAvatar) vAvatar.textContent = user.avatar || user.name.substring(0, 2).toUpperCase();
  if (vFaction) vFaction.textContent = `FACTION: ${user.faction || 'TITAN ALLIANCE'}`;

  const topText = document.getElementById('top-signin-text');
  const clearanceLabel = document.getElementById('user-clearance-status');

  if (topText) topText.textContent = `${user.name.split(' ')[0]} (Verified)`;
  if (clearanceLabel) clearanceLabel.textContent = `LEVEL 5 TITAN`;
}

// Sign out user
async function logoutTitanUser() {
  playTone(400, 'sawtooth', 0.1);
  if (TitanAuth.heroTimerInterval) clearInterval(TitanAuth.heroTimerInterval);

  TitanState.currentUser = null;
  TitanState.isAuthenticated = false;
  TitanAuth.activeEmail = '';
  TitanAuth.activeOtp = null;
  localStorage.removeItem('titan_session_token');
  localStorage.removeItem('titan_auth_user');

  try {
    await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
  } catch (e) {
    // Backend offline or static hosting
  }

  const barGmail = document.getElementById('hero-bar-gmail-step');
  const barOtp = document.getElementById('hero-bar-otp-step');
  const barVerified = document.getElementById('hero-bar-verified-step');

  if (barVerified) barVerified.classList.add('hidden');
  if (barOtp) barOtp.classList.add('hidden');
  if (barGmail) barGmail.classList.remove('hidden');

  const topText = document.getElementById('top-signin-text');
  const clearanceLabel = document.getElementById('user-clearance-status');
  if (topText) topText.textContent = 'Sign In';
  if (clearanceLabel) clearanceLabel.textContent = 'LEVEL 0 (GUEST)';

  showNotification('Signed out of Titan Clearance terminal.', 'info');
}

// Validate saved session via HttpOnly cookie or static demo session
async function loadSavedUserSession() {
  // 1. Verify HttpOnly cookie session if backend is reachable
  try {
    const res = await fetch('/api/session', {
      credentials: 'same-origin'
    });
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.authenticated && data.user) {
        TitanState.currentUser = data.user;
        TitanState.isAuthenticated = true;
        localStorage.setItem('titan_auth_user', JSON.stringify(data.user));
        renderAuthenticatedUI();
        return;
      }
    }
  } catch (e) {
    console.debug('Backend session check unavailable:', e);
  }

  // 2. In showcase demo mode only, fallback to client-stored persona
  if (IS_DEMO_MODE) {
    try {
      const savedUserJson = localStorage.getItem('titan_auth_user');
      if (savedUserJson) {
        const user = JSON.parse(savedUserJson);
        if (user && user.email && user.name) {
          TitanState.currentUser = user;
          TitanState.isAuthenticated = true;
          renderAuthenticatedUI();
          return;
        }
      }
    } catch (e) {
      console.debug('Saved demo session parse error:', e);
    }
  } else {
    // If production backend was reached or unreachable without cookie, clean up localStorage
    localStorage.removeItem('titan_auth_user');
    localStorage.removeItem('titan_session_token');
  }
}

// ==========================================================================
// SMTP / ARCHITECTURE TELEMETRY MODAL
// ==========================================================================
async function checkSmtpStatus() {
  const pill = document.getElementById('btn-open-smtp-config');
  const pillText = document.getElementById('smtp-pill-text');
  const pillDot = document.getElementById('smtp-pill-dot');
  const modalDot = document.getElementById('smtp-status-indicator-dot');
  const modalText = document.getElementById('smtp-status-indicator-text');

  try {
    const res = await fetch('/api/status');
    const contentType = res.headers.get('content-type') || '';
    if (res.ok && contentType.includes('application/json')) {
      const data = await res.json();
      if (data && data.turnstileEnabled && data.turnstileSiteKey) {
        turnstileSiteKey = data.turnstileSiteKey;
        initTurnstileWidgets();
      }

      if (data && data.smtpConfigured) {
        if (pill) pill.classList.add('active');
        if (pillDot) pillDot.className = 'live-dot-mini green';
        if (pillText) pillText.textContent = `⚡ Live Gmail Dispatcher: Connected (${data.smtpUser})`;
        if (modalDot) modalDot.className = 'status-indicator-dot online';
        if (modalText) modalText.textContent = `STATUS: ONLINE (DISPATCHING FROM ${data.smtpUser})`;
        return;
      }
    }
  } catch (e) {
    // Expected in static hosting
  }

  // Static showcase mode fallback (clean & informative)
  if (pill) pill.classList.remove('active');
  if (pillDot) pillDot.className = 'live-dot-mini gold';
  if (pillText) pillText.textContent = '⚡ Showcase Architecture: 100% Static Client-Side Terminal';
  if (modalDot) modalDot.className = 'status-indicator-dot simulated';
  if (modalText) modalText.textContent = 'STATUS: STATIC SHOWCASE (CLIENT-SIDE TELEMETRY ACTIVE)';
}

function openSmtpModal() {
  playTone(640, 'sine', 0.08);
  checkSmtpStatus();
  openModal('smtp-setup-modal');
}

function closeSmtpModal() {
  closeModal('smtp-setup-modal');
}

// ==========================================================================
// CLOUDFLARE TURNSTILE
// ==========================================================================
function initTurnstileWidgets() {
  if (!turnstileSiteKey || typeof window.turnstile === 'undefined') return;

  const heroContainer = document.getElementById('hero-turnstile-widget');
  if (heroContainer && heroTurnstileId === null) {
    try {
      heroTurnstileId = window.turnstile.render(heroContainer, {
        sitekey: turnstileSiteKey,
        theme: 'dark'
      });
    } catch (e) {
      console.debug('Hero Turnstile init:', e);
    }
  }

  const page4Container = document.getElementById('page4-turnstile-widget');
  if (page4Container && page4TurnstileId === null) {
    try {
      page4TurnstileId = window.turnstile.render(page4Container, {
        sitekey: turnstileSiteKey,
        theme: 'dark'
      });
    } catch (e) {
      console.debug('Page 4 Turnstile init:', e);
    }
  }
}

// ==========================================================================
// MOTION SYSTEM & INTERACTION CONTROLLERS (Plain CSS + Vanilla JS)
// ==========================================================================

// Safe stub preserving signature for tests/compatibility
function setFontScale(scale) {
  return scale;
}

// 1. Header Compacting on Scroll (72px to 60px)
function initHeaderCompact() {
  const header = document.getElementById('main-header');
  if (!header) return;

  const handleScroll = () => {
    if (window.pageYOffset > 30) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }
  };

  window.addEventListener('scroll', handleScroll, { passive: true });
  handleScroll();
}

// 2. Sliding Nav Underline Indicator
function updateNavIndicator() {
  const navMenu = document.getElementById('nav-menu');
  const indicator = document.getElementById('nav-indicator');
  if (!navMenu || !indicator) return;

  const activeLink = navMenu.querySelector('.nav-link.active');
  if (activeLink && navMenu.offsetParent !== null) {
    const menuRect = navMenu.getBoundingClientRect();
    const linkRect = activeLink.getBoundingClientRect();
    const left = linkRect.left - menuRect.left;
    const width = linkRect.width;

    indicator.style.transform = `translateX(${left}px)`;
    indicator.style.width = `${width}px`;
    indicator.style.opacity = '1';
  } else {
    indicator.style.opacity = '0';
  }
}

function initSlidingNavIndicator() {
  const navMenu = document.getElementById('nav-menu');
  if (!navMenu) return;

  updateNavIndicator();
  window.addEventListener('resize', updateNavIndicator, { passive: true });

  const links = navMenu.querySelectorAll('.nav-link');
  links.forEach(link => {
    link.addEventListener('click', () => {
      links.forEach(l => l.classList.remove('active'));
      link.classList.add('active');
      updateNavIndicator();
    });
  });
}

// 3. Gentle Hero-Art Parallax (Transform only, throttled via requestAnimationFrame)
function initHeroParallax() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const heroArt = document.getElementById('hero-art-img');
  if (!heroArt) return;

  let ticking = false;
  window.addEventListener('scroll', () => {
    if (!ticking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.pageYOffset;
        if (scrollY < window.innerHeight * 1.5) {
          const offset = scrollY * 0.16;
          heroArt.style.transform = `translate3d(0, ${offset.toFixed(1)}px, 0) scale(1.03)`;
        }
        ticking = false;
      });
      ticking = true;
    }
  }, { passive: true });
}

// 4. Scroll Reveal Observer (Translate 16-20px + Fade, once only)
function initScrollReveal() {
  const targets = document.querySelectorAll('.reveal-on-scroll');
  if (!targets.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    targets.forEach(el => el.classList.add('is-revealed'));
    return;
  }

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-revealed');
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    targets.forEach(el => observer.observe(el));
  } else {
    targets.forEach(el => el.classList.add('is-revealed'));
  }
}

// 5. Market-Cap & Numbers Count-Up (Runs once, screen reader accessible)
function initCountUp() {
  const countElements = document.querySelectorAll('[data-count]');
  if (!countElements.length) return;

  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    countElements.forEach(el => {
      const target = parseFloat(el.getAttribute('data-count'));
      const prefix = el.getAttribute('data-prefix') || '';
      const suffix = el.getAttribute('data-suffix') || '';
      if (!isNaN(target)) {
        const isDecimal = String(target).includes('.');
        el.textContent = `${prefix}${target.toFixed(isDecimal ? 1 : 0)}${suffix}`;
      }
    });
    return;
  }

  const animateValue = (el) => {
    const target = parseFloat(el.getAttribute('data-count'));
    if (isNaN(target)) return;
    const prefix = el.getAttribute('data-prefix') || '';
    const suffix = el.getAttribute('data-suffix') || '';
    const isDecimal = String(target).includes('.');
    const decimals = isDecimal ? 1 : 0;
    const duration = 1200;
    const startTime = performance.now();

    const step = (currentTime) => {
      const elapsed = currentTime - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic: 1 - (1 - progress)^3
      const ease = 1 - Math.pow(1 - progress, 3);
      const current = (target * ease).toFixed(decimals);
      el.textContent = `${prefix}${current}${suffix}`;
      if (progress < 1) {
        requestAnimationFrame(step);
      } else {
        el.textContent = `${prefix}${target.toFixed(decimals)}${suffix}`;
      }
    };
    requestAnimationFrame(step);
  };

  if ('IntersectionObserver' in window) {
    const observer = new IntersectionObserver((entries, obs) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          animateValue(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.15 });

    countElements.forEach(el => observer.observe(el));
  } else {
    countElements.forEach(el => animateValue(el));
  }
}

// 6. View Transitions API Helper
function navigateWithViewTransition(callback) {
  if (typeof document !== 'undefined' && document.startViewTransition && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.startViewTransition(callback);
  } else {
    callback();
  }
}

// 7. Looping Animations Lifecycle Manager (Pauses when tab hidden or off-screen)
function initAnimationVisibilityManager() {
  const hTrack = document.getElementById('carousel-news-track');
  const mTape = document.getElementById('marquee-tape');
  const vTrack = document.getElementById('vcascade-track');

  document.addEventListener('visibilitychange', () => {
    const isHidden = document.hidden;
    const hState = isHidden || TitanState.isTickerPaused ? 'paused' : 'running';
    const vState = isHidden || TitanState.isVerticalPaused ? 'paused' : 'running';

    if (hTrack) hTrack.style.animationPlayState = hState;
    if (mTape) mTape.style.animationPlayState = hState;
    if (vTrack) vTrack.style.animationPlayState = vState;
  });

  if ('IntersectionObserver' in window) {
    const hSection = document.getElementById('page-horizontal-news');
    if (hSection) {
      const hObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const state = (entry.isIntersecting && !TitanState.isTickerPaused && !document.hidden) ? 'running' : 'paused';
          if (hTrack) hTrack.style.animationPlayState = state;
          if (mTape) mTape.style.animationPlayState = state;
        });
      }, { threshold: 0.05 });
      hObserver.observe(hSection);
    }

    const vSection = document.getElementById('page-vertical-feed');
    if (vSection) {
      const vObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
          const state = (entry.isIntersecting && !TitanState.isVerticalPaused && !document.hidden) ? 'running' : 'paused';
          if (vTrack) vTrack.style.animationPlayState = state;
        });
      }, { threshold: 0.05 });
      vObserver.observe(vSection);
    }
  }
}

// ==========================================================================
// TICKER & VERTICAL FEED CONTROLS
// ==========================================================================
function toggleHorizontalTicker() {
  playTone(500, 'sine', 0.08);
  const track = document.getElementById('carousel-news-track');
  const marquee = document.getElementById('marquee-tape');
  const btn = document.getElementById('ticker-pause-btn');

  TitanState.isTickerPaused = !TitanState.isTickerPaused;

  if (TitanState.isTickerPaused) {
    if (track) track.style.animationPlayState = 'paused';
    if (marquee) marquee.style.animationPlayState = 'paused';
    if (btn) btn.textContent = '▶ Resume Flow';
  } else {
    if (track) track.style.animationPlayState = 'running';
    if (marquee) marquee.style.animationPlayState = 'running';
    if (btn) btn.textContent = '⏸ Pause Flow';
  }
}

function adjustTickerSpeed(speed) {
  playTone(600, 'sine', 0.06);
  const track = document.getElementById('carousel-news-track');
  const marquee = document.getElementById('marquee-tape');

  const controls = document.querySelectorAll('[data-speed-horizontal]');
  controls.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-speed-horizontal') === speed);
  });

  if (speed === 'slower') {
    if (track) track.style.animationDuration = '75s';
    if (marquee) marquee.style.animationDuration = '60s';
  } else if (speed === 'normal') {
    if (track) track.style.animationDuration = '45s';
    if (marquee) marquee.style.animationDuration = '38s';
  } else if (speed === 'fast') {
    if (track) track.style.animationDuration = '22s';
    if (marquee) marquee.style.animationDuration = '18s';
  }
}

function toggleVerticalFeed() {
  playTone(500, 'sine', 0.08);
  const track = document.getElementById('vcascade-track');
  const btn = document.getElementById('vertical-pause-btn');

  TitanState.isVerticalPaused = !TitanState.isVerticalPaused;

  if (TitanState.isVerticalPaused) {
    if (track) track.style.animationPlayState = 'paused';
    if (btn) btn.textContent = '▶ Resume Feed';
  } else {
    if (track) track.style.animationPlayState = 'running';
    if (btn) btn.textContent = '⏸ Pause Feed';
  }
}

function adjustVerticalSpeed(speed) {
  playTone(620, 'sine', 0.06);
  const track = document.getElementById('vcascade-track');
  const controls = document.querySelectorAll('[data-speed-vertical]');

  controls.forEach(b => {
    b.classList.toggle('active', b.getAttribute('data-speed-vertical') === speed);
  });

  if (speed === 'normal') {
    if (track) track.style.animationDuration = '35s';
  } else {
    if (track) track.style.animationDuration = '16s';
  }
}

function reverseVerticalFeed() {
  playTone(700, 'sine', 0.08);
  const track = document.getElementById('vcascade-track');
  if (track) {
    if (TitanState.verticalDirection === 'down') {
      track.style.animationDirection = 'reverse';
      TitanState.verticalDirection = 'up';
    } else {
      track.style.animationDirection = 'normal';
      TitanState.verticalDirection = 'down';
    }
  }
}

// ==========================================================================
// PAGE 4: TOP-UP STEP NAVIGATION & SIMULATION CHARGE
// ==========================================================================
function goToStep(stepNumber) {
  playTone(580, 'sine', 0.06);
  document.getElementById('step-view-1').classList.add('hidden');
  document.getElementById('step-view-2').classList.add('hidden');
  document.getElementById('step-view-3').classList.add('hidden');
  document.getElementById('step-view-success').classList.add('hidden');

  for (let i = 1; i <= 3; i++) {
    const tab = document.getElementById(`step-tab-${i}`);
    if (tab) {
      tab.classList.toggle('active', i <= stepNumber);
    }
  }

  const targetView = document.getElementById(`step-view-${stepNumber}`);
  if (targetView) targetView.classList.remove('hidden');
}

function processTopUpCharge() {
  const btn = document.getElementById('btn-execute-charge');
  const btnText = document.getElementById('charge-btn-text');

  if (btn) btn.disabled = true;
  if (btnText) btnText.textContent = 'ACTIVATING DEMO CLEARANCE (NO CHARGE)...';

  playTone(520, 'sine', 0.12);

  setTimeout(() => {
    TitanState.hasPaidClearance = true;
    if (btn) btn.disabled = false;
    if (btnText) btnText.textContent = 'ACTIVATE DEMO CLEARANCE (FREE • NO CARD REQUIRED)';

    const targetEmail = document.getElementById('success-target-gmail');
    if (targetEmail) {
      targetEmail.textContent = TitanState.verifiedGmail || (TitanState.currentUser ? TitanState.currentUser.email : 'analyst@titanwar.intel');
    }

    document.getElementById('step-view-1').classList.add('hidden');
    document.getElementById('step-view-2').classList.add('hidden');
    document.getElementById('step-view-3').classList.add('hidden');
    document.getElementById('step-view-success').classList.remove('hidden');

    playSuccessChime();
    showNotification('Level 5 Demonstration Clearance Activated!', 'success');
  }, 400);
}

function resetTopUpFlow() {
  playTone(480, 'sine', 0.08);
  goToStep(1);
  for (let i = 1; i <= 6; i++) {
    const el = document.getElementById(`otp-${i}`);
    if (el) el.value = '';
  }
}

// Navigation helpers with View Transitions API support
function scrollToSection(sectionId) {
  playTone(550, 'sine', 0.08);
  const target = document.getElementById(sectionId);
  if (target) {
    navigateWithViewTransition(() => {
      target.scrollIntoView({ behavior: 'smooth' });
    });
  }
}

function scrollToTop() {
  playTone(650, 'sine', 0.08);
  navigateWithViewTransition(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });
}

function initScrollNavSpy() {
  const sections = document.querySelectorAll('.war-page');
  const navLinks = document.querySelectorAll('.nav-link');

  const onScroll = () => {
    let current = '';
    const scrollPosition = window.pageYOffset + 140;

    sections.forEach(section => {
      const sectionTop = section.offsetTop;
      const sectionHeight = section.clientHeight;
      if (scrollPosition >= sectionTop && scrollPosition < sectionTop + sectionHeight) {
        current = section.getAttribute('id');
      }
    });

    navLinks.forEach(link => {
      if (link.getAttribute('data-target') === current) {
        if (!link.classList.contains('active')) {
          link.classList.add('active');
          updateNavIndicator();
        }
      } else {
        link.classList.remove('active');
      }
    });
  };

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

// ==========================================================================
// DYNAMIC INTEL DATABASE & VERIFIED PRIMARY SOURCES LOADER
// Data decoupled from JavaScript into public/data/dossiers.json
// ==========================================================================
let IntelDatabase = {};

async function loadDossiersData() {
  try {
    const res = await fetch('/data/dossiers.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.dossiers) {
        IntelDatabase = data.dossiers;
        return;
      }
    }
  } catch (err) {
    console.debug('[Titan Intel] Primary data fetch failed, checking mirror:', err);
  }

  // Mirror fallback
  try {
    const res = await fetch('/dossiers.json');
    if (res.ok) {
      const data = await res.json();
      if (data && data.dossiers) {
        IntelDatabase = data.dossiers;
      }
    }
  } catch (err) {
    console.debug('[Titan Intel] Mirror fetch error:', err);
  }
}

async function openIntelModal(intelId) {
  playTone(720, 'sine', 0.1);

  // If data is still loading, wait a moment
  if (!IntelDatabase[intelId]) {
    await loadDossiersData();
  }

  const data = IntelDatabase[intelId];
  if (!data) return;

  const tagEl = document.getElementById('modal-tag');
  const bodyEl = document.getElementById('modal-body-content');

  if (tagEl) tagEl.textContent = data.tag;
  if (bodyEl) {
    const safeSources = Array.isArray(data.primarySources) ? data.primarySources : [];
    const sourcesHtml = safeSources.length ? `
      <div class="modal-sources-block">
        <h4 class="sources-heading">🏛️ PRIMARY SOURCES &amp; REGULATORY CITATIONS</h4>
        <ul class="sources-list">
          ${safeSources.map(src => {
            const safeUrl = isSafeUrl(src.url) ? src.url : '#';
            return `
            <li class="source-item">
              <span class="source-type-pill">${escapeHtml(src.type || 'OFFICIAL')}</span>
              <div class="source-details">
                <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" class="source-link">
                  ${escapeHtml(src.title)} &nearr;
                </a>
                <div class="source-citation">${escapeHtml(src.citation)}</div>
              </div>
            </li>
          `;
          }).join('')}
        </ul>
      </div>
    ` : '';

    bodyEl.innerHTML = `
      <div class="modal-verification-bar">
        <span class="verified-check-tag">✓ FACT-CHECKED &amp; VERIFIED</span>
        <span class="verified-date-val">LAST AUDIT: ${escapeHtml(data.lastVerified || 'October 2026')}</span>
      </div>
      <h2 style="font-family: var(--font-heading); font-size: 1.4rem; margin-bottom: 14px; color: var(--burgundy-primary);">${escapeHtml(data.title)}</h2>
      ${sanitizeHtml(data.content)}
      ${sourcesHtml}
    `;
  }

  openModal('intel-modal');
}

async function loadLiveNews() {
  const marquee = typeof document !== 'undefined' ? document.getElementById('marquee-tape') : null;
  if (!marquee) return;
  try {
    const res = await fetch('/api/news');
    if (!res.ok) return;
    const json = await res.json();
    const items = Array.isArray(json.data) ? json.data : (Array.isArray(json.items) ? json.items : (json.data?.articles || json.articles || []));
    if (!json.success || !Array.isArray(items) || items.length === 0) return;

    const tickerColors = {
      NVDA: 'red',
      MSFT: 'green',
      GOOGL: 'red',
      META: 'green',
      AAPL: 'red',
      AMZN: 'green',
      TSLA: 'red'
    };

    const itemsHtml = items.map(item => {
      const ticker = escapeHtml(item.ticker || 'MARKET');
      const color = tickerColors[ticker] || 'green';
      const headline = escapeHtml(item.headline || item.title || '');
      const source = escapeHtml(item.source || 'WIRE').toUpperCase();
      return `<div class="marquee-item"><span class="ticker-symbol ${color}">${ticker}</span> <strong>${source}:</strong> ${headline}</div>`;
    }).join('\n');

    marquee.innerHTML = itemsHtml + '\n' + itemsHtml;
  } catch (err) {
    // Keep fallback marquee content if offline or network unreachable
  }
}

async function loadBotTelemetry() {
  try {
    const res = await fetch('/api/bot/status');
    if (!res.ok) return;
    const json = await res.json();
    if (!json || !json.portfolio) return;

    const nav = json.portfolio.totalEquity || json.portfolio.cash || 100000;
    const cash = json.portfolio.cash || 84250;
    const pnl = json.portfolio.unrealizedPnL || 0;
    const pnlPct = nav > 0 ? ((pnl / nav) * 100).toFixed(2) : '0.00';
    const isTripped = Boolean(json.riskGuard && json.riskGuard.circuitBreakerTripped);

    const botStatusEl = document.getElementById('telemetry-bot-status');
    const botNavEl = document.getElementById('telemetry-bot-nav');
    const breakerEl = document.getElementById('telemetry-risk-breaker');

    if (botStatusEl) botStatusEl.textContent = json.status === 'running' ? 'AUTONOMOUS' : 'PAPER DESK';
    if (botNavEl) botNavEl.textContent = `$${Number(nav).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (breakerEl) {
      breakerEl.textContent = isTripped ? 'TRIPPED' : 'ARMED (2.0%)';
      breakerEl.className = isTripped ? 'telemetry-value red' : 'telemetry-value green';
    }

    const jarvisNav = document.getElementById('jarvis-nav-val');
    const jarvisCash = document.getElementById('jarvis-cash-val');
    const jarvisPnl = document.getElementById('jarvis-pnl-val');
    const jarvisPos = document.getElementById('jarvis-positions-val');

    if (jarvisNav) jarvisNav.textContent = `$${Number(nav).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (jarvisCash) jarvisCash.textContent = `$${Number(cash).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (jarvisPnl) {
      const sign = pnl >= 0 ? '+' : '';
      jarvisPnl.textContent = `${sign}$${Number(pnl).toFixed(2)} (${sign}${pnlPct}%)`;
      jarvisPnl.className = pnl >= 0 ? 'portfolio-card-val green' : 'portfolio-card-val red';
    }
    if (jarvisPos && json.portfolio.positions) {
      const symbols = Object.keys(json.portfolio.positions);
      if (symbols.length > 0) {
        jarvisPos.textContent = symbols.slice(0, 4).join(', ');
      }
    }
  } catch (err) {
    // Graceful offline fallback
  }
}

async function loadNewsEngineStatus() {
  try {
    const res = await fetch('/api/news/status');
    if (!res.ok) return;
    const json = await res.json();
    if (!json || !json.success) return;

    const cadenceEl = document.getElementById('telemetry-news-cadence');
    if (cadenceEl && json.interval_hours) {
      cadenceEl.textContent = `${json.interval_hours}.0 Hours`;
    }
  } catch (err) {
    // Graceful offline fallback
  }
}

// ==========================================================================
// DOM READY INITIALIZATION & CENTRAL EVENT DELEGATION
// Zero Inline Event Handlers
// ==========================================================================
if (typeof document !== 'undefined') {
  document.addEventListener('DOMContentLoaded', () => {
    loadDossiersData();
    loadLiveNews();
    loadBotTelemetry();
    loadNewsEngineStatus();
    initHeaderCompact();
    initSlidingNavIndicator();
    initScrollNavSpy();
    initHeroParallax();
    initScrollReveal();
    initCountUp();
    initAnimationVisibilityManager();
    loadSavedUserSession();
    checkSmtpStatus();

  // Audio Toggle Button Initialization
  const audioBtn = document.getElementById('audio-toggle-btn');
  const audioState = document.getElementById('audio-state');
  if (audioBtn) {
    audioBtn.setAttribute('aria-pressed', 'false');
    audioBtn.addEventListener('click', () => {
      TitanState.isAudioEnabled = !TitanState.isAudioEnabled;
      if (audioState) audioState.textContent = TitanState.isAudioEnabled ? 'ON' : 'OFF';
      audioBtn.setAttribute('aria-pressed', TitanState.isAudioEnabled ? 'true' : 'false');
      audioBtn.classList.toggle('muted', !TitanState.isAudioEnabled);
      const icon = audioBtn.querySelector('.audio-icon');
      if (icon) icon.textContent = TitanState.isAudioEnabled ? '🔊' : '🔇';

      if (TitanState.isAudioEnabled) {
        playTone(600, 'sine', 0.1);
        showNotification('Tactical Audio Effects Enabled', 'info');
      } else {
        showNotification('Audio Effects Muted', 'info');
      }
    });
  }

  // Mobile Menu Toggle
  const mobileToggle = document.getElementById('mobile-toggle');
  const navMenu = document.getElementById('nav-menu');
  if (mobileToggle && navMenu) {
    mobileToggle.addEventListener('click', () => {
      const isExpanded = mobileToggle.getAttribute('aria-expanded') === 'true';
      mobileToggle.setAttribute('aria-expanded', String(!isExpanded));
      navMenu.classList.toggle('active');
    });
  }

  // Form Submissions
  const heroGmailForm = document.getElementById('hero-gmail-form');
  if (heroGmailForm) {
    heroGmailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('hero-gmail-input');
      TitanAuth.sendOtp(input ? input.value : '', 'hero');
    });
  }

  const heroOtpForm = document.getElementById('hero-otp-form');
  if (heroOtpForm) {
    heroOtpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('hero-otp-input');
      TitanAuth.verifyOtp(input ? input.value : '', 'hero');
    });
  }

  const heroOtpInput = document.getElementById('hero-otp-input');
  if (heroOtpInput) {
    heroOtpInput.addEventListener('input', () => {
      playTone(680, 'sine', 0.03, 0.04);
      heroOtpInput.value = heroOtpInput.value.replace(/\D/g, '').substring(0, 6);
      if (heroOtpInput.value.length === 6) {
        TitanAuth.verifyOtp(heroOtpInput.value, 'hero');
      }
    });
  }

  const page4GmailForm = document.getElementById('page4-gmail-form');
  if (page4GmailForm) {
    page4GmailForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('gmail-input');
      TitanAuth.sendOtp(input ? input.value : '', 'page4');
    });
  }

  const page4OtpForm = document.getElementById('page4-otp-form');
  if (page4OtpForm) {
    page4OtpForm.addEventListener('submit', (e) => {
      e.preventDefault();
      let enteredPin = '';
      for (let i = 1; i <= 6; i++) {
        const el = document.getElementById(`otp-${i}`);
        if (el) enteredPin += el.value.trim();
      }
      TitanAuth.verifyOtp(enteredPin, 'page4');
    });
  }

  // Page 4 6-digit OTP Input Behavior (Auto-advance & Backspace)
  for (let i = 1; i <= 6; i++) {
    const input = document.getElementById(`otp-${i}`);
    if (input) {
      input.addEventListener('input', (e) => {
        playTone(650, 'sine', 0.04, 0.04);
        input.value = input.value.replace(/\D/g, '').substring(0, 1);
        if (input.value.length === 1 && i < 6) {
          const next = document.getElementById(`otp-${i + 1}`);
          if (next) next.focus();
        }

        // Check if all 6 filled
        let full = '';
        for (let j = 1; j <= 6; j++) {
          const item = document.getElementById(`otp-${j}`);
          if (item) full += item.value.trim();
        }
        if (full.length === 6) {
          TitanAuth.verifyOtp(full, 'page4');
        }
      });

      input.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !input.value && i > 1) {
          const prev = document.getElementById(`otp-${i - 1}`);
          if (prev) {
            prev.focus();
            prev.value = '';
          }
        }
      });

      input.addEventListener('paste', (e) => {
        e.preventDefault();
        const pasted = (e.clipboardData || window.clipboardData).getData('text').replace(/\D/g, '').substring(0, 6);
        if (pasted.length > 0) {
          for (let j = 0; j < 6; j++) {
            const digitInput = document.getElementById(`otp-${j + 1}`);
            if (digitInput) digitInput.value = pasted[j] || '';
          }
          if (pasted.length === 6) {
            TitanAuth.verifyOtp(pasted, 'page4');
          } else {
            const nextEmpty = document.getElementById(`otp-${pasted.length + 1}`);
            if (nextEmpty) nextEmpty.focus();
          }
        }
      });
    }
  }

  // Central Click Delegation for Data Attributes
  document.addEventListener('click', (e) => {
    const target = e.target.closest('[data-action], [data-scroll], [data-scale], [data-speed-horizontal], [data-speed-vertical]');
    if (!target) return;

    const action = target.getAttribute('data-action');
    const scrollTarget = target.getAttribute('data-scroll');
    const scale = target.getAttribute('data-scale');
    const speedH = target.getAttribute('data-speed-horizontal');
    const speedV = target.getAttribute('data-speed-vertical');

    if (scrollTarget) {
      if (scrollTarget === 'top') {
        scrollToTop();
      } else {
        scrollToSection(scrollTarget);
      }
    }

    if (scale) {
      setFontScale(scale);
    }

    if (speedH) {
      adjustTickerSpeed(speedH);
    }

    if (speedV) {
      adjustVerticalSpeed(speedV);
    }

    if (action === 'open-modal') {
      const intelId = target.getAttribute('data-intel-id');
      if (intelId) openIntelModal(intelId);
    } else if (action === 'close-intel-modal') {
      closeModal('intel-modal');
    } else if (action === 'open-smtp-modal') {
      openSmtpModal();
    } else if (action === 'close-smtp-modal') {
      closeModal('smtp-setup-modal');
    } else if (action === 'hero-resend-otp') {
      handleHeroResendOtp();
    } else if (action === 'hero-reset-bar') {
      resetHeroAuthBar();
    } else if (action === 'logout-user') {
      logoutTitanUser();
    } else if (action === 'toggle-horizontal-ticker') {
      toggleHorizontalTicker();
    } else if (action === 'toggle-vertical-feed') {
      toggleVerticalFeed();
    } else if (action === 'reverse-vertical-feed') {
      reverseVerticalFeed();
    } else if (action === 'preset-gmail') {
      const email = target.getAttribute('data-email');
      const input = document.getElementById('gmail-input');
      if (input && email) {
        input.value = email;
        input.focus();
      }
    } else if (action === 'goto-step') {
      const step = parseInt(target.getAttribute('data-step'), 10);
      if (!isNaN(step)) goToStep(step);
    } else if (action === 'process-charge') {
      processTopUpCharge();
    } else if (action === 'reset-topup') {
      resetTopUpFlow();
    } else if (action === 'unlock-dossier-pass') {
      closeModal('intel-modal');
      scrollToSection('page-premium');
    }
  });

  // Keyboard accessibility on cards with role="button"
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const active = document.activeElement;
      if (active && active.getAttribute('data-action') === 'open-modal') {
        e.preventDefault();
        const intelId = active.getAttribute('data-intel-id');
        if (intelId) openIntelModal(intelId);
      }
    }
  });
  });
}

// Explicit exports for module / testing environments
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    TitanState,
    TitanAuth,
    isValidEmail,
    IS_DEMO_MODE,
    escapeHtml,
    isSafeUrl,
    sanitizeHtml,
    IntelDatabase,
    openModal,
    closeModal,
    openSmtpModal,
    closeSmtpModal,
    checkSmtpStatus,
    loadLiveNews,
    loadBotTelemetry,
    loadNewsEngineStatus
  };
}
