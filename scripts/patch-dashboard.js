const fs = require('fs');
const path = require('path');
const vm = require('vm');

const targetPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DX773-IE.js');
const backupPath = path.join(__dirname, '..', 'public', 'trading-assistant', 'assets', 'index-DX773-IE.js.bak');

if (!fs.existsSync(backupPath)) {
  fs.copyFileSync(targetPath, backupPath);
  console.log('[BACKUP] Created backup of index-DX773-IE.js');
}

const originalContent = fs.readFileSync(backupPath, 'utf8');
const lines = originalContent.split('\n');

// Line 223 (0-indexed 222) contains the application logic
const line223 = lines[222];

// Boundaries verified:
// 0 to 5379: Remainder of Hf (MarketOracle Chat)
// 5379 to 6240: Bf (Market News)
// 6240 to 12174: Wf, Vi, Qf, Kf, Gf
// 12174 to 13675: Yf, Xf (Price Graph)
// 13675 to 19822: ec, qf, Jf, Zf, ep, yt, gt, Ue, tp, np
// 19822 to 20125: rp (News Parser)
// 20125 to 20680: lp, sp
// 20680 to 25907: ip (Main Dashboard)
// 25907 to end: nc, Ki, op, ap, up, cp, rc, dp, fp, render

const prefix_0_to_5379 = line223.substring(0, 5379);
const middle_6240_to_12174 = line223.substring(6240, 12174);
const middle_13675_to_19822 = line223.substring(13675, 19822);
const middle_20125_to_20680 = line223.substring(20125, 20680);
const suffix_25907_to_end = line223.substring(25907);

console.log('Validating slices...');
console.log('Prefix starts with:', prefix_0_to_5379.substring(0, 30));
console.log('Prefix ends with:', prefix_0_to_5379.substring(prefix_0_to_5379.length - 40));
console.log('Wf starts with:', middle_6240_to_12174.substring(0, 40));
console.log('ec starts with:', middle_13675_to_19822.substring(0, 40));
console.log('lp starts with:', middle_20125_to_20680.substring(0, 40));
console.log('nc starts with:', suffix_25907_to_end.substring(0, 40));
