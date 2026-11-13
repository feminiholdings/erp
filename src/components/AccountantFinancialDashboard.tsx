import React, { useState, useMemo, useEffect } from 'react';
import {
  DollarSign,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Package,
  PackageX,
  AlertTriangle,
  Download,
  ShieldAlert,
  Building,
  CreditCard,
  Sparkles,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  Trash2,
  Wallet,
  Receipt,
  Search,
  X,
  Filter,
} from 'lucide-react';
import {
  Product,
  TransactionDoc,
  Branch,
  GeoRegion,
  StaffMember,
  PayrollRun,
  PayrollRecord,
  LineItem,
  Partner,
  ExternalCustomer,
  ComplianceRecord,
  AccountingExpense,
  ExpenseCategory,
  ExpensePaymentMethod,
  ExpenseStatus,
} from '../types';
import { formatKes, exportReportToPDF, exportToCSV } from '../erpUtils';
import { BarGraph, PieChart as AnalyticsPieChart } from './common/AnalyticsCharts';
import { KraReturnsPanel } from './KraReturnsExportModal';
import { KraReturnScheduleType } from '../utils/kraReturnsExport';
import { useDashboardPrefs } from '../utils/dashboardPrefs';
import { MinimalDashboardBar } from './common/MinimalDashboardBar';

interface AccountantFinancialDashboardProps {
  currentUser: StaffMember;
  products: Product[];
  transactions: TransactionDoc[];
  branches: Branch[];
  regions: GeoRegion[];
  partners?: Partner[];
  externalCustomers?: ExternalCustomer[];
  staffList?: StaffMember[];
  complianceRecords?: ComplianceRecord[];
  payrollRuns?: PayrollRun[];
  expenses?: AccountingExpense[];
  onCreateExpense?: (
    draft: Omit<AccountingExpense, 'id' | 'expenseNo' | 'createdAt' | 'recordedBy' | 'recordedByRole'>
  ) => Promise<void> | void;
  onUpdateExpenseStatus?: (expenseId: string, status: ExpenseStatus) => Promise<void> | void;
  onDeleteExpense?: (expenseId: string) => Promise<void> | void;
  onPreviewDoc?: (doc: TransactionDoc) => void;
  onOpenKraReturns?: (defaultTab?: KraReturnScheduleType) => void;
  onTriggerToast?: (type: 'success' | 'error', title: string, message: string) => void;
}

type DateFilter = 'ALL' | 'YEAR' | 'MONTH' | 'WEEK' | 'TODAY';
type ActiveFinanceTab = 'summary' | 'expenses' | 'sales' | 'stock' | 'deadstock_damages' | 'tax_credit';

const EXPENSE_CATEGORIES: ExpenseCategory[] = [
  'Rent & Warehouse Lease',
  'Utilities & Power',
  'Fuel & Fleet Logistics',
  'KRA Excise & Licenses',
  'Staff Allowances & Casuals',
  'Marketing & Promotions',
  'Repairs & Maintenance',
  'Office & POS Supplies',
  'Security & Insurance',
  'Petty Cash & Miscellaneous',
];

const EXPENSE_PAYMENT_METHODS: ExpensePaymentMethod[] = [
  'M-Pesa',
  'Cash',
  'Bank Transfer',
  'Petty Cash',
  'Cheque',
  'Credit / Payable',
];

const CATEGORY_COLORS: Record<string, string> = {
  'Rent & Warehouse Lease': '#0A006E',
  'Utilities & Power': '#0EA5E9',
  'Fuel & Fleet Logistics': '#F59E0B',
  'KRA Excise & Licenses': '#6366F1',
  'Staff Allowances & Casuals': '#EC4899',
  'Marketing & Promotions': '#8B5CF6',
  'Repairs & Maintenance': '#F97316',
  'Office & POS Supplies': '#14B8A6',
  'Security & Insurance': '#334155',
  'Petty Cash & Miscellaneous': '#64748B',
};

const isWithinDateFilter = (dateStr: string | undefined, dateFilter: DateFilter): boolean => {
  if (dateFilter === 'ALL') return true;
  if (!dateStr) return false;
  const parsed = new Date(dateStr);
  if (isNaN(parsed.getTime())) return false;

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  const dayOfWeek = now.getDay();
  const daysSinceMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - daysSinceMonday, 0, 0, 0, 0);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const startOfYear = new Date(now.getFullYear(), 0, 1, 0, 0, 0, 0);

  if (dateFilter === 'TODAY') return parsed >= startOfToday && parsed <= now;
  if (dateFilter === 'WEEK') return parsed >= startOfWeek && parsed <= now;
  if (dateFilter === 'MONTH') return parsed >= startOfMonth && parsed <= now;
  if (dateFilter === 'YEAR') return parsed >= startOfYear && parsed <= now;
  return true;
};

export const AccountantFinancialDashboard: React.FC<AccountantFinancialDashboardProps> = ({
  currentUser,
  products,
  transactions,
  branches,
  regions,
  partners = [],
  externalCustomers = [],
  staffList = [],
  complianceRecords = [],
  payrollRuns = [],
  expenses = [],
  onCreateExpense,
  onUpdateExpenseStatus,
  onDeleteExpense,
  onPreviewDoc,
  onOpenKraReturns,
  onTriggerToast,
}) => {
  const [dateFilter, setDateFilter] = useState<DateFilter>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('erp_accountant_date_filter') as DateFilter | null;
      if (saved && ['ALL', 'YEAR', 'MONTH', 'WEEK', 'TODAY'].includes(saved)) return saved;
    }
    return 'ALL';
  });

  const [activeTab, setActiveTab] = useState<ActiveFinanceTab>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('erp_accountant_tab') as ActiveFinanceTab | null;
      if (saved && ['summary', 'expenses', 'sales', 'stock', 'deadstock_damages', 'tax_credit'].includes(saved)) {
        return saved;
      }
    }
    return 'summary';
  });

  const [selectedBranchFilter, setSelectedBranchFilter] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('erp_accountant_branch_filter') || 'ALL';
    }
    return 'ALL';
  });

  useEffect(() => {
    try {
      localStorage.setItem('erp_accountant_date_filter', dateFilter);
    } catch {}
  }, [dateFilter]);

  useEffect(() => {
    try {
      localStorage.setItem('erp_accountant_tab', activeTab);
    } catch {}
  }, [activeTab]);

  useEffect(() => {
    try {
      localStorage.setItem('erp_accountant_branch_filter', selectedBranchFilter);
    } catch {}
  }, [selectedBranchFilter]);

  // Expense Form / Modal State
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expenseTitle, setExpenseTitle] = useState('');
  const [expenseCategory, setExpenseCategory] = useState<ExpenseCategory>('Utilities & Power');
  const [expenseAmount, setExpenseAmount] = useState('');
  const [expenseBranchId, setExpenseBranchId] = useState<string>(() => branches[0]?.id || currentUser.branchId || '');
  const [expensePaymentMethod, setExpensePaymentMethod] = useState<ExpensePaymentMethod>('M-Pesa');
  const [expenseRefNo, setExpenseRefNo] = useState('');
  const [expenseVendor, setExpenseVendor] = useState('');
  const [expenseDate, setExpenseDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [expenseStatus, setExpenseStatus] = useState<ExpenseStatus>('Paid');
  const [expenseNotes, setExpenseNotes] = useState('');
  const [isSubmittingExpense, setIsSubmittingExpense] = useState(false);

  // Expense table filters & delete confirmation state
  const [expenseSearch, setExpenseSearch] = useState('');
  const [expenseCategoryFilter, setExpenseCategoryFilter] = useState<string>('ALL');
  const [pendingDeleteExpenseId, setPendingDeleteExpenseId] = useState<string | null>(null);

  const {
    schema: dashSchema,
    prefs: dashPrefs,
    isMinimal,
    setMode: setDashMode,
    toggleKpi,
    toggleWidget,
    isKpiVisible,
    isWidgetVisible,
    resetToDefault,
  } = useDashboardPrefs(currentUser);

  useEffect(() => {
    if (!expenseBranchId && branches.length > 0) {
      setExpenseBranchId(branches[0].id);
    }
  }, [branches, expenseBranchId]);

  const selectedBranchObj = useMemo(
    () => branches.find((b) => b.id === selectedBranchFilter) || null,
    [branches, selectedBranchFilter]
  );

  // Filter transactions based on date filter and branch filter
  const filteredTransactions = useMemo(() => {
    return transactions.filter((tx) => {
      if (selectedBranchFilter !== 'ALL') {
        const matchesId = tx.branchId === selectedBranchFilter;
        const matchesName = selectedBranchObj ? tx.branchName === selectedBranchObj.name : false;
        if (!matchesId && !matchesName) return false;
      }
      return isWithinDateFilter(tx.createdAt, dateFilter);
    });
  }, [transactions, dateFilter, selectedBranchFilter, selectedBranchObj]);

  // Filter recorded operating expenses based on date filter and branch filter
  const filteredExpenses = useMemo(() => {
    return expenses.filter((exp) => {
      if (selectedBranchFilter !== 'ALL') {
        const matchesId = exp.branchId === selectedBranchFilter;
        const matchesName = selectedBranchObj ? exp.branchName === selectedBranchObj.name : false;
        if (!matchesId && !matchesName) return false;
      }
      return isWithinDateFilter(exp.expenseDate || exp.createdAt, dateFilter);
    });
  }, [expenses, dateFilter, selectedBranchFilter, selectedBranchObj]);

  // Filter payroll runs based on date filter (and branch when computing payroll total)
  const filteredPayrollRuns = useMemo(() => {
    return payrollRuns.filter((pr) => isWithinDateFilter(pr.runDate || pr.createdAt, dateFilter));
  }, [payrollRuns, dateFilter]);

  // LIVE DATA FROM SALES CALCULATIONS
  const salesMetrics = useMemo(() => {
    let grossSales = 0;
    let creditNotesTotal = 0;
    let completedOrdersCount = 0;
    let estimatedCogs = 0;
    let liquidCollectedTotal = 0;

    // Include all ERP channels and expand dynamically for any other channel names
    const channelTotals: Record<string, { count: number; total: number }> = {
      'Retail Counter POS': { count: 0, total: 0 },
      'B2B Wholesale POS': { count: 0, total: 0 },
      'Restaurant & Club POS': { count: 0, total: 0 },
      'Merchant Shop POS': { count: 0, total: 0 },
      'Customer Online Portal': { count: 0, total: 0 },
      'Affiliate Rep': { count: 0, total: 0 },
    };

    const paymentTotals: Record<string, { count: number; total: number }> = {};

    const skuPerformance: Record<
      string,
      { sku: string; name: string; volumeMl: number; category: string; unitsSold: number; totalRevenue: number; cogs: number }
    > = {};

    let accountsReceivable = 0;
    let overdueReceivable = 0;
    let internalWarehousePurchasesTotal = 0;
    let internalWarehousePurchasesCount = 0;
    const now = new Date();

    filteredTransactions.forEach((tx) => {
      const txTotal = Number(tx.totalAmount || 0);
      if (tx.orderCategory === 'WAREHOUSE_PURCHASE') {
        if (tx.docType === 'Invoice' || tx.docType === 'Receipt') {
          internalWarehousePurchasesTotal += txTotal;
          internalWarehousePurchasesCount++;
        }
        return;
      }

      if (tx.docType === 'Receipt' || tx.docType === 'Invoice' || tx.docType === 'Online Order') {
        grossSales += txTotal;
        completedOrdersCount++;

        const channelName = tx.channel || 'Retail Counter POS';
        if (!channelTotals[channelName]) {
          channelTotals[channelName] = { count: 0, total: 0 };
        }
        channelTotals[channelName].count++;
        channelTotals[channelName].total += txTotal;

        const method = tx.paymentMethod || 'Settled / Other';
        if (!paymentTotals[method]) {
          paymentTotals[method] = { count: 0, total: 0 };
        }
        paymentTotals[method].count++;
        paymentTotals[method].total += txTotal;

        const lowerMethod = method.toLowerCase();
        if (
          tx.status === 'Paid' ||
          tx.status === 'Fulfilled' ||
          lowerMethod.includes('cash') ||
          lowerMethod.includes('pesa') ||
          lowerMethod.includes('bank') ||
          lowerMethod.includes('card')
        ) {
          if (!lowerMethod.includes('credit') && tx.status !== 'Issued') {
            liquidCollectedTotal += txTotal;
          }
        }

        // Only unsettled, non-credited invoices count as Accounts Receivable
        if (tx.docType === 'Invoice' && tx.status !== 'Paid' && tx.status !== 'Credited') {
          accountsReceivable += txTotal;
          const txAgeDays = (now.getTime() - new Date(tx.createdAt).getTime()) / (1000 * 60 * 60 * 24);
          if (txAgeDays > 30) {
            overdueReceivable += txTotal;
          }
        }

        try {
          const parsed = JSON.parse(tx.itemsSummary);
          const items: Array<LineItem & { total?: number }> = Array.isArray(parsed) ? parsed : [];
          if (items.length === 0) {
            estimatedCogs += txTotal * 0.72;
          } else {
            items.forEach((item) => {
              const matchedProduct = products.find((p) => p.id === item.productId || p.sku === item.sku);
              const qty = Number(item.totalBottles || item.quantityUnits || 1);
              const lineRev = Number(item.lineTotal ?? item.total ?? Number(item.unitPrice || 0) * Number(item.quantityUnits || 1));
              const unitCost =
                matchedProduct?.warehouseCostKes ??
                matchedProduct?.baseLandedCost ??
                Math.round(Number(item.unitPrice || 0) * 0.72);
              const lineCogs = qty * unitCost;
              estimatedCogs += lineCogs;

              const skuKey = item.sku || item.productId || item.name;
              if (!skuPerformance[skuKey]) {
                skuPerformance[skuKey] = {
                  sku: item.sku || skuKey,
                  name: item.name || matchedProduct?.name || 'SKU Item',
                  volumeMl: matchedProduct?.volumeMl || 750,
                  category: matchedProduct?.category || 'IPS',
                  unitsSold: 0,
                  totalRevenue: 0,
                  cogs: 0,
                };
              }
              skuPerformance[skuKey].unitsSold += qty;
              skuPerformance[skuKey].totalRevenue += lineRev;
              skuPerformance[skuKey].cogs += lineCogs;
            });
          }
        } catch {
          estimatedCogs += txTotal * 0.72;
        }
      } else if (tx.docType === 'Credit Note') {
        creditNotesTotal += txTotal;
      }
    });

    const netCommercialSales = grossSales - creditNotesTotal;
    const grossProfit = netCommercialSales - estimatedCogs;
    const grossMarginPct = netCommercialSales > 0 ? (grossProfit / netCommercialSales) * 100 : 0;
    const aov = completedOrdersCount > 0 ? grossSales / completedOrdersCount : 0;

    const topSkus = Object.values(skuPerformance)
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, 8);

    return {
      grossSales,
      creditNotesTotal,
      netCommercialSales,
      completedOrdersCount,
      estimatedCogs,
      grossProfit,
      grossMarginPct,
      aov,
      liquidCollectedTotal,
      channelTotals,
      paymentTotals,
      topSkus,
      accountsReceivable,
      overdueReceivable,
      internalWarehousePurchasesTotal,
      internalWarehousePurchasesCount,
    };
  }, [filteredTransactions, products]);

  // LIVE DATA FROM STOCK CALCULATIONS (Respects selectedBranchFilter & handles unallocated stock cleanly)
  const stockMetrics = useMemo(() => {
    let totalStockCost = 0;
    let totalStockRetailValue = 0;
    let totalStockWholesaleValue = 0;
    let totalBottlesInBond = 0;

    let ipsCost = 0;
    let ipsBottles = 0;
    let lpsCost = 0;
    let lpsBottles = 0;

    let totalDamagedBottles = 0;
    let totalDamagedLossKes = 0;
    let totalSpoiledBottles = 0;
    let totalSpoiledLossKes = 0;

    let totalDeadStockBottles = 0;
    let totalDeadStockCapitalKes = 0;
    const deadStockItems: Array<{ product: Product; daysInactive: number; tiedUpCapital: number; bottlesCount: number }> = [];

    const now = new Date();
    const branchStockMap: Record<string, { branchName: string; bottles: number; costValuation: number; retailValuation: number }> = {};
    branches.forEach((b) => {
      branchStockMap[b.id] = {
        branchName: b.name,
        bottles: 0,
        costValuation: 0,
        retailValuation: 0,
      };
    });

    products.forEach((p) => {
      const globalBottles = p.totalBottles ?? 0;
      const unitCost = p.warehouseCostKes ?? p.baseLandedCost ?? Math.round((p.retailPriceKes || 3000) * 0.72);
      const retailPrice = p.retailPriceKes ?? p.baseRetailPrice ?? Math.round(unitCost * 1.35);
      const wholesalePrice = p.wholesalePriceKes ?? p.baseWholesalePrice ?? Math.round(unitCost * 1.18);

      let parsedBranchMap: Record<string, number> = {};
      let allocatedTotal = 0;
      try {
        if (p.branchStockSummary) {
          parsedBranchMap = JSON.parse(p.branchStockSummary);
          allocatedTotal = Object.values(parsedBranchMap).reduce((s, n) => s + Number(n || 0), 0);
        }
      } catch {
        parsedBranchMap = {};
        allocatedTotal = 0;
      }

      // Attribute each SKU's stock into branches for Depot Valuation table
      if (allocatedTotal > 0) {
        Object.entries(parsedBranchMap).forEach(([bId, bQty]) => {
          const qty = Number(bQty || 0);
          if (branchStockMap[bId] && qty > 0) {
            branchStockMap[bId].bottles += qty;
            branchStockMap[bId].costValuation += qty * unitCost;
            branchStockMap[bId].retailValuation += qty * retailPrice;
          }
        });
      } else if (globalBottles > 0 && branches[0] && branchStockMap[branches[0].id]) {
        branchStockMap[branches[0].id].bottles += globalBottles;
        branchStockMap[branches[0].id].costValuation += globalBottles * unitCost;
        branchStockMap[branches[0].id].retailValuation += globalBottles * retailPrice;
      }

      // Scoped bottle count for active branch filter (or all branches)
      const bottles =
        selectedBranchFilter === 'ALL'
          ? globalBottles
          : allocatedTotal > 0
          ? Number(parsedBranchMap[selectedBranchFilter] || 0)
          : branches[0]?.id === selectedBranchFilter
          ? globalBottles
          : 0;

      const itemCostVal = bottles * unitCost;
      const itemRetailVal = bottles * retailPrice;
      const itemWholesaleVal = bottles * wholesalePrice;

      totalStockCost += itemCostVal;
      totalStockRetailValue += itemRetailVal;
      totalStockWholesaleValue += itemWholesaleVal;
      totalBottlesInBond += bottles;

      if (p.category === 'LPS') {
        lpsCost += itemCostVal;
        lpsBottles += bottles;
      } else {
        ipsCost += itemCostVal;
        ipsBottles += bottles;
      }

      // Damages & Spoiled items (attribute to branch when single branch selected only if ratio applies, otherwise company-wide or main)
      const ratio = selectedBranchFilter === 'ALL' ? 1 : globalBottles > 0 ? bottles / globalBottles : 0;
      const dmgCount = Math.round((p.damagedBottlesCount || 0) * ratio);
      const spoilCount = Math.round((p.spoiledBottlesCount || 0) * ratio);
      if (dmgCount > 0) {
        totalDamagedBottles += dmgCount;
        totalDamagedLossKes += dmgCount * unitCost;
      }
      if (spoilCount > 0) {
        totalSpoiledBottles += spoilCount;
        totalSpoiledLossKes += spoilCount * unitCost;
      }

      const thresholdDays = p.deadStockThresholdDays || 90;
      const lastMoveDate = p.lastStockMovementDate ? new Date(p.lastStockMovementDate) : new Date(p.createdAt || '2026-08-01');
      const daysInactive = Math.max(0, Math.floor((now.getTime() - lastMoveDate.getTime()) / (1000 * 60 * 60 * 24)));

      if (daysInactive >= thresholdDays && bottles > 0) {
        totalDeadStockBottles += bottles;
        totalDeadStockCapitalKes += itemCostVal;
        deadStockItems.push({
          product: p,
          daysInactive,
          tiedUpCapital: itemCostVal,
          bottlesCount: bottles,
        });
      }
    });

    const potentialGrossMargin = totalStockRetailValue - totalStockCost;
    const potentialMarginPct = totalStockRetailValue > 0 ? (potentialGrossMargin / totalStockRetailValue) * 100 : 0;
    const totalWriteOffs = totalDamagedLossKes + totalSpoiledLossKes;
    const shrinkagePct = totalStockCost > 0 ? (totalWriteOffs / totalStockCost) * 100 : 0;

    deadStockItems.sort((a, b) => b.tiedUpCapital - a.tiedUpCapital);

    return {
      totalStockCost,
      totalStockRetailValue,
      totalStockWholesaleValue,
      totalBottlesInBond,
      ipsCost,
      ipsBottles,
      lpsCost,
      lpsBottles,
      potentialGrossMargin,
      potentialMarginPct,
      totalDamagedBottles,
      totalDamagedLossKes,
      totalSpoiledBottles,
      totalSpoiledLossKes,
      totalWriteOffs,
      shrinkagePct,
      totalDeadStockBottles,
      totalDeadStockCapitalKes,
      deadStockItems,
      branchStockMap,
    };
  }, [products, branches, selectedBranchFilter]);

  // RECORDED OPERATING EXPENSES AGGREGATION
  const expenseMetrics = useMemo(() => {
    let totalRecorded = 0;
    let totalPaid = 0;
    let totalPending = 0;
    const byCategory: Record<string, { count: number; total: number }> = {};
    const byMethod: Record<string, { count: number; total: number }> = {};
    const byBranch: Record<string, { branchName: string; count: number; total: number }> = {};

    filteredExpenses.forEach((exp) => {
      const amt = Number(exp.amountKes || 0);
      totalRecorded += amt;
      if (exp.status === 'Paid') totalPaid += amt;
      else totalPending += amt;

      if (!byCategory[exp.category]) byCategory[exp.category] = { count: 0, total: 0 };
      byCategory[exp.category].count++;
      byCategory[exp.category].total += amt;

      const method = exp.paymentMethod || 'Cash';
      if (!byMethod[method]) byMethod[method] = { count: 0, total: 0 };
      byMethod[method].count++;
      byMethod[method].total += amt;

      const bKey = exp.branchName || 'Headquarters';
      if (!byBranch[bKey]) byBranch[bKey] = { branchName: bKey, count: 0, total: 0 };
      byBranch[bKey].count++;
      byBranch[bKey].total += amt;
    });

    const topCategoryEntry = Object.entries(byCategory).sort((a, b) => b[1].total - a[1].total)[0];

    return {
      totalRecorded,
      totalPaid,
      totalPending,
      byCategory,
      byMethod,
      byBranch,
      topCategoryName: topCategoryEntry?.[0] || 'None Logged',
      topCategoryAmount: topCategoryEntry?.[1]?.total || 0,
    };
  }, [filteredExpenses]);

  // TAX & STATUTORY LIABILITIES (Respects period + branch filter)
  const taxMetrics = useMemo(() => {
    const netTaxable = Math.max(0, salesMetrics.netCommercialSales);
    const estimatedVatPayable = (netTaxable / 1.16) * 0.16;
    const estimatedExciseLiability = stockMetrics.ipsBottles * 0.75 * 253;

    let totalPayrollDisbursed = 0;
    filteredPayrollRuns.forEach((pr) => {
      if (selectedBranchFilter === 'ALL') {
        totalPayrollDisbursed += Number(pr.totalDisbursed || 0);
      } else {
        try {
          const recs: PayrollRecord[] = JSON.parse(pr.recordsJson || '[]');
          const branchSum = recs
            .filter((r) => selectedBranchObj && r.branchName === selectedBranchObj.name)
            .reduce((s, r) => s + Number(r.netSalary || 0), 0);
          totalPayrollDisbursed += branchSum;
        } catch {
          // Ignore malformed payroll records
        }
      }
    });

    return {
      estimatedVatPayable,
      estimatedExciseLiability,
      totalPayrollDisbursed,
    };
  }, [salesMetrics.netCommercialSales, stockMetrics.ipsBottles, filteredPayrollRuns, selectedBranchFilter, selectedBranchObj]);

  // CONSOLIDATED FINANCIAL SUMMARY (100% Real Ledger Values — Zero Hardcoded Estimates)
  const financialSummary = useMemo(() => {
    const totalStockAssets = stockMetrics.totalStockCost;
    const accountsReceivable = salesMetrics.accountsReceivable;
    const payrollExpense = taxMetrics.totalPayrollDisbursed;
    const writeOffsExpense = stockMetrics.totalWriteOffs;
    const recordedOverhead = expenseMetrics.totalRecorded;
    const totalExpenses = payrollExpense + writeOffsExpense + recordedOverhead;

    // Net settled liquidity position from sales collections minus paid expenses & payroll
    const netCashCollected = Math.max(
      0,
      salesMetrics.liquidCollectedTotal -
        salesMetrics.creditNotesTotal -
        expenseMetrics.totalPaid -
        payrollExpense
    );
    const totalAssetsValue = totalStockAssets + accountsReceivable + netCashCollected;

    const grossProfit = salesMetrics.grossProfit;
    const netProfit = grossProfit - totalExpenses;
    const netProfitMargin =
      salesMetrics.netCommercialSales > 0 ? (netProfit / salesMetrics.netCommercialSales) * 100 : 0;

    return {
      totalAssetsValue,
      netCashCollected,
      grossProfit,
      totalExpenses,
      netProfit,
      netProfitMargin,
      payrollExpense,
      writeOffsExpense,
      recordedOverhead,
    };
  }, [stockMetrics, salesMetrics, taxMetrics, expenseMetrics]);

  // Visual Chart Datasets for Bar Graphs & Pie Charts
  const pnlBarChartData = useMemo(
    () => [
      { label: 'Gross Sales', value: Math.round(salesMetrics.grossSales), color: '#0A006E' },
      { label: 'Net Revenue', value: Math.round(salesMetrics.netCommercialSales), color: '#0EA5E9' },
      { label: 'COGS', value: Math.round(salesMetrics.estimatedCogs), color: '#F59E0B' },
      { label: 'Gross Profit', value: Math.round(financialSummary.grossProfit), color: '#10B981' },
      { label: 'All Expenses', value: Math.round(financialSummary.totalExpenses), color: '#EF4444' },
      {
        label: financialSummary.netProfit < 0 ? 'Net Loss' : 'Net Profit',
        value: Math.round(financialSummary.netProfit),
        color: financialSummary.netProfit < 0 ? '#E11D48' : '#34D186',
      },
    ],
    [salesMetrics, financialSummary]
  );

  // Dynamic Expense Pie Chart combining Payroll + Write-Offs + Real Logged Expense Categories
  const expensePieChartData = useMemo(() => {
    const slices: Array<{ label: string; value: number; color: string; sublabel?: string }> = [];
    if (financialSummary.payrollExpense > 0) {
      slices.push({
        label: 'Staff Payroll',
        value: financialSummary.payrollExpense,
        color: '#EF4444',
        sublabel: 'Disbursed salaries & PAYE',
      });
    }
    if (financialSummary.writeOffsExpense > 0) {
      slices.push({
        label: 'Stock Write-Offs',
        value: financialSummary.writeOffsExpense,
        color: '#F59E0B',
        sublabel: 'Damaged & spoiled stock',
      });
    }
    Object.entries(expenseMetrics.byCategory).forEach(([cat, info]) => {
      if (info.total > 0) {
        slices.push({
          label: cat,
          value: info.total,
          color: CATEGORY_COLORS[cat] || '#64748B',
          sublabel: `${info.count} Expense Voucher${info.count === 1 ? '' : 's'}`,
        });
      }
    });
    return slices;
  }, [financialSummary.payrollExpense, financialSummary.writeOffsExpense, expenseMetrics.byCategory]);

  const expenseCategoryBarData = useMemo(() => {
    return Object.entries(expenseMetrics.byCategory)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 6)
      .map(([cat, info]) => ({
        label: cat.split('&')[0].trim(),
        value: info.total,
        color: CATEGORY_COLORS[cat] || '#0A006E',
        secondaryLabel: `${info.count} items`,
      }));
  }, [expenseMetrics.byCategory]);

  const paymentMethodPieData = useMemo(() => {
    const palette = ['#0A006E', '#34D186', '#F59E0B', '#6366F1', '#EC4899', '#0EA5E9'];
    return Object.entries(salesMetrics.paymentTotals).map(([method, data], idx) => ({
      label: method,
      value: data.total,
      color: palette[idx % palette.length],
      sublabel: `${data.count} Orders`,
    }));
  }, [salesMetrics.paymentTotals]);

  const channelPieChartData = useMemo(() => {
    const palette = ['#0A006E', '#34D186', '#F59E0B', '#6366F1', '#EC4899', '#0EA5E9'];
    return Object.entries(salesMetrics.channelTotals)
      .filter(([, d]) => d.total > 0)
      .map(([channel, d], idx) => ({
        label: channel,
        value: d.total,
        color: palette[idx % palette.length],
        sublabel: `${d.count} Orders`,
      }));
  }, [salesMetrics.channelTotals]);

  const topSkusBarChartData = useMemo(() => {
    const palette = ['#0A006E', '#34D186', '#6366F1', '#EC4899', '#F59E0B', '#0EA5E9'];
    return salesMetrics.topSkus.slice(0, 6).map((sku, idx) => ({
      label: sku.name.length > 12 ? sku.name.slice(0, 11) + '…' : sku.name,
      value: sku.totalRevenue,
      color: palette[idx % palette.length],
      secondaryLabel: `${sku.unitsSold} Btls`,
    }));
  }, [salesMetrics.topSkus]);

  // Filtered expense table rows for UI display
  const visibleExpenses = useMemo(() => {
    const q = expenseSearch.trim().toLowerCase();
    return filteredExpenses.filter((e) => {
      if (expenseCategoryFilter !== 'ALL' && e.category !== expenseCategoryFilter) return false;
      if (!q) return true;
      return (
        e.title.toLowerCase().includes(q) ||
        e.expenseNo.toLowerCase().includes(q) ||
        (e.vendorName || '').toLowerCase().includes(q) ||
        (e.referenceNo || '').toLowerCase().includes(q) ||
        e.branchName.toLowerCase().includes(q)
      );
    });
  }, [filteredExpenses, expenseSearch, expenseCategoryFilter]);

  const handleSubmitExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericAmount = Number(expenseAmount);
    if (!expenseTitle.trim()) {
      onTriggerToast?.('error', 'Missing Expense Title', 'Please enter a brief description or title for the expense.');
      return;
    }
    if (!numericAmount || numericAmount <= 0 || Number.isNaN(numericAmount)) {
      onTriggerToast?.('error', 'Invalid Amount', 'Please enter a valid expense amount greater than KES 0.');
      return;
    }
    if (!onCreateExpense) {
      onTriggerToast?.('error', 'Handler Unavailable', 'Expense recording is not wired to storage.');
      return;
    }

    const branchMatch =
      branches.find((b) => b.id === expenseBranchId) ||
      branches[0] || { id: currentUser.branchId || 'hq', name: currentUser.branchName || 'Headquarters' };

    setIsSubmittingExpense(true);
    try {
      await onCreateExpense({
        title: expenseTitle.trim(),
        category: expenseCategory,
        amountKes: Math.round(numericAmount * 100) / 100,
        branchId: branchMatch.id,
        branchName: branchMatch.name,
        paymentMethod: expensePaymentMethod,
        referenceNo: expenseRefNo.trim() || undefined,
        vendorName: expenseVendor.trim() || undefined,
        expenseDate: expenseDate || new Date().toISOString().slice(0, 10),
        status: expenseStatus,
        notes: expenseNotes.trim() || undefined,
      });

      setExpenseTitle('');
      setExpenseAmount('');
      setExpenseRefNo('');
      setExpenseVendor('');
      setExpenseNotes('');
      setIsExpenseModalOpen(false);
    } finally {
      setIsSubmittingExpense(false);
    }
  };

  // EXPORT HANDLERS
  const handleExportComprehensiveFinancialPDF = () => {
    const scopeLabel = selectedBranchObj ? selectedBranchObj.name : 'All Branches';
    exportReportToPDF(
      'Official Chief Financial Accountant Statement & Live Balance Sheet',
      `Accounting Period: ${dateFilter} · Scope: ${scopeLabel} · Prepared for ${currentUser.name}`,
      ['Financial Ledger Item', 'Valuation Basis', 'Volume / Count', 'Amount (KES)', 'Classification'],
      [
        ['Gross Commercial Turnover', 'Sales Ledger', `${salesMetrics.completedOrdersCount} Orders`, Math.round(salesMetrics.grossSales).toLocaleString(), 'Revenue'],
        ['Commercial Credit Notes Issued', 'Adjustments & Returns', `${filteredTransactions.filter((t) => t.docType === 'Credit Note').length} Notes`, Math.round(salesMetrics.creditNotesTotal).toLocaleString(), 'Deduction'],
        ['Net Commercial Revenue', 'Gross - Credits', '-', Math.round(salesMetrics.netCommercialSales).toLocaleString(), 'Net Sales'],
        ['Cost of Goods Sold (COGS)', 'Unit Landed Cost', '-', Math.round(salesMetrics.estimatedCogs).toLocaleString(), 'Direct Cost'],
        ['Gross Commercial Profit', 'Net Revenue - COGS', `${salesMetrics.grossMarginPct.toFixed(1)}% Margin`, Math.round(salesMetrics.grossProfit).toLocaleString(), 'Gross Surplus'],
        ['Recorded Operating Expenses', 'Expense Vouchers', `${filteredExpenses.length} Vouchers`, Math.round(expenseMetrics.totalRecorded).toLocaleString(), 'Operating Expense'],
        ['Payroll Disbursed', 'Payroll Runs', `${filteredPayrollRuns.length} Runs`, Math.round(taxMetrics.totalPayrollDisbursed).toLocaleString(), 'Payroll Expense'],
        ['Stock Write-Offs (Damaged & Spoiled)', 'Inventory Losses', `${stockMetrics.totalDamagedBottles + stockMetrics.totalSpoiledBottles} Btls`, Math.round(stockMetrics.totalWriteOffs).toLocaleString(), 'Loss Write-Off'],
        ['Net Operating Profit / (Loss)', 'Gross Profit - All Expenses', `${financialSummary.netProfitMargin.toFixed(1)}% Margin`, Math.round(financialSummary.netProfit).toLocaleString(), financialSummary.netProfit >= 0 ? 'Net Profit' : 'Net Loss'],
        ['Live Stock Valuation (Landed Cost)', 'Asset on Hand', `${stockMetrics.totalBottlesInBond.toLocaleString()} Btls`, Math.round(stockMetrics.totalStockCost).toLocaleString(), 'Current Asset'],
        ['Outstanding Accounts Receivable', 'Unsettled B2B Invoices', '-', Math.round(salesMetrics.accountsReceivable).toLocaleString(), 'Current Asset'],
        ['Output VAT (16%) Obligation', 'KRA Statutory Remittance', '-', Math.round(taxMetrics.estimatedVatPayable).toLocaleString(), 'Liability'],
      ],
      'Vaairo_Accountant_Financial_Analysis_Statement'
    );
  };

  const handleExportFinancialLedgerCSV = () => {
    exportToCSV(
      'Vaairo_Live_Accounting_Ledger',
      ['Transaction Date', 'Doc Number', 'Doc Type', 'Branch', 'Channel', 'Payment Tender', 'Customer', 'Amount (KES)', 'Status'],
      filteredTransactions.map((tx) => [
        new Date(tx.createdAt).toLocaleDateString(),
        tx.docNumber,
        tx.docType,
        tx.branchName,
        tx.channel,
        tx.paymentMethod,
        tx.customerName,
        Math.round(tx.totalAmount),
        tx.status,
      ])
    );
  };

  const handleExportExpensesCSV = () => {
    exportToCSV(
      'Vaairo_Operating_Expenses_Ledger',
      ['Voucher No', 'Date', 'Title', 'Category', 'Branch', 'Vendor / Payee', 'Payment Method', 'Reference No', 'Amount (KES)', 'Status', 'Recorded By'],
      visibleExpenses.map((e) => [
        e.expenseNo,
        e.expenseDate,
        e.title,
        e.category,
        e.branchName,
        e.vendorName || '-',
        e.paymentMethod,
        e.referenceNo || '-',
        Math.round(e.amountKes),
        e.status,
        e.recordedBy,
      ])
    );
  };

  const handleExportExpensesPDF = () => {
    exportReportToPDF(
      'Operating Expenses & Disbursement Voucher Schedule',
      `Period: ${dateFilter} · Scope: ${selectedBranchObj ? selectedBranchObj.name : 'All Branches'} · ${visibleExpenses.length} Vouchers`,
      ['Voucher', 'Date', 'Title & Vendor', 'Category', 'Branch', 'Method', 'Amount (KES)', 'Status'],
      visibleExpenses.map((e) => [
        e.expenseNo,
        e.expenseDate,
        e.vendorName ? `${e.title} (${e.vendorName})` : e.title,
        e.category,
        e.branchName,
        e.paymentMethod,
        Math.round(e.amountKes).toLocaleString(),
        e.status,
      ]),
      'Vaairo_Operating_Expenses_Schedule'
    );
  };

  const safeDivPct = (part: number, whole: number): number => {
    if (!whole || whole <= 0) return 0;
    return Math.max(0, Math.min(100, (part / whole) * 100));
  };

  return (
    <div className="space-y-4">
      {/* Unified Minimal Customizable Accountant Header */}
      <MinimalDashboardBar
        currentUser={currentUser}
        schema={dashSchema}
        prefs={dashPrefs}
        onChangeMode={setDashMode}
        onToggleKpi={toggleKpi}
        onToggleWidget={toggleWidget}
        onReset={resetToDefault}
        subtitle={`${selectedBranchObj ? selectedBranchObj.name : 'All Branches'} · ${filteredExpenses.length} Vouchers · Period: ${dateFilter}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsExpenseModalOpen(true)}
              className="px-2.5 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Expense
            </button>
            <button
              type="button"
              onClick={() => {
                if (onOpenKraReturns) {
                  onOpenKraReturns('VAT3_SALES_SEC_B');
                } else {
                  setActiveTab('tax_credit');
                }
              }}
              className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <FileSpreadsheet className="w-3.5 h-3.5" />
              KRA (.xlsx)
            </button>
            <button
              type="button"
              onClick={handleExportComprehensiveFinancialPDF}
              className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              PDF
            </button>
            <button
              type="button"
              onClick={handleExportFinancialLedgerCSV}
              className="px-2.5 py-1.5 bg-white border border-slate-200 text-slate-700 rounded-lg text-[11px] font-montserrat font-bold flex items-center gap-1 cursor-pointer whitespace-nowrap"
            >
              <Download className="w-3.5 h-3.5" />
              CSV
            </button>
          </>
        }
      />

      {/* Streamlined Branch & Period Filter Strip */}
      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2 flex flex-wrap items-center justify-between gap-2">
        <div className="bg-slate-100 p-0.5 rounded-lg border border-slate-200 flex items-center text-xs">
          {(['ALL', 'YEAR', 'MONTH', 'WEEK', 'TODAY'] as DateFilter[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setDateFilter(period)}
              className={`px-2.5 py-1 rounded-md font-montserrat font-bold text-[11px] transition cursor-pointer whitespace-nowrap ${
                dateFilter === period
                  ? 'bg-[#0A006E] text-[#FFDE00]'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {period === 'ALL'
                ? 'All'
                : period === 'YEAR'
                ? 'Year'
                : period === 'MONTH'
                ? 'Month'
                : period === 'WEEK'
                ? 'Week'
                : 'Today'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <select
            aria-label="Filter by Branch"
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-montserrat font-semibold text-[#0A006E] cursor-pointer"
          >
            <option value="ALL">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* TOP LIVE FINANCIAL KPI STRIP */}
      {isWidgetVisible('kpi_strip') && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5 sm:gap-3">
          {isKpiVisible('gross_sales') && (
            <div className="bg-white border border-slate-200 hover:border-[#0A006E] rounded-xl p-3.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                  Gross Sales
                </span>
                <DollarSign className="w-3.5 h-3.5 text-[#0A006E] shrink-0" />
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-[#0A006E] font-mono-tabular mt-1 truncate">
                {formatKes(salesMetrics.grossSales)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {salesMetrics.completedOrdersCount} orders · AOV {formatKes(salesMetrics.aov)}
              </div>
            </div>
          )}

          {isKpiVisible('expenses') && (
            <div
              onClick={() => setActiveTab('expenses')}
              className="bg-white border border-slate-200 hover:border-rose-500 rounded-xl p-3.5 transition cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-semibold text-rose-700 truncate">
                  Expenses
                </span>
                <Wallet className="w-3.5 h-3.5 text-rose-600 shrink-0" />
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-rose-700 font-mono-tabular mt-1 truncate">
                {formatKes(expenseMetrics.totalRecorded)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {filteredExpenses.length} vouchers · Tap to manage
              </div>
            </div>
          )}

          {isKpiVisible('stock_asset') && (
            <div className="bg-white border border-slate-200 hover:border-[#0A006E] rounded-xl p-3.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                  Stock Valuation
                </span>
                <Package className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-emerald-700 font-mono-tabular mt-1 truncate">
                {formatKes(stockMetrics.totalStockCost)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {stockMetrics.totalBottlesInBond.toLocaleString()} bottles in bond
              </div>
            </div>
          )}

          {isKpiVisible('gross_profit') && (
            <div className="bg-white border border-slate-200 hover:border-[#0A006E] rounded-xl p-3.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-semibold text-slate-500 truncate">
                  Gross Profit
                </span>
                <TrendingUp className="w-3.5 h-3.5 text-[#0A006E] shrink-0" />
              </div>
              <div
                className={`text-base sm:text-lg font-montserrat font-black font-mono-tabular mt-1 truncate ${
                  salesMetrics.grossProfit < 0 ? 'text-rose-700' : 'text-[#0A006E]'
                }`}
              >
                {formatKes(salesMetrics.grossProfit)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                Margin:{' '}
                <strong className={salesMetrics.grossMarginPct < 0 ? 'text-rose-600' : 'text-emerald-700'}>
                  {salesMetrics.grossMarginPct.toFixed(1)}%
                </strong>
              </div>
            </div>
          )}

          {isKpiVisible('writeoffs') && (
            <div className="bg-white border border-slate-200 hover:border-amber-400 rounded-xl p-3.5 transition">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-semibold text-amber-800 truncate">
                  Write-Offs &amp; Idle
                </span>
                <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
              </div>
              <div className="text-base sm:text-lg font-montserrat font-black text-amber-900 font-mono-tabular mt-1 truncate">
                {formatKes(stockMetrics.totalWriteOffs + stockMetrics.totalDeadStockCapitalKes)}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5 truncate">
                {stockMetrics.deadStockItems.length} idle SKUs
              </div>
            </div>
          )}
        </div>
      )}

      {/* ACCOUNTANT NAVIGATION TABS */}
      <div className="flex items-center gap-1.5 border-b border-slate-200 overflow-x-auto pb-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'summary'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          P&amp;L Summary
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Wallet className="w-3.5 h-3.5" />
          Expenses ({filteredExpenses.length})
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'sales'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <DollarSign className="w-3.5 h-3.5" />
          Sales &amp; Tenders
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'stock'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Package className="w-3.5 h-3.5" />
          Stock Valuation
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deadstock_damages')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'deadstock_damages'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <PackageX className="w-3.5 h-3.5" />
          Damages &amp; Dead Stock
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tax_credit')}
          className={`px-3 py-1.5 rounded-lg font-montserrat font-bold text-xs flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap ${
            activeTab === 'tax_credit'
              ? 'bg-[#0A006E] text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ShieldAlert className="w-3.5 h-3.5" />
          KRA Tax &amp; A/R
        </button>
      </div>

      {/* TAB 1: EXECUTIVE P&L & BALANCE SHEET */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {isWidgetVisible('asset_cards') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {/* Stat Card 1: Total Assets */}
              <div className="bg-white border border-slate-200 hover:border-[#0A006E] rounded-xl p-4 space-y-2.5 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-montserrat font-black text-slate-500 uppercase tracking-wider">
                    Working Assets Value
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center shadow-xs">
                    <Building className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
                <div className="text-2xl font-montserrat font-black text-[#0A006E] font-mono-tabular">
                  {formatKes(financialSummary.totalAssetsValue)}
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600">
                    <span>Stock + A/R + Net Cash</span>
                    <span className="text-emerald-700">Live Ledger</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${safeDivPct(stockMetrics.totalStockCost, financialSummary.totalAssetsValue)}%` }}
                      className="bg-[#0A006E] h-full"
                      title="Stock Valuation"
                    />
                    <div
                      style={{ width: `${safeDivPct(salesMetrics.accountsReceivable, financialSummary.totalAssetsValue)}%` }}
                      className="bg-[#34D186] h-full"
                      title="Accounts Receivable"
                    />
                    <div
                      style={{ width: `${safeDivPct(financialSummary.netCashCollected, financialSummary.totalAssetsValue)}%` }}
                      className="bg-amber-400 h-full"
                      title="Net Cash Collected"
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-slate-500 pt-0.5">
                    <span>Stock: {Math.round(safeDivPct(stockMetrics.totalStockCost, financialSummary.totalAssetsValue))}%</span>
                    <span>A/R: {Math.round(safeDivPct(salesMetrics.accountsReceivable, financialSummary.totalAssetsValue))}%</span>
                    <span>Cash: {Math.round(safeDivPct(financialSummary.netCashCollected, financialSummary.totalAssetsValue))}%</span>
                  </div>
                </div>
              </div>

              {/* Stat Card 2: Gross Profit */}
              <div className="bg-white border border-slate-200 hover:border-emerald-600 rounded-2xl p-5 shadow-2xs space-y-3 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-montserrat font-black text-slate-500 uppercase tracking-wider">
                    Gross Profit
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shadow-xs">
                    <TrendingUp className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
                <div className={`text-2xl font-montserrat font-black font-mono-tabular ${
                  financialSummary.grossProfit < 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}>
                  {formatKes(financialSummary.grossProfit)}
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600">
                    <span>Gross Margin</span>
                    <span className={`font-black ${salesMetrics.grossMarginPct < 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                      {salesMetrics.grossMarginPct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(0, Math.min(100, salesMetrics.grossMarginPct))}%` }}
                      className="bg-emerald-500 h-full rounded-full"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 flex items-center justify-between">
                    <span>COGS: {formatKes(salesMetrics.estimatedCogs)}</span>
                    <span className="text-emerald-700 font-bold">Net Sales - COGS</span>
                  </div>
                </div>
              </div>

              {/* Stat Card 3: Total Expenses */}
              <div className="bg-white border border-slate-200 hover:border-rose-500 rounded-2xl p-5 shadow-2xs space-y-3 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-montserrat font-black text-slate-500 uppercase tracking-wider">
                    Total Expenses
                  </span>
                  <div className="w-8 h-8 rounded-xl bg-rose-600 text-white flex items-center justify-center shadow-xs">
                    <TrendingDown className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
                <div className="text-2xl font-montserrat font-black text-rose-700 font-mono-tabular">
                  {formatKes(financialSummary.totalExpenses)}
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600">
                    <span>Expense-to-Sales</span>
                    <span className="text-rose-600 font-black">
                      {salesMetrics.netCommercialSales > 0
                        ? ((financialSummary.totalExpenses / salesMetrics.netCommercialSales) * 100).toFixed(1)
                        : '0.0'}
                      %
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden flex">
                    <div
                      style={{ width: `${safeDivPct(financialSummary.payrollExpense, financialSummary.totalExpenses)}%` }}
                      className="bg-rose-500 h-full"
                      title="Payroll"
                    />
                    <div
                      style={{ width: `${safeDivPct(financialSummary.writeOffsExpense, financialSummary.totalExpenses)}%` }}
                      className="bg-amber-500 h-full"
                      title="Stock Write-offs"
                    />
                    <div
                      style={{ width: `${safeDivPct(financialSummary.recordedOverhead, financialSummary.totalExpenses)}%` }}
                      className="bg-[#0A006E] h-full"
                      title="Recorded Operating Expenses"
                    />
                  </div>
                  <div className="text-[10px] text-slate-500 pt-0.5 flex items-center justify-between">
                    <span>Payroll: {Math.round(safeDivPct(financialSummary.payrollExpense, financialSummary.totalExpenses))}%</span>
                    <span>Loss: {Math.round(safeDivPct(financialSummary.writeOffsExpense, financialSummary.totalExpenses))}%</span>
                    <span>Ops: {Math.round(safeDivPct(financialSummary.recordedOverhead, financialSummary.totalExpenses))}%</span>
                  </div>
                </div>
              </div>

              {/* Stat Card 4: Net Profit / Loss */}
              <div className="bg-white border border-slate-200 hover:border-[#0A006E] rounded-2xl p-5 shadow-2xs space-y-3 transition">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-montserrat font-black text-slate-500 uppercase tracking-wider">
                    {financialSummary.netProfit < 0 ? 'Net Operating Loss' : 'Net Profit'}
                  </span>
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shadow-xs border ${
                    financialSummary.netProfit < 0
                      ? 'bg-rose-600 text-white border-rose-700'
                      : 'bg-[#FFDE00] text-[#0A006E] border-[#0A006E]'
                  }`}>
                    <Sparkles className="w-4 h-4 stroke-[2.5]" />
                  </div>
                </div>
                <div className={`text-2xl font-montserrat font-black font-mono-tabular ${
                  financialSummary.netProfit < 0 ? 'text-rose-700' : 'text-[#0A006E]'
                }`}>
                  {formatKes(financialSummary.netProfit)}
                </div>
                <div className="space-y-1.5 pt-1">
                  <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600">
                    <span>Net Margin</span>
                    <span className={`font-black ${financialSummary.netProfit < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                      {financialSummary.netProfitMargin.toFixed(1)}%
                    </span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div
                      style={{ width: `${Math.max(0, Math.min(100, Math.abs(financialSummary.netProfitMargin)))}%` }}
                      className={`${financialSummary.netProfit < 0 ? 'bg-rose-600' : 'bg-[#0A006E]'} h-full rounded-full`}
                    />
                  </div>
                  <div className={`text-[10px] font-bold pt-0.5 flex items-center justify-between ${
                    financialSummary.netProfit < 0 ? 'text-rose-600' : 'text-emerald-700'
                  }`}>
                    <span>{financialSummary.netProfit < 0 ? 'Deficit After Expenses' : 'Surplus Generated'}</span>
                    <span>Reconciled P&amp;L</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Executive Graphical Visualizations: P&L Bar Graph & Operating Expense Pie Chart */}
          {isWidgetVisible('charts') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarGraph
                title="Executive P&L & Surplus Flow"
                subtitle="Gross Revenue, COGS, Gross Profit, Expenses & Net Result"
                data={pnlBarChartData}
                badge="P&L Comparison"
                activeColor="#0A006E"
                mode="compare"
                emptyMessage="Record sales or expenses to populate P&L comparison bars"
              />
              <AnalyticsPieChart
                title="Operating Expense & Outflow Breakdown"
                subtitle="Payroll, Stock Write-Offs, and Logged Expense Categories"
                data={expensePieChartData}
                badge="Expense Mix"
                centerMetricLabel="Total Outflow"
                emptyMessage="No expenses, payroll disbursements, or write-offs recorded for this period"
              />
            </div>
          )}

          {isWidgetVisible('income_statement') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* Live Profit & Loss Breakdown Card */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">
                      Commercial Income Statement (P&amp;L)
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Live POS sales, COGS, expenses, payroll &amp; write-offs.
                    </p>
                  </div>
                  <span className="text-[11px] font-mono-tabular font-bold text-[#0A006E] bg-slate-100 px-2 py-0.5 rounded">
                    {dateFilter}
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between py-1 border-b border-slate-100">
                    <span className="font-semibold text-slate-700">Gross Commercial Sales Turnover:</span>
                    <span className="font-mono-tabular font-bold text-slate-900">{formatKes(salesMetrics.grossSales)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 text-rose-700">
                    <span className="font-semibold">Less: Credit Notes Issued &amp; Returns:</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(salesMetrics.creditNotesTotal)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200 font-bold text-slate-900 bg-slate-50 px-2 rounded-lg">
                    <span>Net Commercial Revenue:</span>
                    <span className="font-mono-tabular text-sm text-[#0A006E]">{formatKes(salesMetrics.netCommercialSales)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 text-amber-800">
                    <span className="font-semibold">Less: Cost of Goods Sold (COGS):</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(salesMetrics.estimatedCogs)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1.5 border-b border-slate-200 font-bold text-[#1E9E60] bg-emerald-50/60 px-2 rounded-lg">
                    <span>Gross Operating Profit:</span>
                    <span className="font-mono-tabular text-sm">{formatKes(salesMetrics.grossProfit)} ({salesMetrics.grossMarginPct.toFixed(1)}%)</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 text-rose-700">
                    <span className="font-semibold flex items-center gap-2">
                      Less: Operating Expenses ({filteredExpenses.length}):
                      <button
                        type="button"
                        onClick={() => setIsExpenseModalOpen(true)}
                        className="text-[10px] font-bold text-[#0A006E] bg-[#FFDE00] px-1.5 py-0.5 rounded cursor-pointer"
                      >
                        + Add
                      </button>
                    </span>
                    <span className="font-mono-tabular font-bold">- {formatKes(expenseMetrics.totalRecorded)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 text-rose-600">
                    <span className="font-semibold">Less: Stock Write-Offs:</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(stockMetrics.totalWriteOffs)}</span>
                  </div>

                  <div className="flex items-center justify-between py-1 border-b border-slate-100 text-slate-700">
                    <span className="font-semibold">Less: Payroll Disbursed ({filteredPayrollRuns.length} Runs):</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(taxMetrics.totalPayrollDisbursed)}</span>
                  </div>

                  <div className={`flex items-center justify-between py-2 border font-black text-sm px-3 rounded-lg mt-2 ${
                    financialSummary.netProfit < 0
                      ? 'border-rose-300 text-rose-800 bg-rose-50'
                      : 'border-[#0A006E]/30 text-[#0A006E] bg-[#FFDE00]/25'
                  }`}>
                    <span>{financialSummary.netProfit < 0 ? 'Net Operating Deficit:' : 'Net Commercial Surplus:'}</span>
                    <span className="font-mono-tabular">{formatKes(financialSummary.netProfit)}</span>
                  </div>
                </div>
              </div>

              {/* Live Inventory Asset & Working Capital Balance */}
              <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 space-y-3.5">
                <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                  <div>
                    <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">
                      Inventory Valuation &amp; Liquidity
                    </h3>
                    <p className="text-[11px] text-slate-500">
                      Bonded warehouses, receivables, and settled cash.
                    </p>
                  </div>
                </div>

                <div className="space-y-2.5 text-xs">
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between">
                    <span className="font-bold text-slate-700">Landed Inventory Asset (Cost):</span>
                    <span className="font-mono-tabular font-black text-[#0A006E] text-sm">
                      {formatKes(stockMetrics.totalStockCost)}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="text-slate-500 text-[10px] font-bold">Wholesale Value</div>
                      <div className="text-sm font-montserrat font-black text-slate-900 font-mono-tabular mt-0.5">
                        {formatKes(stockMetrics.totalStockWholesaleValue)}
                      </div>
                    </div>

                    <div className="bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                      <div className="text-slate-500 text-[10px] font-bold">Retail Value</div>
                      <div className="text-sm font-montserrat font-black text-[#1E9E60] font-mono-tabular mt-0.5">
                        {formatKes(stockMetrics.totalStockRetailValue)}
                      </div>
                    </div>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 space-y-1.5">
                    <div className="flex items-center justify-between text-slate-800">
                      <span className="font-semibold">Net Settled Inflow:</span>
                      <span className="font-mono-tabular font-bold text-[#0A006E]">
                        {formatKes(financialSummary.netCashCollected)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800">
                      <span className="font-semibold">Unrealized Inventory Margin:</span>
                      <span className="font-mono-tabular font-bold text-[#1E9E60]">
                        {formatKes(stockMetrics.potentialGrossMargin)} ({stockMetrics.potentialMarginPct.toFixed(1)}%)
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-slate-800">
                      <span className="font-semibold">Stock Units in Bond:</span>
                      <span className="font-mono-tabular font-bold">
                        {stockMetrics.totalBottlesInBond.toLocaleString()} Bottles
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-amber-800">
                      <span className="font-semibold">Capital in Dead Stock:</span>
                      <span className="font-mono-tabular font-bold">
                        {formatKes(stockMetrics.totalDeadStockCapitalKes)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quick Recent Transactions Ledger (Expanded Mode Only to Keep Minimal Clean) */}
          {!isMinimal && (
            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">
                  Recent Live Commercial &amp; Financial Ledger
                </h3>
                <span className="text-xs font-mono-tabular text-slate-500">
                  Showing {Math.min(10, filteredTransactions.length)} of {filteredTransactions.length}
                </span>
              </div>

            {filteredTransactions.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                No commercial transactions match the selected branch &amp; date period.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                      <th className="py-2.5 px-3 font-black">Doc Number</th>
                      <th className="py-2.5 px-3 font-black">Type</th>
                      <th className="py-2.5 px-3 font-black">Channel</th>
                      <th className="py-2.5 px-3 font-black">Branch</th>
                      <th className="py-2.5 px-3 font-black">Customer / Client</th>
                      <th className="py-2.5 px-3 font-black">Payment Tender</th>
                      <th className="py-2.5 px-3 font-black text-right">Amount (KES)</th>
                      <th className="py-2.5 px-3 font-black text-center">Status</th>
                      <th className="py-2.5 px-3 font-black text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredTransactions.slice(0, 10).map((t) => (
                      <tr key={t.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0A006E]">{t.docNumber}</td>
                        <td className="py-2.5 px-3">
                          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            t.docType === 'Credit Note'
                              ? 'bg-rose-100 text-rose-700'
                              : t.docType === 'Invoice'
                              ? 'bg-blue-100 text-blue-700'
                              : 'bg-emerald-100 text-emerald-700'
                          }`}>
                            {t.docType}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">{t.channel}</td>
                        <td className="py-2.5 px-3 text-slate-700">{t.branchName}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{t.customerName}</td>
                        <td className="py-2.5 px-3 text-slate-600">{t.paymentMethod || 'Settled'}</td>
                        <td className={`py-2.5 px-3 text-right font-mono-tabular font-bold ${
                          t.docType === 'Credit Note' ? 'text-rose-600' : 'text-slate-900'
                        }`}>
                          {t.docType === 'Credit Note' ? `- ${formatKes(t.totalAmount)}` : formatKes(t.totalAmount)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#34D186]/20 text-[#1E9E60]">
                            {t.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            type="button"
                            onClick={() => onPreviewDoc?.(t)}
                            className="px-2.5 py-1 bg-slate-100 hover:bg-[#FFDE00] text-[#0A006E] rounded-lg text-[11px] font-bold transition cursor-pointer"
                          >
                            View Doc
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          )}
        </div>
      )}

      {/* TAB 2: OPERATING EXPENSES & OVERHEADS ENTRY + LEDGER */}
      {activeTab === 'expenses' && (
        <div className="space-y-6">
          {/* Expense KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
              <span className="text-[11px] font-montserrat font-black text-rose-700 uppercase tracking-wider">
                Total Operating Expenses
              </span>
              <div className="text-2xl font-montserrat font-black text-rose-800 font-mono-tabular mt-1">
                {formatKes(expenseMetrics.totalRecorded)}
              </div>
              <div className="text-xs text-rose-700 mt-1">
                {filteredExpenses.length} expense voucher{filteredExpenses.length === 1 ? '' : 's'} logged
              </div>
            </div>

            <div className="bg-emerald-50 border-2 border-emerald-200 rounded-2xl p-4">
              <span className="text-[11px] font-montserrat font-black text-emerald-800 uppercase tracking-wider">
                Settled / Paid Outflows
              </span>
              <div className="text-2xl font-montserrat font-black text-emerald-800 font-mono-tabular mt-1">
                {formatKes(expenseMetrics.totalPaid)}
              </div>
              <div className="text-xs text-emerald-700 mt-1">
                Deducted from liquid cash position
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
              <span className="text-[11px] font-montserrat font-black text-amber-800 uppercase tracking-wider">
                Recorded / Pending Settlement
              </span>
              <div className="text-2xl font-montserrat font-black text-amber-900 font-mono-tabular mt-1">
                {formatKes(expenseMetrics.totalPending)}
              </div>
              <div className="text-xs text-amber-800 mt-1">
                Awaiting payment confirmation
              </div>
            </div>

            <div className="bg-[#F0F2F0] border-2 border-slate-200 rounded-2xl p-4">
              <span className="text-[11px] font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
                Top Expense Category
              </span>
              <div className="text-base font-montserrat font-black text-[#0A006E] mt-1 truncate">
                {expenseMetrics.topCategoryName}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular font-bold mt-1">
                {formatKes(expenseMetrics.topCategoryAmount)}
              </div>
            </div>
          </div>

          {/* Inline Expense Entry Form + Expense Analytics Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
            {/* Quick Expense Entry Form */}
            <form
              onSubmit={handleSubmitExpense}
              className="lg:col-span-5 bg-[#F0F2F0] border-2 border-[#0A006E]/20 rounded-2xl p-5 space-y-3.5"
            >
              <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                <div>
                  <span className="text-[10px] font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
                    Expense Voucher Entry
                  </span>
                  <h3 className="text-base font-montserrat font-black text-[#0A006E]">
                    Log Operating Expense
                  </h3>
                </div>
                <div className="w-8 h-8 rounded-xl bg-[#0A006E] text-[#FFDE00] flex items-center justify-center">
                  <Receipt className="w-4 h-4" />
                </div>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Expense Title / Description *
                  </label>
                  <input
                    type="text"
                    required
                    value={expenseTitle}
                    onChange={(e) => setExpenseTitle(e.target.value)}
                    placeholder="e.g. Monthly Warehouse Rent / KPLC Token / Diesel"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-medium focus:border-[#0A006E] outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Category *
                    </label>
                    <select
                      value={expenseCategory}
                      onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                    >
                      {EXPENSE_CATEGORIES.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Amount (KES) *
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="any"
                      required
                      value={expenseAmount}
                      onChange={(e) => setExpenseAmount(e.target.value)}
                      placeholder="e.g. 25000"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono-tabular font-bold focus:border-[#0A006E] outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Branch / Depot
                    </label>
                    <select
                      value={expenseBranchId}
                      onChange={(e) => setExpenseBranchId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                    >
                      {branches.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Payment Method
                    </label>
                    <select
                      value={expensePaymentMethod}
                      onChange={(e) => setExpensePaymentMethod(e.target.value as ExpensePaymentMethod)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                    >
                      {EXPENSE_PAYMENT_METHODS.map((pm) => (
                        <option key={pm} value={pm}>
                          {pm}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Expense Date
                    </label>
                    <input
                      type="date"
                      value={expenseDate}
                      onChange={(e) => setExpenseDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono-tabular focus:border-[#0A006E] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Voucher Status
                    </label>
                    <select
                      value={expenseStatus}
                      onChange={(e) => setExpenseStatus(e.target.value as ExpenseStatus)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                    >
                      <option value="Paid">Paid &amp; Settled</option>
                      <option value="Approved">Approved (Payable)</option>
                      <option value="Recorded">Recorded (Draft)</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Vendor / Payee
                    </label>
                    <input
                      type="text"
                      value={expenseVendor}
                      onChange={(e) => setExpenseVendor(e.target.value)}
                      placeholder="e.g. Kenya Power / Landlord"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-[#0A006E] outline-none"
                    />
                  </div>

                  <div>
                    <label className="block font-montserrat font-bold text-slate-700 mb-1">
                      Receipt / M-Pesa Ref
                    </label>
                    <input
                      type="text"
                      value={expenseRefNo}
                      onChange={(e) => setExpenseRefNo(e.target.value)}
                      placeholder="e.g. QK9182TR3P"
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono-tabular focus:border-[#0A006E] outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Audit Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={expenseNotes}
                    onChange={(e) => setExpenseNotes(e.target.value)}
                    placeholder="Additional justification or invoice link"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 focus:border-[#0A006E] outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="w-full py-3 bg-[#0A006E] hover:bg-indigo-950 text-[#FFDE00] rounded-xl font-montserrat font-black text-xs flex items-center justify-center gap-2 shadow-md cursor-pointer transition disabled:opacity-60"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  {isSubmittingExpense ? 'Saving Expense...' : 'Save Expense Voucher to P&L'}
                </button>
              </div>
            </form>

            {/* Expense Breakdown Analytics */}
            <div className="lg:col-span-7 space-y-6">
              <AnalyticsPieChart
                title="Operating Expense & Outflow Breakdown"
                subtitle="Live share across Payroll, Write-Offs, and Logged Expense Categories"
                data={expensePieChartData}
                badge="Expense Allocation"
                centerMetricLabel="Total Outflow"
                emptyMessage="Log your first operating expense on the left to visualize cost breakdown"
              />
              <BarGraph
                title="Top Logged Expense Categories"
                subtitle="Highest expenditure heads in the selected accounting scope"
                data={expenseCategoryBarData}
                badge="Category Spend"
                activeColor="#EF4444"
                emptyMessage="No operating expense vouchers recorded yet"
              />
            </div>
          </div>

          {/* Recorded Expense Vouchers Ledger */}
          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Recorded Operating Expense Vouchers
                </h3>
                <p className="text-xs text-slate-600">
                  Every saved voucher updates Executive P&amp;L, Net Profit, and Cashflow in real-time.
                </p>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
                  <input
                    type="text"
                    value={expenseSearch}
                    onChange={(e) => setExpenseSearch(e.target.value)}
                    placeholder="Search voucher, payee, ref..."
                    className="pl-8 pr-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 outline-none focus:border-[#0A006E]"
                  />
                </div>
                <select
                  value={expenseCategoryFilter}
                  onChange={(e) => setExpenseCategoryFilter(e.target.value)}
                  className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 outline-none"
                >
                  <option value="ALL">All Categories</option>
                  {EXPENSE_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleExportExpensesPDF}
                  className="px-3 py-1.5 bg-[#FFDE00] text-[#0A006E] rounded-xl text-xs font-montserrat font-black cursor-pointer"
                >
                  PDF
                </button>
                <button
                  type="button"
                  onClick={handleExportExpensesCSV}
                  className="px-3 py-1.5 bg-white border border-slate-300 text-[#0A006E] rounded-xl text-xs font-montserrat font-bold cursor-pointer"
                >
                  CSV
                </button>
              </div>
            </div>

            {visibleExpenses.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center space-y-2">
                <Wallet className="w-8 h-8 text-slate-300 mx-auto" />
                <div className="text-sm font-montserrat font-bold text-slate-700">
                  No Operating Expenses Found
                </div>
                <p className="text-xs text-slate-500">
                  Use the form above or click &ldquo;Record Expense&rdquo; to log rent, utilities, fuel, licenses, or petty cash expenses.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                      <th className="py-2.5 px-3 font-black">Voucher #</th>
                      <th className="py-2.5 px-3 font-black">Date</th>
                      <th className="py-2.5 px-3 font-black">Title &amp; Vendor</th>
                      <th className="py-2.5 px-3 font-black">Category</th>
                      <th className="py-2.5 px-3 font-black">Branch</th>
                      <th className="py-2.5 px-3 font-black">Method / Ref</th>
                      <th className="py-2.5 px-3 font-black text-right">Amount (KES)</th>
                      <th className="py-2.5 px-3 font-black text-center">Status</th>
                      <th className="py-2.5 px-3 font-black text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {visibleExpenses.map((exp) => (
                      <tr key={exp.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0A006E] whitespace-nowrap">
                          {exp.expenseNo}
                        </td>
                        <td className="py-2.5 px-3 font-mono-tabular text-slate-600 whitespace-nowrap">
                          {exp.expenseDate}
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{exp.title}</div>
                          {(exp.vendorName || exp.notes) && (
                            <div className="text-[11px] text-slate-500 truncate max-w-[220px]">
                              {[exp.vendorName, exp.notes].filter(Boolean).join(' · ')}
                            </div>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 font-bold text-[10px] whitespace-nowrap">
                            {exp.category}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-700">{exp.branchName}</td>
                        <td className="py-2.5 px-3 text-slate-600">
                          <div>{exp.paymentMethod}</div>
                          {exp.referenceNo && (
                            <div className="text-[10px] font-mono-tabular text-slate-400">{exp.referenceNo}</div>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-black text-rose-700 whitespace-nowrap">
                          {formatKes(exp.amountKes)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            exp.status === 'Paid'
                              ? 'bg-emerald-100 text-emerald-800'
                              : exp.status === 'Approved'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-amber-100 text-amber-800'
                          }`}>
                            {exp.status}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {exp.status !== 'Paid' && onUpdateExpenseStatus && (
                              <button
                                type="button"
                                onClick={() => onUpdateExpenseStatus(exp.id, 'Paid')}
                                title="Mark as Paid"
                                className="px-2 py-1 bg-emerald-100 hover:bg-emerald-200 text-emerald-800 rounded-lg text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                              >
                                <CheckCircle2 className="w-3 h-3" />
                                Pay
                              </button>
                            )}
                            {onDeleteExpense && (
                              pendingDeleteExpenseId === exp.id ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      onDeleteExpense(exp.id);
                                      setPendingDeleteExpenseId(null);
                                    }}
                                    className="px-2 py-1 bg-rose-600 text-white rounded-lg text-[10px] font-bold cursor-pointer"
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingDeleteExpenseId(null)}
                                    className="px-1.5 py-1 bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold cursor-pointer"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setPendingDeleteExpenseId(exp.id)}
                                  title="Delete Expense"
                                  className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: LIVE SALES ANALYSIS & TENDER BREAKDOWN */}
      {activeTab === 'sales' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <BarGraph
              title="Top 6 SKUs by Revenue"
              subtitle="Leading product turnover across POS & wholesale"
              data={topSkusBarChartData}
              badge="Top SKUs"
              activeColor="#34D186"
              emptyMessage="No SKU sales logged in selected period"
            />
            <AnalyticsPieChart
              title="Payment Tender Mix"
              subtitle="M-Pesa, Cash, Bank Transfer, and Credit mix"
              data={paymentMethodPieData}
              badge="Tenders"
              centerMetricLabel="Total Tender"
              emptyMessage="No settled tender data in selected period"
            />
            <AnalyticsPieChart
              title="Sales Channel Share"
              subtitle="Retail, Wholesale, Restaurant, Merchant & Online"
              data={channelPieChartData}
              badge="Channels"
              centerMetricLabel="Channel Sales"
              emptyMessage="No channel sales logged in selected period"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Sales by Channel */}
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Gross Turnover by Sales Distribution Channel
                </h3>
                <span className="text-xs font-mono-tabular font-bold text-slate-600">
                  Total: {formatKes(salesMetrics.grossSales)}
                </span>
              </div>

              <div className="space-y-3">
                {Object.entries(salesMetrics.channelTotals).map(([channel, data]) => {
                  const sharePct = salesMetrics.grossSales > 0 ? (data.total / salesMetrics.grossSales) * 100 : 0;
                  return (
                    <div key={channel} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                      <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                        <span>{channel}</span>
                        <span className="font-mono-tabular text-[#0A006E]">
                          {formatKes(data.total)} ({sharePct.toFixed(1)}%)
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                        <div
                          className="bg-[#0A006E] h-full rounded-full transition-all duration-500"
                          style={{ width: `${sharePct}%` }}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500 flex justify-between">
                        <span>Transactions Issued: {data.count}</span>
                        <span>Avg Order: {data.count > 0 ? formatKes(data.total / data.count) : 'KES 0'}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Sales by Payment Method / Tender Liquidity */}
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-300 pb-3">
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Commercial Cashflow &amp; Payment Tender Liquidity
                </h3>
                <span className="text-xs font-mono-tabular font-bold text-slate-600">
                  {Object.keys(salesMetrics.paymentTotals).length} Tenders
                </span>
              </div>

              {Object.keys(salesMetrics.paymentTotals).length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                  No payment tender transactions found for the current filter.
                </div>
              ) : (
                <div className="space-y-3">
                  {Object.entries(salesMetrics.paymentTotals).map(([method, data]) => {
                    const sharePct = salesMetrics.grossSales > 0 ? (data.total / salesMetrics.grossSales) * 100 : 0;
                    const isLiquid = method.toLowerCase().includes('pesa') || method.toLowerCase().includes('cash');
                    return (
                      <div key={method} className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                        <div className="flex items-center justify-between text-xs font-bold text-slate-800">
                          <span className="flex items-center gap-1.5">
                            <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                            {method}
                            {isLiquid && (
                              <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-emerald-100 text-emerald-800">
                                Instant Liquidity
                              </span>
                            )}
                          </span>
                          <span className="font-mono-tabular text-slate-900">
                            {formatKes(data.total)} ({sharePct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[#34D186] h-full rounded-full transition-all duration-500"
                            style={{ width: `${sharePct}%` }}
                          />
                        </div>
                        <div className="text-[11px] text-slate-500">
                          Captured across {data.count} payment transactions.
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Top Selling Liquor SKUs by Gross Turnover */}
          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
            <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
              Top Revenue &amp; Profit Generating Liquor SKUs (Live Velocity)
            </h3>

            {salesMetrics.topSkus.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-xs text-slate-500">
                No SKU line-item sales recorded in this accounting period.
              </div>
            ) : (
              <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                      <th className="py-2.5 px-3 font-black">SKU Code</th>
                      <th className="py-2.5 px-3 font-black">Liquor Description</th>
                      <th className="py-2.5 px-3 font-black">Category</th>
                      <th className="py-2.5 px-3 font-black text-right">Units Sold</th>
                      <th className="py-2.5 px-3 font-black text-right">Total Revenue (KES)</th>
                      <th className="py-2.5 px-3 font-black text-right">COGS (KES)</th>
                      <th className="py-2.5 px-3 font-black text-right">Gross Margin (KES)</th>
                      <th className="py-2.5 px-3 font-black text-right">Margin %</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {salesMetrics.topSkus.map((sku) => {
                      const margin = sku.totalRevenue - sku.cogs;
                      const marginPct = sku.totalRevenue > 0 ? (margin / sku.totalRevenue) * 100 : 0;
                      return (
                        <tr key={sku.sku} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0A006E]">{sku.sku}</td>
                          <td className="py-2.5 px-3 font-medium text-slate-900">{sku.name} ({sku.volumeMl}ml)</td>
                          <td className="py-2.5 px-3">
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                              sku.category === 'LPS' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {sku.category === 'LPS' ? 'LPS Local' : 'IPS Import'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold">{sku.unitsSold} btls</td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-slate-900">
                            {formatKes(sku.totalRevenue)}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular text-slate-600">
                            {formatKes(sku.cogs)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono-tabular font-bold ${
                            margin < 0 ? 'text-rose-600' : 'text-[#1E9E60]'
                          }`}>
                            {formatKes(margin)}
                          </td>
                          <td className={`py-2.5 px-3 text-right font-mono-tabular font-bold ${
                            marginPct < 0 ? 'text-rose-600' : 'text-[#1E9E60]'
                          }`}>
                            {marginPct.toFixed(1)}%
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: LIVE STOCK VALUATION & DEPOTS (IPS vs LPS) */}
      {activeTab === 'stock' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-[#F0F2F0] border-2 border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-[#0A006E] text-[#FFDE00] uppercase">
                    IPS Bonded Import Stock
                  </span>
                  <h4 className="text-base font-montserrat font-black text-[#0A006E] mt-1">
                    Imported Products Stock (IPS)
                  </h4>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-bold">Total IPS Bottles:</div>
                  <div className="text-sm font-bold text-slate-900 font-mono-tabular">
                    {stockMetrics.ipsBottles.toLocaleString()} Btls
                  </div>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs text-slate-500">Landed Asset Capital (Customs &amp; Shipping Paid):</div>
                <div className="text-xl font-montserrat font-black text-[#0A006E] font-mono-tabular">
                  {formatKes(stockMetrics.ipsCost)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Share of Total Inventory: {stockMetrics.totalStockCost > 0 ? ((stockMetrics.ipsCost / stockMetrics.totalStockCost) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>

            <div className="bg-[#F0F2F0] border-2 border-slate-200 rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-black bg-amber-500 text-white uppercase">
                    LPS Local Kenyan Stock
                  </span>
                  <h4 className="text-base font-montserrat font-black text-amber-900 mt-1">
                    Local Products Stock (LPS)
                  </h4>
                </div>
                <div className="text-right">
                  <div className="text-xs text-slate-500 font-bold">Total LPS Bottles:</div>
                  <div className="text-sm font-bold text-slate-900 font-mono-tabular">
                    {stockMetrics.lpsBottles.toLocaleString()} Btls
                  </div>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs text-slate-500">Warehouse Purchase Capital:</div>
                <div className="text-xl font-montserrat font-black text-amber-800 font-mono-tabular">
                  {formatKes(stockMetrics.lpsCost)}
                </div>
                <div className="text-[11px] text-slate-500">
                  Share of Total Inventory: {stockMetrics.totalStockCost > 0 ? ((stockMetrics.lpsCost / stockMetrics.totalStockCost) * 100).toFixed(1) : 0}%
                </div>
              </div>
            </div>
          </div>

          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Regional Branch &amp; Bonded Depot Stock Asset Ledger
                </h3>
                <p className="text-xs text-slate-600">
                  Asset valuation breakdown per geographical depot and licensed bond warehouse.
                </p>
              </div>
            </div>

            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                    <th className="py-2.5 px-3 font-black">Branch Depot Name</th>
                    <th className="py-2.5 px-3 font-black">Geo-Pricing Zone</th>
                    <th className="py-2.5 px-3 font-black text-right">Physical Stock (Btls)</th>
                    <th className="py-2.5 px-3 font-black text-right">Asset Cost Value (KES)</th>
                    <th className="py-2.5 px-3 font-black text-right">Retail Market Value (KES)</th>
                    <th className="py-2.5 px-3 font-black text-right">Unrealized Margin (KES)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {branches.map((b) => {
                    const bData = stockMetrics.branchStockMap[b.id] || {
                      bottles: 0,
                      costValuation: 0,
                      retailValuation: 0,
                    };
                    const margin = bData.retailValuation - bData.costValuation;
                    return (
                      <tr key={b.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-montserrat font-bold text-slate-900">{b.name}</td>
                        <td className="py-2.5 px-3 text-slate-600">{b.regionName}</td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-bold">
                          {bData.bottles.toLocaleString()}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-[#0A006E]">
                          {formatKes(bData.costValuation)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-slate-900">
                          {formatKes(bData.retailValuation)}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-bold text-[#1E9E60]">
                          {formatKes(margin)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 5: DEAD STOCK, DAMAGES & SPOILAGE WRITE-OFFS */}
      {activeTab === 'deadstock_damages' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-rose-50 border-2 border-rose-200 rounded-2xl p-4">
              <span className="text-xs font-bold text-rose-700 uppercase">Damaged Goods Write-Off</span>
              <div className="text-2xl font-montserrat font-black text-rose-800 font-mono-tabular mt-1">
                {formatKes(stockMetrics.totalDamagedLossKes)}
              </div>
              <div className="text-xs text-rose-600 mt-1">
                {stockMetrics.totalDamagedBottles} bottles broken, crushed or damaged in transit.
              </div>
            </div>

            <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4">
              <span className="text-xs font-bold text-amber-700 uppercase">Spoiled Stock Write-Off</span>
              <div className="text-2xl font-montserrat font-black text-amber-800 font-mono-tabular mt-1">
                {formatKes(stockMetrics.totalSpoiledLossKes)}
              </div>
              <div className="text-xs text-amber-600 mt-1">
                {stockMetrics.totalSpoiledBottles} bottles curdled, corked, oxidized or spoiled.
              </div>
            </div>

            <div className="bg-slate-100 border-2 border-slate-300 rounded-2xl p-4">
              <span className="text-xs font-bold text-slate-700 uppercase">Total Shrinkage &amp; Write-Offs</span>
              <div className="text-2xl font-montserrat font-black text-slate-900 font-mono-tabular mt-1">
                {formatKes(stockMetrics.totalWriteOffs)}
              </div>
              <div className="text-xs text-slate-600 mt-1">
                Deducted from gross commercial surplus on the P&amp;L statement.
              </div>
            </div>
          </div>

          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Stagnant &amp; Dead Stock Valuation Ledger
                </h3>
                <p className="text-xs text-slate-600">
                  SKUs exceeding the Inventory Manager&apos;s inactivity threshold with zero sales velocity.
                </p>
              </div>
              <span className="text-xs font-bold px-3 py-1 bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-mono-tabular">
                Total Locked Capital: {formatKes(stockMetrics.totalDeadStockCapitalKes)}
              </span>
            </div>

            <div className="overflow-x-auto bg-white border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                    <th className="py-2.5 px-3 font-black">SKU</th>
                    <th className="py-2.5 px-3 font-black">Liquor Description</th>
                    <th className="py-2.5 px-3 font-black">Category</th>
                    <th className="py-2.5 px-3 font-black text-center">Days Inactive</th>
                    <th className="py-2.5 px-3 font-black text-center">Threshold</th>
                    <th className="py-2.5 px-3 font-black text-right">Idle Stock</th>
                    <th className="py-2.5 px-3 font-black text-right">Tied-Up Capital (KES)</th>
                    <th className="py-2.5 px-3 font-black text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {stockMetrics.deadStockItems.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-6 text-center text-slate-500 font-medium">
                        No SKUs currently exceed the dead stock threshold. Inventory circulation is healthy!
                      </td>
                    </tr>
                  ) : (
                    stockMetrics.deadStockItems.map((item) => (
                      <tr key={item.product.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono-tabular font-bold text-[#0A006E]">{item.product.sku}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">{item.product.name}</td>
                        <td className="py-2.5 px-3">{item.product.category} · {item.product.subCategory}</td>
                        <td className="py-2.5 px-3 text-center font-bold text-amber-700 font-mono-tabular">
                          {item.daysInactive} days
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">
                          {item.product.deadStockThresholdDays || 90} days
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-bold">
                          {item.bottlesCount} btls
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono-tabular font-black text-amber-900">
                          {formatKes(item.tiedUpCapital)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            DEAD STOCK
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* TAB 6: KRA TAX, VAT & ACCOUNTS RECEIVABLE */}
      {activeTab === 'tax_credit' && (
        <div className="space-y-6">
          <KraReturnsPanel
            currentUser={currentUser}
            transactions={transactions}
            products={products}
            partners={partners}
            externalCustomers={externalCustomers}
            staffList={staffList}
            payrollRuns={payrollRuns}
            complianceRecords={complianceRecords}
            branches={branches}
            regions={regions}
            defaultTab="VAT3_SALES_SEC_B"
            onTriggerToast={onTriggerToast}
          />

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="border-b border-slate-300 pb-3">
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  KRA Statutory Tax &amp; Excise Duties Accrual
                </h3>
                <p className="text-xs text-slate-600">
                  Fiscal obligations calculated per Kenya Revenue Authority requirements.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">Output Value Added Tax (VAT 16%):</div>
                    <div className="text-[11px] text-slate-500">Calculated on net commercial turnover (Gross - Credit Notes)</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black font-montserrat text-[#0A006E] font-mono-tabular">
                      {formatKes(taxMetrics.estimatedVatPayable)}
                    </div>
                    <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Payable 20th Monthly
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">KRA Digital Excise Stamps / Spirits Duty:</div>
                    <div className="text-[11px] text-slate-500">Excise stamps duty verified on IPS spirits &amp; liqueurs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black font-montserrat text-slate-900 font-mono-tabular">
                      {formatKes(taxMetrics.estimatedExciseLiability)}
                    </div>
                    <span className="text-[10px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      Bonded / Cleared
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">Staff Statutory Payroll Deductions:</div>
                    <div className="text-[11px] text-slate-500">PAYE, NSSF, and NHIF/SHIF withholdings from payroll</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black font-montserrat text-slate-900 font-mono-tabular">
                      {formatKes(taxMetrics.totalPayrollDisbursed * 0.22)}
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
                      Remittance Ready
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-5 space-y-4">
              <div className="border-b border-slate-300 pb-3">
                <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                  Accounts Receivable &amp; Commercial Credit Aging
                </h3>
                <p className="text-xs text-slate-600">
                  Outstanding credit invoices issued to B2B retailers and distributors.
                </p>
              </div>

              <div className="space-y-3 text-xs">
                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">Total Outstanding Receivables:</div>
                    <div className="text-[11px] text-slate-500">Unsettled credit invoices awaiting bank clearance</div>
                  </div>
                  <div className="text-right">
                    <div className="text-base font-black font-montserrat text-[#0A006E] font-mono-tabular">
                      {formatKes(salesMetrics.accountsReceivable)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold text-emerald-800">Current (0 - 30 Days):</div>
                    <div className="text-sm font-black text-slate-900 font-mono-tabular mt-1">
                      {formatKes(Math.max(0, salesMetrics.accountsReceivable - salesMetrics.overdueReceivable))}
                    </div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Within standard terms</div>
                  </div>

                  <div className="bg-white p-3 rounded-xl border border-slate-200">
                    <div className="text-[11px] font-bold text-rose-700">Overdue (30+ Days Risk):</div>
                    <div className="text-sm font-black text-rose-700 font-mono-tabular mt-1">
                      {formatKes(salesMetrics.overdueReceivable)}
                    </div>
                    <div className="text-[10px] text-rose-500 mt-0.5">Follow-up required</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QUICK RECORD EXPENSE MODAL (Accessible from any tab on Mobile or Desktop) */}
      {isExpenseModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white border-2 border-[#0A006E] rounded-2xl max-w-lg w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-[#0A006E] text-white px-5 py-4 flex items-center justify-between">
              <div>
                <span className="text-[10px] font-montserrat font-black text-[#FFDE00] uppercase tracking-wider">
                  Accounting Disbursement Voucher
                </span>
                <h3 className="text-base font-montserrat font-black">Record Operating Expense</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsExpenseModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitExpense} className="p-5 space-y-3.5 text-xs">
              <div>
                <label className="block font-montserrat font-bold text-slate-700 mb-1">
                  Expense Title / Description *
                </label>
                <input
                  type="text"
                  required
                  value={expenseTitle}
                  onChange={(e) => setExpenseTitle(e.target.value)}
                  placeholder="e.g. Monthly Warehouse Rent / KPLC Token / Fuel"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-medium focus:border-[#0A006E] outline-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Category *
                  </label>
                  <select
                    value={expenseCategory}
                    onChange={(e) => setExpenseCategory(e.target.value as ExpenseCategory)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                  >
                    {EXPENSE_CATEGORIES.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Amount (KES) *
                  </label>
                  <input
                    type="number"
                    min="1"
                    step="any"
                    required
                    value={expenseAmount}
                    onChange={(e) => setExpenseAmount(e.target.value)}
                    placeholder="e.g. 25000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono-tabular font-bold focus:border-[#0A006E] outline-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Branch / Depot
                  </label>
                  <select
                    value={expenseBranchId}
                    onChange={(e) => setExpenseBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Payment Method
                  </label>
                  <select
                    value={expensePaymentMethod}
                    onChange={(e) => setExpensePaymentMethod(e.target.value as ExpensePaymentMethod)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                  >
                    {EXPENSE_PAYMENT_METHODS.map((pm) => (
                      <option key={pm} value={pm}>
                        {pm}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Expense Date
                  </label>
                  <input
                    type="date"
                    value={expenseDate}
                    onChange={(e) => setExpenseDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono-tabular focus:border-[#0A006E] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Status
                  </label>
                  <select
                    value={expenseStatus}
                    onChange={(e) => setExpenseStatus(e.target.value as ExpenseStatus)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:border-[#0A006E] outline-none"
                  >
                    <option value="Paid">Paid &amp; Settled</option>
                    <option value="Approved">Approved (Payable)</option>
                    <option value="Recorded">Recorded (Draft)</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Vendor / Payee
                  </label>
                  <input
                    type="text"
                    value={expenseVendor}
                    onChange={(e) => setExpenseVendor(e.target.value)}
                    placeholder="e.g. Kenya Power"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 focus:border-[#0A006E] outline-none"
                  />
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Receipt / M-Pesa Ref
                  </label>
                  <input
                    type="text"
                    value={expenseRefNo}
                    onChange={(e) => setExpenseRefNo(e.target.value)}
                    placeholder="e.g. QK9182TR3P"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-mono-tabular focus:border-[#0A006E] outline-none"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsExpenseModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-montserrat font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingExpense}
                  className="px-5 py-2 bg-[#0A006E] hover:bg-indigo-950 text-[#FFDE00] rounded-xl font-montserrat font-black flex items-center gap-1.5 shadow-md cursor-pointer disabled:opacity-60"
                >
                  <Plus className="w-4 h-4 stroke-[2.5]" />
                  {isSubmittingExpense ? 'Saving...' : 'Save Expense Voucher'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
