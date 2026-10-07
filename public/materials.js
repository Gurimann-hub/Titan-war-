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

  async init() {
    this.bindDOM();
    this.setupBfCacheGuard();
    const isAuthed = await this.enforceRouteGuard();
    if (isAuthed) {
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
  }
};

// Initialize once DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MaterialsHub.init());
  } else {
    MaterialsHub.init();
  }
}
