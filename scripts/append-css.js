const fs = require('fs');
const path = require('path');

const cssPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DBEPqIPN.css');
const css = fs.readFileSync(cssPath, 'utf8');

const newStyles = `
/* News Integration & Catalyst Impact Styles */
.news-item--active {
  border-color: rgba(34, 211, 238, 0.45) !important;
  background: rgba(34, 211, 238, 0.06) !important;
}
.news-ticker-tag {
  display: inline-flex;
  align-items: center;
  padding: 1px 6px;
  background: rgba(34, 211, 238, 0.15);
  border: 1px solid rgba(34, 211, 238, 0.35);
  border-radius: 4px;
  color: #22d3ee;
  font: 700 10px var(--mono, monospace);
  letter-spacing: 0.06em;
  cursor: pointer;
  transition: all 0.15s ease;
}
.news-ticker-tag:hover {
  background: rgba(34, 211, 238, 0.3);
  box-shadow: 0 0 8px rgba(34, 211, 238, 0.3);
}
.news-sentiment-badge {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 1px 7px;
  border-radius: 4px;
  font: 700 9px var(--mono, monospace);
  letter-spacing: 0.05em;
}
.news-sentiment--bull {
  background: rgba(52, 211, 153, 0.15);
  border: 1px solid rgba(52, 211, 153, 0.4);
  color: #34d399;
}
.news-sentiment--bear {
  background: rgba(251, 113, 133, 0.15);
  border: 1px solid rgba(251, 113, 133, 0.4);
  color: #fb7185;
}
.news-sentiment--neutral {
  background: rgba(148, 163, 184, 0.12);
  border: 1px solid rgba(148, 163, 184, 0.3);
  color: #94a3b8;
}
.news-impact-est {
  opacity: 0.9;
  font-weight: 600;
}
.news-actions-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-top: 6px;
  padding-top: 4px;
  border-top: 1px solid rgba(255, 255, 255, 0.04);
}
.news-impact-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 3px 8px;
  background: rgba(15, 23, 42, 0.85);
  border: 1px solid rgba(34, 211, 238, 0.3);
  border-radius: 4px;
  color: #38bdf8;
  font: 600 9.5px var(--sans, sans-serif);
  cursor: pointer;
  transition: all 0.15s ease;
}
.news-impact-btn:hover {
  background: rgba(56, 189, 248, 0.18);
  border-color: #38bdf8;
  box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
}
.news-impact-btn--applied {
  background: rgba(52, 211, 153, 0.2) !important;
  border-color: #34d399 !important;
  color: #34d399 !important;
}

/* Multi-Asset Simultaneous Graph Styles */
.multi-stock-panel .graph-chart {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.graph-catalyst-banner {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 12px 6px;
  padding: 5px 9px;
  background: linear-gradient(90deg, rgba(245, 158, 11, 0.18) 0%, rgba(245, 158, 11, 0.05) 100%);
  border: 1px solid rgba(245, 158, 11, 0.4);
  border-radius: 5px;
  color: #f59e0b;
  font: 10px var(--sans, sans-serif);
  animation: bannerFadeIn 0.3s ease;
}
.catalyst-flash-icon {
  color: #fbbf24;
  animation: flashPulse 1.2s ease-in-out infinite;
}
@keyframes flashPulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.9); }
}
@keyframes bannerFadeIn {
  from { opacity: 0; transform: translateY(-4px); }
  to { opacity: 1; transform: translateY(0); }
}
.graph-legend-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 4px 6px;
  background: rgba(10, 14, 23, 0.6);
  border: 1px solid rgba(255, 255, 255, 0.05);
  border-radius: 6px;
  max-height: 58px;
  overflow-y: auto;
  scrollbar-width: thin;
}
.legend-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 6px;
  background: rgba(15, 23, 42, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font: 10px var(--mono, monospace);
  color: #94a3b8;
  cursor: pointer;
  transition: all 0.15s ease;
}
.legend-chip:hover {
  background: rgba(255, 255, 255, 0.08);
  color: #f8fafc;
}
.legend-chip--active {
  background: rgba(34, 211, 238, 0.14) !important;
  color: #f8fafc !important;
  box-shadow: 0 0 10px rgba(34, 211, 238, 0.2);
}
.legend-chip__dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  flex-shrink: 0;
}
.legend-chip__sym {
  font-weight: 700;
  color: inherit;
}
.legend-chip__px {
  color: #cbd5e1;
  font-size: 9.5px;
}
.legend-chip__pct {
  font-size: 9px;
  font-weight: 600;
}
.catalyst-pulse {
  animation: catalystPulseRing 1.8s cubic-bezier(0.215, 0.61, 0.355, 1) infinite;
  transform-origin: center;
}
@keyframes catalystPulseRing {
  0% { transform: scale(0.9); opacity: 0.9; }
  50% { transform: scale(1.3); opacity: 0.3; }
  100% { transform: scale(0.9); opacity: 0.9; }
}
`;

if (!css.includes('/* News Integration & Catalyst Impact Styles */')) {
  fs.writeFileSync(cssPath, css + '\n' + newStyles, 'utf8');
  console.log('[CSS SUCCESS] Appended enhanced styles to index-DBEPqIPN.css');
} else {
  console.log('[CSS] Enhanced styles already present');
}
