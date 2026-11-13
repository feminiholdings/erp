import { useState, useEffect, useCallback } from 'react';
import { StaffMember, StaffRole } from '../types';

export type DashboardDensity = 'minimal' | 'expanded';

export interface DashboardToggleItem {
  id: string;
  label: string;
  description?: string;
  defaultVisible: boolean;
}

export interface RoleDashboardSchema {
  title: string;
  subtitle: string;
  kpis: DashboardToggleItem[];
  widgets: DashboardToggleItem[];
}

export interface UserDashboardPrefs {
  mode: DashboardDensity;
  hiddenKpis: string[];
  hiddenWidgets: string[];
}

export const ROLE_DASHBOARD_SCHEMAS: Record<StaffRole, RoleDashboardSchema> = {
  Admin: {
    title: 'Executive Command',
    subtitle: 'Customizable overview · tap any tile to focus',
    kpis: [
      { id: 'turnover', label: 'Gross Turnover', defaultVisible: true },
      { id: 'catalog', label: 'Liquor Catalog', defaultVisible: true },
      { id: 'branches', label: 'Branches & Zones', defaultVisible: true },
      { id: 'staff_transfers', label: 'Staff & Transfers', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'KPI Summary Row', defaultVisible: true },
      { id: 'charts_analytics', label: 'Executive Bar & Pie Charts', defaultVisible: true },
      { id: 'reports_grid', label: 'Performance & Reports Tiles', defaultVisible: true },
      { id: 'ops_grid', label: 'Operations & Departments', defaultVisible: true },
      { id: 'alerts_strip', label: 'Pending Approvals & Deliveries Alert', defaultVisible: true },
      { id: 'branch_table', label: 'Regional Branch Performance Table', defaultVisible: true },
    ],
  },
  Accountant: {
    title: 'Financial Accounting',
    subtitle: 'Live P&L, expenses, inventory valuation & KRA compliance',
    kpis: [
      { id: 'gross_sales', label: 'Gross Sales', defaultVisible: true },
      { id: 'expenses', label: 'Recorded Expenses', defaultVisible: true },
      { id: 'stock_asset', label: 'Stock Valuation', defaultVisible: true },
      { id: 'gross_profit', label: 'Gross Profit & Margin', defaultVisible: true },
      { id: 'writeoffs', label: 'Write-Offs & Dead Stock', defaultVisible: false },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Top KPI Strip', defaultVisible: true },
      { id: 'asset_cards', label: '4 Summary Balance Cards', defaultVisible: true },
      { id: 'charts', label: 'P&L & Outflow Charts', defaultVisible: true },
      { id: 'income_statement', label: 'Income Statement & Liquidity Split', defaultVisible: true },
    ],
  },
  HR: {
    title: 'HR & People Hub',
    subtitle: 'Leave approvals, staff directory, payroll & KRA statutory compliance',
    kpis: [
      { id: 'headcount', label: 'Workforce Headcount', defaultVisible: true },
      { id: 'compliance', label: 'KRA / NSSF Coverage', defaultVisible: true },
      { id: 'payroll', label: 'Latest Payroll Cycle', defaultVisible: true },
      { id: 'branches', label: 'Branch Deployment', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'HR KPI Strip', defaultVisible: true },
      { id: 'leave_alerts', label: 'Leave & Emergency Approvals Banner', defaultVisible: true },
      { id: 'focus_tiles', label: 'Quick Workspace Tiles', defaultVisible: true },
      { id: 'role_distribution', label: 'Staff Role Distribution', defaultVisible: true },
      { id: 'branch_deployment', label: 'Branch Deployment List', defaultVisible: true },
    ],
  },
  'Sales Manager': {
    title: 'Commercial Sales',
    subtitle: 'Wholesale B2B, retail counters, partner channels & pricing',
    kpis: [
      { id: 'total_sales', label: 'Total Commercial Sales', defaultVisible: true },
      { id: 'wholesale', label: 'Wholesale B2B Volume', defaultVisible: true },
      { id: 'retail', label: 'Retail Counter Volume', defaultVisible: true },
      { id: 'partners', label: 'Commercial Partners', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Sales KPI Strip', defaultVisible: true },
      { id: 'quick_actions', label: 'Sales Action Tiles', defaultVisible: true },
      { id: 'sales_tracker', label: 'Sales Period Tracker', defaultVisible: true },
    ],
  },
  'Branch Manager': {
    title: 'Branch Operations',
    subtitle: 'Regional depot sales, stock transfers, deliveries & staff',
    kpis: [
      { id: 'branch_sales', label: 'Branch Turnover', defaultVisible: true },
      { id: 'branch_stock', label: 'Catalog & Stock', defaultVisible: true },
      { id: 'pending_transfers', label: 'Pending Transfers', defaultVisible: true },
      { id: 'active_deliveries', label: 'Active Deliveries', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Branch KPI Strip', defaultVisible: true },
      { id: 'action_queues', label: 'Pending Transfers & Delivery Queues', defaultVisible: true },
      { id: 'quick_tiles', label: 'Branch Focus Tiles', defaultVisible: true },
      { id: 'compensation', label: 'Payslip & Leave Bar', defaultVisible: true },
    ],
  },
  'Inventory Controller': {
    title: 'Bonded Inventory',
    subtitle: 'Stock valuation, barcode verification & inter-branch transfers',
    kpis: [
      { id: 'valuation', label: 'Bonded Stock Value', defaultVisible: true },
      { id: 'ips_lps', label: 'IPS vs LPS SKUs', defaultVisible: true },
      { id: 'transfers', label: 'Inter-Branch Logistics', defaultVisible: true },
      { id: 'damages', label: 'Damages & Spoilage', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Inventory KPI Strip', defaultVisible: true },
      { id: 'quick_tiles', label: 'Warehouse Action Tiles', defaultVisible: true },
      { id: 'branch_table', label: 'Branch Depot Distribution', defaultVisible: true },
    ],
  },
  'Counter Cashier': {
    title: 'Retail Counter POS',
    subtitle: 'Fast barcode checkout, mobile pairing & instant receipts',
    kpis: [
      { id: 'branch_zone', label: 'Branch & Geo-Zone', defaultVisible: true },
    ],
    widgets: [
      { id: 'scanner_station', label: 'Barcode Scanner Bar', defaultVisible: true },
      { id: 'category_filters', label: 'Category Filter Ribbon', defaultVisible: true },
      { id: 'quick_tips', label: 'Extended Terminal Details', defaultVisible: false },
    ],
  },
  'Affiliate Sales Representative': {
    title: 'Field Sales POS',
    subtitle: 'Client orders, quotes & live commission tracker',
    kpis: [
      { id: 'commission', label: 'Show Earned Commission (Privacy)', defaultVisible: false },
      { id: 'sales_volume', label: 'Show Fulfilled Volume', defaultVisible: true },
      { id: 'queued_orders', label: 'Show Queued Count', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Inline Metrics Bar', defaultVisible: true },
      { id: 'barcode_ribbon', label: 'Barcode Quick Scan Bar', defaultVisible: true },
      { id: 'recent_orders', label: 'Recent Orders Summary', defaultVisible: true },
    ],
  },
  'Delivery Manager': {
    title: 'Delivery & Dispatch',
    subtitle: 'Customer orders, rider assignments & M-Pesa fulfillment',
    kpis: [
      { id: 'pending_dispatch', label: 'Pending Dispatch', defaultVisible: true },
      { id: 'in_transit', label: 'Out for Delivery', defaultVisible: true },
      { id: 'delivered', label: 'Delivered Orders', defaultVisible: true },
      { id: 'riders', label: 'Active Riders', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Dispatch KPI Strip', defaultVisible: true },
      { id: 'filters_bar', label: 'Search & Filter Toolbar', defaultVisible: true },
      { id: 'compact_cards', label: 'Compact Order Cards', defaultVisible: true },
    ],
  },
  'Delivery Rider': {
    title: 'My Delivery Route',
    subtitle: 'Assigned drops, customer contacts & instant delivery confirmation',
    kpis: [
      { id: 'my_pending', label: 'Ready for Pickup', defaultVisible: true },
      { id: 'my_active', label: 'In Transit', defaultVisible: true },
      { id: 'my_completed', label: 'Completed Drops', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Route KPI Strip', defaultVisible: true },
      { id: 'only_my_orders', label: 'Filter to My Assigned Orders First', defaultVisible: true },
      { id: 'filters_bar', label: 'Search Bar', defaultVisible: true },
    ],
  },
};

function buildDefaultPrefs(role: StaffRole): UserDashboardPrefs {
  const schema = ROLE_DASHBOARD_SCHEMAS[role] || ROLE_DASHBOARD_SCHEMAS.Admin;
  return {
    mode: 'minimal',
    hiddenKpis: schema.kpis.filter((k) => !k.defaultVisible).map((k) => k.id),
    hiddenWidgets: schema.widgets.filter((w) => !w.defaultVisible).map((w) => w.id),
  };
}

export function getDashboardPrefsStorageKey(user: Pick<StaffMember, 'id' | 'email' | 'role'>): string {
  const identity = (user.id || user.email || user.role || 'user').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vaairo_dash_prefs_v2_${user.role}_${identity}`;
}

export function useDashboardPrefs(currentUser: Pick<StaffMember, 'id' | 'email' | 'role'>) {
  const role = currentUser.role;
  const schema = ROLE_DASHBOARD_SCHEMAS[role] || ROLE_DASHBOARD_SCHEMAS.Admin;
  const storageKey = getDashboardPrefsStorageKey(currentUser);

  const [prefs, setPrefs] = useState<UserDashboardPrefs>(() => {
    if (typeof window === 'undefined') return buildDefaultPrefs(role);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          mode: parsed.mode === 'expanded' ? 'expanded' : 'minimal',
          hiddenKpis: Array.isArray(parsed.hiddenKpis) ? parsed.hiddenKpis : [],
          hiddenWidgets: Array.isArray(parsed.hiddenWidgets) ? parsed.hiddenWidgets : [],
        };
      }
    } catch {
      // Fallback to default
    }
    return buildDefaultPrefs(role);
  });

  // Reload if currentUser / role changes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs({
          mode: parsed.mode === 'expanded' ? 'expanded' : 'minimal',
          hiddenKpis: Array.isArray(parsed.hiddenKpis) ? parsed.hiddenKpis : [],
          hiddenWidgets: Array.isArray(parsed.hiddenWidgets) ? parsed.hiddenWidgets : [],
        });
        return;
      }
    } catch {
      // ignore
    }
    setPrefs(buildDefaultPrefs(role));
  }, [storageKey, role]);

  const persist = useCallback(
    (next: UserDashboardPrefs) => {
      setPrefs(next);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore storage quota errors
        }
      }
    },
    [storageKey]
  );

  const setMode = useCallback(
    (mode: DashboardDensity) => {
      persist({ ...prefs, mode });
    },
    [prefs, persist]
  );

  const toggleMode = useCallback(() => {
    persist({ ...prefs, mode: prefs.mode === 'minimal' ? 'expanded' : 'minimal' });
  }, [prefs, persist]);

  const toggleKpi = useCallback(
    (kpiId: string) => {
      const exists = prefs.hiddenKpis.includes(kpiId);
      const hiddenKpis = exists
        ? prefs.hiddenKpis.filter((id) => id !== kpiId)
        : [...prefs.hiddenKpis, kpiId];
      persist({ ...prefs, hiddenKpis });
    },
    [prefs, persist]
  );

  const toggleWidget = useCallback(
    (widgetId: string) => {
      const exists = prefs.hiddenWidgets.includes(widgetId);
      const hiddenWidgets = exists
        ? prefs.hiddenWidgets.filter((id) => id !== widgetId)
        : [...prefs.hiddenWidgets, widgetId];
      persist({ ...prefs, hiddenWidgets });
    },
    [prefs, persist]
  );

  const resetToDefault = useCallback(() => {
    persist(buildDefaultPrefs(role));
  }, [role, persist]);

  const isKpiVisible = useCallback(
    (kpiId: string) => !prefs.hiddenKpis.includes(kpiId),
    [prefs.hiddenKpis]
  );

  const isWidgetVisible = useCallback(
    (widgetId: string) => !prefs.hiddenWidgets.includes(widgetId),
    [prefs.hiddenWidgets]
  );

  const visibleKpiCount = schema.kpis.filter((k) => !prefs.hiddenKpis.includes(k.id)).length;
  const visibleWidgetCount = schema.widgets.filter((w) => !prefs.hiddenWidgets.includes(w.id)).length;

  return {
    schema,
    prefs,
    isMinimal: prefs.mode === 'minimal',
    setMode,
    toggleMode,
    toggleKpi,
    toggleWidget,
    isKpiVisible,
    isWidgetVisible,
    resetToDefault,
    visibleKpiCount,
    visibleWidgetCount,
  };
}

export type ErpCustomModuleId =
  | 'inventory'
  | 'branches_transfers'
  | 'geo_pricing'
  | 'partners'
  | 'documents_credit'
  | 'compliance'
  | 'hr_rbac'
  | 'audit_security'
  | 'external_customers'
  | 'leave_management';

export const MODULE_CUSTOM_SCHEMAS: Record<ErpCustomModuleId, RoleDashboardSchema> = {
  inventory: {
    title: 'Liquor Inventory & Bonded Controller',
    subtitle: 'Stock levels, branch allocation, barcode governance & valuation',
    kpis: [
      { id: 'healthy_stock', label: 'Healthy Rotation SKUs', defaultVisible: true },
      { id: 'dead_stock', label: 'Dead Stock Alert', defaultVisible: true },
      { id: 'expiring_soon', label: 'Expiring Soon', defaultVisible: true },
      { id: 'damaged_spoiled', label: 'Damaged & Spoiled', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Stock Health KPI Row', defaultVisible: true },
      { id: 'filter_bar', label: 'Unified Branch & Spec Filter Bar', defaultVisible: true },
      { id: 'catalog_table', label: 'Master Liquor Catalog Table', defaultVisible: true },
    ],
  },
  branches_transfers: {
    title: 'Branches, Warehouses & Stock Transfers',
    subtitle: 'Facility management, warehouse purchase orders & bonded dispatch',
    kpis: [
      { id: 'facilities', label: 'Active Facilities', defaultVisible: true },
      { id: 'pending_auth', label: 'Pending Authorizations', defaultVisible: true },
      { id: 'in_transit', label: 'Dispatched / In Transit', defaultVisible: true },
      { id: 'completed', label: 'Completed Transfers', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Logistics KPI Row', defaultVisible: true },
      { id: 'create_facility', label: 'Commission Facility Form', defaultVisible: true },
      { id: 'transfer_builder', label: 'Order & Transfer Manifest Studio', defaultVisible: true },
      { id: 'transfer_ledger', label: 'Stock Transfer & Order Ledger', defaultVisible: true },
    ],
  },
  geo_pricing: {
    title: 'Geo-Location Pricing Matrix',
    subtitle: 'Regional tariffs, suburb multipliers & SKU price overrides',
    kpis: [
      { id: 'zones', label: 'Pricing Zones', defaultVisible: true },
      { id: 'suburban', label: 'Suburban Ring Zones', defaultVisible: true },
      { id: 'catalog_skus', label: 'Priced Catalog SKUs', defaultVisible: true },
      { id: 'avg_freight', label: 'Avg Freight / Case', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Pricing KPI Row', defaultVisible: true },
      { id: 'zone_forms', label: 'Zone & Override Forms', defaultVisible: true },
      { id: 'zone_directory', label: 'Regional Zones & Matrix', defaultVisible: true },
    ],
  },
  partners: {
    title: 'Trade Partners & Logistics Onboarding',
    subtitle: 'Suppliers, licensed retailers, bars & bonded fleet vetting',
    kpis: [
      { id: 'total_partners', label: 'Total Partners', defaultVisible: true },
      { id: 'verified', label: 'Verified Licenses', defaultVisible: true },
      { id: 'retailers', label: 'Licensed Retailers', defaultVisible: true },
      { id: 'suppliers_logistics', label: 'Suppliers & Carriers', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Partner KPI Row', defaultVisible: true },
      { id: 'onboarding_form', label: 'Partner Onboarding Form', defaultVisible: true },
      { id: 'partners_directory', label: 'Verified Partner Directory', defaultVisible: true },
    ],
  },
  documents_credit: {
    title: 'Commercial Documents & Credit Notes',
    subtitle: 'Invoices, quotations, delivery notes, packing lists & credit offsets',
    kpis: [
      { id: 'total_docs', label: 'Total Documents', defaultVisible: true },
      { id: 'paid_receipts', label: 'Paid Receipts', defaultVisible: true },
      { id: 'issued_invoices', label: 'Issued Invoices', defaultVisible: true },
      { id: 'credit_notes', label: 'Credit Notes', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Documents KPI Row', defaultVisible: true },
      { id: 'doc_creator', label: 'Document Studio Creator', defaultVisible: true },
      { id: 'docs_ledger', label: 'Commercial Documents Ledger', defaultVisible: true },
    ],
  },
  compliance: {
    title: 'KRA iTax Returns & Excise Stamps',
    subtitle: 'VAT3, PAYE P10 spreadsheets & digital excise stamp roll tracking',
    kpis: [
      { id: 'active_certs', label: 'Active Excise Certs', defaultVisible: true },
      { id: 'duty_paid', label: 'Total Excise Duty Paid', defaultVisible: true },
      { id: 'payroll_runs', label: 'Filed Payroll Runs', defaultVisible: true },
      { id: 'taxable_tx', label: 'Taxable Transactions', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Compliance KPI Row', defaultVisible: true },
      { id: 'compliance_workspace', label: 'KRA Returns & Excise Studio', defaultVisible: true },
    ],
  },
  hr_rbac: {
    title: 'HR, Staff Directory & Payroll Engine',
    subtitle: 'Role onboarding, PIN & RBAC controls, payroll runs & leave approvals',
    kpis: [
      { id: 'active_staff', label: 'Active Staff', defaultVisible: true },
      { id: 'payroll_runs', label: 'Payroll Runs', defaultVisible: true },
      { id: 'pending_leave', label: 'Pending Leave Requests', defaultVisible: true },
      { id: 'kra_coverage', label: 'Statutory KRA Coverage', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'HR KPI Row', defaultVisible: true },
      { id: 'workspace_tabs', label: 'Roster, Payroll, Leave & Security', defaultVisible: true },
    ],
  },
  audit_security: {
    title: 'Zero-Trust Audit & Device Surveillance',
    subtitle: 'Live staff device fingerprints, sessions & immutable security logs',
    kpis: [
      { id: 'scoped_logs', label: 'Scoped Audit Events', defaultVisible: true },
      { id: 'security_events', label: 'Security Events', defaultVisible: true },
      { id: 'critical_alerts', label: 'Critical Alerts', defaultVisible: true },
      { id: 'active_sessions', label: 'Monitored Staff', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Audit KPI Row', defaultVisible: true },
      { id: 'session_grid', label: 'Live Staff Device Grid', defaultVisible: true },
      { id: 'audit_table', label: 'Immutable Audit Trail Table', defaultVisible: true },
    ],
  },
  external_customers: {
    title: 'External Customers Directory',
    subtitle: 'Walk-in, VIP & direct trade customer accounts',
    kpis: [
      { id: 'total_customers', label: 'Total Customers', defaultVisible: true },
      { id: 'active_accounts', label: 'Active Accounts', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Customer KPI Row', defaultVisible: true },
      { id: 'customer_list', label: 'Customer Records List', defaultVisible: true },
    ],
  },
  leave_management: {
    title: 'Leave, Off & Emergency Portal',
    subtitle: 'Time-off submissions, relief handovers & HR approval tracking',
    kpis: [
      { id: 'total_requests', label: 'Total Requests', defaultVisible: true },
      { id: 'pending_hr', label: 'Pending HR Review', defaultVisible: true },
      { id: 'approved', label: 'Approved Requests', defaultVisible: true },
    ],
    widgets: [
      { id: 'kpi_strip', label: 'Leave KPI Row', defaultVisible: true },
      { id: 'leave_portal', label: 'Leave Application & History', defaultVisible: true },
    ],
  },
};

function buildDefaultModulePrefs(moduleId: ErpCustomModuleId): UserDashboardPrefs {
  const schema = MODULE_CUSTOM_SCHEMAS[moduleId];
  return {
    mode: 'minimal',
    hiddenKpis: schema.kpis.filter((k) => !k.defaultVisible).map((k) => k.id),
    hiddenWidgets: schema.widgets.filter((w) => !w.defaultVisible).map((w) => w.id),
  };
}

export function useModulePrefs(
  currentUser: Pick<StaffMember, 'id' | 'email' | 'role'>,
  moduleId: ErpCustomModuleId
) {
  const schema = MODULE_CUSTOM_SCHEMAS[moduleId];
  const identity = (currentUser.id || currentUser.email || currentUser.role || 'user').replace(
    /[^a-zA-Z0-9_-]/g,
    '_'
  );
  const storageKey = `vaairo_mod_prefs_v1_${moduleId}_${currentUser.role}_${identity}`;

  const [prefs, setPrefs] = useState<UserDashboardPrefs>(() => {
    if (typeof window === 'undefined') return buildDefaultModulePrefs(moduleId);
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          mode: parsed.mode === 'expanded' ? 'expanded' : 'minimal',
          hiddenKpis: Array.isArray(parsed.hiddenKpis) ? parsed.hiddenKpis : [],
          hiddenWidgets: Array.isArray(parsed.hiddenWidgets) ? parsed.hiddenWidgets : [],
        };
      }
    } catch {
      // Fallback to default
    }
    return buildDefaultModulePrefs(moduleId);
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        setPrefs({
          mode: parsed.mode === 'expanded' ? 'expanded' : 'minimal',
          hiddenKpis: Array.isArray(parsed.hiddenKpis) ? parsed.hiddenKpis : [],
          hiddenWidgets: Array.isArray(parsed.hiddenWidgets) ? parsed.hiddenWidgets : [],
        });
        return;
      }
    } catch {
      // ignore
    }
    setPrefs(buildDefaultModulePrefs(moduleId));
  }, [storageKey, moduleId]);

  const persist = useCallback(
    (next: UserDashboardPrefs) => {
      setPrefs(next);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(next));
        } catch {
          // ignore
        }
      }
    },
    [storageKey]
  );

  const setMode = useCallback((mode: DashboardDensity) => persist({ ...prefs, mode }), [prefs, persist]);
  const toggleKpi = useCallback(
    (kpiId: string) => {
      const hiddenKpis = prefs.hiddenKpis.includes(kpiId)
        ? prefs.hiddenKpis.filter((id) => id !== kpiId)
        : [...prefs.hiddenKpis, kpiId];
      persist({ ...prefs, hiddenKpis });
    },
    [prefs, persist]
  );
  const toggleWidget = useCallback(
    (widgetId: string) => {
      const hiddenWidgets = prefs.hiddenWidgets.includes(widgetId)
        ? prefs.hiddenWidgets.filter((id) => id !== widgetId)
        : [...prefs.hiddenWidgets, widgetId];
      persist({ ...prefs, hiddenWidgets });
    },
    [prefs, persist]
  );
  const resetToDefault = useCallback(() => persist(buildDefaultModulePrefs(moduleId)), [moduleId, persist]);
  const isKpiVisible = useCallback((kpiId: string) => !prefs.hiddenKpis.includes(kpiId), [prefs.hiddenKpis]);
  const isWidgetVisible = useCallback(
    (widgetId: string) => !prefs.hiddenWidgets.includes(widgetId),
    [prefs.hiddenWidgets]
  );

  return {
    schema,
    prefs,
    isMinimal: prefs.mode === 'minimal',
    setMode,
    toggleKpi,
    toggleWidget,
    isKpiVisible,
    isWidgetVisible,
    resetToDefault,
  };
}
