const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('[CSS BUILDER] Applying 5-View Institutional Design System to index-DBEPqIPN.css...');

const cssPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DBEPqIPN.css');
const originalCss = execSync('git show HEAD:public/trading-assistant/assets/index-DBEPqIPN.css', {
  maxBuffer: 10 * 1024 * 1024
}).toString();

const institutionalStyles = `
/* ==========================================================================
   INSTITUTIONAL 5-VIEW FINTECH DESIGN SYSTEM FOR JARVIS
   Palette: #070B14 canvas, #0D1526 cards, #1E293B borders, #00F0FF cyan
   ========================================================================== */

:root {
  --canvas-bg: #070B14;
  --card-bg: #0D1526;
  --card-raised: #111C32;
  --card-subtle: #090F1C;
  --border-subtle: #1E293B;
  --border-bright: #334155;
  --accent-cyan: #00F0FF;
  --bull-emerald: #10B981;
  --warning-amber: #F59E0B;
  --bear-coral: #EF4444;
  --text-primary: #F8FAFC;
  --text-secondary: #94A3B8;
  --text-muted: #64748B;
  --font-sans: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
  --font-mono: 'JetBrains Mono', 'DM Mono', monospace;
  --font-heading: 'Space Grotesk', sans-serif;
}

/* Global Reset & Typography Upgrades */
body {
  background-color: var(--canvas-bg) !important;
  color: var(--text-primary) !important;
  font-family: var(--font-sans) !important;
}

/* Universal Text Input Styling Fix */
input, input[type="text"], input[type="search"], textarea, select {
  background: #0A1120 !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 6px !important;
  color: #F8FAFC !important;
  font-family: var(--font-sans) !important;
  font-size: 12px !important;
  outline: none !important;
  transition: all 0.15s ease !important;
}
input:focus, input[type="text"]:focus, input[type="search"]:focus, textarea:focus {
  border-color: var(--accent-cyan) !important;
  box-shadow: 0 0 12px rgba(0, 240, 255, 0.25) !important;
}
input::placeholder {
  color: #475569 !important;
}

/* Sleek Institutional Scrollbars */
* {
  scrollbar-width: thin !important;
  scrollbar-color: #1E293B transparent !important;
}
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #1E293B;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #334155;
}

/* Card Surfaces with Subtle Hover Glow */
.dashboard-panel {
  background: var(--card-bg) !important;
  border: 1px solid var(--border-subtle) !important;
  border-radius: 8px !important;
  backdrop-filter: blur(12px) !important;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.35) !important;
  transition: border-color 0.15s ease, box-shadow 0.15s ease !important;
}
.dashboard-panel:hover {
  border-color: rgba(51, 65, 85, 0.8) !important;
}

/* --------------------------------------------------------------------------
   1. TOP NAVIGATION BAR
   -------------------------------------------------------------------------- */
.fintech-top-nav {
  height: 60px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 20px;
  background: rgba(7, 11, 20, 0.95);
  border-bottom: 1px solid var(--border-subtle);
  backdrop-filter: blur(16px);
  z-index: 100;
}
.nav-left-brand {
  display: flex;
  align-items: center;
  gap: 12px;
}
.brand-logo-mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border: 1px solid rgba(0, 240, 255, 0.4);
  border-radius: 8px;
  background: rgba(0, 240, 255, 0.1);
  color: var(--accent-cyan);
  box-shadow: 0 0 16px rgba(0, 240, 255, 0.2);
}
.brand-titles {
  display: flex;
  flex-direction: column;
}
.brand-main {
  font: 700 16px var(--font-heading);
  letter-spacing: 0.1em;
  color: #FFFFFF;
}
.brand-sub {
  font: 600 9px var(--font-mono);
  letter-spacing: 0.14em;
  color: var(--text-muted);
}
.nav-pipe {
  width: 1px;
  height: 18px;
  background: var(--border-bright);
  margin: 0 4px;
}

/* Center Global Search & Active Symbol Badge */
.nav-center-search {
  display: flex;
  align-items: center;
  gap: 14px;
}
.global-search-box {
  position: relative;
  display: flex;
  align-items: center;
  width: 320px;
}
.global-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}
.global-search-input {
  width: 100%;
  height: 34px;
  padding: 0 12px 0 32px !important;
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
  letter-spacing: 0.04em;
}
.search-dropdown-menu {
  position: absolute;
  top: 40px;
  left: 0;
  right: 0;
  background: #0B1324;
  border: 1px solid var(--border-bright);
  border-radius: 6px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  z-index: 200;
  display: flex;
  flex-direction: column;
  padding: 4px;
}
.search-dropdown-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 7px 10px;
  border: none;
  background: transparent;
  color: var(--text-primary);
  border-radius: 4px;
  font-family: var(--font-mono);
  font-size: 11px;
  cursor: pointer;
  transition: all 0.12s ease;
}
.search-dropdown-item:hover {
  background: rgba(0, 240, 255, 0.12);
  color: var(--accent-cyan);
}
.search-dropdown-item span {
  color: var(--text-muted);
  font-size: 10px;
}

.nav-active-symbol-badge {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 12px;
  background: rgba(13, 21, 38, 0.9);
  border: 1px solid rgba(0, 240, 255, 0.3);
  border-radius: 6px;
  box-shadow: 0 0 14px rgba(0, 240, 255, 0.1);
}
.active-symbol-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent-cyan);
  box-shadow: 0 0 8px var(--accent-cyan);
}
.active-symbol-ticker {
  font: 700 13px var(--font-mono);
  color: var(--accent-cyan);
  letter-spacing: 0.06em;
}
.active-symbol-price {
  font: 700 13px var(--font-mono);
  color: #FFFFFF;
}
.active-symbol-delta {
  font: 600 11px var(--font-mono);
}

/* Right Quick Stat Pills */
.nav-right-stats {
  display: flex;
  align-items: center;
  gap: 10px;
}
.stat-pill {
  display: flex;
  flex-direction: column;
  padding: 3px 8px;
  background: rgba(13, 21, 38, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
}
.stat-pill__label {
  font: 600 8.5px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.05em;
}
.stat-pill__value {
  font: 600 10.5px var(--font-mono);
  color: var(--text-primary);
}
.stat-pill--ws {
  flex-direction: row;
  align-items: center;
  gap: 6px;
  padding: 6px 9px;
  border-color: rgba(16, 185, 129, 0.35);
  background: rgba(16, 185, 129, 0.08);
}
.ws-pulse-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--bull-emerald);
  box-shadow: 0 0 8px var(--bull-emerald);
}
.stat-pill--ws strong {
  font: 600 10px var(--font-mono);
  color: var(--bull-emerald);
}
.nav-compliance-badge {
  display: flex;
  align-items: center;
  gap: 5px;
  font: 600 9.5px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}

/* --------------------------------------------------------------------------
   2. APP SHELL & SIDEBAR NAVIGATION (5 VIEWS)
   -------------------------------------------------------------------------- */
.fintech-app-shell {
  height: 100vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.fintech-workspace {
  flex: 1;
  display: flex;
  min-height: 0;
  overflow: hidden;
}
.fintech-sidebar {
  width: 230px;
  flex-shrink: 0;
  background: #090F1C;
  border-right: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 12px 10px;
  overflow-y: auto;
}
.sidebar-nav-btn {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid transparent;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  text-align: left;
  transition: all 0.15s ease;
}
.sidebar-nav-btn:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #FFFFFF;
}
.sidebar-nav-btn--active {
  background: rgba(0, 240, 255, 0.08) !important;
  border-color: rgba(0, 240, 255, 0.35) !important;
  color: #FFFFFF !important;
  box-shadow: 0 0 16px rgba(0, 240, 255, 0.12);
}
.sidebar-icon-wrap {
  display: grid;
  place-items: center;
  color: var(--text-muted);
  transition: color 0.15s ease;
}
.sidebar-nav-btn--active .sidebar-icon-wrap {
  color: var(--accent-cyan);
}
.sidebar-btn-copy {
  display: flex;
  flex-direction: column;
  min-width: 0;
}
.sidebar-btn-title {
  font: 600 12px var(--font-heading);
  letter-spacing: 0.04em;
  color: inherit;
}
.sidebar-btn-sub {
  font: 500 8.5px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.05em;
  margin-top: 1px;
}
.active-indicator-glow {
  position: absolute;
  right: 0;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 3px 0 0 3px;
  background: var(--accent-cyan);
  box-shadow: 0 0 10px var(--accent-cyan);
}

.fintech-view-stage {
  flex: 1;
  min-width: 0;
  height: 100%;
  overflow-y: auto;
  background: radial-gradient(ellipse at 50% -20%, rgba(0, 240, 255, 0.05), transparent 45%), var(--canvas-bg);
}
.view-container {
  height: 100%;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px;
  box-sizing: border-box;
}

/* --------------------------------------------------------------------------
   3. VIEW 1: OVERVIEW
   -------------------------------------------------------------------------- */
.macro-regime-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 16px;
  flex-shrink: 0;
  background: rgba(13, 21, 38, 0.7) !important;
  border: 1px solid var(--border-subtle) !important;
}
.regime-badge-group {
  display: flex;
  align-items: center;
  gap: 8px;
}
.regime-label {
  font: 600 9px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
.regime-status {
  font: 700 11px var(--font-mono);
  letter-spacing: 0.04em;
}
.macro-stat {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.macro-stat span {
  font: 500 8.5px var(--font-mono);
  color: var(--text-muted);
}
.macro-stat strong {
  font: 600 11px var(--font-mono);
  color: var(--text-primary);
}

.overview-grid-columns {
  flex: 1;
  display: grid;
  grid-template-columns: 1.15fr 1fr;
  gap: 12px;
  min-height: 0;
}
.overview-col-left, .overview-col-right {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
}

/* Agent Desk Strip */
.agent-desk-strip {
  padding: 10px 14px;
}
.agent-desk-nodes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  margin-top: 8px;
}
.agent-node {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 6px 8px;
  background: rgba(7, 11, 20, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
}
.agent-node__dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--bull-emerald);
  box-shadow: 0 0 6px var(--bull-emerald);
  margin-bottom: 2px;
}
.agent-node strong {
  font: 700 10.5px var(--font-mono);
  color: var(--text-primary);
}
.agent-node small {
  font: 500 8.5px var(--font-mono);
  color: var(--text-muted);
}

/* --------------------------------------------------------------------------
   4. VIEW 2: SECURITIES BROWSER (FIXING OVERLAPPING TEXT & UNSTYLED INPUTS)
   -------------------------------------------------------------------------- */
.securities-main-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1.25fr 1fr;
  gap: 12px;
  min-height: 0;
}
.securities-screener-col, .securities-universe-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}

/* Securities Universe Browser Grid Fix */
.universe-browser {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.universe-header {
  padding: 12px 14px 8px;
  border-bottom: 1px solid var(--border-subtle);
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.universe-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.universe-tabs {
  display: flex;
  gap: 6px;
}
.universe-tab {
  padding: 3px 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--card-subtle);
  color: var(--text-secondary);
  font: 600 10px var(--font-mono);
  cursor: pointer;
  transition: all 0.12s ease;
}
.universe-tab:hover {
  color: #FFFFFF;
  border-color: var(--border-bright);
}
.universe-tab--active {
  background: rgba(0, 240, 255, 0.15) !important;
  border-color: var(--accent-cyan) !important;
  color: var(--accent-cyan) !important;
}
.universe-search {
  position: relative;
  display: flex;
  align-items: center;
}
.universe-search-icon {
  position: absolute;
  left: 10px;
  color: var(--text-muted);
  pointer-events: none;
}
.universe-search-input {
  width: 100%;
  height: 32px;
  padding: 0 10px 0 30px !important;
  font-family: var(--font-mono) !important;
  font-size: 11px !important;
}

/* FIXED NON-OVERLAPPING COLUMNS */
.universe-list-header {
  display: grid;
  grid-template-columns: 85px 1fr 90px;
  align-items: center;
  gap: 10px;
  padding: 8px 14px;
  background: rgba(7, 11, 20, 0.7);
  border-bottom: 1px solid var(--border-subtle);
  font: 700 9px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.06em;
}
.universe-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.universe-row {
  display: grid !important;
  grid-template-columns: 85px 1fr 90px !important;
  align-items: center !important;
  gap: 10px !important;
  padding: 0 14px !important;
  border-bottom: 1px solid rgba(30, 41, 59, 0.5) !important;
  cursor: pointer;
  transition: background 0.12s ease;
}
.universe-row:hover {
  background: rgba(0, 240, 255, 0.05) !important;
}
.universe-row--selected {
  background: rgba(0, 240, 255, 0.1) !important;
  border-color: rgba(0, 240, 255, 0.3) !important;
}
.universe-row-symbol {
  font: 700 12px var(--font-mono) !important;
  color: var(--accent-cyan) !important;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.universe-row-name {
  font-size: 11.5px !important;
  color: var(--text-primary) !important;
  overflow: hidden !important;
  text-overflow: ellipsis !important;
  white-space: nowrap !important;
}
.universe-row-exchange {
  display: flex !important;
  align-items: center !important;
  justify-content: flex-end !important;
  gap: 6px !important;
  font: 500 10px var(--font-mono) !important;
  color: var(--text-muted) !important;
}
.universe-company-link {
  display: inline-grid;
  place-items: center;
  width: 20px;
  height: 20px;
  padding: 0;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--card-raised);
  color: var(--accent-cyan);
  cursor: pointer;
  transition: all 0.12s ease;
}
.universe-company-link:hover {
  background: var(--accent-cyan);
  color: #000;
}
.universe-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 14px;
  border-top: 1px solid var(--border-subtle);
  background: rgba(7, 11, 20, 0.6);
  font: 600 10px var(--font-mono);
  color: var(--text-muted);
}

.supply-chain-preview-card {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  flex-shrink: 0;
}
.preview-card-info h3 {
  margin: 3px 0;
  font: 700 14px var(--font-heading);
  color: #FFFFFF;
}
.preview-card-info p {
  margin: 0;
  font-size: 11px;
  color: var(--text-secondary);
}
.open-company-graph-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: rgba(0, 240, 255, 0.12);
  border: 1px solid rgba(0, 240, 255, 0.4);
  border-radius: 6px;
  color: var(--accent-cyan);
  font: 700 11.5px var(--font-mono);
  cursor: pointer;
  transition: all 0.15s ease;
}
.open-company-graph-btn:hover {
  background: var(--accent-cyan);
  color: #070B14;
  box-shadow: 0 0 14px rgba(0, 240, 255, 0.4);
}

/* --------------------------------------------------------------------------
   5. VIEW 3: TECHNICAL RADAR
   -------------------------------------------------------------------------- */
.radar-top-strip {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 12px 18px;
  background: var(--card-bg);
  border: 1px solid var(--border-subtle);
  border-radius: 8px;
}
.radar-ticker-info {
  display: flex;
  align-items: center;
  gap: 14px;
}
.radar-symbol-badge {
  padding: 5px 12px;
  background: rgba(0, 240, 255, 0.15);
  border: 1px solid var(--accent-cyan);
  border-radius: 6px;
  font: 800 18px var(--font-mono);
  color: var(--accent-cyan);
  letter-spacing: 0.06em;
}
.radar-ticker-info h1 {
  margin: 0;
  font: 700 22px var(--font-heading);
  color: #FFFFFF;
}
.radar-delta {
  font: 600 11.5px var(--font-mono);
}
.radar-controls {
  display: flex;
  align-items: center;
  gap: 12px;
}
.timeframe-tabs, .chart-mode-tabs {
  display: flex;
  gap: 4px;
  background: var(--card-subtle);
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 6px;
}
.timeframe-btn, .chart-mode-btn {
  padding: 4px 10px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-secondary);
  font: 600 10.5px var(--font-mono);
  cursor: pointer;
  transition: all 0.12s ease;
}
.timeframe-btn--active, .chart-mode-btn--active {
  background: rgba(0, 240, 255, 0.2) !important;
  color: var(--accent-cyan) !important;
}

.radar-main-layout {
  flex: 1;
  display: grid;
  grid-template-columns: 1.45fr 1fr;
  gap: 14px;
  min-height: 0;
}
.radar-chart-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}
.legend-overlays {
  display: flex;
  gap: 10px;
  font: 600 10px var(--font-mono);
}
.legend-sma20 { color: #00F0FF; }
.legend-sma50 { color: #F59E0B; }
.legend-vol { color: #64748B; }

.radar-canvas-wrap {
  flex: 1;
  min-height: 0;
  padding: 8px 12px;
  display: flex;
  flex-direction: column;
}
.radar-svg-stage {
  width: 100%;
  height: 100%;
  min-height: 200px;
}
.radar-ticker-strip {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 14px;
  border-top: 1px solid var(--border-subtle);
  overflow-x: auto;
}
.strip-label {
  font: 700 9px var(--font-mono);
  color: var(--text-muted);
  margin-right: 4px;
}
.radar-chip {
  padding: 3px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  background: var(--card-subtle);
  color: var(--text-secondary);
  font: 600 10px var(--font-mono);
  cursor: pointer;
}
.radar-chip:hover {
  color: #FFFFFF;
}
.radar-chip--active {
  border-color: var(--accent-cyan);
  background: rgba(0, 240, 255, 0.15);
  color: var(--accent-cyan);
}

.radar-sidebar {
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}
.radar-stat-card {
  padding: 12px 14px;
}
.conviction-badge-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin: 6px 0 10px;
}
.conviction-badge {
  font: 800 14px var(--font-heading);
}
.conviction-sub {
  font: 600 9.5px var(--font-mono);
  color: var(--text-muted);
}
.rubric-bars {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.rubric-item {
  display: grid;
  grid-template-columns: 120px 1fr 60px;
  align-items: center;
  gap: 8px;
  font: 500 10px var(--font-mono);
}
.rubric-item span {
  color: var(--text-secondary);
}
.mini-bar {
  height: 5px;
  background: #1E293B;
  border-radius: 3px;
  overflow: hidden;
}
.mini-bar div {
  height: 100%;
  border-radius: 3px;
}
.rubric-item strong {
  text-align: right;
  color: #FFFFFF;
}

.matrix-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
  margin-top: 8px;
}
.matrix-cell {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 7px 9px;
  background: rgba(7, 11, 20, 0.6);
  border: 1px solid var(--border-subtle);
  border-radius: 5px;
}
.matrix-cell span {
  font: 600 8.5px var(--font-mono);
  color: var(--text-muted);
}
.matrix-cell strong {
  font: 700 12px var(--font-mono);
  color: var(--text-primary);
}
.matrix-cell small {
  font: 500 8.5px var(--font-sans);
  color: var(--text-secondary);
}

.targets-stack {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}
.target-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 6px 9px;
  border-radius: 5px;
  font: 600 10.5px var(--font-mono);
  border: 1px solid var(--border-subtle);
}
.target-row--res2 { background: rgba(16, 185, 129, 0.12); color: var(--bull-emerald); border-color: rgba(16, 185, 129, 0.3); }
.target-row--res1 { background: rgba(16, 185, 129, 0.06); color: var(--bull-emerald); }
.target-row--mark { background: rgba(0, 240, 255, 0.12); color: var(--accent-cyan); border-color: rgba(0, 240, 255, 0.4); }
.target-row--sup1 { background: rgba(239, 68, 68, 0.06); color: var(--bear-coral); }
.target-row--sup2 { background: rgba(239, 68, 68, 0.14); color: var(--bear-coral); border-color: rgba(239, 68, 68, 0.35); }

/* --------------------------------------------------------------------------
   6. VIEW 4: PORTFOLIO & RISK
   -------------------------------------------------------------------------- */
.portfolio-top-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.metric-card {
  padding: 14px 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.metric-card h1 {
  margin: 4px 0 0;
  font: 700 20px var(--font-heading);
  color: #FFFFFF;
}
.metric-sub {
  font: 600 10px var(--font-mono);
  color: var(--text-muted);
}

.risk-gauges-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.gauge-card {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.gauge-lead {
  display: flex;
  align-items: baseline;
  gap: 6px;
  margin-top: 4px;
}
.gauge-lead strong {
  font: 700 15px var(--font-heading);
  color: #FFFFFF;
}
.gauge-limit {
  font: 600 9px var(--font-mono);
  color: var(--text-muted);
}
.gauge-card p {
  margin: 4px 0 0;
  font-size: 10.5px;
  color: var(--text-secondary);
  line-height: 1.4;
}

.positions-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  overflow: hidden;
}
.positions-table {
  flex: 1;
  overflow-y: auto;
}
.positions-row {
  display: grid;
  grid-template-columns: 180px 80px 80px 100px 105px 145px 1fr 140px;
  align-items: center;
  gap: 10px;
  padding: 8px 16px;
  border-bottom: 1px solid rgba(30, 41, 59, 0.6);
  font: 500 11.5px var(--font-mono);
  color: var(--text-primary);
}
.positions-row--head {
  position: sticky;
  top: 0;
  background: #0B1324;
  font: 700 9px var(--font-mono);
  color: var(--text-muted);
  letter-spacing: 0.06em;
  z-index: 10;
}
.pos-asset {
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.pos-ticker-btn {
  align-self: flex-start;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-cyan);
  font: 700 12px var(--font-mono);
  cursor: pointer;
}
.pos-ticker-btn:hover {
  text-decoration: underline;
}
.pos-asset small {
  color: var(--text-muted);
  font-size: 9.5px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.pos-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
}
.pos-btn {
  padding: 3px 8px;
  border: 1px solid var(--border-subtle);
  border-radius: 4px;
  font: 600 9.5px var(--font-mono);
  cursor: pointer;
  transition: all 0.12s ease;
}
.pos-btn--trim {
  background: rgba(245, 158, 11, 0.12);
  color: var(--warning-amber);
  border-color: rgba(245, 158, 11, 0.35);
}
.pos-btn--trim:hover {
  background: var(--warning-amber);
  color: #070B14;
}
.pos-btn--close {
  background: rgba(239, 68, 68, 0.12);
  color: var(--bear-coral);
  border-color: rgba(239, 68, 68, 0.35);
}
.pos-btn--close:hover {
  background: var(--bear-coral);
  color: #FFFFFF;
}

/* --------------------------------------------------------------------------
   7. VIEW 5: MARKET ORACLE (AI) VIEW
   -------------------------------------------------------------------------- */
.oracle-view {
  display: flex;
  flex-direction: column;
  height: 100%;
}
.oracle-view .chat-panel {
  height: 100%;
  flex: 1;
}

`;

fs.writeFileSync(cssPath, originalCss + '\n' + institutionalStyles, 'utf8');
console.log('[CSS SUCCESS] Institutional 5-View styles appended cleanly to index-DBEPqIPN.css!');
