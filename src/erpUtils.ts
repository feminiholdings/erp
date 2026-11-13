import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import {
  StaffRole,
  StaffMember,
  ERPModuleId,
  Product,
  GeoRegion,
  TransactionDoc,
  LineItem,
  ExternalCustomer,
} from './types';

// Detect legacy sample/demo SKU records so they are purged and never rendered
const SAMPLE_IMPORT_REFS = new Set([
  'KRA-IDF-2026-9921',
  'KRA-IDF-2026-8812',
  'KRA-IDF-2026-7734',
  'LOCAL-LPS-NAIROBI',
  'KRA-IDF-2026-6641',
]);

const SAMPLE_EXCISE_SERIES = new Set([
  'EXC-JW-2026-001',
  'EXC-HN-2026-002',
  'EXC-TQ-2026-003',
  'KRA-LPS-2026-004',
  'EXC-DJ-2026-005',
]);

export function isSampleSkuRecord(p: Partial<Product> & { id?: string }): boolean {
  if (!p) return false;
  const id = (p.id || '').trim();
  const sku = (p.sku || '').trim().toUpperCase();
  const sourceUrl = (p.sourceUrl || '').toLowerCase();
  const importRef = (p.importDeclarationNumber || p.importEntryRef || '').trim();
  const exciseSeries = (p.exciseStampSeries || '').trim();

  if (
    id.startsWith('nd-prod-') ||
    id.startsWith('cat-prod-') ||
    id.startsWith('cat-upd-') ||
    id.startsWith('sample-') ||
    id.startsWith('mock-') ||
    id.startsWith('seed-')
  ) {
    return true;
  }

  if (
    sku.startsWith('ND-') ||
    sku === 'IPS-WHISKY-002' ||
    sku === 'IPS-WHISKY-002-1L'
  ) {
    return true;
  }

  if (
    sourceUrl.includes('nairobidrinks.co.ke') ||
    sourceUrl.includes('urbantechdev.com/catalog/') ||
    Boolean((p as any).internalProvenance)
  ) {
    return true;
  }

  if (
    importRef.startsWith('IDF/2026/NRB/1') ||
    SAMPLE_IMPORT_REFS.has(importRef) ||
    SAMPLE_EXCISE_SERIES.has(exciseSeries)
  ) {
    return true;
  }

  return false;
}

// Detect real client device fingerprint & browser metadata for audit & security monitoring
export function getDeviceFingerprint(): string {
  if (typeof window === 'undefined') return 'Server Runtime';
  const ua = navigator.userAgent;
  const platform = navigator.platform || 'Unknown OS';
  let browser = 'Browser';
  if (ua.includes('Chrome') && !ua.includes('Edg')) browser = 'Chrome';
  else if (ua.includes('Safari') && !ua.includes('Chrome')) browser = 'Safari';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Edg')) browser = 'Edge';

  const isMobile = /Mobile|Android|iP(hone|od|ad)/.test(ua);
  const screenRes = `${window.screen.width}x${window.screen.height}`;
  return `${isMobile ? 'MobileApp' : 'Desktop'} · ${browser} (${platform}) · ${screenRes}`;
}

export function normalizeCatalogProduct(raw: Product, index: number): Product {
  const packSize = raw.packSize || raw.bottlesPerCase || 12;
  const abv = raw.alcoholPercentage ?? raw.abv ?? 40;
  const origin = raw.countryOfOrigin || raw.originCountry || (raw.category === 'LPS' ? 'Kenya' : 'Scotland');
  const wholesale = raw.wholesalePriceKes ?? raw.baseWholesalePrice ?? 2500;
  const retail = raw.retailPriceKes ?? raw.baseRetailPrice ?? 3200;
  const cost = raw.warehouseCostKes ?? raw.baseLandedCost ?? Math.round(wholesale * 0.82);
  const totalBottles = raw.totalBottles ?? 0;

  const defaultBranchStock = JSON.stringify({});
  const isReal = Boolean(raw.hasRealBarcode || raw.barcode);
  const realBarcode = raw.barcode || (isReal ? raw.barcode : undefined);
  const realCaseBarcode = raw.caseBarcode || (isReal ? raw.caseBarcode : undefined);

  return {
    ...raw,
    barcode: realBarcode,
    caseBarcode: realCaseBarcode,
    hasRealBarcode: isReal,
    barcodeVerificationStatus: isReal ? 'APPROVED_MASTER' : 'UNVERIFIED_SOURCE',
    id: raw.id || `prod-${Date.now()}-${index + 1}`,
    sku: raw.sku || generateAutoSku(raw.subCategory || 'Whisky', raw.volumeMl || 750, origin, index),
    category: raw.category === 'LPS' ? 'LPS' : 'IPS',
    subCategory: raw.subCategory || 'Whisky',
    brand: raw.brand || raw.name.split(' ')[0] || 'VAAIRO',
    volumeMl: raw.volumeMl || 750,
    abv,
    alcoholPercentage: abv,
    bottlesPerCase: packSize,
    packSize,
    originCountry: origin,
    countryOfOrigin: origin,
    supplierName: raw.supplierName || '',
    importEntryRef: raw.importDeclarationNumber || raw.importEntryRef || '',
    exciseStampSeries: raw.exciseStampSeries || '',
    baseLandedCost: cost,
    warehouseCostKes: cost,
    baseWholesalePrice: wholesale,
    wholesalePriceKes: wholesale,
    baseRetailPrice: retail,
    retailPriceKes: retail,
    totalBottles,
    branchStockSummary: raw.branchStockSummary || defaultBranchStock,
    geoPriceOverrides: raw.geoPriceOverrides || JSON.stringify({}),
    createdAt: raw.createdAt || new Date().toISOString(),
    isScanned: raw.isScanned !== undefined ? raw.isScanned : isReal,
  };
}

export const MASTER_IMPORTED_INVENTORY: Product[] = [];

// Auto SKU Generator for independent liquor products
const SUBCATEGORY_PREFIX: Record<string, string> = {
  Whisky: 'WHS',
  'Cognac & Brandy': 'COG',
  Gin: 'GIN',
  Vodka: 'VDK',
  Rum: 'RUM',
  'White Rum': 'WRM',
  'Spiced & Dark Rum': 'DRM',
  Tequila: 'TEQ',
  'Liqueur & Cream': 'LIQ',
  'Cream Liqueur': 'CRM',
  'Champagne & Wine': 'WNE',
  'Beer & Cider': 'BER',
};

export function generateAutoSku(
  subCategory: string,
  volumeMl: number,
  originCountry: string,
  sequenceIndex: number,
  stockCategory: 'IPS' | 'LPS' = 'IPS'
): string {
  const catCode = SUBCATEGORY_PREFIX[subCategory] || 'LIQ';
  const countryCode = (originCountry || 'KE')
    .replace(/[^a-zA-Z]/g, '')
    .slice(0, 2)
    .toUpperCase()
    .padEnd(2, 'X');
  const seq = String(sequenceIndex + 101).padStart(4, '0');
  return `${stockCategory}-${catCode}-${volumeMl}-${countryCode}-${seq}`;
}

export function formatKes(amount: number): string {
  return `KES ${Math.round(amount || 0).toLocaleString('en-KE')}`;
}

// Generate simple SVG QR code for KRA eTIMS invoice compliance
export function generateSimpleQrSvg(text: string, size = 160): string {
  const gridSize = 25;
  const matrix: boolean[][] = Array.from({ length: gridSize }, () => Array(gridSize).fill(false));

  const addFinder = (startX: number, startY: number) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (
          r === 0 || r === 6 || c === 0 || c === 6 ||
          (r >= 2 && r <= 4 && c >= 2 && c <= 4)
        ) {
          matrix[startY + r][startX + c] = true;
        } else {
          matrix[startY + r][startX + c] = false;
        }
      }
    }
  };

  addFinder(0, 0);
  addFinder(gridSize - 7, 0);
  addFinder(0, gridSize - 7);

  for (let i = 8; i < gridSize - 8; i++) {
    matrix[6][i] = i % 2 === 0;
    matrix[i][6] = i % 2 === 0;
  }

  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash) + text.charCodeAt(i);
  }

  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if ((r < 7 && c < 7) || (r < 7 && c >= gridSize - 7) || (r >= gridSize - 7 && c < 7)) {
        continue;
      }
      if (r === 6 || c === 6) continue;
      const pseudo = Math.abs(Math.sin((r * gridSize + c + hash) * 9301 + 49297));
      matrix[r][c] = (pseudo * 10) % 2 > 0.95;
    }
  }

  const cellSize = size / gridSize;
  let paths = '';
  for (let r = 0; r < gridSize; r++) {
    for (let c = 0; c < gridSize; c++) {
      if (matrix[r][c]) {
        const x = (c * cellSize).toFixed(1);
        const y = (r * cellSize).toFixed(1);
        const w = cellSize.toFixed(1);
        const h = cellSize.toFixed(1);
        paths += `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="#0A006E" />`;
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" class="mx-auto">${paths}</svg>`;
}

// Geo-Location Price Calculator (Suburb vs Lower Region vs Metro vs Duty-Free)
export function calculateGeoPrice(
  product: Product,
  region: GeoRegion | undefined,
  mode: 'wholesale' | 'retail'
): { unitBottlePrice: number; casePrice: number; appliedRuleLabel: string } {
  const baseWholesale = product.wholesalePriceKes ?? product.baseWholesalePrice ?? 2500;
  const baseRetail = product.retailPriceKes ?? product.baseRetailPrice ?? 3200;
  const packSize = product.packSize || product.bottlesPerCase || 12;
  const baseUnit = mode === 'wholesale' ? baseWholesale : baseRetail;

  if (!region) {
    return {
      unitBottlePrice: Math.round(baseUnit),
      casePrice: Math.round(baseUnit * packSize),
      appliedRuleLabel: 'Standard Base Tariff',
    };
  }

  // Check if product has explicit regional override
  try {
    const overrides = product.geoPriceOverrides ? JSON.parse(product.geoPriceOverrides) : {};
    const regOverride = overrides[region.id];
    if (regOverride && typeof regOverride[mode] === 'number' && regOverride[mode] > 0) {
      const unitOverride = Number(regOverride[mode]);
      return {
        unitBottlePrice: Math.round(unitOverride),
        casePrice: Math.round(
          unitOverride * packSize + (mode === 'wholesale' ? region.freightLevyPerCase : 0)
        ),
        appliedRuleLabel: `${region.name} Custom Override`,
      };
    }
  } catch {
    // fallback to multiplier
  }

  const multiplier = mode === 'wholesale' ? region.wholesaleMultiplier : region.retailMultiplier;
  const freightPerBottle = region.freightLevyPerCase / Math.max(1, packSize);
  const computedBottle =
    baseUnit * multiplier + (mode === 'wholesale' ? freightPerBottle : freightPerBottle * 0.5);

  return {
    unitBottlePrice: Math.round(computedBottle),
    casePrice: Math.round(computedBottle * packSize),
    appliedRuleLabel: `${region.name} (${region.tierType} ×${multiplier.toFixed(2)} + KES ${region.freightLevyPerCase}/case freight)`,
  };
}

// Target Access Model Matrix Definition
export type AccessLevel =
  | 'Full'
  | 'Finance'
  | 'HR KPIs'
  | 'Sales KPIs'
  | 'Branch KPIs'
  | 'Stock KPIs'
  | 'Manage'
  | 'Read-only'
  | 'Limited'
  | 'Branch'
  | 'Cost / stock'
  | 'Financial view'
  | 'Financial'
  | 'Sales scope'
  | 'Branch scope'
  | 'Delivery docs'
  | 'Own POS docs'
  | 'Own sales docs'
  | 'Tax reports'
  | 'View'
  | 'Branch view'
  | 'Limited staff operations'
  | 'Financial reports'
  | 'Finance audit'
  | 'HR audit'
  | 'Stock scope'
  | 'Own activity'
  | 'Assigned POS'
  | 'Assigned prices'
  | 'Own sales'
  | 'Delivery KPIs'
  | 'Assigned deliveries'
  | 'Assigned route'
  | 'Riders & routes'
  | 'Dispatch docs'
  | 'Delivery notes'
  | 'Employ riders'
  | 'Dispatch audit'
  | 'Self-service'
  | 'Approve / Decline'
  | 'None';

export interface ModuleAccessItem {
  moduleName: string;
  moduleId: ERPModuleId;
  permissions: Record<StaffRole, AccessLevel>;
  description: string;
}

export const TARGET_ACCESS_MATRIX: ModuleAccessItem[] = [
  {
    moduleName: 'Executive overview',
    moduleId: 'overview',
    description: 'Executive dashboards, performance metrics, and operational command views.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Finance',
      HR: 'HR KPIs',
      'Sales Manager': 'Sales KPIs',
      'Branch Manager': 'Branch KPIs',
      'Inventory Controller': 'Stock KPIs',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'Own sales',
      'Delivery Manager': 'Delivery KPIs',
      'Delivery Rider': 'Assigned deliveries',
    },
  },
  {
    moduleName: 'Retail POS',
    moduleId: 'retail_pos',
    description: 'Direct counter retail checkout, barcode scanning, and instant cash/M-Pesa receipting.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Manage',
      'Inventory Controller': 'None',
      'Counter Cashier': 'Limited',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'None',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Wholesale / sales POS',
    moduleId: 'sales_pos',
    description: 'Commercial B2B distributor invoicing, quote generation, and bulk sales dispatch.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Limited',
      'Inventory Controller': 'None',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'Own sales',
      'Delivery Manager': 'View',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Inventory',
    moduleId: 'inventory',
    description: 'Master IPS/LPS liquor stock, batch expiry, barcode governance, and spoilage tracking.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Read-only',
      'Branch Manager': 'Branch',
      'Inventory Controller': 'Manage',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'Read-only',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Transfers',
    moduleId: 'branches_transfers',
    description: 'Bonded inter-branch stock transfers, dispatch permits, transit logistics, and receiving.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Read-only',
      'Branch Manager': 'Branch',
      'Inventory Controller': 'Manage',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'Manage',
      'Delivery Rider': 'Assigned route',
    },
  },
  {
    moduleName: 'Pricing',
    moduleId: 'geo_pricing',
    description: 'Geo-regional pricing multipliers, wholesale margins, freight levies, and price tiers.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Cost / stock',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'Assigned prices',
      'Delivery Manager': 'None',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Suppliers / partners',
    moduleId: 'partners',
    description: 'Bonded distillers, commercial importers, licensed retail partners, and fleet logistics.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Financial view',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Manage',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'Riders & routes',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Invoices / credits',
    moduleId: 'documents_credit',
    description: 'Commercial tax invoices, delivery notes, packing lists, quotes, and credit notes.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Financial',
      HR: 'None',
      'Sales Manager': 'Sales scope',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Delivery docs',
      'Counter Cashier': 'Own POS docs',
      'Affiliate Sales Representative': 'Own sales docs',
      'Delivery Manager': 'Dispatch docs',
      'Delivery Rider': 'Delivery notes',
    },
  },
  {
    moduleName: 'Tax / excise compliance',
    moduleId: 'compliance',
    description: 'KRA eTIMS fiscalization, customs bonded warehouse licenses, and digital excise stamps.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Tax reports',
      HR: 'None',
      'Sales Manager': 'View',
      'Branch Manager': 'Branch view',
      'Inventory Controller': 'Manage',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'None',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'HR / staff / roles',
    moduleId: 'hr_rbac',
    description: 'Staff directory, credential provisioning, PIN access, and role assignment boundaries.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'Manage',
      'Sales Manager': 'None',
      'Branch Manager': 'Limited staff operations',
      'Inventory Controller': 'None',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'Employ riders',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Payroll',
    moduleId: 'payroll',
    description: 'Salary computations, statutory deductions (PAYE, NSSF, SHIF, Housing Levy), and payslips.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Financial reports',
      HR: 'Manage',
      'Sales Manager': 'None',
      'Branch Manager': 'None',
      'Inventory Controller': 'None',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'None',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Audit / security',
    moduleId: 'audit_security',
    description: 'Zero-trust security logs, device fingerprints, auth traces, and tamper-evident audit trails.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Finance audit',
      HR: 'HR audit',
      'Sales Manager': 'Sales scope',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Stock scope',
      'Counter Cashier': 'Own activity',
      'Affiliate Sales Representative': 'Own activity',
      'Delivery Manager': 'Dispatch audit',
      'Delivery Rider': 'Own activity',
    },
  },
  {
    moduleName: 'Restaurant / merchant outlets',
    moduleId: 'outlets_restaurants',
    description: 'Bars, restaurant clubs, and merchant shops with kitchen/pantry and central liquor top-ups.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Financial reports',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Stock scope',
      'Counter Cashier': 'Assigned POS',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'None',
      'Delivery Rider': 'None',
    },
  },
  {
    moduleName: 'Customer orders & delivery dispatch',
    moduleId: 'delivery_management',
    description: 'Inspect online customer order details, assign riders, dispatch deliveries, and confirm fulfillment.',
    permissions: {
      Admin: 'Full',
      Accountant: 'None',
      HR: 'None',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'None',
      'Counter Cashier': 'None',
      'Affiliate Sales Representative': 'None',
      'Delivery Manager': 'Manage',
      'Delivery Rider': 'Assigned deliveries',
    },
  },
  {
    moduleName: 'Internal inbox & department chat',
    moduleId: 'internal_inbox',
    description: 'Inter-department and direct staff messaging with inline commercial invoice transfers and targeted stock transfer requests.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Financial',
      HR: 'Manage',
      'Sales Manager': 'Manage',
      'Branch Manager': 'Branch scope',
      'Inventory Controller': 'Manage',
      'Counter Cashier': 'Limited',
      'Affiliate Sales Representative': 'Limited',
      'Delivery Manager': 'Manage',
      'Delivery Rider': 'Limited',
    },
  },
  {
    moduleName: 'Leave, Off-Days & Emergency Requests',
    moduleId: 'leave_management',
    description: 'Standard company leave system: Annual, Off-Day, Emergency, Sick, Maternity, and Paternity requests with HR approve/decline workflow.',
    permissions: {
      Admin: 'Full',
      Accountant: 'Self-service',
      HR: 'Approve / Decline',
      'Sales Manager': 'Self-service',
      'Branch Manager': 'Self-service',
      'Inventory Controller': 'Self-service',
      'Counter Cashier': 'Self-service',
      'Affiliate Sales Representative': 'Self-service',
      'Delivery Manager': 'Self-service',
      'Delivery Rider': 'Self-service',
    },
  },
];

export const ROLE_DISTINCTIONS: Record<StaffRole, string> = {
  Accountant:
    'Financial access must not automatically permit editing inventory, staff, product costs, or transaction histories. Allows approved accounting actions, reconciliation, financial reporting, and credit-note workflows according to policy.',
  HR:
    'Can manage employee records and approved role assignments, but cannot change financial records or access unrestricted business data.',
  'Branch Manager':
    'Access must be limited to the assigned branch and explicitly assigned business units.',
  'Inventory Controller':
    'Can manage stock, batches, expiry, damages, spoilage, and transfers according to their authorized warehouse or branch scope. Cannot edit sales totals or finalize payroll.',
  'Counter Cashier':
    'Can process permitted checkout transactions, issue receipts, and view their own permitted transaction history. Refunds, voids, and credits require supervisor approval.',
  'Affiliate Sales Representative':
    'Can create and track their own permitted sales and orders. Must not access another representative\'s customer records or the full company customer database.',
  Admin:
    'Has broad administrative access, but sensitive actions should still be audited, with strong authentication and additional confirmation for destructive operations.',
  'Sales Manager':
    'Oversees commercial wholesale and retail sales channels, national pricing, partner retailers, with read-only oversight of bonded inventory.',
  'Delivery Manager':
    'In charge of online orders and delivery dispatch queues, employing and managing dispatch riders, geo-locating and assigning riders to regional branches, and monitoring M-Pesa payments and transaction history.',
  'Delivery Rider':
    'Assigned to branch delivery routes for dispatching online customer orders and handling customer deliveries.',
};

// Strict Role-Based Access Control Matrix
export const ROLE_PERMISSIONS: Record<
  StaffRole,
  {
    allowedModules: ERPModuleId[];
    canCreateRoles: StaffRole[];
    badgeTitle: string;
    authRequirement: 'google' | 'pin' | 'google_or_pin';
    scopeToAssignedBranch: boolean;
  }
> = {
  Admin: {
    allowedModules: [
      'overview',
      'retail_pos',
      'sales_pos',
      'inventory',
      'branches_transfers',
      'geo_pricing',
      'partners',
      'documents_credit',
      'compliance',
      'hr_rbac',
      'audit_security',
      'outlets_restaurants',
      'delivery_management',
      'internal_inbox',
      'leave_management',
    ],
    canCreateRoles: ['HR'], // Admin provisions HR, who then manages other operational roles
    badgeTitle: 'Executive System Administrator (Google Auth)',
    authRequirement: 'google',
    scopeToAssignedBranch: false,
  },
  Accountant: {
    allowedModules: [
      'overview',
      'partners',
      'documents_credit',
      'compliance',
      'audit_security',
      'outlets_restaurants',
      'internal_inbox',
      'leave_management',
    ],
    canCreateRoles: [],
    badgeTitle: 'Chief Financial Accountant (Google / 6-Digit PIN)',
    authRequirement: 'google_or_pin',
    scopeToAssignedBranch: false,
  },
  HR: {
    allowedModules: ['overview', 'hr_rbac', 'audit_security', 'internal_inbox', 'leave_management'],
    canCreateRoles: [
      'Accountant',
      'Sales Manager',
      'Branch Manager',
      'Inventory Controller',
      'Counter Cashier',
      'Affiliate Sales Representative',
      'Delivery Manager',
      'Delivery Rider',
    ],
    badgeTitle: 'Human Resources & Access Controller (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: false,
  },
  'Sales Manager': {
    allowedModules: [
      'overview',
      'retail_pos',
      'sales_pos',
      'inventory',
      'branches_transfers',
      'geo_pricing',
      'partners',
      'documents_credit',
      'compliance',
      'audit_security',
      'outlets_restaurants',
      'delivery_management',
      'internal_inbox',
      'leave_management',
    ],
    canCreateRoles: [],
    badgeTitle: 'National Distribution Sales Manager (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: false,
  },
  'Branch Manager': {
    allowedModules: [
      'overview',
      'retail_pos',
      'sales_pos',
      'inventory',
      'branches_transfers',
      'geo_pricing',
      'partners',
      'documents_credit',
      'compliance',
      'hr_rbac',
      'audit_security',
      'outlets_restaurants',
      'delivery_management',
      'internal_inbox',
      'leave_management',
    ],
    canCreateRoles: ['Counter Cashier', 'Affiliate Sales Representative', 'Delivery Rider'],
    badgeTitle: 'Regional Branch Manager (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: true,
  },
  'Inventory Controller': {
    allowedModules: [
      'overview',
      'inventory',
      'branches_transfers',
      'geo_pricing',
      'partners',
      'documents_credit',
      'compliance',
      'audit_security',
      'outlets_restaurants',
      'internal_inbox',
      'leave_management',
    ],
    canCreateRoles: [],
    badgeTitle: 'Bonded Warehouse & Inventory Controller (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: false,
  },
  'Counter Cashier': {
    allowedModules: ['retail_pos', 'documents_credit', 'audit_security', 'outlets_restaurants', 'internal_inbox', 'leave_management'],
    canCreateRoles: [],
    badgeTitle: 'Retail Checkout Counter Cashier (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: true,
  },
  'Affiliate Sales Representative': {
    allowedModules: ['sales_pos', 'internal_inbox', 'leave_management'],
    canCreateRoles: [],
    badgeTitle: 'Field & Affiliate Sales Representative (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: true,
  },
  'Delivery Manager': {
    allowedModules: ['overview', 'delivery_management', 'audit_security', 'internal_inbox', 'leave_management'],
    canCreateRoles: ['Delivery Rider'],
    badgeTitle: 'Logistics & Delivery Operations Manager (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: false,
  },
  'Delivery Rider': {
    allowedModules: ['delivery_management', 'internal_inbox', 'leave_management'],
    canCreateRoles: [],
    badgeTitle: 'Field Delivery & Dispatch Rider (6-Digit PIN)',
    authRequirement: 'pin',
    scopeToAssignedBranch: true,
  },
};

export function getRoleAccessLevel(role: StaffRole, moduleId: ERPModuleId): AccessLevel {
  const item = TARGET_ACCESS_MATRIX.find((m) => m.moduleId === moduleId);
  if (!item) return 'None';
  return item.permissions[role] || 'None';
}

export interface GranularFeatureDefinition {
  key: string;
  label: string;
  category: 'Core Modules' | 'POS & Sales Operations' | 'Inventory & Stock Governance' | 'Finance, Credit & Invoicing' | 'HR, Access & Administration';
  description: string;
  isModule: boolean;
  moduleId?: ERPModuleId;
}

export const ERP_FEATURE_CATALOG: GranularFeatureDefinition[] = [
  // Module-Level Features
  {
    key: 'overview',
    label: 'Executive Overview Dashboard',
    category: 'Core Modules',
    description: 'High-level business intelligence, gross revenue, branch KPIs, and live ledger summaries.',
    isModule: true,
    moduleId: 'overview',
  },
  {
    key: 'retail_pos',
    label: 'Retail Counter POS Terminal',
    category: 'POS & Sales Operations',
    description: 'Direct barcode scanning, cash/M-Pesa tender, optical search, and real-time counter sales.',
    isModule: true,
    moduleId: 'retail_pos',
  },
  {
    key: 'sales_pos',
    label: 'Wholesale Commercial B2B POS',
    category: 'POS & Sales Operations',
    description: 'Bulk order processing, credit facility transactions, tiered discounts, and distributor billing.',
    isModule: true,
    moduleId: 'sales_pos',
  },
  {
    key: 'inventory',
    label: 'Bonded Warehouse Inventory & Auto-SKU',
    category: 'Inventory & Stock Governance',
    description: 'Master liquor catalog, barcode assignment, physical count reconciliation, and batch tracking.',
    isModule: true,
    moduleId: 'inventory',
  },
  {
    key: 'branches_transfers',
    label: 'Branch Outlets & Inter-Branch Transfers',
    category: 'Core Modules',
    description: 'Distribution hub network, transit manifests, stock dispatch, and transfer receipt confirmations.',
    isModule: true,
    moduleId: 'branches_transfers',
  },
  {
    key: 'geo_pricing',
    label: 'Geo-Regional Pricing & Zone Multipliers',
    category: 'Core Modules',
    description: 'Autonomous location-based pricing tiers, freight levies, and regional markup rules.',
    isModule: true,
    moduleId: 'geo_pricing',
  },
  {
    key: 'partners',
    label: 'Suppliers, Retailers & Logistics Directory',
    category: 'Core Modules',
    description: 'Distributor directory, liquor trade licenses, KRA PIN compliance, and 3PL carriers.',
    isModule: true,
    moduleId: 'partners',
  },
  {
    key: 'documents_credit',
    label: 'Invoices, Thermal Receipts & Credit Notes',
    category: 'Finance, Credit & Invoicing',
    description: 'Official tax documentation, eTIMS QR invoices, thermal payslips, and credit note issuance.',
    isModule: true,
    moduleId: 'documents_credit',
  },
  {
    key: 'compliance',
    label: 'Regulatory & Excise Bonded Stamp Control',
    category: 'Core Modules',
    description: 'KRA excise stamps, import customs declarations, bond licenses, and regulatory audits.',
    isModule: true,
    moduleId: 'compliance',
  },
  {
    key: 'hr_rbac',
    label: 'HR Provisioning & Role-Based Access Control',
    category: 'HR, Access & Administration',
    description: 'Employee onboarding, credential generation, salary compensation, and feature permission stripping.',
    isModule: true,
    moduleId: 'hr_rbac',
  },
  {
    key: 'audit_security',
    label: 'User Security Traces & Audit Logs',
    category: 'HR, Access & Administration',
    description: 'Tamper-evident system logs, biometric device fingerprints, and unauthorized attempt alerts.',
    isModule: true,
    moduleId: 'audit_security',
  },
  {
    key: 'outlets_restaurants',
    label: 'Branch Outlets, Bars & Club Management',
    category: 'Core Modules',
    description: 'Commercial outlet operations, food/beverage menus, bar pantry stock, and central liquor top-ups.',
    isModule: true,
    moduleId: 'outlets_restaurants',
  },
  {
    key: 'delivery_management',
    label: 'Customer Order Details & Delivery Dispatch',
    category: 'POS & Sales Operations',
    description: 'Inspect full customer order details, assign riders, dispatch deliveries, and confirm order fulfillment.',
    isModule: true,
    moduleId: 'delivery_management',
  },
  {
    key: 'internal_inbox',
    label: 'Internal Inbox & Inter-Department Chat',
    category: 'Core Modules',
    description: 'Departmental channels and direct staff messaging with inline invoice transfers and person-targeted stock transfer requests.',
    isModule: true,
    moduleId: 'internal_inbox',
  },
  {
    key: 'leave_management',
    label: 'Company Leave, Off-Day & Emergency Portal',
    category: 'HR, Access & Administration',
    description: 'Submit Annual, Off-Day, Emergency, Sick, Maternity, and Paternity requests and process HR approvals.',
    isModule: true,
    moduleId: 'leave_management',
  },

  // Granular Sub-Features
  {
    key: 'pos_discounts',
    label: 'Manual Discount & Price Override at Checkout',
    category: 'POS & Sales Operations',
    description: 'Ability for cashier or salesperson to adjust unit prices or apply non-standard discounts during POS sales.',
    isModule: false,
    moduleId: 'retail_pos',
  },
  {
    key: 'pos_voids',
    label: 'Void Scanned Items & Cancel Orders',
    category: 'POS & Sales Operations',
    description: 'Authority to void scanned line items or abort an active checkout transaction after scanning.',
    isModule: false,
    moduleId: 'retail_pos',
  },
  {
    key: 'inventory_damage_logging',
    label: 'Quarantine & Spoilage Write-off Authorization',
    category: 'Inventory & Stock Governance',
    description: 'Permission to log broken bottles, transit damage, or spoiled stock and deduct from active asset balance.',
    isModule: false,
    moduleId: 'inventory',
  },
  {
    key: 'issue_credit_notes',
    label: 'Issue Customer Credit Notes & Refunds',
    category: 'Finance, Credit & Invoicing',
    description: 'Authority to issue commercial credit notes that reduce client accounts receivable balances.',
    isModule: false,
    moduleId: 'documents_credit',
  },
  {
    key: 'export_financial_pdf',
    label: 'Export Confidential Executive Financial Reports',
    category: 'Finance, Credit & Invoicing',
    description: 'Ability to export gross profit, COGS, dead-stock capital, and P&L financial data to PDF/CSV.',
    isModule: false,
    moduleId: 'documents_credit',
  },
  {
    key: 'manage_staff_salaries',
    label: 'Manage Staff Compensation & Execute Payroll',
    category: 'HR, Access & Administration',
    description: 'Permission to view, modify base salaries, calculate statutory deductions, and finalize monthly payroll disbursements.',
    isModule: false,
    moduleId: 'hr_rbac',
  },
];

/**
 * Calculates effective ERP modules available to a staff member, taking into account:
 * 1. Role baseline permissions (or Admin custom matrix overrides)
 * 2. User-specific explicitly stripped modules/features (removed by Admin)
 * 3. User-specific explicitly granted modules/features (added by Admin)
 */
export function getEffectiveUserModules(
  staff: StaffMember,
  customRoleMatrix?: Record<StaffRole, ERPModuleId[]>
): ERPModuleId[] {
  // Baseline modules from role (checking custom admin matrix first if provided)
  const baseModules =
    (customRoleMatrix && customRoleMatrix[staff.role]) ||
    ROLE_PERMISSIONS[staff.role]?.allowedModules ||
    [];

  // If user has complete module override, use it as initial
  let effective: ERPModuleId[] =
    staff.allowedModuleOverrides && staff.allowedModuleOverrides.length > 0
      ? [...staff.allowedModuleOverrides]
      : [...baseModules];

  // Strip off features revoked by Admin
  if (staff.strippedFeatures && staff.strippedFeatures.length > 0) {
    effective = effective.filter((mod) => !staff.strippedFeatures!.includes(mod));
  }

  // Grant extra features explicitly enabled by Admin
  if (staff.grantedFeatures && staff.grantedFeatures.length > 0) {
    staff.grantedFeatures.forEach((feat: string) => {
      const isKnownModule = ERP_FEATURE_CATALOG.some(
        (f) => f.isModule && f.key === feat
      );
      if (isKnownModule && !effective.includes(feat as ERPModuleId)) {
        effective.push(feat as ERPModuleId);
      }
    });
  }

  // Ensure internal_inbox is available to all departments/staff unless explicitly stripped
  if (
    !effective.includes('internal_inbox') &&
    !(staff.strippedFeatures && staff.strippedFeatures.includes('internal_inbox'))
  ) {
    effective.push('internal_inbox');
  }

  // Logged-in ERP users must never switch into the standalone customer portal
  effective = effective.filter((mod) => mod !== 'customer_portal');

  return effective;
}

/**
 * Checks whether a specific sub-feature or module is allowed for a user
 */
export function isUserFeaturePermitted(
  staff: StaffMember,
  featureKey: string,
  customRoleMatrix?: Record<StaffRole, ERPModuleId[]>
): boolean {
  // If explicitly stripped from this user, access is strictly denied
  if (staff.strippedFeatures && staff.strippedFeatures.includes(featureKey)) {
    return false;
  }

  // If explicitly granted to this user, access is permitted
  if (staff.grantedFeatures && staff.grantedFeatures.includes(featureKey)) {
    return true;
  }

  // If this is a module-level feature, check module permissions
  const featDef = ERP_FEATURE_CATALOG.find((f) => f.key === featureKey);
  if (featDef?.isModule) {
    const allowedMods = getEffectiveUserModules(staff, customRoleMatrix);
    return allowedMods.includes(featDef.moduleId || (featureKey as ERPModuleId));
  }

  // For sub-features: if parent module is stripped, sub-feature is also blocked
  if (featDef?.moduleId) {
    const allowedMods = getEffectiveUserModules(staff, customRoleMatrix);
    if (!allowedMods.includes(featDef.moduleId)) {
      return false;
    }
  }

  // Default role allowance
  if (staff.role === 'Admin') return true;
  if (staff.role === 'Accountant') {
    return !['pos_discounts', 'pos_voids', 'inventory_damage_logging', 'manage_staff_salaries'].includes(featureKey);
  }
  if (staff.role === 'HR') {
    return ['manage_staff_salaries'].includes(featureKey);
  }
  if (staff.role === 'Branch Manager' || staff.role === 'Sales Manager') {
    return ['pos_discounts', 'pos_voids', 'inventory_damage_logging', 'issue_credit_notes'].includes(featureKey);
  }
  if (staff.role === 'Inventory Controller') {
    return ['inventory_damage_logging'].includes(featureKey);
  }
  return false;
}

// Export any dataset to CSV
export function exportToCSV(filename: string, headers: string[], rows: (string | number)[][]): void {
  const escapeCell = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const csvContent = [
    headers.map(escapeCell).join(','),
    ...rows.map((row) => row.map(escapeCell).join(',')),
  ].join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `${filename}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Export any tabular ERP statement or report to PDF
export function exportReportToPDF(
  title: string,
  subtitle: string,
  headers: string[],
  rows: (string | number)[][],
  filename: string
): void {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });

  // Deep Sovereign Navy Header Banner (#0A006E)
  doc.setFillColor(10, 0, 110);
  doc.rect(0, 0, doc.internal.pageSize.getWidth(), 74, 'F');

  // Electric Gold Accent Rule (#FFDE00)
  doc.setFillColor(255, 222, 0);
  doc.rect(0, 74, doc.internal.pageSize.getWidth(), 4, 'F');

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('VAAIRO SPIRITS & BEVERAGE IMPORTERS ERP', 36, 32);

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(title, 36, 52);

  doc.setFontSize(9);
  doc.setTextColor(255, 222, 0);
  doc.text(`Generated: ${new Date().toLocaleString()} | ${subtitle}`, 36, 66);

  autoTable(doc, {
    startY: 94,
    head: [headers],
    body: rows.map((r) => r.map((c) => String(c ?? ''))),
    theme: 'grid',
    headStyles: {
      fillColor: [10, 0, 110],
      textColor: [255, 222, 0],
      fontSize: 9,
      fontStyle: 'bold',
    },
    bodyStyles: {
      fontSize: 8.5,
      textColor: [15, 23, 42],
    },
    alternateRowStyles: {
      fillColor: [240, 242, 240],
    },
    margin: { left: 36, right: 36 },
  });

  doc.save(`${filename}.pdf`);
}

export interface NormalizedDocumentLineItem {
  sku: string;
  name: string;
  unitMode: 'bottle' | 'case';
  bottlesPerCase: number;
  quantityUnits: number;
  totalBottles: number;
  unitPrice: number;
  lineTotal: number;
}

export function normalizeDocumentLineItems(itemsSummary: string): NormalizedDocumentLineItem[] {
  let rawItems: Record<string, unknown>[] = [];
  try {
    const parsed = JSON.parse(itemsSummary);
    if (Array.isArray(parsed)) rawItems = parsed;
  } catch {
    rawItems = [];
  }

  return rawItems.map((raw) => {
    const sku = String(raw.sku || raw.productSku || '—');
    const name = String(raw.name || raw.productName || raw.description || 'Line Item');
    const unitMode: 'bottle' | 'case' = raw.unitMode === 'case' ? 'case' : 'bottle';
    const bottlesPerCase = Number(raw.bottlesPerCase || raw.packSize || 0);
    const quantityUnits = Number(raw.quantityUnits ?? raw.quantity ?? raw.qty ?? 0);
    const computedBottles =
      unitMode === 'case' && bottlesPerCase > 0 ? quantityUnits * bottlesPerCase : quantityUnits;
    const totalBottles = Number(raw.totalBottles ?? raw.bottles ?? computedBottles);
    const unitPrice = Number(raw.unitPrice ?? raw.price ?? 0);
    const lineTotal = Number(raw.lineTotal ?? raw.total ?? quantityUnits * unitPrice);

    return {
      sku,
      name,
      unitMode,
      bottlesPerCase,
      quantityUnits,
      totalBottles,
      unitPrice,
      lineTotal,
    };
  });
}

function createVaairoWatermarkDataUrl(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 460;
    canvas.height = 190;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((12 * Math.PI) / 180);
    ctx.globalAlpha = 0.11;

    // Rounded outer border matching preview watermark stamp
    const w = 360;
    const h = 112;
    const x = -w / 2;
    const y = -h / 2;
    const r = 22;

    ctx.strokeStyle = '#0A006E';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
    ctx.stroke();

    // Ribbon Award Emblem on left
    ctx.strokeStyle = '#0A006E';
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x + 62, y + 46, 22, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 48, y + 64);
    ctx.lineTo(x + 44, y + 92);
    ctx.lineTo(x + 62, y + 81);
    ctx.lineTo(x + 80, y + 92);
    ctx.lineTo(x + 76, y + 64);
    ctx.stroke();

    // Right-aligned stamp text
    ctx.fillStyle = '#0A006E';
    ctx.font = '900 24px Helvetica, Arial, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText('VAAIRO BONDED', x + w - 26, y + 50);
    ctx.fillStyle = '#334155';
    ctx.font = '700 18px Helvetica, Arial, sans-serif';
    ctx.fillText('VERIFIED & AUDITED', x + w - 26, y + 78);

    ctx.restore();
    return canvas.toDataURL('image/png');
  } catch {
    return null;
  }
}

function drawShieldBadge(doc: jsPDF, cx: number, cy: number, size: number, rgb: [number, number, number]): void {
  doc.setDrawColor(rgb[0], rgb[1], rgb[2]);
  doc.setLineWidth(0.9);
  const halfW = size * 0.44;
  const topY = cy - size * 0.5;
  const midY = cy + size * 0.05;
  const botY = cy + size * 0.5;
  doc.lines(
    [
      [halfW, size * 0.16],
      [0, midY - (topY + size * 0.16)],
      [-halfW, botY - midY],
      [-halfW, midY - botY],
      [0, topY + size * 0.16 - midY],
    ],
    cx,
    topY,
    [1, 1],
    'S',
    true
  );
  // Check tick inside shield
  doc.lines(
    [
      [size * 0.14, size * 0.14],
      [size * 0.24, -size * 0.28],
    ],
    cx - size * 0.18,
    cy - size * 0.02,
    [1, 1],
    'S'
  );
}

// Export specific Commercial Document (Receipt, Invoice, Quote, Packing List, Delivery Note, Credit Note) to PDF
// Matching the exact white-letterhead DocumentPrintModal preview layout 1:1
export function exportCommercialDocumentPDF(tx: TransactionDoc): void {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginX = 34;
  const contentWidth = pageWidth - marginX * 2;

  const isLogisticsOnly = tx.docType === 'Packing List' || tx.docType === 'Delivery Note';
  const items = normalizeDocumentLineItems(tx.itemsSummary);

  // Subtle Watermark Stamp placed cleanly behind header/top-right
  const watermarkPng = createVaairoWatermarkDataUrl();
  if (watermarkPng) {
    doc.addImage(watermarkPng, 'PNG', pageWidth - marginX - 220, 74, 198, 82);
  }

  // ---- 1. LETTERHEAD (Matches DocumentPrintModal white letterhead) ----
  let leftY = 44;
  const leftMaxWidth = 310;

  // Emerald status dot + VAAIRO BEVERAGES & MERCHANTS LTD
  doc.setFillColor(52, 209, 134); // #34D186
  doc.circle(marginX + 3.5, leftY - 3, 3.2, 'F');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(10, 0, 110); // #0A006E
  const merchantLabel = 'VAAIRO BEVERAGES & MERCHANTS LTD';
  doc.text(merchantLabel, marginX + 12, leftY);

  let badgeX = marginX + 12 + doc.getTextWidth(merchantLabel) + 6;
  if (tx.supplierFacilityType) {
    const fText = tx.supplierFacilityType.replace('_', ' ').toUpperCase();
    doc.setFontSize(6.5);
    const bw = doc.getTextWidth(fText) + 10;
    doc.setFillColor(219, 234, 254); // blue-100
    doc.roundedRect(badgeX, leftY - 8.5, bw, 11, 2.5, 2.5, 'F');
    doc.setTextColor(30, 58, 138); // blue-900
    doc.text(fText, badgeX + 5, leftY - 1);
    badgeX += bw + 4;
  }
  if (tx.orderCategory === 'WAREHOUSE_PURCHASE') {
    const wpText = 'WAREHOUSE -> BRANCH PURCHASE';
    doc.setFontSize(6.5);
    const bw = doc.getTextWidth(wpText) + 10;
    if (badgeX + bw < marginX + leftMaxWidth) {
      doc.setFillColor(255, 222, 0); // #FFDE00
      doc.roundedRect(badgeX, leftY - 8.5, bw, 11, 2.5, 2.5, 'F');
      doc.setTextColor(10, 0, 110);
      doc.text(wpText, badgeX + 5, leftY - 1);
    }
  }

  // Document Type Title (Bold Italic #0A006E)
  leftY += 23;
  doc.setFont('helvetica', 'bolditalic');
  doc.setFontSize(22);
  doc.setTextColor(10, 0, 110);
  doc.text(tx.docType.toUpperCase(), marginX, leftY);

  // Issuing Facility Line
  leftY += 15;
  doc.setFontSize(8.5);
  const facilityLine = `Issuing Facility: ${tx.branchName} (${tx.regionName})`;
  const facilityLines = doc.splitTextToSize(facilityLine, leftMaxWidth) as string[];
  facilityLines.forEach((line, idx) => {
    if (idx === 0 && line.startsWith('Issuing Facility: ')) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('Issuing Facility: ', marginX, leftY);
      const prefixW = doc.getTextWidth('Issuing Facility: ');
      const rest = line.slice('Issuing Facility: '.length);
      const branchPart = tx.branchName;
      if (rest.startsWith(branchPart)) {
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(branchPart, marginX + prefixW, leftY);
        const branchW = doc.getTextWidth(branchPart);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(71, 85, 105);
        doc.text(rest.slice(branchPart.length), marginX + prefixW + branchW, leftY);
      } else {
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(15, 23, 42);
        doc.text(rest, marginX + prefixW, leftY);
      }
    } else {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(line, marginX, leftY);
    }
    leftY += 11;
  });

  // Channel & Issued By Line
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(100, 116, 139);
  const channelText = `Channel: ${tx.channel} · Issued By: ${tx.createdBy} (${tx.createdByRole})`;
  const channelLines = doc.splitTextToSize(channelText, leftMaxWidth) as string[];
  channelLines.forEach((line) => {
    doc.text(line, marginX, leftY);
    leftY += 10.5;
  });

  // Right Metadata Box (#F8FAFC card with #E2E8F0 border)
  const metaBoxW = 196;
  const metaBoxX = pageWidth - marginX - metaBoxW;
  const metaBoxY = 34;
  const issuedStr = `Issued: ${new Date(tx.createdAt).toLocaleString()}`;
  const statusStr = `Status: ${tx.status} · ${tx.paymentMethod}`;
  const statusLines = doc.splitTextToSize(statusStr, metaBoxW - 34) as string[];
  const metaBoxH =
    18 + // top pad + docNumber
    14 + // issued
    (tx.validUntil ? 12 : 0) +
    statusLines.length * 10.5 +
    12; // bottom pad

  doc.setFillColor(248, 250, 252); // bg-slate-50
  doc.setDrawColor(226, 232, 240); // border-slate-200
  doc.setLineWidth(0.9);
  doc.roundedRect(metaBoxX, metaBoxY, metaBoxW, metaBoxH, 7, 7, 'FD');

  const metaRightX = metaBoxX + metaBoxW - 11;
  let metaCursorY = metaBoxY + 18;
  doc.setFont('courier', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(10, 0, 110);
  doc.text(tx.docNumber, metaRightX, metaCursorY, { align: 'right' });

  metaCursorY += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(issuedStr, metaRightX, metaCursorY, { align: 'right' });

  if (tx.validUntil) {
    metaCursorY += 11.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    doc.text(`Valid Until: ${tx.validUntil}`, metaRightX, metaCursorY, { align: 'right' });
  }

  metaCursorY += 12.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(4, 120, 87); // emerald-700
  const firstStatusWidth = doc.getTextWidth(statusLines[0] || '');
  drawShieldBadge(doc, metaRightX - firstStatusWidth - 8, metaCursorY - 2.5, 7.5, [4, 120, 87]);
  statusLines.forEach((line) => {
    doc.text(line, metaRightX, metaCursorY, { align: 'right' });
    metaCursorY += 10.5;
  });

  // Letterhead bottom divider border
  const headerBottomY = Math.max(leftY + 6, metaBoxY + metaBoxH + 14);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(1.4);
  doc.line(marginX, headerBottomY, pageWidth - marginX, headerBottomY);

  // ---- 2. CONSIGNEE & REGULATORY INFO CARD (#F8FAFC rounded card) ----
  const infoBoxY = headerBottomY + 14;
  const colPad = 14;
  const colGap = 18;
  const colW = (contentWidth - colPad * 2 - colGap) / 2;
  const leftColX = marginX + colPad;
  const rightColX = leftColX + colW + colGap;

  // Measure left column content height
  const customerHeading = tx.buyerBranchName ? 'PURCHASING / RECEIVING BRANCH' : 'CONSIGNEE / CUSTOMER DETAILS';
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  const custNameLines = doc.splitTextToSize(tx.customerName || 'Walk-In Customer', colW) as string[];
  const kraValue = tx.customerKraPin || tx.customerLicenseNo || 'Commercial Verified 21+';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const kraLines = doc.splitTextToSize(`License / KRA PIN: ${kraValue}`, colW) as string[];

  const extraLeftLines: string[] = [];
  if (tx.customerPhone) extraLeftLines.push(...(doc.splitTextToSize(`Tel: ${tx.customerPhone}`, colW) as string[]));
  if (tx.customerEmail) extraLeftLines.push(...(doc.splitTextToSize(`Email: ${tx.customerEmail}`, colW) as string[]));
  if (tx.deliveryAddress) extraLeftLines.push(...(doc.splitTextToSize(`Delivery Address: ${tx.deliveryAddress}`, colW) as string[]));

  const leftColHeight =
    12 +
    custNameLines.length * 12 +
    4 +
    kraLines.length * 10.5 +
    (extraLeftLines.length > 0 ? 4 + extraLeftLines.length * 10 : 0);

  // Measure right column content height
  const regCopy =
    'All IPS/LPS spirits & alcoholic beverages carry verified KRA Digital Excise & Import Duty Stamps. Bonded under Kenya Revenue Authority rules.';
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  const regLines = doc.splitTextToSize(regCopy, colW) as string[];
  const linkedLines = tx.linkedTransferNo
    ? (doc.splitTextToSize(`Linked Purchase / Transfer Batch: ${tx.linkedTransferNo}`, colW) as string[])
    : [];
  const refLines = tx.relatedInvoiceNo
    ? (doc.splitTextToSize(
        `Ref Document: ${tx.relatedInvoiceNo}${tx.creditReason ? ` · Reason: ${tx.creditReason}` : ''}`,
        colW
      ) as string[])
    : [];
  const noteLines = tx.notes ? (doc.splitTextToSize(`Notes: ${tx.notes}`, colW) as string[]) : [];

  const rightColHeight =
    12 +
    regLines.length * 11 +
    (linkedLines.length ? 4 + linkedLines.length * 10.5 : 0) +
    (refLines.length ? 4 + refLines.length * 10.5 : 0) +
    (noteLines.length ? 4 + noteLines.length * 10.5 : 0);

  const infoBoxH = Math.max(leftColHeight, rightColHeight) + 24;

  doc.setFillColor(248, 250, 252); // #F8FAFC
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.9);
  doc.roundedRect(marginX, infoBoxY, contentWidth, infoBoxH, 7, 7, 'FD');

  // Draw left column text
  let ly = infoBoxY + 17;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(10, 0, 110);
  doc.text(customerHeading, leftColX, ly);

  ly += 13;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  custNameLines.forEach((l) => {
    doc.text(l, leftColX, ly);
    ly += 12;
  });

  ly += 2;
  doc.setFontSize(8);
  kraLines.forEach((l, idx) => {
    if (idx === 0 && l.startsWith('License / KRA PIN: ')) {
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text('License / KRA PIN: ', leftColX, ly);
      const pw = doc.getTextWidth('License / KRA PIN: ');
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(l.slice('License / KRA PIN: '.length), leftColX + pw, ly);
    } else {
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(15, 23, 42);
      doc.text(l, leftColX, ly);
    }
    ly += 10.5;
  });

  if (extraLeftLines.length > 0) {
    ly += 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    extraLeftLines.forEach((l) => {
      doc.text(l, leftColX, ly);
      ly += 10;
    });
  }

  // Draw right column text
  let ry = infoBoxY + 17;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(30, 158, 96); // #1E9E60
  doc.text('REGULATORY, EXCISE & TRACEABILITY METADATA', rightColX, ry);

  ry += 13;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  regLines.forEach((l) => {
    doc.text(l, rightColX, ry);
    ry += 11;
  });

  if (linkedLines.length > 0) {
    ry += 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 0, 110);
    linkedLines.forEach((l) => {
      doc.text(l, rightColX, ry);
      ry += 10.5;
    });
  }
  if (refLines.length > 0) {
    ry += 2;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(146, 64, 14);
    refLines.forEach((l) => {
      doc.text(l, rightColX, ry);
      ry += 10.5;
    });
  }
  if (noteLines.length > 0) {
    ry += 2;
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(71, 85, 105);
    noteLines.forEach((l) => {
      doc.text(l, rightColX, ry);
      ry += 10.5;
    });
  }

  // ---- 3. LINE ITEMS TABLE (Matches #0A006E Header + #FFDE00 Gold Text) ----
  const tableStartY = infoBoxY + infoBoxH + 16;

  const tableHeaders = isLogisticsOnly
    ? ['SKU', 'Product Description', 'Pack Mode', 'Qty', 'Total Btls', 'Excise Stamp Verification']
    : ['SKU', 'Product Description', 'Pack Mode', 'Qty', 'Total Btls', 'Unit Price (KES)', 'Line Total (KES)'];

  const tableRows = items.map((item) => {
    const packLabel =
      item.bottlesPerCase > 0 ? `${item.unitMode} (${item.bottlesPerCase}/cs)` : item.unitMode;
    return isLogisticsOnly
      ? [
          item.sku,
          item.name,
          packLabel,
          String(item.quantityUnits),
          String(item.totalBottles),
          'VERIFIED SEALED',
        ]
      : [
          item.sku,
          item.name,
          packLabel,
          String(item.quantityUnits),
          String(item.totalBottles),
          formatKes(item.unitPrice),
          formatKes(item.lineTotal),
        ];
  });

  autoTable(doc, {
    startY: tableStartY,
    head: [tableHeaders],
    body: tableRows,
    theme: 'plain',
    styles: {
      fontSize: 8.3,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
      textColor: [15, 23, 42],
      lineColor: [226, 232, 240],
      lineWidth: 0.5,
      valign: 'middle',
    },
    headStyles: {
      fillColor: [10, 0, 110], // #0A006E
      textColor: [255, 222, 0], // #FFDE00
      fontSize: 8.3,
      fontStyle: 'bold',
      cellPadding: { top: 9, right: 8, bottom: 9, left: 8 },
    },
    bodyStyles: {
      fillColor: [255, 255, 255],
    },
    columnStyles: isLogisticsOnly
      ? {
          0: { fontStyle: 'bold', textColor: [10, 0, 110], cellWidth: 68 },
          1: { fontStyle: 'bold', textColor: [15, 23, 42] },
          2: { textColor: [71, 85, 105], cellWidth: 74 },
          3: { halign: 'right', fontStyle: 'bold', cellWidth: 42 },
          4: { halign: 'right', fontStyle: 'bold', textColor: [30, 158, 96], cellWidth: 56 },
          5: { halign: 'right', fontStyle: 'bold', textColor: [30, 158, 96], cellWidth: 120 },
        }
      : {
          0: { fontStyle: 'bold', textColor: [10, 0, 110], cellWidth: 62 },
          1: { fontStyle: 'bold', textColor: [15, 23, 42] },
          2: { textColor: [71, 85, 105], cellWidth: 66 },
          3: { halign: 'right', fontStyle: 'bold', cellWidth: 36 },
          4: { halign: 'right', fontStyle: 'bold', textColor: [30, 158, 96], cellWidth: 52 },
          5: { halign: 'right', textColor: [51, 65, 85], cellWidth: 78 },
          6: { halign: 'right', fontStyle: 'bold', textColor: [10, 0, 110], cellWidth: 82 },
        },
    didParseCell: (data) => {
      if (data.section === 'head' && data.column.index >= 3) {
        data.cell.styles.halign = 'right';
      }
    },
    didDrawCell: (data) => {
      // Draw crisp green checkmark next to "VERIFIED SEALED"
      if (isLogisticsOnly && data.section === 'body' && data.column.index === 5) {
        const text = String(data.cell.raw || '');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.3);
        const textW = doc.getTextWidth(text);
        const tickX = data.cell.x + data.cell.width - 8 - textW - 10;
        const tickY = data.cell.y + data.cell.height / 2;
        doc.setDrawColor(30, 158, 96);
        doc.setLineWidth(1.2);
        doc.lines(
          [
            [2.4, 2.4],
            [4.5, -5.2],
          ],
          tickX,
          tickY,
          [1, 1],
          'S'
        );
      }
    },
    margin: { left: marginX, right: marginX },
  });

  let finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || tableStartY + 80;

  // Ensure footer section fits cleanly on current page
  if (finalY + 115 > pageHeight - 36) {
    doc.addPage();
    finalY = 40;
  }

  // ---- 4. BOTTOM SIGN-OFF OR FINANCIAL TOTALS CARD ----
  if (isLogisticsOnly) {
    const signTopY = finalY + 18;
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(1);
    doc.line(marginX, signTopY, pageWidth - marginX, signTopY);

    const signCol1X = marginX;
    const signCol2X = marginX + contentWidth / 2 + 12;
    const labelY = signTopY + 20;
    const lineY = labelY + 26;
    const subY = lineY + 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.8);
    doc.setTextColor(15, 23, 42);
    doc.text(`${tx.branchName} Dispatch Officer`, signCol1X, labelY);
    doc.text('Logistics Driver / Consignee Receiver', signCol2X, labelY);

    doc.setDrawColor(148, 163, 184);
    doc.setLineWidth(1.4);
    doc.line(signCol1X, lineY, signCol1X + 180, lineY);
    doc.line(signCol2X, lineY, signCol2X + 180, lineY);

    doc.setFont('courier', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text('Signature & Excise Seal Check', signCol1X, subY);
    doc.text('Received in Good Bonded Condition', signCol2X, subY);
  } else {
    const footerY = finalY + 18;

    // Left Compliance Box (bg-slate-50 rounded card)
    const noticeW = 266;
    const noticeText = `Prices reflect regional geo-location tariff rules (${tx.regionName}). Sale of alcohol to persons under 21 is strictly prohibited by Kenyan law.`;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const noticeLines = doc.splitTextToSize(noticeText, noticeW - 36) as string[];
    const noticeH = Math.max(54, 20 + noticeLines.length * 10.5);

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.9);
    doc.roundedRect(marginX, footerY + 14, noticeW, noticeH, 7, 7, 'FD');

    drawShieldBadge(doc, marginX + 16, footerY + 28, 9, [10, 0, 110]);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    let ny = footerY + 28;
    noticeLines.forEach((l) => {
      doc.text(l, marginX + 26, ny);
      ny += 10.5;
    });

    // Right Emerald Totals Card (#F0FDF4 bg, #34D186 1.5pt border)
    const totalsW = 216;
    const totalsX = pageWidth - marginX - totalsW;
    const totalsH = 82;

    doc.setFillColor(240, 253, 244); // #F0FDF4
    doc.setDrawColor(52, 209, 134); // #34D186
    doc.setLineWidth(1.5);
    doc.roundedRect(totalsX, footerY, totalsW, totalsH, 7, 7, 'FD');

    const padInner = 14;
    doc.setFont('courier', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(51, 65, 85);
    doc.text('Subtotal:', totalsX + padInner, footerY + 20);
    doc.text(formatKes(tx.subtotal), totalsX + totalsW - padInner, footerY + 20, { align: 'right' });

    doc.text('Excise & Regional VAT:', totalsX + padInner, footerY + 35);
    doc.text(formatKes(tx.exciseAndTax), totalsX + totalsW - padInner, footerY + 35, { align: 'right' });

    doc.setDrawColor(134, 239, 172); // emerald-300
    doc.setLineWidth(0.9);
    doc.line(totalsX + padInner, footerY + 45, totalsX + totalsW - padInner, footerY + 45);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(10, 0, 110);
    doc.text(tx.docType === 'Credit Note' ? 'Total Credit:' : 'Grand Total:', totalsX + padInner, footerY + 64);
    doc.text(formatKes(tx.totalAmount), totalsX + totalsW - padInner, footerY + 64, { align: 'right' });
  }

  doc.save(`${tx.docType.replace(/\s+/g, '_')}_${tx.docNumber}.pdf`);
}

export const INITIAL_EXTERNAL_CUSTOMERS: ExternalCustomer[] = [
  {
    id: 'cust-ext-001',
    customerNumber: 'CUST-0001',
    name: 'Kevin Otieno (Operations)',
    companyName: 'Club Casablanca Westlands',
    customerType: 'Bar / Restaurant / Club',
    phone: '0722100201',
    email: 'orders@casablancanairobi.com',
    kraPin: 'P051882910Z',
    deliveryAddress: 'Mpaka Road, Westlands, Nairobi',
    preferredBranchId: 'br-hq-cbd-01',
    preferredBranchName: 'HQ - Main Branch',
    paymentTerms: 'Net 14 Days',
    creditLimitKes: 350000,
    notes: 'Premium whisky and tequila weekly stock orders. Authorized receiver: John (Bar Manager).',
    totalOrdersCount: 8,
    totalSpentKes: 684000,
    status: 'Active',
    createdAt: '2026-02-01T00:00:00.000Z',
  },
  {
    id: 'cust-ext-002',
    customerNumber: 'CUST-0002',
    name: 'Wanjiku Kamau',
    companyName: 'Kileleshwa Liquor Emporium',
    customerType: 'Wholesale / B2B',
    phone: '0733882299',
    email: 'info@kileleshwaliquors.co.ke',
    kraPin: 'P052994411M',
    deliveryAddress: 'Kandara Road, Kileleshwa, Nairobi',
    preferredBranchId: 'br-hq-cbd-01',
    preferredBranchName: 'HQ - Main Branch',
    paymentTerms: 'Cash / M-Pesa on Delivery',
    creditLimitKes: 100000,
    notes: 'High-volume imported vodka and gin buyer. Orders by the master case.',
    totalOrdersCount: 14,
    totalSpentKes: 1240000,
    status: 'Active',
    createdAt: '2026-02-10T00:00:00.000Z',
  },
  {
    id: 'cust-ext-003',
    customerNumber: 'CUST-0003',
    name: 'Chef Dominic Mutua',
    companyName: 'The Wine Bar & Grill Lavington',
    customerType: 'Hotel / Hospitality',
    phone: '0711993344',
    email: 'purchasing@lavgrill.ke',
    kraPin: 'P051122334X',
    deliveryAddress: 'James Gichuru Road, Lavington',
    preferredBranchId: 'br-hq-cbd-01',
    preferredBranchName: 'HQ - Main Branch',
    paymentTerms: 'Net 30 Days',
    creditLimitKes: 500000,
    notes: 'Supplies fine wines, single malts, and brandies. Requires formal ETIMS invoices for VAT accounting.',
    totalOrdersCount: 6,
    totalSpentKes: 520000,
    status: 'Active',
    createdAt: '2026-02-15T00:00:00.000Z',
  },
  {
    id: 'cust-ext-004',
    customerNumber: 'CUST-0004',
    name: 'Brian Omondi',
    companyName: 'Private Event Solutions Kenya',
    customerType: 'Event Organizer',
    phone: '0799445566',
    email: 'brian@omondievents.com',
    kraPin: 'P057788990K',
    deliveryAddress: 'Ngong Road, Karen Junction Gate 4',
    preferredBranchId: 'br-hq-cbd-01',
    preferredBranchName: 'HQ - Main Branch',
    paymentTerms: 'Custom Credit Terms',
    creditLimitKes: 0,
    notes: 'Bulk corporate gala & wedding supply. Pays upfront via M-Pesa.',
    totalOrdersCount: 3,
    totalSpentKes: 310000,
    status: 'Active',
    createdAt: '2026-03-01T00:00:00.000Z',
  },
];

