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
      { id: 'reports_grid', label: 'Performance & Reports Tiles', defaultVisible: true },
      { id: 'ops_grid', label: 'Operations & Departments', defaultVisible: true },
      { id: 'alerts_strip', label: 'Pending Approvals & Deliveries Alert', defaultVisible: true },
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
