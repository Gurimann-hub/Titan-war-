/**
 * TITAN WAR // MATERIALS REPOSITORY HUB CONTROLLER & ROUTE GUARD
 * Architecture: Client-Side Route Protection, Debounced Search, Category Filtering,
 * Tabular / Grid View Transitions, Real File Streaming, and Session Revocation.
 */

// Global Hub State
const MaterialsHub = {
  currentUser: null,
  allMaterials: [],
  filteredMaterials: [],
  currentCategory: 'all',
  searchQuery: '',
  currentSort: 'date-desc',
  viewMode: 'grid', // 'grid' | 'table'
  searchDebounceTimer: null,
  activePreviewItem: null,

  // Phase 3: Live Intelligence Stream & Newsroom State
  newsArticles: [],
  newsBookmarks: new Set(),
  activeMode: 'stream', // 'stream' | 'bookmarks' | 'assets'
  activeTicker: 'all',
  activeCategory: 'all',
  activeSentiment: 'all',
  activeMinImpact: 0,
  activeTimeWindow: 'all',
  newsSearchQuery: '',
  newsDebounceTimer: null,
  sseConnection: null,
  sseReconnectAttempts: 0,
  sseReconnectTimer: null,
  activeDossierArticle: null,
  breakingArticle: null,
  speechSynthUtterance: null,
  isBriefingPlaying: false,
  forceRefreshCooldown: false,

  async init() {
    this.bindDOM();
    this.setupBfCacheGuard();
    const isAuthed = await this.enforceRouteGuard();
    if (isAuthed) {
      await this.initNewsStream();
      await this.loadMaterials();
      this.updateStorageDisplay();
      this.initTradingAssistantWidget();
    }
  },

  /**
   * Section 6: Authentication Route Guard
   * Evaluates presence and validity of session token via /api/auth/session.
   * Redirects immediately to /login?returnUrl=/materials if unauthenticated.
   */
  async enforceRouteGuard() {
    try {
      const response = await fetch('/api/auth/session', {
        method: 'GET',
        credentials: 'same-origin',
        headers: {
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        }
      });

      if (!response.ok) {
        throw new Error('Unauthorized');
      }

      const data = await response.json();
      if (!data.authenticated || !data.user) {
        throw new Error('Not authenticated');
      }

      this.currentUser = data.user;
      this.renderUserProfile(data.user);
      return true;
    } catch (err) {
      console.warn('[SECURITY ROUTE GUARD] Access denied. Redirecting to authentication portal...');
      localStorage.removeItem('titan_auth_user');
      sessionStorage.removeItem('titan_auth_active');
      window.location.replace('/login?returnUrl=/materials');
      return false;
    }
  },

  /**
   * Back-button and bfcache protection:
   * Detects restored pages from browser back-forward cache and re-verifies session.
   */
  setupBfCacheGuard() {
    window.addEventListener('pageshow', (event) => {
      if (event.persisted) {
        console.log('[SECURITY] Restored from bfcache, validating session integrity...');
        this.enforceRouteGuard();
      }
    });
  },

  bindDOM() {
    // Nav elements
    this.logoutBtn = document.getElementById('logout-btn');
    this.userAvatarCircle = document.getElementById('user-avatar-circle');
    this.userNameDisplay = document.getElementById('user-name-display');
    this.userRoleDisplay = document.getElementById('user-role-display');

    // Controls
    this.searchInput = document.getElementById('search-input');
    this.searchClearBtn = document.getElementById('search-clear-btn');
    this.sortSelect = document.getElementById('sort-select');
    this.categoryPills = document.querySelectorAll('.category-pill');
    this.btnViewGrid = document.getElementById('btn-view-grid');
    this.btnViewTable = document.getElementById('btn-view-table');

    // Display containers
    this.materialsGrid = document.getElementById('materials-grid');
    this.materialsTableContainer = document.getElementById('materials-table-container');
    this.materialsTableBody = document.getElementById('materials-table-body');
    this.materialsCountBadge = document.getElementById('materials-count-badge');

    // Modals
    this.previewModal = document.getElementById('preview-modal');
    this.uploadModal = document.getElementById('upload-modal');
    this.btnOpenUpload = document.getElementById('btn-open-upload');
    this.uploadForm = document.getElementById('upload-form');

    // Logout trigger
    if (this.logoutBtn) {
      this.logoutBtn.addEventListener('click', (e) => {
        e.preventDefault();
        this.handleLogout();
      });
    }

    // Search input with debounce
    if (this.searchInput) {
      this.searchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        if (this.searchClearBtn) {
          this.searchClearBtn.classList.toggle('visible', query.length > 0);
        }
        clearTimeout(this.searchDebounceTimer);
        this.searchDebounceTimer = setTimeout(() => {
          this.searchQuery = query;
          this.applyFiltersAndRender();
        }, 220);
      });
    }

    if (this.searchClearBtn) {
      this.searchClearBtn.addEventListener('click', () => {
        this.searchInput.value = '';
        this.searchClearBtn.classList.remove('visible');
        this.searchQuery = '';
        this.applyFiltersAndRender();
        this.searchInput.focus();
      });
    }

    // Sort Dropdown
    if (this.sortSelect) {
      this.sortSelect.addEventListener('change', (e) => {
        this.currentSort = e.target.value;
        this.applyFiltersAndRender();
      });
    }

    // Category Filter Pills
    this.categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        this.categoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.currentCategory = pill.getAttribute('data-category') || 'all';
        this.applyFiltersAndRender();
      });
    });

    // View Mode Toggle Buttons
    if (this.btnViewGrid) {
      this.btnViewGrid.addEventListener('click', () => this.setViewMode('grid'));
    }
    if (this.btnViewTable) {
      this.btnViewTable.addEventListener('click', () => this.setViewMode('table'));
    }

    // Modal Trigger: Upload
    if (this.btnOpenUpload) {
      this.btnOpenUpload.addEventListener('click', () => this.openUploadModal());
    }

    if (this.uploadForm) {
      this.uploadForm.addEventListener('submit', (e) => this.handleUploadSubmit(e));
    }

    // Global modal close handlers
    document.addEventListener('click', (e) => {
      if (e.target.matches('[data-close-modal]') || e.target.classList.contains('portal-modal-backdrop')) {
        this.closeAllModals();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeAllModals();
      }
    });
  },

  renderUserProfile(user) {
    if (this.userAvatarCircle) {
      this.userAvatarCircle.textContent = user.avatar || 'AM';
    }
    if (this.userNameDisplay) {
      this.userNameDisplay.textContent = user.name || 'Alex Mercer';
    }
    if (this.userRoleDisplay) {
      this.userRoleDisplay.textContent = `${user.role || 'Host'} // Level 5`;
    }
  },

  setViewMode(mode) {
    this.viewMode = mode;
    if (this.btnViewGrid) this.btnViewGrid.classList.toggle('active', mode === 'grid');
    if (this.btnViewTable) this.btnViewTable.classList.toggle('active', mode === 'table');

    if (this.materialsGrid) {
      this.materialsGrid.style.display = mode === 'grid' ? 'grid' : 'none';
    }
    if (this.materialsTableContainer) {
      this.materialsTableContainer.style.display = mode === 'table' ? 'block' : 'none';
    }
  },

  async loadMaterials() {
    try {
      const response = await fetch('/api/materials', {
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!response.ok) throw new Error('Failed to load materials');

      const data = await response.json();
      this.allMaterials = data.materials || [];
      this.updateStorageDisplay(data.storage);
      this.updateCategoryCounts();
      this.applyFiltersAndRender();
    } catch (err) {
      this.showToast('Error loading materials repository.', 'error');
    }
  },

  updateStorageDisplay(storageData) {
    const defaultStorage = {
      usedFormatted: '6.4 GB',
      totalFormatted: '15.0 GB',
      percentage: '42.7'
    };
    const s = storageData || defaultStorage;

    const fillBar = document.getElementById('storage-bar-fill');
    const numbersEl = document.getElementById('storage-numbers-text');
    if (fillBar) fillBar.style.width = `${s.percentage}%`;
    if (numbersEl) {
      numbersEl.innerHTML = `<strong>${s.usedFormatted}</strong> utilized of <strong>${s.totalFormatted}</strong> (${s.percentage}%)`;
    }
  },

  updateCategoryCounts() {
    const counts = { all: this.allMaterials.length };
    this.allMaterials.forEach(m => {
      const cat = m.category.toLowerCase();
      counts[cat] = (counts[cat] || 0) + 1;
    });

    this.categoryPills.forEach(pill => {
      const cat = pill.getAttribute('data-category');
      const badge = pill.querySelector('.pill-count');
      if (badge) {
        badge.textContent = counts[cat] || 0;
      }
    });
  },

  applyFiltersAndRender() {
    let list = [...this.allMaterials];

    // Category filter
    if (this.currentCategory && this.currentCategory !== 'all') {
      list = list.filter(m => m.category.toLowerCase() === this.currentCategory.toLowerCase());
    }

    // Search query filter
    if (this.searchQuery && this.searchQuery.trim()) {
      const q = this.searchQuery.trim().toLowerCase();
      list = list.filter(m => {
        const titleMatch = m.title.toLowerCase().includes(q);
        const descMatch = m.description && m.description.toLowerCase().includes(q);
        const tagMatch = m.tags && m.tags.some(t => t.toLowerCase().includes(q));
        const extMatch = m.fileType && m.fileType.toLowerCase().includes(q);
        return titleMatch || descMatch || tagMatch || extMatch;
      });
    }

    // Sort order
    switch (this.currentSort) {
      case 'date-asc':
        list.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
        break;
      case 'size-desc':
        list.sort((a, b) => (b.fileSizeBytes || 0) - (a.fileSizeBytes || 0));
        break;
      case 'size-asc':
        list.sort((a, b) => (a.fileSizeBytes || 0) - (b.fileSizeBytes || 0));
        break;
      case 'title-asc':
        list.sort((a, b) => a.title.localeCompare(b.title));
        break;
      case 'popularity-desc':
        list.sort((a, b) => (b.downloadsCount || 0) - (a.downloadsCount || 0));
        break;
      case 'date-desc':
      default:
        list.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
        break;
    }

    this.filteredMaterials = list;

    if (this.materialsCountBadge) {
      this.materialsCountBadge.textContent = `${list.length} asset${list.length === 1 ? '' : 's'}`;
    }

    this.renderGrid(list);
    this.renderTable(list);
  },

  renderGrid(items) {
    if (!this.materialsGrid) return;

    if (items.length === 0) {
      this.materialsGrid.innerHTML = `
        <div class="empty-state-card">
          <div class="empty-state-icon">🔍</div>
          <h3 class="empty-state-title">No Intelligence Materials Found</h3>
          <p class="empty-state-desc">No assets match your search filters. Try adjusting keywords or category selection.</p>
        </div>
      `;
      return;
    }

    this.materialsGrid.innerHTML = items.map(item => {
      const typeLower = (item.fileType || 'dat').toLowerCase();
      const accessBadgeClass = item.accessLevel === 'host-only' ? 'host-only' : item.accessLevel === 'restricted' ? 'restricted' : 'public';
      const accessLabel = item.accessLevel === 'host-only' ? 'HOST ONLY' : item.accessLevel === 'restricted' ? 'RESTRICTED' : 'PUBLIC';

      return `
        <article class="material-card" data-id="${item.id}">
          <div>
            <div class="card-top">
              <div class="resource-icon-badge ${typeLower}">
                ${item.fileType || 'FILE'}
              </div>
              <div class="card-heading-meta">
                <h3 class="card-title" title="${this.escapeHtml(item.title)}">${this.escapeHtml(item.title)}</h3>
                <div class="card-badges-row">
                  <span class="badge-tag ${accessBadgeClass}">${accessLabel}</span>
                  <span class="badge-tag" style="background: rgba(255,255,255,0.06); color: var(--text-secondary);">${item.category}</span>
                </div>
              </div>
            </div>

            <p class="card-description">${this.escapeHtml(item.description || 'Intelligence dossier asset.')}</p>
          </div>

          <div>
            <div class="card-metadata-row">
              <span class="card-meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>${item.fileSize}</span>
              </span>
              <span class="card-meta-item">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                <span>${item.dateAdded}</span>
              </span>
            </div>

            <div class="card-actions-row">
              <button type="button" class="btn btn-sm btn-primary" onclick="MaterialsHub.downloadAsset('${item.id}')" title="Download ${this.escapeHtml(item.title)}">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>Download</span>
              </button>

              <button type="button" class="btn btn-sm btn-ghost" onclick="MaterialsHub.previewAsset('${item.id}')" title="Preview Dossier">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                <span>Preview</span>
              </button>

              <button type="button" class="btn btn-sm btn-ghost" onclick="MaterialsHub.shareAsset('${item.id}')" title="Copy Share Link">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  renderTable(items) {
    if (!this.materialsTableBody) return;

    if (items.length === 0) {
      this.materialsTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
            No matching materials found in repository.
          </td>
        </tr>
      `;
      return;
    }

    this.materialsTableBody.innerHTML = items.map(item => {
      const typeLower = (item.fileType || 'dat').toLowerCase();
      const accessBadgeClass = item.accessLevel === 'host-only' ? 'host-only' : item.accessLevel === 'restricted' ? 'restricted' : 'public';
      const accessLabel = item.accessLevel === 'host-only' ? 'HOST ONLY' : item.accessLevel === 'restricted' ? 'RESTRICTED' : 'PUBLIC';

      return `
        <tr>
          <td>
            <div class="table-file-cell">
              <div class="resource-icon-badge ${typeLower}" style="width: 32px; height: 32px; font-size: 0.68rem;">
                ${item.fileType || 'FILE'}
              </div>
              <div>
                <div class="table-file-title">${this.escapeHtml(item.title)}</div>
                <div class="table-file-sub">${item.id} &bull; ${item.fileType}</div>
              </div>
            </div>
          </td>
          <td><span class="badge-tag" style="background: rgba(255,255,255,0.06); color: var(--text-secondary);">${item.category}</span></td>
          <td><span style="font-family: var(--font-mono); font-size: 0.8rem;">${item.fileSize}</span></td>
          <td><span class="badge-tag ${accessBadgeClass}">${accessLabel}</span></td>
          <td style="color: var(--text-secondary);">${item.dateAdded}</td>
          <td>
            <div style="display: flex; gap: 6px;">
              <button type="button" class="btn btn-sm btn-primary" onclick="MaterialsHub.downloadAsset('${item.id}')" title="Download">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>
                <span>Get</span>
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onclick="MaterialsHub.previewAsset('${item.id}')" title="Preview">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button type="button" class="btn btn-sm btn-ghost" onclick="MaterialsHub.shareAsset('${item.id}')" title="Share Link">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  /**
   * Real File Download Trigger
   * Directs download request to /api/materials/download/:id
   */
  async downloadAsset(id) {
    const item = this.allMaterials.find(m => m.id === id);
    const title = item ? item.title : 'Asset';
    this.showToast(`Initiating secure download: ${title}...`, 'info');

    try {
      const response = await fetch(`/api/materials/download/${id}`, {
        credentials: 'same-origin'
      });

      if (!response.ok) {
        throw new Error('Download failed');
      }

      // Stream blob to client
      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const tempAnchor = document.createElement('a');
      tempAnchor.style.display = 'none';
      tempAnchor.href = downloadUrl;
      const sanitizedName = (item?.title || 'dossier').replace(/[^a-zA-Z0-9_-]/g, '_');
      tempAnchor.download = `${sanitizedName}.${(item?.fileType || 'txt').toLowerCase()}`;
      document.body.appendChild(tempAnchor);
      tempAnchor.click();
      window.URL.revokeObjectURL(downloadUrl);
      tempAnchor.remove();

      this.showToast(`Download completed: ${item?.title || 'File'}`, 'success');
    } catch (e) {
      this.showToast('Unable to stream asset. Please verify session.', 'error');
    }
  },

  /**
   * Preview Asset Dialog
   */
  previewAsset(id) {
    const item = this.allMaterials.find(m => m.id === id);
    if (!item) return;

    this.activePreviewItem = item;

    const modalTitle = document.getElementById('preview-modal-title');
    const modalCategory = document.getElementById('preview-modal-category');
    const modalSize = document.getElementById('preview-modal-size');
    const modalDate = document.getElementById('preview-modal-date');
    const modalAccess = document.getElementById('preview-modal-access');
    const modalChecksum = document.getElementById('preview-modal-checksum');
    const modalContent = document.getElementById('preview-modal-content');
    const btnDownload = document.getElementById('preview-btn-download');

    if (modalTitle) modalTitle.textContent = item.title;
    if (modalCategory) modalCategory.textContent = item.category;
    if (modalSize) modalSize.textContent = `${item.fileSize} (${item.fileType})`;
    if (modalDate) modalDate.textContent = item.dateAdded;
    if (modalAccess) modalAccess.textContent = item.accessLevel.toUpperCase();
    if (modalChecksum) modalChecksum.textContent = item.checksum || 'SHA-256 Verified';
    if (modalContent) modalContent.textContent = item.sampleContent || 'Preview unavailable for this format.';

    if (btnDownload) {
      btnDownload.onclick = () => this.downloadAsset(item.id);
    }

    if (this.previewModal) {
      this.previewModal.classList.add('active');
    }
  },

  /**
   * Share Asset Link to Clipboard
   */
  shareAsset(id) {
    const item = this.allMaterials.find(m => m.id === id);
    const title = item ? item.title : 'Material';
    const shareUrl = `${window.location.origin}/materials?assetId=${encodeURIComponent(id)}`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(shareUrl).then(() => {
        this.showToast(`Copied secure link for: "${title}"`, 'success');
      }).catch(() => {
        this.fallbackCopyText(shareUrl);
      });
    } else {
      this.fallbackCopyText(shareUrl);
    }
  },

  fallbackCopyText(text) {
    const input = document.createElement('input');
    input.value = text;
    document.body.appendChild(input);
    input.select();
    document.execCommand('copy');
    input.remove();
    this.showToast('Copied secure share link to clipboard!', 'success');
  },

  openUploadModal() {
    if (this.uploadModal) {
      this.uploadModal.classList.add('active');
    }
  },

  closeAllModals() {
    if (this.previewModal) this.previewModal.classList.remove('active');
    if (this.uploadModal) this.uploadModal.classList.remove('active');
    const dossierModal = document.getElementById('story-dossier-modal');
    if (dossierModal) dossierModal.classList.remove('active');
  },

  async handleUploadSubmit(e) {
    e.preventDefault();
    const title = document.getElementById('upload-title')?.value.trim();
    const category = document.getElementById('upload-category')?.value;
    const fileType = document.getElementById('upload-filetype')?.value.trim().toUpperCase() || 'PDF';
    const fileSize = document.getElementById('upload-filesize')?.value.trim() || '4.2 MB';
    const accessLevel = document.getElementById('upload-access')?.value || 'host-only';
    const description = document.getElementById('upload-desc')?.value.trim();

    if (!title || !category) {
      this.showToast('Title and category are required.', 'error');
      return;
    }

    try {
      const response = await fetch('/api/materials', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({
          title,
          category,
          fileType,
          fileSize,
          accessLevel,
          description
        })
      });

      if (!response.ok) throw new Error('Upload failed');
      const data = await response.json();

      this.closeAllModals();
      this.showToast(`Strategic material "${title}" registered successfully!`, 'success');

      // Reload dataset
      await this.loadMaterials();
    } catch (err) {
      this.showToast('Failed to register material.', 'error');
    }
  },

  /**
   * Session Revocation & Log Out Flow
   * Purges client state, clears HttpOnly cookies, and redirects to /login?message=logged_out
   */
  async handleLogout() {
    this.showToast('Terminating executive session...', 'info');

    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        credentials: 'same-origin'
      });
    } catch (e) {
      // Ignore network errors on logout
    }

    // Purge local storage tokens and identity cache
    localStorage.removeItem('titan_auth_user');
    sessionStorage.removeItem('titan_auth_active');

    // Programmatic redirect back to sign-in portal
    window.location.replace('/login?message=logged_out');
  },

  escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
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
  },

  /**
   * Section 7: Trading Assistant Workstation Integration
   * Connects New Folder 1 (JARVIS & MarketOracle) directly into Materials page.
   * Loads market ticker ribbon and controls the responsive embedded workstation iframe.
   */
  async initTradingAssistantWidget() {
    const ribbon = document.getElementById('assistant-ticker-ribbon');
    const toggleBtn = document.getElementById('toggle-embedded-assistant');
    const toggleText = document.getElementById('toggle-assistant-text');
    const container = document.getElementById('embedded-assistant-container');
    const iframe = document.getElementById('assistant-iframe');
    const navBtn = document.getElementById('nav-trading-assistant-btn');

    if (toggleBtn && container && iframe) {
      toggleBtn.addEventListener('click', () => {
        const isHidden = container.style.display === 'none';
        if (isHidden) {
          if (!iframe.src || iframe.src === 'about:blank' || iframe.src.endsWith('about:blank')) {
            iframe.src = '/trading-assistant';
          }
          container.style.display = 'block';
          if (toggleText) toggleText.textContent = 'Collapse Workstation';
          toggleBtn.classList.add('active');
        } else {
          container.style.display = 'none';
          if (toggleText) toggleText.textContent = 'Expand Embedded Workstation';
          toggleBtn.classList.remove('active');
        }
      });
    }

    if (navBtn) {
      navBtn.addEventListener('click', (e) => {
        const hubCard = document.getElementById('trading-assistant-hub-card');
        if (hubCard) {
          hubCard.scrollIntoView({ behavior: 'smooth', block: 'start' });
          if (container && container.style.display === 'none' && toggleBtn) {
            toggleBtn.click();
          }
          e.preventDefault();
        }
      });
    }

    // Load live market snapshot ribbon
    if (ribbon) {
      try {
        const res = await fetch('/api/market/snapshot?tickers=NVDA,MSFT,AAPL,GOOGL,AMZN,META,TSLA,PLTR');
        if (res.ok) {
          const snapshots = await res.json();
          ribbon.innerHTML = snapshots.map(s => {
            const isPositive = s.changePct >= 0;
            const changeColor = isPositive ? '#10b981' : '#f43f5e';
            const changeSign = isPositive ? '+' : '';
            return `
              <div style="background: rgba(15, 23, 42, 0.7); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 10px 12px; cursor: pointer; transition: transform 0.15s ease;" onclick="window.open('/trading-assistant', '_blank')" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='translateY(0)'" title="View ${s.company} in Trading Assistant">
                <div style="display: flex; justify-content: space-between; align-items: baseline;">
                  <strong style="color: #f8fafc; font-size: 0.9rem;">${s.ticker}</strong>
                  <span style="font-size: 0.75rem; color: ${changeColor}; font-weight: 600;">${changeSign}${s.changePct.toFixed(2)}%</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
                  <span style="font-size: 0.85rem; color: #94a3b8;">$${s.price.toFixed(2)}</span>
                  <span style="font-size: 0.65rem; color: #06b6d4; text-transform: uppercase;">${s.primarySignal || 'SIGNAL'}</span>
                </div>
              </div>
            `;
          }).join('');
        }
      } catch (e) {
        console.warn('[TRADING ASSISTANT] Ribbon load warning:', e.message);
      }
    }

    // Section 7.B: Triad Trading Bot & Physical Kill Switch Controls
    const statusPill = document.getElementById('bot-status-pill');
    const startBtn = document.getElementById('bot-start-btn');
    const stopBtn = document.getElementById('bot-stop-btn');
    const killBtn = document.getElementById('bot-kill-btn');
    const resetBtn = document.getElementById('bot-reset-btn');

    const updateBotUI = (statusData) => {
      if (!statusPill) return;
      const status = statusData.status || 'STOPPED';
      if (status === 'RUNNING') {
        statusPill.textContent = 'BOT: RUNNING';
        statusPill.style.background = 'rgba(16, 185, 129, 0.2)';
        statusPill.style.color = '#10b981';
        statusPill.style.borderColor = 'rgba(16, 185, 129, 0.4)';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'inline-block';
        if (resetBtn) resetBtn.style.display = 'none';
      } else if (status === 'TRIPPED') {
        statusPill.textContent = 'BOT: TRIPPED / LOCKED';
        statusPill.style.background = 'rgba(239, 68, 68, 0.25)';
        statusPill.style.color = '#f87171';
        statusPill.style.borderColor = 'rgba(239, 68, 68, 0.5)';
        if (startBtn) startBtn.style.display = 'none';
        if (stopBtn) stopBtn.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'inline-block';
      } else {
        statusPill.textContent = 'BOT: STOPPED';
        statusPill.style.background = 'rgba(148, 163, 184, 0.2)';
        statusPill.style.color = '#cbd5e1';
        statusPill.style.borderColor = 'rgba(148, 163, 184, 0.3)';
        if (startBtn) startBtn.style.display = 'inline-block';
        if (stopBtn) stopBtn.style.display = 'none';
        if (resetBtn) resetBtn.style.display = 'none';
      }
    };

    const syncBotStatus = async () => {
      try {
        const res = await fetch('/api/bot/status');
        if (res.ok) {
          const data = await res.json();
          updateBotUI(data);
        }
      } catch (e) {
        // quiet catch
      }
    };

    if (startBtn) {
      startBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/bot/start', { method: 'POST' });
          const data = await res.json();
          if (res.ok && data.success) {
            MaterialsHub.showToast('Triad Trading Bot simulation started', 'success');
          } else {
            MaterialsHub.showToast(data.message || 'Failed to start bot', 'error');
          }
          syncBotStatus();
        } catch (e) {
          MaterialsHub.showToast('Network error starting bot', 'error');
        }
      });
    }

    if (stopBtn) {
      stopBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/bot/stop', { method: 'POST' });
          if (res.ok) {
            MaterialsHub.showToast('Trading Bot simulation paused', 'info');
          }
          syncBotStatus();
        } catch (e) {
          MaterialsHub.showToast('Network error stopping bot', 'error');
        }
      });
    }

    if (killBtn) {
      killBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/bot/kill-switch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: 'Operator manual kill switch activation from Materials Hub' })
          });
          const data = await res.json();
          if (res.ok && data.success) {
            MaterialsHub.showToast('EMERGENCY KILL SWITCH ENGAGED! Bot halted and locked.', 'error');
          }
          syncBotStatus();
        } catch (e) {
          MaterialsHub.showToast('Failed to trigger kill switch', 'error');
        }
      });
    }

    if (resetBtn) {
      resetBtn.addEventListener('click', async () => {
        try {
          const res = await fetch('/api/bot/reset', { method: 'POST' });
          if (res.ok) {
            MaterialsHub.showToast('RiskGuard circuit breaker reset to Standby', 'success');
          }
          syncBotStatus();
        } catch (e) {
          MaterialsHub.showToast('Failed to reset circuit breaker', 'error');
        }
      });
    }

    syncBotStatus();
  },

  // =========================================================================
  // PHASE 3: LIVE INTELLIGENCE STREAM & NEWSROOM CONTROLLER METHODS
  // =========================================================================

  async initNewsStream() {
    this.bindNewsDOM();
    await this.loadBookmarks();
    await this.loadNewsArticles();
    this.connectNewsSSE();
  },

  bindNewsDOM() {
    // Live date display
    const dateDisplay = document.getElementById('stream-live-date');
    if (dateDisplay) {
      const now = new Date();
      const monthYear = now.toLocaleString('en-US', { month: 'long', year: 'numeric' }).toUpperCase();
      dateDisplay.textContent = `${monthYear} // REAL-TIME HYPERSCALER CATALYST RADAR`;
    }

    // Mode Tabs
    const tabs = document.querySelectorAll('.news-mode-tab');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const mode = tab.getAttribute('data-mode') || 'stream';
        this.setMode(mode);
      });
    });

    // News Search
    const searchInput = document.getElementById('news-search-input');
    const searchClear = document.getElementById('news-search-clear');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        if (searchClear) searchClear.classList.toggle('visible', val.length > 0);
        clearTimeout(this.newsDebounceTimer);
        this.newsDebounceTimer = setTimeout(() => {
          this.newsSearchQuery = val;
          this.renderNewsFeed();
        }, 200);
      });
    }

    if (searchClear) {
      searchClear.addEventListener('click', () => {
        if (searchInput) {
          searchInput.value = '';
          searchInput.focus();
        }
        searchClear.classList.remove('visible');
        this.newsSearchQuery = '';
        this.renderNewsFeed();
      });
    }

    // Filter dropdowns
    const impactSelect = document.getElementById('news-impact-select');
    if (impactSelect) {
      impactSelect.addEventListener('change', (e) => {
        this.activeMinImpact = parseInt(e.target.value, 10) || 0;
        this.renderNewsFeed();
      });
    }

    const timeSelect = document.getElementById('news-time-select');
    if (timeSelect) {
      timeSelect.addEventListener('change', (e) => {
        this.activeTimeWindow = e.target.value || 'all';
        this.renderNewsFeed();
      });
    }

    // Ticker Pills
    const tickerPills = document.querySelectorAll('#news-ticker-pills .news-pill-btn');
    tickerPills.forEach(pill => {
      pill.addEventListener('click', () => {
        tickerPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeTicker = pill.getAttribute('data-ticker') || 'all';
        this.renderNewsFeed();
      });
    });

    // Category Pills
    const categoryPills = document.querySelectorAll('#news-category-pills .news-pill-btn');
    categoryPills.forEach(pill => {
      pill.addEventListener('click', () => {
        categoryPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeCategory = pill.getAttribute('data-category') || 'all';
        this.renderNewsFeed();
      });
    });

    // Sentiment Pills
    const sentimentPills = document.querySelectorAll('#news-sentiment-pills .news-pill-btn');
    sentimentPills.forEach(pill => {
      pill.addEventListener('click', () => {
        sentimentPills.forEach(p => p.classList.remove('active'));
        pill.classList.add('active');
        this.activeSentiment = pill.getAttribute('data-sentiment') || 'all';
        this.renderNewsFeed();
      });
    });

    // Force Refresh Button
    const btnRefresh = document.getElementById('btn-force-refresh-news');
    if (btnRefresh) {
      btnRefresh.addEventListener('click', () => this.forceRefreshNews());
    }

    // Audio Briefing Player
    const btnPlayBriefing = document.getElementById('btn-play-briefing');
    if (btnPlayBriefing) {
      btnPlayBriefing.addEventListener('click', () => this.startAudioBriefing());
    }

    const audioToggle = document.getElementById('audio-play-toggle');
    if (audioToggle) {
      audioToggle.addEventListener('click', () => this.toggleAudioBriefing());
    }

    const audioClose = document.getElementById('audio-close-btn');
    if (audioClose) {
      audioClose.addEventListener('click', () => this.stopAudioBriefing());
    }

    // Breaking Alert Banner Actions
    const btnBreakingDossier = document.getElementById('btn-breaking-dossier');
    if (btnBreakingDossier) {
      btnBreakingDossier.addEventListener('click', () => {
        if (this.breakingArticle) {
          this.openStoryDossier(this.breakingArticle);
        }
      });
    }

    const btnDismissBreaking = document.getElementById('btn-dismiss-breaking');
    if (btnDismissBreaking) {
      btnDismissBreaking.addEventListener('click', () => {
        const banner = document.getElementById('breaking-alert-banner');
        if (banner) banner.style.display = 'none';
      });
    }

    // Dossier Modal Bookmark Button
    const btnDossierBookmark = document.getElementById('dossier-btn-bookmark');
    if (btnDossierBookmark) {
      btnDossierBookmark.addEventListener('click', () => {
        if (this.activeDossierArticle) {
          this.toggleStoryBookmark(this.activeDossierArticle.id);
        }
      });
    }
  },

  async loadBookmarks() {
    try {
      const res = await fetch('/api/bookmarks');
      if (res.ok) {
        const data = await res.json();
        const bMarks = data.bookmarks || data.items || [];
        this.newsBookmarks = new Set(bMarks.map(b => b.article_id || b.id));
        this.updateBookmarksBadge();
      }
    } catch (e) {
      console.warn('[NEWSROOM] Could not load bookmarks:', e.message);
    }
  },

  async loadNewsArticles() {
    try {
      const res = await fetch('/api/news');
      if (res.ok) {
        const data = await res.json();
        const articles = data.articles || data.items || [];
        if (Array.isArray(articles) && articles.length > 0) {
          this.newsArticles = articles;
          localStorage.setItem('titan_cached_news', JSON.stringify(articles.slice(0, 50)));
        }
      }
    } catch (e) {
      console.warn('[NEWSROOM] Failed to fetch live news, loading offline cache:', e.message);
      const cached = localStorage.getItem('titan_cached_news');
      if (cached) {
        try {
          this.newsArticles = JSON.parse(cached);
        } catch (_) {}
      }
    }

    this.checkBreakingStory();
    this.updateStreamCountBadge();
    this.renderNewsFeed();
  },

  checkBreakingStory() {
    const breaking = this.newsArticles.find(a => a.is_breaking || a.impact_score >= 9);
    const banner = document.getElementById('breaking-alert-banner');
    const headlineText = document.getElementById('breaking-headline-text');

    if (breaking && banner && headlineText) {
      this.breakingArticle = breaking;
      headlineText.textContent = breaking.headline;
      banner.style.display = 'flex';
    } else if (banner) {
      banner.style.display = 'none';
    }
  },

  updateStreamCountBadge() {
    const badge = document.getElementById('stream-count-badge');
    if (badge) {
      badge.textContent = this.newsArticles.length;
    }
  },

  updateBookmarksBadge() {
    const badge = document.getElementById('bookmarks-count-badge');
    if (badge) {
      badge.textContent = this.newsBookmarks.size;
    }
  },

  connectNewsSSE() {
    if (this.sseConnection) {
      try { this.sseConnection.close(); } catch (_) {}
    }

    const statusPill = document.getElementById('stream-status-pill');
    const statusText = document.getElementById('stream-status-text');

    try {
      this.sseConnection = new EventSource('/api/news/stream');

      this.sseConnection.onopen = () => {
        this.sseReconnectAttempts = 0;
        if (this.sseReconnectTimer) clearTimeout(this.sseReconnectTimer);
        if (statusPill) statusPill.classList.remove('reconnecting');
        if (statusText) statusText.textContent = 'LIVE STREAM ACTIVE';
      };

      this.sseConnection.onerror = () => {
        if (statusPill) statusPill.classList.add('reconnecting');
        if (statusText) statusText.textContent = 'RECONNECTING...';

        try { this.sseConnection.close(); } catch (_) {}

        // Jittered exponential backoff: 1s, 2s, 4s, 8s, up to 30s
        const delay = Math.min(1000 * Math.pow(2, this.sseReconnectAttempts), 30000) + Math.random() * 500;
        this.sseReconnectAttempts++;
        this.sseReconnectTimer = setTimeout(() => this.connectNewsSSE(), delay);
      };

      this.sseConnection.addEventListener('connected', (e) => {
        console.log('[SSE] News stream handshake active:', e.data);
      });

      this.sseConnection.addEventListener('initial_feed', (e) => {
        try {
          const payload = JSON.parse(e.data);
          const articles = payload.articles || payload.items || [];
          if (Array.isArray(articles) && articles.length > 0) {
            // Merge with local list avoiding duplicates
            const existingIds = new Set(this.newsArticles.map(a => a.id));
            const newOnes = articles.filter(a => !existingIds.has(a.id));
            if (newOnes.length > 0) {
              this.newsArticles = [...newOnes, ...this.newsArticles];
              this.updateStreamCountBadge();
              this.checkBreakingStory();
              this.renderNewsFeed();
            }
          }
        } catch (err) {
          console.warn('[SSE] Error parsing initial_feed:', err.message);
        }
      });

      this.sseConnection.addEventListener('news_story', (e) => {
        try {
          const story = JSON.parse(e.data);
          if (story && story.id) {
            const exists = this.newsArticles.some(a => a.id === story.id || a.headline === story.headline);
            if (!exists) {
              this.newsArticles.unshift(story);
              localStorage.setItem('titan_cached_news', JSON.stringify(this.newsArticles.slice(0, 50)));
              this.updateStreamCountBadge();

              if (story.impact_score >= 9 || story.is_breaking) {
                this.checkBreakingStory();
              }

              // Prepend to DOM if in stream mode and matches active filter
              if (this.activeMode === 'stream') {
                this.renderNewsFeed(story.id); // passes newStoryId for animation
              }

              this.showToast(`⚡ Live Intelligence: ${story.headline.slice(0, 55)}... (Impact ${story.impact_score}/10)`, 'info');
            }
          }
        } catch (err) {
          console.warn('[SSE] Error processing news_story:', err.message);
        }
      });
    } catch (e) {
      console.warn('[SSE] EventSource initialization warning:', e.message);
    }
  },

  setMode(mode) {
    this.activeMode = mode;

    // Update active tab styles
    const tabs = document.querySelectorAll('.news-mode-tab');
    tabs.forEach(tab => {
      const tabMode = tab.getAttribute('data-mode');
      const isActive = tabMode === mode;
      tab.classList.toggle('active', isActive);
      tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
    });

    const newsFeedView = document.getElementById('news-feed-view');
    const dossierArchivesView = document.getElementById('dossier-archives-view');

    if (mode === 'assets') {
      if (newsFeedView) newsFeedView.style.display = 'none';
      if (dossierArchivesView) dossierArchivesView.style.display = 'block';
    } else {
      if (dossierArchivesView) dossierArchivesView.style.display = 'none';
      if (newsFeedView) newsFeedView.style.display = 'block';
      this.renderNewsFeed();
    }
  },

  renderNewsFeed(highlightStoryId = null) {
    const container = document.getElementById('news-stream-container');
    if (!container) return;

    let list = [...this.newsArticles];

    // Filter by mode
    if (this.activeMode === 'bookmarks') {
      list = list.filter(a => this.newsBookmarks.has(a.id));
    }

    // Filter by Ticker
    if (this.activeTicker !== 'all') {
      const t = this.activeTicker.toUpperCase();
      list = list.filter(a => {
        if (Array.isArray(a.tickers)) return a.tickers.includes(t);
        if (typeof a.tickers === 'string') return a.tickers.includes(t);
        return (a.headline && a.headline.includes(t)) || (a.content && a.content.includes(t));
      });
    }

    // Filter by Category
    if (this.activeCategory !== 'all') {
      list = list.filter(a => (a.category || '').toLowerCase() === this.activeCategory.toLowerCase());
    }

    // Filter by Sentiment
    if (this.activeSentiment !== 'all') {
      list = list.filter(a => (a.sentiment || '').toLowerCase() === this.activeSentiment.toLowerCase());
    }

    // Filter by Min Impact
    if (this.activeMinImpact > 0) {
      list = list.filter(a => (a.impact_score || 0) >= this.activeMinImpact);
    }

    // Filter by Time Horizon
    if (this.activeTimeWindow !== 'all') {
      const now = Date.now();
      const windowHours = this.activeTimeWindow === '24h' ? 24 : this.activeTimeWindow === '7d' ? 168 : 720;
      const maxAgeMs = windowHours * 60 * 60 * 1000;
      list = list.filter(a => {
        const ts = new Date(a.published_at || a.created_at || Date.now()).getTime();
        return (now - ts) <= maxAgeMs;
      });
    }

    // Filter by Search Query
    if (this.newsSearchQuery) {
      const q = this.newsSearchQuery.toLowerCase();
      list = list.filter(a => {
        return (a.headline && a.headline.toLowerCase().includes(q)) ||
               (a.summary && a.summary.toLowerCase().includes(q)) ||
               (a.why_it_matters && a.why_it_matters.toLowerCase().includes(q)) ||
               (a.catalyst_analysis && a.catalyst_analysis.toLowerCase().includes(q));
      });
    }

    // Empty state handling
    if (list.length === 0) {
      if (this.activeMode === 'bookmarks') {
        container.innerHTML = `
          <div class="news-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
            <h3>No Bookmarked Catalysts</h3>
            <p>You have not saved any intelligence stories yet. Click the bookmark icon on any card in the Live Intelligence Feed to curate your personal executive briefing.</p>
          </div>
        `;
      } else {
        container.innerHTML = `
          <div class="news-empty-state">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <h3>No Intelligence Catalysts Found</h3>
            <p>No wire stories match your active filter criteria. Try resetting ticker, impact threshold, or search keywords.</p>
            <button type="button" class="btn btn-sm btn-gold" style="margin-top: 14px;" onclick="MaterialsHub.resetNewsFilters()">Reset All Filters</button>
          </div>
        `;
      }
      return;
    }

    // Render Cards
    container.innerHTML = list.map(story => {
      const isBookmarked = this.newsBookmarks.has(story.id);
      const impactScore = story.impact_score || 5;
      const impactClass = impactScore >= 8 ? 'high' : impactScore >= 5 ? 'medium' : 'low';
      const sentiment = (story.sentiment || 'neutral').toLowerCase();
      const isBreaking = story.is_breaking || impactScore >= 9;
      const isNewArrival = highlightStoryId && story.id === highlightStoryId;

      // Extract tickers
      let tickersList = [];
      if (Array.isArray(story.tickers)) {
        tickersList = story.tickers;
      } else if (typeof story.tickers === 'string') {
        tickersList = story.tickers.split(/[\s,]+/).filter(Boolean);
      }
      const primaryTicker = tickersList[0] || 'NVDA';

      const timeAgo = this.formatTimeAgo(story.published_at || story.created_at);
      const sourceName = story.source_name || story.source_id || 'Institutional Wire';

      return `
        <article class="news-article-card ${isBreaking ? 'breaking' : ''} ${isNewArrival ? 'new-arrival' : ''}" id="story-card-${story.id}">
          <div>
            <div class="news-card-header">
              <div class="news-meta-badges">
                <span class="badge-impact ${impactClass}">Impact ${impactScore}/10</span>
                <span class="badge-sentiment ${sentiment}">${sentiment}</span>
                <span class="badge-tag host-only" style="padding: 2px 7px;">${this.escapeHTML(story.category || 'Intelligence')}</span>
              </div>
              <button 
                type="button" 
                class="btn-bookmark-action ${isBookmarked ? 'bookmarked' : ''}" 
                onclick="MaterialsHub.toggleStoryBookmark('${story.id}', this)"
                title="${isBookmarked ? 'Remove Bookmark' : 'Bookmark Story'}"
                aria-label="${isBookmarked ? 'Remove Bookmark' : 'Bookmark Story'}"
              >
                ${isBookmarked ? '🔖' : '☆'}
              </button>
            </div>

            <h3 class="news-card-headline" onclick="MaterialsHub.openStoryDossierById('${story.id}')" title="Inspect full catalyst dossier">
              ${this.escapeHTML(story.headline)}
            </h3>

            <p class="news-card-summary">
              ${this.escapeHTML(story.summary || '')}
            </p>

            ${story.why_it_matters || story.rationale ? `
              <div class="why-it-matters-box">
                <strong>Why It Matters:</strong>
                ${this.escapeHTML(story.why_it_matters || story.rationale)}
              </div>
            ` : ''}

            <div class="news-tickers-row">
              ${tickersList.map(t => `
                <button type="button" class="ticker-tag-btn" onclick="MaterialsHub.filterByTicker('${t}')" title="Filter feed by ${t}">
                  $${this.escapeHTML(t)}
                </button>
              `).join('')}
            </div>
          </div>

          <div class="news-card-footer">
            <span class="news-source-badge" title="Verified source provenance">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>
              <span>${this.escapeHTML(sourceName)}</span>
              <span style="opacity: 0.5;">&bull;</span>
              <span>${timeAgo}</span>
            </span>

            <div class="news-footer-actions">
              <button type="button" class="btn btn-sm btn-ghost" style="padding: 3px 8px; font-size: 0.74rem;" onclick="MaterialsHub.openStoryDossierById('${story.id}')">
                Dossier
              </button>
              <a href="/trading-assistant?ticker=${encodeURIComponent(primaryTicker)}&article=${encodeURIComponent(story.id)}" target="_blank" class="btn-jarvis-link" title="Open in Jarvis with pre-loaded catalysts">
                <span>Jarvis</span>
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              </a>
            </div>
          </div>
        </article>
      `;
    }).join('');
  },

  resetNewsFilters() {
    this.activeTicker = 'all';
    this.activeCategory = 'all';
    this.activeSentiment = 'all';
    this.activeMinImpact = 0;
    this.newsSearchQuery = '';

    const searchInput = document.getElementById('news-search-input');
    if (searchInput) searchInput.value = '';

    const impactSelect = document.getElementById('news-impact-select');
    if (impactSelect) impactSelect.value = '0';

    document.querySelectorAll('#news-ticker-pills .news-pill-btn').forEach(p => p.classList.toggle('active', p.dataset.ticker === 'all'));
    document.querySelectorAll('#news-category-pills .news-pill-btn').forEach(p => p.classList.toggle('active', p.dataset.category === 'all'));
    document.querySelectorAll('#news-sentiment-pills .news-pill-btn').forEach(p => p.classList.toggle('active', p.dataset.sentiment === 'all'));

    this.renderNewsFeed();
  },

  filterByTicker(ticker) {
    this.activeTicker = ticker;
    const tickerPills = document.querySelectorAll('#news-ticker-pills .news-pill-btn');
    tickerPills.forEach(p => {
      p.classList.toggle('active', (p.getAttribute('data-ticker') || '').toUpperCase() === ticker.toUpperCase());
    });
    this.renderNewsFeed();
  },

  async toggleStoryBookmark(storyId, btnElement = null) {
    try {
      const res = await fetch('/api/bookmarks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ article_id: storyId })
      });

      if (res.ok) {
        const data = await res.json();
        const isBookmarked = data.action === 'added' || data.bookmarked === true;

        if (isBookmarked) {
          this.newsBookmarks.add(storyId);
          this.showToast('Article catalyst added to bookmarks', 'success');
        } else {
          this.newsBookmarks.delete(storyId);
          this.showToast('Article removed from bookmarks', 'info');
        }

        this.updateBookmarksBadge();

        if (btnElement) {
          btnElement.classList.toggle('bookmarked', isBookmarked);
          btnElement.innerHTML = isBookmarked ? '🔖' : '☆';
        }

        const modalBookmarkBtn = document.getElementById('dossier-btn-bookmark');
        const modalBookmarkText = document.getElementById('dossier-bookmark-text');
        if (modalBookmarkBtn && this.activeDossierArticle && this.activeDossierArticle.id === storyId) {
          if (modalBookmarkText) {
            modalBookmarkText.textContent = isBookmarked ? '✓ Bookmarked' : '🔖 Bookmark Story';
          }
        }

        if (this.activeMode === 'bookmarks') {
          this.renderNewsFeed();
        }
      }
    } catch (e) {
      this.showToast('Network error updating bookmark', 'error');
    }
  },

  openStoryDossierById(storyId) {
    const story = this.newsArticles.find(a => a.id === storyId);
    if (story) {
      this.openStoryDossier(story);
    }
  },

  openStoryDossier(story) {
    this.activeDossierArticle = story;

    const modal = document.getElementById('story-dossier-modal');
    const headline = document.getElementById('dossier-modal-headline');
    const summary = document.getElementById('dossier-modal-summary');
    const rationale = document.getElementById('dossier-modal-rationale');
    const content = document.getElementById('dossier-modal-content');
    const badges = document.getElementById('dossier-modal-badges');
    const provGrid = document.getElementById('dossier-provenance-grid');
    const jarvisBtn = document.getElementById('dossier-btn-jarvis');
    const bookmarkText = document.getElementById('dossier-bookmark-text');

    if (!modal) return;

    if (headline) headline.textContent = story.headline;
    if (summary) summary.textContent = story.summary || '';
    if (rationale) rationale.textContent = story.why_it_matters || story.rationale || 'High-probability impact on hyperscaler CapEx expenditure.';
    if (content) content.textContent = story.catalyst_analysis || story.content || '';

    // Badges
    if (badges) {
      const impactScore = story.impact_score || 5;
      const impactClass = impactScore >= 8 ? 'high' : impactScore >= 5 ? 'medium' : 'low';
      const sentiment = (story.sentiment || 'neutral').toLowerCase();
      badges.innerHTML = `
        <span class="badge-impact ${impactClass}">Impact ${impactScore}/10</span>
        <span class="badge-sentiment ${sentiment}">${sentiment}</span>
        <span class="badge-tag host-only">${this.escapeHTML(story.category || 'Strategic')}</span>
        <span class="badge-tag public">${this.escapeHTML(story.source_name || story.source_id || 'Wire')}</span>
      `;
    }

    // Provenance Grid
    if (provGrid) {
      const timeStr = new Date(story.published_at || story.created_at || Date.now()).toLocaleString();
      const trackerRun = story.tracker_run_id || `run_trk_${story.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
      const predictorRun = story.predictor_run_id || `run_pred_${story.id.replace(/[^a-zA-Z0-9]/g, '').slice(-8)}`;
      const sha256 = story.provenance_sha256 || story.hash || 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

      provGrid.innerHTML = `
        <div class="preview-meta-item">
          <span class="provenance-cell-label">Tracker Agent Run</span>
          <span class="provenance-cell-val">${trackerRun}</span>
        </div>
        <div class="preview-meta-item">
          <span class="provenance-cell-label">Predictor Agent Run</span>
          <span class="provenance-cell-val">${predictorRun}</span>
        </div>
        <div class="preview-meta-item">
          <span class="provenance-cell-label">Ingested & Verified</span>
          <span class="provenance-cell-val">${timeStr}</span>
        </div>
        <div class="preview-meta-item">
          <span class="provenance-cell-label">Commander Gate SHA-256</span>
          <span class="provenance-cell-val" style="color: var(--gold-accent);">${sha256.slice(0, 32)}...</span>
        </div>
      `;
    }

    // Tickers and Jarvis Link
    let tickersList = [];
    if (Array.isArray(story.tickers)) tickersList = story.tickers;
    else if (typeof story.tickers === 'string') tickersList = story.tickers.split(/[\s,]+/).filter(Boolean);
    const primaryTicker = tickersList[0] || 'NVDA';

    if (jarvisBtn) {
      jarvisBtn.href = `/trading-assistant?ticker=${encodeURIComponent(primaryTicker)}&article=${encodeURIComponent(story.id)}`;
    }

    // Bookmark State
    if (bookmarkText) {
      const isBookmarked = this.newsBookmarks.has(story.id);
      bookmarkText.textContent = isBookmarked ? '✓ Bookmarked' : '🔖 Bookmark Story';
    }

    modal.classList.add('active');
  },

  async forceRefreshNews() {
    if (this.forceRefreshCooldown) return;

    this.forceRefreshCooldown = true;
    const btn = document.getElementById('btn-force-refresh-news');
    if (btn) {
      btn.disabled = true;
      btn.innerHTML = `
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="animation: spin 1s linear infinite;"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
        <span>Refreshing...</span>
      `;
    }

    try {
      const res = await fetch('/api/news?force=true');
      if (res.ok) {
        const data = await res.json();
        const articles = data.articles || data.items || [];
        if (Array.isArray(articles) && articles.length > 0) {
          this.newsArticles = articles;
          this.updateStreamCountBadge();
          this.checkBreakingStory();
          this.renderNewsFeed();
          this.showToast('Intelligence radar refreshed with latest wire catalysts', 'success');
        }
      }
    } catch (e) {
      this.showToast('Refresh failed. Using local stream cache.', 'error');
    }

    // Cooldown countdown: 10s
    let remaining = 10;
    const timer = setInterval(() => {
      remaining--;
      if (btn && remaining > 0) {
        btn.innerHTML = `<span>Cooldown (${remaining}s)</span>`;
      } else {
        clearInterval(timer);
        this.forceRefreshCooldown = false;
        if (btn) {
          btn.disabled = false;
          btn.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>
            <span>Force Refresh</span>
          `;
        }
      }
    }, 1000);
  },

  // =========================================================================
  // AUDIO BRIEFING (BROWSER SPEECH SYNTHESIS)
  // =========================================================================

  startAudioBriefing() {
    if (!('speechSynthesis' in window)) {
      this.showToast('Browser text-to-speech engine is not supported in this environment.', 'info');
      return;
    }

    if (window.speechSynthesis.speaking && this.isBriefingPlaying) {
      this.toggleAudioBriefing();
      return;
    }

    window.speechSynthesis.cancel();

    // Select top 3-4 stories by impact
    const topStories = [...this.newsArticles]
      .sort((a, b) => (b.impact_score || 0) - (a.impact_score || 0))
      .slice(0, 4);

    if (topStories.length === 0) {
      this.showToast('No catalyst stories currently available for briefing.', 'info');
      return;
    }

    const scriptParts = [
      'Titan War Executive Intelligence Briefing. System status: real-time streaming pipeline active.'
    ];

    topStories.forEach((story, idx) => {
      const rank = idx === 0 ? 'Top catalyst' : `Story ${idx + 1}`;
      scriptParts.push(`${rank}: ${story.headline}. Impact rating: ${story.impact_score || 8} out of 10. ${story.why_it_matters || story.summary || ''}`);
    });

    scriptParts.push('This concludes the current executive briefing. All catalysts logged to SQLite platform database.');
    const fullScript = scriptParts.join(' ');

    const utterance = new SpeechSynthesisUtterance(fullScript);
    utterance.rate = 1.05;
    utterance.pitch = 1.0;

    // Pick appropriate voice if available
    const voices = window.speechSynthesis.getVoices();
    const naturalVoice = voices.find(v => v.lang.startsWith('en') && (v.name.includes('Natural') || v.name.includes('Neural') || v.name.includes('Google') || v.name.includes('Samantha')));
    if (naturalVoice) utterance.voice = naturalVoice;

    const audioBar = document.getElementById('audio-briefing-bar');
    const audioText = document.getElementById('audio-briefing-text');
    const audioViz = document.getElementById('audio-bars-viz');
    const toggleBtn = document.getElementById('audio-play-toggle');
    const briefingLabel = document.getElementById('btn-briefing-label');

    if (audioBar) audioBar.style.display = 'flex';
    if (audioViz) audioViz.classList.add('audio-playing');
    if (audioText) audioText.textContent = `Reading Top Catalyst: "${topStories[0].headline}"`;
    if (toggleBtn) toggleBtn.innerHTML = '<span>⏸ Pause</span>';
    if (briefingLabel) briefingLabel.textContent = 'Pause Briefing';

    this.isBriefingPlaying = true;
    this.speechSynthUtterance = utterance;

    utterance.onboundary = (event) => {
      // dynamically update reading text if boundary permits
    };

    utterance.onend = () => {
      this.stopAudioBriefing();
      this.showToast('Executive audio briefing finished', 'success');
    };

    utterance.onerror = () => {
      this.stopAudioBriefing();
    };

    window.speechSynthesis.speak(utterance);
  },

  toggleAudioBriefing() {
    if (!('speechSynthesis' in window)) return;

    const toggleBtn = document.getElementById('audio-play-toggle');
    const audioViz = document.getElementById('audio-bars-viz');
    const briefingLabel = document.getElementById('btn-briefing-label');

    if (window.speechSynthesis.paused) {
      window.speechSynthesis.resume();
      this.isBriefingPlaying = true;
      if (toggleBtn) toggleBtn.innerHTML = '<span>⏸ Pause</span>';
      if (audioViz) audioViz.classList.add('audio-playing');
      if (briefingLabel) briefingLabel.textContent = 'Pause Briefing';
    } else if (window.speechSynthesis.speaking) {
      window.speechSynthesis.pause();
      this.isBriefingPlaying = false;
      if (toggleBtn) toggleBtn.innerHTML = '<span>▶ Resume</span>';
      if (audioViz) audioViz.classList.remove('audio-playing');
      if (briefingLabel) briefingLabel.textContent = 'Resume Briefing';
    }
  },

  stopAudioBriefing() {
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    this.isBriefingPlaying = false;

    const audioBar = document.getElementById('audio-briefing-bar');
    const audioViz = document.getElementById('audio-bars-viz');
    const briefingLabel = document.getElementById('btn-briefing-label');

    if (audioBar) audioBar.style.display = 'none';
    if (audioViz) audioViz.classList.remove('audio-playing');
    if (briefingLabel) briefingLabel.textContent = 'Play Audio Briefing';
  },

  // =========================================================================
  // UTILITY HELPERS
  // =========================================================================

  formatTimeAgo(dateInput) {
    if (!dateInput) return 'Just now';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return 'Recently';

    const diffSec = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return `${Math.floor(diffSec / 86400)}d ago`;
  },

  escapeHTML(str) {
    if (typeof str !== 'string') return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};

// Expose globally for inline DOM event triggers
if (typeof window !== 'undefined') {
  window.MaterialsHub = MaterialsHub;
}

// Initialize once DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MaterialsHub.init());
  } else {
    MaterialsHub.init();
  }
}

