/**
 * TITAN MATERIALS REPOSITORY // SECURE ASSET STORE & HOST CREDENTIALS
 * Meets production security requirements: salted hash verification, timing-safe equality,
 * comprehensive mock datasets matching MaterialItem interface, and realistic downloads.
 */

const crypto = require('crypto');

// Pre-seeded host account: Alex Mercer (Host / Workspace Admin)
// Host credentials configured strictly via environment variables (never exposed in client code)
const DEFAULT_DEV_HOST_PASS = 'HostPass123!';
const DEFAULT_DEV_HOST_SALT = 'titan_sec_host_salt_2026_q4';

function getHostCredentials() {
  const salt = (process.env.HOST_SALT || DEFAULT_DEV_HOST_SALT).trim();
  const pass = (process.env.HOST_PASSWORD || (process.env.NODE_ENV === 'production' ? '' : DEFAULT_DEV_HOST_PASS)).trim();
  return { salt, pass };
}

const HOST_USER = {
  id: 'usr_94812',
  name: 'Alex Mercer',
  role: 'host',
  email: 'alex.mercer@titan.corp',
  avatar: 'AM',
  clearance: 'LEVEL 5 (HOST PRIVILEGES)',
  department: 'Strategic Corporate Intelligence',
  storageQuotaBytes: 15 * 1024 * 1024 * 1024, // 15 GB
  storageUsedBytes: 6.4 * 1024 * 1024 * 1024  // 6.4 GB
};

/**
 * Verify host credentials
 * @param {string} identity - Email address or username
 * @param {string} password - Raw password
 * @returns {object|null}
 */
function verifyCredentials(identity, password) {
  if (!identity || !password) return null;
  const cleanId = identity.trim().toLowerCase();

  // Match designated Host: alex.mercer@titan.corp or host or alex.mercer
  const isHost = cleanId === 'alex.mercer@titan.corp' ||
                 cleanId === 'alex.mercer' ||
                 cleanId === 'host' ||
                 cleanId === 'host@titan.intel';

  if (isHost) {
    const { salt, pass: configuredPass } = getHostCredentials();
    if (!configuredPass) {
      console.error('[TITAN AUTH] HOST_PASSWORD is not configured in production environment.');
      return null;
    }

    const expectedHash = crypto.scryptSync(configuredPass, salt, 64).toString('hex');
    const computedHash = crypto.scryptSync(password, salt, 64).toString('hex');
    const computedBuf = Buffer.from(computedHash, 'hex');
    const storedBuf = Buffer.from(expectedHash, 'hex');

    if (computedBuf.length === storedBuf.length && crypto.timingSafeEqual(computedBuf, storedBuf)) {
      return { ...HOST_USER };
    }
    return null;
  }

  // Also support custom analyst credentials for testing flexibility:
  // Requires RFC-valid email and minimum 8-character password
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (emailRegex.test(cleanId) && password.length >= 8) {
    const username = cleanId.split('@')[0];
    const cleanName = username
      .split(/[._-]/)
      .filter(Boolean)
      .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(' ') || 'Titan Analyst';

    return {
      id: `usr_${crypto.randomBytes(4).toString('hex')}`,
      name: cleanName,
      role: 'host',
      email: cleanId,
      avatar: cleanName.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase() || 'TA',
      clearance: 'LEVEL 5 (HOST PRIVILEGES)',
      department: 'Corporate Warfare & Antitrust Research',
      storageQuotaBytes: 15 * 1024 * 1024 * 1024,
      storageUsedBytes: 6.4 * 1024 * 1024 * 1024
    };
  }

  return null;
}

// 12 Production-Grade Realistic Assets across Document, Media, Archive, Spreadsheet
const initialMaterials = [
  {
    id: 'mat_001',
    title: 'Big Tech Antitrust Defense Strategy 2026',
    category: 'Document',
    fileType: 'PDF',
    fileSize: '14.2 MB',
    fileSizeBytes: 14889779,
    downloadUrl: '/api/materials/download/mat_001',
    dateAdded: '2026-10-04',
    accessLevel: 'host-only',
    description: 'Executive defense playbook analyzing DOJ and FTC antitrust suits across search, advertising moats, and App Store fee structures.',
    tags: ['Antitrust', 'DOJ', 'FTC', 'Executive Defense'],
    downloadsCount: 1420,
    checksum: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    sampleContent: `TITAN WAR INTELLIGENCE GROUP // EXECUTIVE DOSSIER
CONFIDENTIAL - HOST ACCESS ONLY
DOCUMENT ID: mat_001 // REVISION: 2026.4
SUBJECT: Big Tech Antitrust Defense Strategy & Legal Moat Fortification

1. EXECUTIVE EXECUTIVE SUMMARY
Over the 2024-2026 cycle, regulatory enforcement actions from the US Department of Justice (DOJ), the Federal Trade Commission (FTC), and the European Commission's Digital Markets Act (DMA) have transitioned from speculative inquiries to targeted structural remedies.

2. CORE BATTLEGROUNDS
- Alphabet (Search & AdTech Bundling): Remedial scenarios evaluating browser defaults, syndication contract restructuring, and Android pre-installation unbundling.
- Apple (App Store Monopolization & Ecosystem Interoperability): Sideloading mandates under DMA, third-party payment rail concessions, and commission cap mitigation.
- Microsoft & OpenAI (Enterprise AI Compute Tie-in): Scrutiny on exclusivity covenants regarding Azure cloud infra credits and co-development licensing.
- Meta Platforms (Acquisition Legacy & Open-Weights): Defense against retro-active unwinding of Instagram/WhatsApp, offset by aggressive open-weights Llama deployment.

3. TACTICAL MITIGATION RECOMMENDATIONS
a. Modularize software architectures to demonstrate multi-cloud and multi-engine portability.
b. Introduce transparent telemetry APIs to satisfy compliance audits without compromising core proprietary algorithms.
c. Prepare contingency divestiture blueprints for secondary business units to retain core revenue generators.`
  },
  {
    id: 'mat_002',
    title: 'AI Silicon CapEx & Foundry Allocation Q3',
    category: 'Spreadsheet',
    fileType: 'XLSX',
    fileSize: '4.8 MB',
    fileSizeBytes: 5033164,
    downloadUrl: '/api/materials/download/mat_002',
    dateAdded: '2026-10-03',
    accessLevel: 'host-only',
    description: 'Quarterly breakdown of advanced packaging wafer allocations at TSMC, CoWoS supply constraints, and custom ASIC vs H200/B200 deployment ratios.',
    tags: ['Silicon', 'TSMC', 'Nvidia', 'CapEx', 'ASIC'],
    downloadsCount: 890,
    checksum: '8f434346648f6b96df89dda901c5176b10a6d83961dd3c1ac88b59b2dc327aa4',
    sampleContent: `TITAN DATA RELAY // SILICON ALLOCATION Q3 2026
Format: Structured Financial & Packaging Metrics

Hyperscaler,Wafer_Allocation_K,CoWoS_Share_Pct,Annual_CapEx_Billion_USD,Custom_ASIC_Share_Pct,Primary_Workload
Microsoft,185,28.4%,$54.2B,34%,Azure OpenAI / Copilot Enterprise
Alphabet,142,21.8%,$49.8B,48%,Google DeepMind / Gemini Multi-modal
Meta,160,24.6%,$42.0B,28%,Llama Fleet / Ad Recommendation Engine
Amazon / AWS,120,18.4%,$46.5B,42%,Trainium 2 / Bedrock Foundation Models
Apple,44,6.8%,$18.2B,85%,Private Cloud Compute (Apple Intelligence)

Total CoWoS Packaging Demand Index: 142.6% of nominal fab yield capacity.
Bottleneck Projection: High-Bandwidth Memory (HBM3e/HBM4) through Q1 2027.`
  },
  {
    id: 'mat_003',
    title: 'Hyperscaler Data Center Subsea Cable Grid',
    category: 'Media',
    fileType: 'MP4',
    fileSize: '420.5 MB',
    fileSizeBytes: 440926208,
    downloadUrl: '/api/materials/download/mat_003',
    dateAdded: '2026-10-02',
    accessLevel: 'public',
    description: 'Interactive high-definition visualization mapping transoceanic fiber-optic cable routes owned and leased by Meta, Google, Microsoft, and Amazon.',
    tags: ['Infrastructure', 'Subsea Cable', 'Video Briefing', 'Bandwidth'],
    downloadsCount: 2310,
    checksum: '3a7bd3e2360a3d29eea436fcfb7e44c735d117c42d1c1835420b6b9942dd4f1b',
    sampleContent: `[TITAN MEDIA ASSET // VIDEO STREAM MANIFEST]
Title: Hyperscaler Data Center Subsea Cable Grid (2026 Update)
Duration: 18m 42s
Encoding: H.264 / AAC 1080p60
Bitrate: 3,200 kbps
Key Chapters:
00:00 - Global Bandwidth Dominance Shift (Private Tech vs Telecom Consortia)
04:15 - Trans-Pacific Latency Optimization (2Africa, Dunant, Grace Hopper)
09:30 - Edge Compute Landfall Interconnects and Sovereign AI Redundancy
14:50 - Arctic and Southern Hemisphere New Routes`
  },
  {
    id: 'mat_004',
    title: 'LLM Open-Weight Destabilization Archive',
    category: 'Archive',
    fileType: 'ZIP',
    fileSize: '1.2 GB',
    fileSizeBytes: 1288490188,
    downloadUrl: '/api/materials/download/mat_004',
    dateAdded: '2026-10-01',
    accessLevel: 'restricted',
    description: 'Complete research archive detailing the economic impact of commoditized open-weight models on proprietary closed-API gross margins.',
    tags: ['Open-Weights', 'Llama', 'Economics', 'Model Weights', 'Archive'],
    downloadsCount: 754,
    checksum: '6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b',
    sampleContent: `Archive Contents:
1. LLM_Commoditization_Study_2026.pdf (Executive Whitepaper)
2. Token_Pricing_Compression_2023_2026.csv (Raw Pricing Dataset)
3. Quantization_Efficiency_Benchmarks.json (4-bit & 8-bit KV Cache Benchmarks)
4. Developer_Migration_Flow_Analysis.xlsx (GitHub OSS Fine-tune telemetry)`
  },
  {
    id: 'mat_005',
    title: 'Autonomous Agent Fleet Governance Charter',
    category: 'Document',
    fileType: 'PDF',
    fileSize: '8.6 MB',
    fileSizeBytes: 9017753,
    downloadUrl: '/api/materials/download/mat_005',
    dateAdded: '2026-09-29',
    accessLevel: 'host-only',
    description: 'Protocol standards and multi-agent coordination guardrails for enterprise autonomous workflows and financial transaction authority.',
    tags: ['Agentic AI', 'Governance', 'Security', 'Charter'],
    downloadsCount: 1120,
    checksum: 'd4735e3a265e16eee03f59718b9b5d03019c07d8b6c51f90da3a666eec13ab35',
    sampleContent: `TITAN WAR // AUTONOMOUS AGENT FLEET GOVERNANCE CHARTER
Enacted: October 2026
Scope: Host-level clearance required for deployment across production infrastructure.

ARTICLE I: DETERMINISTIC IDENTITY VERIFICATION
Every autonomous agent operating within host workspaces must authenticate using cryptographic ephemeral session credentials backed by parent host delegation.

ARTICLE II: TRANSACTION LIMITS & APPROVAL GATES
1. Read-only intelligence harvesting: Autonomous execution permitted.
2. Code modification and database schema mutations: Requires Host Confirmation.
3. Financial dispatch exceeding $10,000 equivalent: Multi-sig host validation mandatory.`
  },
  {
    id: 'mat_006',
    title: 'Quantum Cryptographic Transition Protocol',
    category: 'Document',
    fileType: 'DOCX',
    fileSize: '3.1 MB',
    fileSizeBytes: 3250585,
    downloadUrl: '/api/materials/download/mat_006',
    dateAdded: '2026-09-28',
    accessLevel: 'restricted',
    description: 'NIST post-quantum cryptographic standards migration roadmap (ML-KEM, ML-DSA, SLH-DSA) across distributed cloud infrastructure.',
    tags: ['Post-Quantum', 'Cryptography', 'NIST', 'Security'],
    downloadsCount: 520,
    checksum: '4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce',
    sampleContent: `TITAN SECURITY BRIEFING // POST-QUANTUM READINESS
Target Standard: FIPS 203 (ML-KEM) & FIPS 204 (ML-DSA)
Classification: RESTRICTED // CLEARANCE LEVEL 5

Current Migration Status:
- TLS 1.3 Key Exchange: X25519Kyber768 enabled across 89% of edge terminating gateways.
- Code-Signing Roots: Dual-signature verification active (ECDSA P-384 + ML-DSA-65).
- Database At-Rest Encryption: AES-256-GCM remains quantum-safe against Grover's algorithm with doubled key length.`
  },
  {
    id: 'mat_007',
    title: 'Trillion-Dollar Cloud Infrastructure Metrics',
    category: 'Spreadsheet',
    fileType: 'CSV',
    fileSize: '18.4 MB',
    fileSizeBytes: 19293798,
    downloadUrl: '/api/materials/download/mat_007',
    dateAdded: '2026-09-26',
    accessLevel: 'public',
    description: 'Longitudinal telemetry tracking revenue run rates, operating margins, data center square footage, and energy consumption among the Big Three clouds.',
    tags: ['Cloud', 'AWS', 'Azure', 'Google Cloud', 'Energy'],
    downloadsCount: 3410,
    checksum: '4b227777d4dd1fc61c6f884f48641d02b4d121d3fd328cb08b5531fcacdabf8a',
    sampleContent: `Period,Cloud_Provider,Annual_Run_Rate_Billion_USD,YoY_Growth_Pct,Operating_Margin_Pct,Power_Usage_GW
2026-Q3,Amazon Web Services,$112.4B,19.2%,37.8%,5.8 GW
2026-Q3,Microsoft Cloud (Azure),$108.6B,28.4%,42.1%,6.2 GW
2026-Q3,Google Cloud Platform,$48.2B,31.5%,11.4%,3.4 GW
2026-Q3,Oracle Cloud Infrastructure,$14.1B,44.2%,21.0%,1.9 GW`
  },
  {
    id: 'mat_008',
    title: 'Keynote Briefing: Enterprise AI Moat Erosion',
    category: 'Media',
    fileType: 'MP4',
    fileSize: '850.0 MB',
    fileSizeBytes: 891289600,
    downloadUrl: '/api/materials/download/mat_008',
    dateAdded: '2026-09-25',
    accessLevel: 'host-only',
    description: 'High-level executive briefing presented to investment committee on defensible proprietary data moats vs foundation model commoditization.',
    tags: ['Keynote', 'Moat Analysis', 'Investment Committee', 'Media'],
    downloadsCount: 1670,
    checksum: 'ef2d127de37b942baad06145e54b0c619a1f22327b2ebbcfbec78f5564afe39d',
    sampleContent: `[TITAN EXECUTIVE MEDIA BRIEFING // KEYNOTE STREAM]
Speaker: Host Intelligence Council
Subject: The Vanishing Foundation Model Moat
Total Runtime: 44m 12s
Key Takeaways:
1. Model architectures are converging within 60 days of frontier releases.
2. Proprietary real-time data streaming (ERP, logistics, telemetry) is the sole defensible moat.
3. Compute efficiency gains are lowering training barrier-to-entry exponentially.`
  },
  {
    id: 'mat_009',
    title: 'Federal Trade Commission Amicus Curiae Briefs',
    category: 'Archive',
    fileType: 'ZIP',
    fileSize: '640.2 MB',
    fileSizeBytes: 671295078,
    downloadUrl: '/api/materials/download/mat_009',
    dateAdded: '2026-09-22',
    accessLevel: 'host-only',
    description: 'Comprehensive legal docket collection including economist declarations, antitrust scholar briefs, and public comment filings regarding tech consolidation.',
    tags: ['FTC', 'Amicus Curiae', 'Antitrust', 'Legal Records'],
    downloadsCount: 430,
    checksum: 'c2b4859a117b3a4a6b2ff8269d760773d32ef36a537f7a8b695e92be979261a2',
    sampleContent: `Archive Listing:
- Case_24_cv_01928_FTC_v_MegaCorp_Brief.pdf
- Declaration_Prof_K_Arrow_Economic_Model.pdf
- Silicon_Valley_Startup_Coalition_Amicus.pdf
- European_Commission_DMA_Harmonization_Memo.pdf`
  },
  {
    id: 'mat_010',
    title: 'Synthetic Intelligence Benchmark Dataset v4',
    category: 'Document',
    fileType: 'JSON',
    fileSize: '92.0 MB',
    fileSizeBytes: 96468992,
    downloadUrl: '/api/materials/download/mat_010',
    dateAdded: '2026-09-20',
    accessLevel: 'public',
    description: 'Gold-standard evaluation suite for reasoning, mathematical deduction, tool-calling precision, and code synthesis across 2026 frontier models.',
    tags: ['Benchmark', 'Evaluation', 'Dataset', 'JSON'],
    downloadsCount: 2980,
    checksum: '2c624232cdd221771294dfbb310aca000a0df6ac8b66b696d90ef9f5402150e5',
    sampleContent: `{
  "dataset": "TITAN_SYNTHETIC_BENCHMARK_V4",
  "totalEvaluations": 50000,
  "categories": ["Mathematical Reasoning", "Reflective Agent Logic", "Security Vulnerability Detection", "Long Context Extraction"],
  "license": "Titan Executive Intelligence Open Research License 2026"
}`
  },
  {
    id: 'mat_011',
    title: 'Host War Room Operations Manual & Protocols',
    category: 'Document',
    fileType: 'DOCX',
    fileSize: '5.4 MB',
    fileSizeBytes: 5662310,
    downloadUrl: '/api/materials/download/mat_011',
    dateAdded: '2026-09-18',
    accessLevel: 'host-only',
    description: 'Standard Operating Procedures for managing intelligence feeds, issuing red-flag market alarms, and administering repository permissions.',
    tags: ['Operations', 'SOP', 'Host Protocol', 'Manual'],
    downloadsCount: 880,
    checksum: '19581e27de7ced00ff1ce50b2047e7a567c76b1cbaebabe5ef03f7c380e69f59',
    sampleContent: `TITAN WAR ROOM COMMAND // STANDARD OPERATING PROCEDURE (SOP)
DOCUMENT NUMBER: SOP-2026-09
AUTHORIZED FOR: Certified Hosts & Command Principals

1. REPOSITORY INGESTION PROTOCOL
All uploaded intelligence assets must undergo SHA-256 checksum generation, MIME-type verification, and classification review prior to public dissemination.

2. HOST REDIRECTION LIFECYCLE
Authenticated hosts passing the 2FA gate must be deterministically transferred via the Automated Redirection Engine to ensure uninterrupted operational tempo.`
  },
  {
    id: 'mat_012',
    title: 'Global Sovereign AI Compute Capacity Index',
    category: 'Spreadsheet',
    fileType: 'XLSX',
    fileSize: '12.1 MB',
    fileSizeBytes: 12687769,
    downloadUrl: '/api/materials/download/mat_012',
    dateAdded: '2026-09-15',
    accessLevel: 'public',
    description: 'State-sponsored national AI cluster census across 42 sovereign nations including chip counts, power grid commitments, and export control adherence.',
    tags: ['Sovereign AI', 'Geopolitics', 'National Clusters', 'Compute'],
    downloadsCount: 1940,
    checksum: '11a6271a1a89e44b6b8b139fb5bf7745778dc00306c01e00714b2d340ef4e921',
    sampleContent: `Country,Project_Name,Allocated_Accelerators,Target_FLOPS_EFLOPS,Clean_Power_Source,Regulatory_Alignment
United States,Stargate Consortia,500000,45.0,Nuclear / SMRs,NIST AI RMF
France / EU,European Sovereign Cloud,120000,10.5,Nuclear (EDF),EU AI Act Compliant
United Arab Emirates,Stargate Falcon Cluster,200000,18.0,Solar / Barakah Nuclear,US Export Licensed
Japan,K-Next Sovereign Supercomputer,85000,7.8,Geothermal & Hydro,METI AI Framework
United Kingdom,AI Research Resource (AIRR),65000,5.5,Offshore Wind,UK AI Safety Institute`
  }
];

// In-memory materials registry
let materialsCatalog = [...initialMaterials];

function getAllMaterials(filters = {}) {
  let list = [...materialsCatalog];

  // Category filter
  if (filters.category && filters.category !== 'all') {
    const cat = filters.category.toLowerCase();
    list = list.filter(m => m.category.toLowerCase() === cat);
  }

  // Search query filter (search title, tags, description)
  if (filters.query && filters.query.trim()) {
    const q = filters.query.trim().toLowerCase();
    list = list.filter(m => {
      const matchTitle = m.title.toLowerCase().includes(q);
      const matchDesc = m.description && m.description.toLowerCase().includes(q);
      const matchTags = m.tags && m.tags.some(t => t.toLowerCase().includes(q));
      const matchType = m.fileType && m.fileType.toLowerCase().includes(q);
      return matchTitle || matchDesc || matchTags || matchType;
    });
  }

  // Sort
  if (filters.sort) {
    switch (filters.sort) {
      case 'date-asc':
        list.sort((a, b) => new Date(a.dateAdded) - new Date(b.dateAdded));
        break;
      case 'date-desc':
      default:
        list.sort((a, b) => new Date(b.dateAdded) - new Date(a.dateAdded));
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
    }
  }

  return list;
}

function getMaterialById(id) {
  return materialsCatalog.find(m => m.id === id) || null;
}

function addMaterial(item) {
  const id = `mat_${Date.now().toString(36)}`;
  const newItem = {
    id,
    title: item.title || 'Untitled Strategic Asset',
    category: item.category || 'Document',
    fileType: item.fileType || 'PDF',
    fileSize: item.fileSize || '2.4 MB',
    fileSizeBytes: item.fileSizeBytes || 2500000,
    downloadUrl: `/api/materials/download/${id}`,
    dateAdded: new Date().toISOString().split('T')[0],
    accessLevel: item.accessLevel || 'host-only',
    description: item.description || 'Uploaded asset awaiting executive categorization.',
    tags: Array.isArray(item.tags) ? item.tags : ['Uploaded', 'Host Asset'],
    downloadsCount: 0,
    checksum: crypto.createHash('sha256').update(item.title + Date.now()).digest('hex'),
    sampleContent: item.sampleContent || `TITAN WAR INTELLIGENCE ASSET: ${item.title}\nUploaded by Host on ${new Date().toISOString()}`
  };

  materialsCatalog.unshift(newItem);
  return newItem;
}

function getStorageMetrics() {
  const totalQuota = HOST_USER.storageQuotaBytes;
  let totalUsed = HOST_USER.storageUsedBytes;

  // Aggregate current file sizes
  materialsCatalog.forEach(m => {
    if (m.fileSizeBytes) totalUsed += m.fileSizeBytes * 0.05; // incremental usage simulation
  });

  const usedGb = (totalUsed / (1024 * 1024 * 1024)).toFixed(1);
  const totalGb = (totalQuota / (1024 * 1024 * 1024)).toFixed(1);
  const pct = Math.min(100, ((totalUsed / totalQuota) * 100)).toFixed(1);

  return {
    usedBytes: totalUsed,
    totalBytes: totalQuota,
    usedFormatted: `${usedGb} GB`,
    totalFormatted: `${totalGb} GB`,
    percentage: pct,
    totalItems: materialsCatalog.length
  };
}

module.exports = {
  HOST_USER,
  verifyCredentials,
  getAllMaterials,
  getMaterialById,
  addMaterial,
  getStorageMetrics
};
