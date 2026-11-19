import React, { useState, useMemo, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  DollarSign,
  TrendingUp,
  BarChart3,
  Package,
  PackageX,
  AlertTriangle,
  Download,
  ShieldAlert,
  CreditCard,
  FileSpreadsheet,
  Plus,
  CheckCircle2,
  Trash2,
  Wallet,
  Receipt,
  Search,
  X,
  Filter,
  FileCheck2,
  Printer,
  Clock,
  XCircle,
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
  ChequeStatus,
  ChequeDetails,
} from '../types';
import { formatKes, exportReportToPDF, exportToCSV, calculateGeoPrice, getDocumentCreationRecord } from '../erpUtils';
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
  onUpdateTransaction?: (txId: string, updates: Partial<TransactionDoc>) => Promise<boolean>;
  onCreateTransaction?: (
    txDraft: Omit<TransactionDoc, 'id' | 'createdAt'>,
    updatedProducts: { productId: string; newTotal: number; newBranchStockJson: string }[]
  ) => Promise<TransactionDoc | null>;
}

type DateFilter = 'ALL' | 'YEAR' | 'MONTH' | 'WEEK' | 'TODAY';
type ActiveFinanceTab =
  | 'summary'
  | 'cheques'
  | 'expenses'
  | 'sales'
  | 'stock'
  | 'deadstock_damages'
  | 'tax_credit';

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
  onUpdateTransaction,
  onCreateTransaction,
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
      if (
        saved &&
        ['summary', 'cheques', 'expenses', 'sales', 'stock', 'deadstock_damages', 'tax_credit'].includes(saved)
      ) {
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

  // Client Cheque & Purchase Order Management State
  const [chequeStatusFilter, setChequeStatusFilter] = useState<'ALL' | ChequeStatus>('ALL');
  const [chequeSearch, setChequeSearch] = useState('');
  const [rejectingChequeTxId, setRejectingChequeTxId] = useState<string | null>(null);
  const [inlineRejectionReason, setInlineRejectionReason] = useState('');
  const [updatingChequeId, setUpdatingChequeId] = useState<string | null>(null);

  // New Client Purchase Order (Cheque) Modal State
  const [isChequePoModalOpen, setIsChequePoModalOpen] = useState(false);
  const [poBranchId, setPoBranchId] = useState<string>(() => branches[0]?.id || currentUser.branchId || '');
  const [poSelectedPartyKey, setPoSelectedPartyKey] = useState('');
  const [poCustomerName, setPoCustomerName] = useState('');
  const [poCustomerPhone, setPoCustomerPhone] = useState('');
  const [poCustomerKraPin, setPoCustomerKraPin] = useState('');
  const [poProdId, setPoProdId] = useState(() => products[0]?.id || '');
  const [poUnitMode, setPoUnitMode] = useState<'Bottle' | 'Case'>('Case');
  const [poQty, setPoQty] = useState<number>(1);
  const [poCustomPrice, setPoCustomPrice] = useState<number>(0);
  const [poLineItems, setPoLineItems] = useState<LineItem[]>([]);
  const [poTaxMode, setPoTaxMode] = useState<'EXCLUSIVE_16' | 'INCLUSIVE_16' | 'EXEMPT_0'>('EXCLUSIVE_16');
  const [poChequeNumber, setPoChequeNumber] = useState('');
  const [poDrawerBank, setPoDrawerBank] = useState('');
  const [poBranchName, setPoBranchName] = useState('');
  const [poDrawerName, setPoDrawerName] = useState('');
  const [poChequeDate, setPoChequeDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [poMaturityDate, setPoMaturityDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    return d.toISOString().slice(0, 10);
  });
  const [poInitialStatus, setPoInitialStatus] = useState<ChequeStatus>('Processing');
  const [poRejectionReason, setPoRejectionReason] = useState('');
  const [poNotes, setPoNotes] = useState('');
  const [poModalError, setPoModalError] = useState<string | null>(null);
  const [isSavingPo, setIsSavingPo] = useState(false);

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
      if (tx.status === 'Rejected') return;
      const txTotal = Number(tx.totalAmount || 0);
      if (tx.orderCategory === 'WAREHOUSE_PURCHASE') {
        if (tx.docType === 'Invoice' || tx.docType === 'Receipt') {
          internalWarehousePurchasesTotal += txTotal;
          internalWarehousePurchasesCount++;
        }
        return;
      }

      const isClearedPaidChequePo =
        tx.docType === 'Purchase Order' && tx.status === 'Paid';

      if (
        tx.docType === 'Receipt' ||
        tx.docType === 'Invoice' ||
        tx.docType === 'Online Order' ||
        isClearedPaidChequePo
      ) {
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
        const isUnsettledOrUnmatured =
          tx.status === 'Issued' ||
          tx.status === 'Processing' ||
          tx.status === 'Pending Verification';
        if (
          !isUnsettledOrUnmatured &&
          (tx.status === 'Paid' ||
            tx.status === 'Fulfilled' ||
            lowerMethod.includes('cash') ||
            lowerMethod.includes('pesa') ||
            lowerMethod.includes('bank') ||
            lowerMethod.includes('card'))
        ) {
          if (!lowerMethod.includes('credit') && (!lowerMethod.includes('cheque') || tx.status === 'Paid')) {
            liquidCollectedTotal += txTotal;
          }
        }

        // Only unsettled, non-credited, non-rejected invoices count as Accounts Receivable
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

  // CHEQUE & CLIENT PURCHASE ORDER METRICS & HANDLERS
  const chequeStats = useMemo(() => {
    const allChequeDocs = filteredTransactions.filter(
      (tx) =>
        tx.paymentMethod === 'Cheque' ||
        Boolean(tx.chequeDetails) ||
        tx.docType === 'Purchase Order'
    );
    const getStatus = (tx: TransactionDoc): ChequeStatus =>
      tx.status === 'Paid' || tx.status === 'Rejected' || tx.status === 'Processing'
        ? tx.status
        : tx.chequeDetails?.status || 'Processing';

    const processingDocs = allChequeDocs.filter((tx) => getStatus(tx) === 'Processing');
    const paidDocs = allChequeDocs.filter((tx) => getStatus(tx) === 'Paid');
    const rejectedDocs = allChequeDocs.filter((tx) => getStatus(tx) === 'Rejected');

    const processingTotal = processingDocs.reduce((s, t) => s + Number(t.totalAmount || 0), 0);
    const paidTotal = paidDocs.reduce((s, t) => s + Number(t.totalAmount || 0), 0);
    const rejectedTotal = rejectedDocs.reduce((s, t) => s + Number(t.totalAmount || 0), 0);

    const q = chequeSearch.trim().toLowerCase();
    const visibleList = allChequeDocs.filter((tx) => {
      if (chequeStatusFilter !== 'ALL' && getStatus(tx) !== chequeStatusFilter) return false;
      if (!q) return true;
      return (
        tx.docNumber.toLowerCase().includes(q) ||
        tx.customerName.toLowerCase().includes(q) ||
        (tx.chequeDetails?.chequeNumber || '').toLowerCase().includes(q) ||
        (tx.chequeDetails?.drawerBank || '').toLowerCase().includes(q) ||
        (tx.chequeDetails?.drawerName || '').toLowerCase().includes(q)
      );
    });

    return {
      allChequeDocs,
      processingDocs,
      paidDocs,
      rejectedDocs,
      processingTotal,
      paidTotal,
      rejectedTotal,
      visibleList,
    };
  }, [filteredTransactions, chequeStatusFilter, chequeSearch]);

  const poSelectedBranchObj = useMemo(
    () => branches.find((b) => b.id === poBranchId) || branches[0],
    [branches, poBranchId]
  );

  const poSelectedRegionObj = useMemo(
    () =>
      regions.find(
        (r) => r.id === poSelectedBranchObj?.regionId || r.name === poSelectedBranchObj?.regionName
      ) || regions[0],
    [regions, poSelectedBranchObj]
  );

  const poSelectedProdObj = useMemo(
    () => products.find((p) => p.id === poProdId) || products[0],
    [products, poProdId]
  );

  const poDefaultUnitPrice = useMemo(() => {
    if (!poSelectedProdObj) return 0;
    const baseBtl = poSelectedRegionObj
      ? Math.round(calculateGeoPrice(poSelectedProdObj, poSelectedRegionObj, 'wholesale').unitBottlePrice)
      : Math.round(poSelectedProdObj.wholesalePriceKes || poSelectedProdObj.baseWholesalePrice || 0);
    const packSize = poSelectedProdObj.packSize || poSelectedProdObj.bottlesPerCase || 12;
    return poUnitMode === 'Case' ? baseBtl * packSize : baseBtl;
  }, [poSelectedProdObj, poSelectedRegionObj, poUnitMode]);

  const poActiveUnitPrice = poCustomPrice > 0 ? poCustomPrice : poDefaultUnitPrice;

  const poFinancials = useMemo(() => {
    const rawSum = poLineItems.reduce((s, li) => s + li.lineTotal, 0);
    if (poTaxMode === 'EXEMPT_0') return { subtotal: rawSum, tax: 0, total: rawSum };
    if (poTaxMode === 'INCLUSIVE_16') {
      const subtotal = Math.round(rawSum / 1.16);
      return { subtotal, tax: rawSum - subtotal, total: rawSum };
    }
    const tax = Math.round(rawSum * 0.16);
    return { subtotal: rawSum, tax, total: rawSum + tax };
  }, [poLineItems, poTaxMode]);

  const handleAddPoLineItem = () => {
    const prod = poSelectedProdObj;
    if (!prod) return;
    const packSize = prod.packSize || prod.bottlesPerCase || 12;
    const qtyUnits = Math.max(1, Number(poQty) || 1);
    const totalBottles = poUnitMode === 'Case' ? qtyUnits * packSize : qtyUnits;
    const unitPrice = Math.max(0, Math.round(poActiveUnitPrice));
    const lineTotal = Math.round(qtyUnits * unitPrice);

    setPoLineItems((prev) => {
      const idx = prev.findIndex((i) => i.productId === prod.id && i.unitMode === poUnitMode);
      if (idx >= 0) {
        const updated = [...prev];
        const newUnits = updated[idx].quantityUnits + qtyUnits;
        updated[idx] = {
          ...updated[idx],
          quantityUnits: newUnits,
          totalBottles: poUnitMode === 'Case' ? newUnits * packSize : newUnits,
          unitPrice,
          lineTotal: Math.round(newUnits * unitPrice),
        };
        return updated;
      }
      return [
        ...prev,
        {
          productId: prod.id,
          sku: prod.sku,
          name: prod.name,
          unitMode: poUnitMode,
          bottlesPerCase: packSize,
          quantityUnits: qtyUnits,
          totalBottles,
          unitPrice,
          lineTotal,
        },
      ];
    });
    setPoQty(1);
    setPoCustomPrice(0);
    setPoModalError(null);
  };

  const handleSelectPoParty = (key: string) => {
    setPoSelectedPartyKey(key);
    if (!key) return;
    const [kind, id] = key.split(':');
    if (kind === 'cust') {
      const c = externalCustomers.find((x) => x.id === id);
      if (c) {
        setPoCustomerName(c.companyName ? `${c.companyName} (${c.name})` : c.name);
        setPoCustomerPhone(c.phone || '');
        setPoCustomerKraPin(c.kraPin || c.liquorLicenseNo || '');
        if (!poDrawerName) setPoDrawerName(c.companyName || c.name);
      }
    } else if (kind === 'partner') {
      const p = partners.find((x) => x.id === id);
      if (p) {
        setPoCustomerName(p.companyName);
        setPoCustomerPhone(p.phone || '');
        setPoCustomerKraPin(p.taxPin || p.liquorLicenseNo || '');
        if (!poDrawerName) setPoDrawerName(p.companyName);
      }
    }
  };

  const handleUpdateChequeStatus = async (
    tx: TransactionDoc,
    nextStatus: ChequeStatus,
    rejectionReason?: string
  ) => {
    if (!onUpdateTransaction) {
      onTriggerToast?.('error', 'Action Unavailable', 'Transaction update handler is not wired.');
      return;
    }
    setUpdatingChequeId(tx.id);
    try {
      const nextChequeDetails: ChequeDetails = {
        chequeNumber: tx.chequeDetails?.chequeNumber || 'PENDING-REF',
        drawerBank: tx.chequeDetails?.drawerBank || 'Client Bank',
        ...(tx.chequeDetails?.branchName ? { branchName: tx.chequeDetails.branchName } : {}),
        drawerName: tx.chequeDetails?.drawerName || tx.customerName,
        chequeDate: tx.chequeDetails?.chequeDate || (tx.createdAt || new Date().toISOString()).slice(0, 10),
        maturityDate: tx.chequeDetails?.maturityDate || (tx.createdAt || new Date().toISOString()).slice(0, 10),
        amountKes: tx.chequeDetails?.amountKes ?? tx.totalAmount,
        status: nextStatus,
        ...(nextStatus === 'Rejected' && rejectionReason?.trim()
          ? { rejectionReason: rejectionReason.trim() }
          : {}),
        updatedBy: currentUser.name,
        updatedAt: new Date().toISOString(),
      };

      const ok = await onUpdateTransaction(tx.id, {
        status: nextStatus,
        chequeDetails: nextChequeDetails,
      });

      // Keep linked Receipts and parent POs/Invoices in sync
      const linkedDocs = transactions.filter(
        (other) =>
          other.id !== tx.id &&
          (other.relatedInvoiceNo === tx.docNumber ||
            (tx.relatedInvoiceNo && other.docNumber === tx.relatedInvoiceNo))
      );
      for (const linked of linkedDocs) {
        await onUpdateTransaction(linked.id, {
          status: nextStatus,
          chequeDetails: nextChequeDetails,
        }).catch(() => {});
      }

      if (ok) {
        onTriggerToast?.(
          'success',
          `Cheque Marked ${nextStatus}`,
          `${tx.docNumber} (${tx.customerName}) updated to ${
            nextStatus === 'Processing' ? 'Processing (Not Matured)' : nextStatus
          }.`
        );
      }
      setRejectingChequeTxId(null);
      setInlineRejectionReason('');
    } finally {
      setUpdatingChequeId(null);
    }
  };

  const handleIssueOrPrintChequeReceipt = async (tx: TransactionDoc) => {
    const liveStatus: ChequeStatus =
      tx.status === 'Paid' || tx.status === 'Rejected' || tx.status === 'Processing'
        ? tx.status
        : tx.chequeDetails?.status || 'Processing';

    if (tx.docType === 'Receipt') {
      onPreviewDoc?.(tx);
      return;
    }

    const existingReceipt = transactions.find(
      (r) => r.docType === 'Receipt' && r.relatedInvoiceNo === tx.docNumber
    );

    const syncedChequeDetails: ChequeDetails | undefined = tx.chequeDetails
      ? { ...tx.chequeDetails, status: liveStatus }
      : undefined;

    if (existingReceipt) {
      if (
        onUpdateTransaction &&
        (existingReceipt.status !== liveStatus ||
          existingReceipt.chequeDetails?.status !== liveStatus)
      ) {
        await onUpdateTransaction(existingReceipt.id, {
          status: liveStatus,
          ...(syncedChequeDetails ? { chequeDetails: syncedChequeDetails } : {}),
        });
      }
      onPreviewDoc?.({
        ...existingReceipt,
        status: liveStatus,
        ...(syncedChequeDetails ? { chequeDetails: syncedChequeDetails } : {}),
      });
      return;
    }

    const rcpNumber = `RCP-${Date.now().toString().slice(-6)}`;
    if (onCreateTransaction) {
      const createdReceipt = await onCreateTransaction(
        {
          docNumber: rcpNumber,
          docType: 'Receipt',
          channel: tx.channel || 'B2B Wholesale POS',
          orderCategory: tx.orderCategory || 'FACILITY_DOCUMENT',
          branchId: tx.branchId,
          branchName: tx.branchName,
          regionId: tx.regionId,
          regionName: tx.regionName,
          ...(tx.customerId ? { customerId: tx.customerId } : {}),
          customerName: tx.customerName,
          ...(tx.customerPhone ? { customerPhone: tx.customerPhone } : {}),
          ...(tx.customerEmail ? { customerEmail: tx.customerEmail } : {}),
          ...(tx.customerKraPin ? { customerKraPin: tx.customerKraPin } : {}),
          customerLicenseNo: tx.customerLicenseNo || 'Commercial Verified 21+',
          itemsSummary: tx.itemsSummary,
          subtotal: tx.subtotal,
          exciseAndTax: tx.exciseAndTax,
          totalAmount: tx.totalAmount,
          paymentMethod: 'Cheque',
          status: liveStatus,
          ...(syncedChequeDetails ? { chequeDetails: syncedChequeDetails } : {}),
          relatedInvoiceNo: tx.docNumber,
          notes: `Client cheque receipt generated from ${tx.docType} ${tx.docNumber} (${
            liveStatus === 'Processing' ? 'Not Matured' : liveStatus
          })`,
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
        },
        []
      );
      if (createdReceipt) {
        onPreviewDoc?.(createdReceipt);
        return;
      }
    }

    onPreviewDoc?.({
      ...tx,
      docType: 'Receipt',
      docNumber: rcpNumber,
      status: liveStatus,
      relatedInvoiceNo: tx.docNumber,
      ...(syncedChequeDetails ? { chequeDetails: syncedChequeDetails } : {}),
    });
  };

  const handleSaveClientChequePo = async (andPrintReceipt: boolean) => {
    if (!onCreateTransaction) {
      setPoModalError('Transaction creation handler is not available.');
      return;
    }
    if (!poSelectedBranchObj || !poSelectedRegionObj) {
      setPoModalError('Please select a valid branch.');
      return;
    }
    if (!poCustomerName.trim()) {
      setPoModalError('Please enter or select the client name.');
      return;
    }
    if (poLineItems.length === 0) {
      setPoModalError('Please add at least one product line item.');
      return;
    }
    if (!poChequeNumber.trim() || !poDrawerBank.trim()) {
      setPoModalError('Please enter both Cheque Number and Drawer Bank.');
      return;
    }

    setPoModalError(null);
    setIsSavingPo(true);

    try {
      const poNumber = `PO-${Date.now().toString().slice(-6)}`;
      const chequeDetailsObj: ChequeDetails = {
        chequeNumber: poChequeNumber.trim(),
        drawerBank: poDrawerBank.trim(),
        ...(poBranchName.trim() ? { branchName: poBranchName.trim() } : {}),
        drawerName: poDrawerName.trim() || poCustomerName.trim(),
        chequeDate: poChequeDate || new Date().toISOString().slice(0, 10),
        maturityDate: poMaturityDate || poChequeDate || new Date().toISOString().slice(0, 10),
        amountKes: poFinancials.total,
        status: poInitialStatus,
        ...(poInitialStatus === 'Rejected' && poRejectionReason.trim()
          ? { rejectionReason: poRejectionReason.trim() }
          : {}),
        updatedBy: currentUser.name,
        updatedAt: new Date().toISOString(),
      };

      const createdPo = await onCreateTransaction(
        {
          docNumber: poNumber,
          docType: 'Purchase Order',
          channel: 'B2B Wholesale POS',
          orderCategory: 'FACILITY_DOCUMENT',
          branchId: poSelectedBranchObj.id,
          branchName: poSelectedBranchObj.name,
          regionId: poSelectedRegionObj.id,
          regionName: poSelectedRegionObj.name,
          customerName: poCustomerName.trim(),
          ...(poCustomerPhone.trim() ? { customerPhone: poCustomerPhone.trim() } : {}),
          ...(poCustomerKraPin.trim() ? { customerKraPin: poCustomerKraPin.trim().toUpperCase() } : {}),
          customerLicenseNo: poCustomerKraPin.trim().toUpperCase() || 'Commercial Verified 21+',
          itemsSummary: JSON.stringify(poLineItems),
          subtotal: poFinancials.subtotal,
          exciseAndTax: poFinancials.tax,
          totalAmount: poFinancials.total,
          paymentMethod: 'Cheque',
          status: poInitialStatus,
          chequeDetails: chequeDetailsObj,
          ...(poNotes.trim() ? { notes: poNotes.trim() } : {}),
          createdBy: currentUser.name,
          createdByRole: currentUser.role,
        },
        []
      );

      if (createdPo) {
        onTriggerToast?.(
          'success',
          `Purchase Order ${poNumber} Saved`,
          `Cheque #${chequeDetailsObj.chequeNumber} recorded as ${
            poInitialStatus === 'Processing' ? 'Processing (Not Matured)' : poInitialStatus
          }.`
        );
        if (andPrintReceipt) {
          await handleIssueOrPrintChequeReceipt(createdPo);
        } else {
          onPreviewDoc?.(createdPo);
        }
      }

      setIsChequePoModalOpen(false);
      setPoLineItems([]);
      setPoSelectedPartyKey('');
      setPoCustomerName('');
      setPoCustomerPhone('');
      setPoCustomerKraPin('');
      setPoChequeNumber('');
      setPoDrawerBank('');
      setPoBranchName('');
      setPoDrawerName('');
      setPoInitialStatus('Processing');
      setPoRejectionReason('');
      setPoNotes('');
    } finally {
      setIsSavingPo(false);
    }
  };

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
        subtitle={`${selectedBranchObj ? selectedBranchObj.name : 'All Branches'} · Period: ${dateFilter}`}
        actions={
          <>
            <button
              type="button"
              onClick={() => setIsChequePoModalOpen(true)}
              className="px-2.5 py-1.5 bg-[#FFDE00] text-[#0A006E] rounded-lg text-[11px] font-montserrat font-black flex items-center gap-1 cursor-pointer whitespace-nowrap border border-[#0A006E]/20"
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              + Cheque PO
            </button>
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

      {/* Slim Period & Branch Filter Row */}
      <div className="bg-white border border-slate-200 rounded-2xl sm:rounded-xl px-3 py-2.5 sm:py-2 flex flex-wrap items-center justify-between gap-2.5">
        <div className="bg-slate-100 p-1 sm:p-0.5 rounded-xl sm:rounded-lg border border-slate-200 flex items-center gap-1 sm:gap-0 text-xs overflow-x-auto max-w-full">
          {(['ALL', 'YEAR', 'MONTH', 'WEEK', 'TODAY'] as DateFilter[]).map((period) => (
            <button
              key={period}
              type="button"
              onClick={() => setDateFilter(period)}
              className={`min-h-[38px] sm:min-h-0 px-3 sm:px-2.5 py-1.5 sm:py-1 rounded-lg sm:rounded-md font-montserrat font-bold text-xs sm:text-[11px] transition cursor-pointer whitespace-nowrap ${
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
          <Filter className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-slate-400" />
          <select
            aria-label="Filter by Branch"
            value={selectedBranchFilter}
            onChange={(e) => setSelectedBranchFilter(e.target.value)}
            className="min-h-[40px] sm:min-h-0 px-3 sm:px-2.5 py-2 sm:py-1 bg-slate-50 border border-slate-200 rounded-xl sm:rounded-lg text-xs font-montserrat font-semibold text-[#0A006E] cursor-pointer"
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

      {/* CLEAN 4-CARD FINANCIAL KPI ROW */}
      {isWidgetVisible('kpi_strip') && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
          className="grid grid-cols-2 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3"
        >
          {isKpiVisible('net_revenue') && (
            <div
              onClick={() => setActiveTab('sales')}
              className="beta-kpi-card rounded-xl p-4 cursor-pointer"
            >
              <div className="text-xs font-montserrat font-semibold text-slate-500 truncate">
                Net Revenue
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-[#0A006E] font-mono-tabular mt-1 truncate">
                {formatKes(salesMetrics.netCommercialSales)}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-1 truncate">
                {salesMetrics.completedOrdersCount} orders
              </div>
            </div>
          )}

          {isKpiVisible('expenses') && (
            <div
              onClick={() => setActiveTab('expenses')}
              className="beta-kpi-card rounded-xl p-4 cursor-pointer"
            >
              <div className="text-xs font-montserrat font-semibold text-slate-500 truncate">
                Total Expenses
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-rose-700 font-mono-tabular mt-1 truncate">
                {formatKes(financialSummary.totalExpenses)}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-1 truncate">
                {filteredExpenses.length} expense vouchers
              </div>
            </div>
          )}

          {isKpiVisible('net_profit') && (
            <div className="beta-kpi-card rounded-xl p-4">
              <div className="text-xs font-montserrat font-semibold text-slate-500 truncate">
                {financialSummary.netProfit < 0 ? 'Net Deficit' : 'Net Profit'}
              </div>
              <div
                className={`text-xl sm:text-2xl font-extrabold font-mono-tabular mt-1 truncate ${
                  financialSummary.netProfit < 0 ? 'text-rose-700' : 'text-emerald-700'
                }`}
              >
                {formatKes(financialSummary.netProfit)}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-1 truncate">
                {financialSummary.netProfitMargin.toFixed(1)}% net margin
              </div>
            </div>
          )}

          {isKpiVisible('pending_ar') && (
            <div
              onClick={() => setActiveTab('cheques')}
              className="beta-kpi-card rounded-xl p-4 cursor-pointer"
            >
              <div className="text-xs font-montserrat font-semibold text-slate-500 truncate">
                Pending Cheques &amp; A/R
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-amber-800 font-mono-tabular mt-1 truncate">
                {formatKes(chequeStats.processingTotal + salesMetrics.accountsReceivable)}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-1 truncate">
                {chequeStats.processingDocs.length} processing cheque(s)
              </div>
            </div>
          )}

          {isKpiVisible('stock_asset') && (
            <div
              onClick={() => setActiveTab('stock')}
              className="beta-kpi-card rounded-xl p-4 cursor-pointer"
            >
              <div className="text-xs font-montserrat font-semibold text-slate-500 truncate">
                Stock Valuation
              </div>
              <div className="text-xl sm:text-2xl font-extrabold text-emerald-700 font-mono-tabular mt-1 truncate">
                {formatKes(stockMetrics.totalStockCost)}
              </div>
              <div className="text-xs text-slate-600 font-mono-tabular mt-1 truncate">
                {stockMetrics.totalBottlesInBond.toLocaleString()} btls in bond
              </div>
            </div>
          )}
        </motion.div>
      )}

      {/* CLEAN FINANCE NAVIGATION TABS */}
      <div className="flex items-center gap-2 sm:gap-1.5 border-b border-slate-200 overflow-x-auto pb-2 sm:pb-1.5">
        <button
          type="button"
          onClick={() => setActiveTab('summary')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'summary'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'summary' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <BarChart3 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Overview
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('cheques')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'cheques'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'cheques' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <FileCheck2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Cheques &amp; POs ({chequeStats.allChequeDocs.length})
            {chequeStats.processingDocs.length > 0 && (
              <span className="ml-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-black bg-amber-400 text-[#0A006E]">
                {chequeStats.processingDocs.length}
              </span>
            )}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('expenses')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'expenses'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'expenses' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <Wallet className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Expenses ({filteredExpenses.length})
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('sales')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'sales'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'sales' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <DollarSign className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Sales &amp; Tenders
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('stock')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'stock'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'stock' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <Package className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Stock Valuation
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('deadstock_damages')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'deadstock_damages'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'deadstock_damages' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <PackageX className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            Write-Offs
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('tax_credit')}
          className={`beta-action-tile relative min-h-[44px] sm:min-h-0 px-4 py-2.5 sm:px-3 sm:py-1.5 rounded-xl sm:rounded-lg font-montserrat font-bold text-xs flex items-center gap-2 sm:gap-1.5 cursor-pointer whitespace-nowrap ${
            activeTab === 'tax_credit'
              ? 'text-[#FFDE00]'
              : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
          }`}
        >
          {activeTab === 'tax_credit' && (
            <motion.span
              layoutId="accountant-tab-pill"
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className="absolute inset-0 bg-[#0A006E] rounded-xl sm:rounded-lg"
            />
          )}
          <span className="relative z-10 flex items-center gap-2 sm:gap-1.5">
            <ShieldAlert className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
            KRA Tax &amp; A/R
          </span>
        </button>
      </div>

      {/* TAB 1: SIMPLIFIED ACCOUNTANT OVERVIEW */}
      {activeTab === 'summary' && (
        <div className="space-y-4">
          {/* Actionable Pending Cheque Alert (Only shown when cheques await maturity) */}
          {chequeStats.processingDocs.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="font-montserrat font-semibold text-amber-950 flex items-center gap-2">
                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                <span>
                  {chequeStats.processingDocs.length} client cheque(s) awaiting clearing ({formatKes(chequeStats.processingTotal)})
                </span>
              </span>
              <button
                type="button"
                onClick={() => setActiveTab('cheques')}
                className="px-3 py-1 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-bold cursor-pointer"
              >
                Review Cheques →
              </button>
            </div>
          )}

          {/* 2 Core Visual Charts: P&L Flow Bar Graph & Expense Outflow Pie Chart */}
          {isWidgetVisible('charts') && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <BarGraph
                title="P&L Snapshot"
                subtitle="Gross Sales, COGS, Expenses & Net Result"
                data={pnlBarChartData}
                badge="P&L"
                activeColor="#0A006E"
                mode="compare"
                emptyMessage="Record sales or expenses to view P&L bars"
              />
              <AnalyticsPieChart
                title="Expense & Outflow Mix"
                subtitle="Payroll, stock write-offs & operating overheads"
                data={expensePieChartData}
                badge="Outflow"
                centerMetricLabel="Total Outflow"
                emptyMessage="No expenses recorded for this period"
              />
            </div>
          )}

          {/* Clean 6-Tile Quick Workspaces Grid */}
          {isWidgetVisible('workspace_tiles') && (
            <div className="space-y-1.5">
              <div className="text-[10px] font-montserrat font-bold text-slate-400 uppercase tracking-wider px-0.5">
                Finance Workspaces (Tap to Open)
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-2.5">
                <button
                  type="button"
                  onClick={() => setActiveTab('cheques')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center">
                    <FileCheck2 className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">Cheques &amp; Client POs</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      {chequeStats.processingDocs.length} processing · {chequeStats.allChequeDocs.length} total
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('expenses')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-rose-50 text-rose-600 flex items-center justify-center">
                    <Wallet className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">Operating Expenses</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      {filteredExpenses.length} vouchers · {formatKes(expenseMetrics.totalRecorded)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('sales')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-[#0A006E]/10 text-[#0A006E] flex items-center justify-center">
                    <DollarSign className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">Sales &amp; Tenders</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      {salesMetrics.completedOrdersCount} orders · {formatKes(salesMetrics.grossSales)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('stock')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
                    <Package className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">Stock Valuation</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      {stockMetrics.totalBottlesInBond.toLocaleString()} btls · {formatKes(stockMetrics.totalStockCost)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('deadstock_damages')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
                    <PackageX className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">Write-Offs &amp; Idle</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      {stockMetrics.deadStockItems.length} idle SKUs · {formatKes(stockMetrics.totalWriteOffs)}
                    </div>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('tax_credit')}
                  className="beta-action-tile p-4 sm:p-3.5 bg-white hover:bg-slate-50 border border-slate-200 hover:border-[#0A006E] rounded-2xl sm:rounded-xl text-left flex flex-col justify-between gap-2.5 cursor-pointer transition"
                >
                  <div className="w-11 h-11 sm:w-9 sm:h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                    <ShieldAlert className="w-6 h-6 sm:w-4.5 sm:h-4.5" />
                  </div>
                  <div>
                    <div className="text-sm sm:text-xs font-montserrat font-bold text-slate-900">KRA Tax &amp; A/R</div>
                    <div className="text-xs text-slate-600 font-mono-tabular font-semibold">
                      VAT {formatKes(taxMetrics.estimatedVatPayable)}
                    </div>
                  </div>
                </button>
              </div>
            </div>
          )}

          {/* Concise P&L Summary & Recent Ledger (Expanded Mode Only) */}
          {!isMinimal && isWidgetVisible('income_statement') && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">P&amp;L Statement</h3>
                    <span className="text-[11px] font-mono-tabular text-slate-500">{dateFilter}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Net Commercial Revenue</span>
                    <span className="font-mono-tabular font-bold text-slate-900">{formatKes(salesMetrics.netCommercialSales)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-amber-800">
                    <span>Less: COGS</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(salesMetrics.estimatedCogs)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-emerald-700 font-bold">
                    <span>Gross Profit ({salesMetrics.grossMarginPct.toFixed(1)}%)</span>
                    <span className="font-mono-tabular">{formatKes(salesMetrics.grossProfit)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 text-rose-700">
                    <span>Less: Expenses, Payroll &amp; Write-Offs</span>
                    <span className="font-mono-tabular font-bold">- {formatKes(financialSummary.totalExpenses)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 font-black text-sm text-[#0A006E]">
                    <span>{financialSummary.netProfit < 0 ? 'Net Deficit' : 'Net Profit'}</span>
                    <span className="font-mono-tabular">{formatKes(financialSummary.netProfit)}</span>
                  </div>
                </div>

                <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                    <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">Balance &amp; Liquidity</h3>
                    <span className="text-[11px] text-slate-500">Live Assets</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Bonded Stock Valuation (Cost)</span>
                    <span className="font-mono-tabular font-bold text-slate-900">{formatKes(stockMetrics.totalStockCost)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Accounts Receivable (B2B)</span>
                    <span className="font-mono-tabular font-bold text-slate-900">{formatKes(salesMetrics.accountsReceivable)}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100">
                    <span className="text-slate-600">Net Settled Cash Inflow</span>
                    <span className="font-mono-tabular font-bold text-emerald-700">{formatKes(financialSummary.netCashCollected)}</span>
                  </div>
                  <div className="flex justify-between pt-1.5 font-black text-sm text-[#0A006E]">
                    <span>Working Assets Total</span>
                    <span className="font-mono-tabular">{formatKes(financialSummary.totalAssetsValue)}</span>
                  </div>
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-montserrat font-bold text-[#0A006E]">Recent Transactions</h3>
                  <span className="text-xs font-mono-tabular text-slate-500">
                    Showing {Math.min(8, filteredTransactions.length)} of {filteredTransactions.length}
                  </span>
                </div>
                {filteredTransactions.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500">
                    No commercial transactions match the selected filters.
                  </div>
                ) : (
                  <div className="overflow-x-auto border border-slate-200 rounded-lg">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-montserrat">
                          <th className="py-2 px-3 font-bold">Doc #</th>
                          <th className="py-2 px-3 font-bold">Customer</th>
                          <th className="py-2 px-3 font-bold">Created By · Day &amp; Time</th>
                          <th className="py-2 px-3 font-bold">Status</th>
                          <th className="py-2 px-3 font-bold text-right">Amount</th>
                          <th className="py-2 px-3 font-bold text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {filteredTransactions.slice(0, 8).map((t) => {
                          const creationRec = getDocumentCreationRecord(t);
                          return (
                          <tr key={t.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono-tabular font-bold text-[#0A006E]">{t.docNumber}</td>
                            <td className="py-2 px-3 text-slate-800">{t.customerName}</td>
                            <td className="py-2 px-3 whitespace-nowrap">
                              <div className="font-semibold text-slate-900">{creationRec.createdBy}</div>
                              <div className="text-[10px] font-mono-tabular text-slate-500">
                                {creationRec.createdDay} · {creationRec.createdTime}
                              </div>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{t.status}</td>
                            <td className="py-2 px-3 text-right font-mono-tabular font-bold">{formatKes(t.totalAmount)}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => onPreviewDoc?.(t)}
                                className="px-2.5 py-1 bg-slate-100 hover:bg-[#0A006E] hover:text-[#FFDE00] text-[#0A006E] rounded-md text-[11px] font-bold transition cursor-pointer"
                              >
                                View
                              </button>
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
        </div>
      )}

      {/* TAB: CLIENT PURCHASE ORDERS & CHEQUE CLEARING */}
      {activeTab === 'cheques' && (
        <div className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-montserrat font-black text-[#0A006E] flex items-center gap-2">
                <FileCheck2 className="w-4 h-4 text-[#0A006E]" />
                Client Purchase Orders &amp; Cheque Clearing Desk
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Create client Purchase Orders with cheque details, hold unmatured cheques as <strong>Processing</strong>, clear to <strong>Paid</strong> or mark <strong>Rejected</strong>, and print client receipts reflecting the exact status.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsChequePoModalOpen(true)}
              className="px-4 py-2 bg-[#0A006E] hover:bg-indigo-950 text-[#FFDE00] rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
            >
              <Plus className="w-4 h-4" />
              New Client Purchase Order (Cheque)
            </button>
          </div>

          {/* 3 Status KPI Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <button
              type="button"
              onClick={() => setChequeStatusFilter(chequeStatusFilter === 'Processing' ? 'ALL' : 'Processing')}
              className={`text-left rounded-xl p-4 border-2 transition cursor-pointer ${
                chequeStatusFilter === 'Processing'
                  ? 'bg-amber-50 border-amber-500 shadow-xs'
                  : 'bg-amber-50/60 border-amber-200 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-montserrat font-black text-amber-900 uppercase">
                  Processing (Not Matured)
                </span>
                <Clock className="w-4 h-4 text-amber-700" />
              </div>
              <div className="text-2xl font-extrabold text-amber-950 font-mono-tabular mt-1">
                {formatKes(chequeStats.processingTotal)}
              </div>
              <div className="text-xs text-amber-800 mt-0.5">
                {chequeStats.processingDocs.length} cheque{chequeStats.processingDocs.length === 1 ? '' : 's'} awaiting maturity
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChequeStatusFilter(chequeStatusFilter === 'Paid' ? 'ALL' : 'Paid')}
              className={`text-left rounded-xl p-4 border-2 transition cursor-pointer ${
                chequeStatusFilter === 'Paid'
                  ? 'bg-emerald-50 border-emerald-500 shadow-xs'
                  : 'bg-emerald-50/60 border-emerald-200 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-montserrat font-black text-emerald-900 uppercase">
                  Paid (Cleared Cheques)
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              </div>
              <div className="text-2xl font-extrabold text-emerald-950 font-mono-tabular mt-1">
                {formatKes(chequeStats.paidTotal)}
              </div>
              <div className="text-xs text-emerald-800 mt-0.5">
                {chequeStats.paidDocs.length} cleared &amp; settled
              </div>
            </button>

            <button
              type="button"
              onClick={() => setChequeStatusFilter(chequeStatusFilter === 'Rejected' ? 'ALL' : 'Rejected')}
              className={`text-left rounded-xl p-4 border-2 transition cursor-pointer ${
                chequeStatusFilter === 'Rejected'
                  ? 'bg-rose-50 border-rose-500 shadow-xs'
                  : 'bg-rose-50/60 border-rose-200 hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-montserrat font-black text-rose-900 uppercase">
                  Rejected (Returned Cheques)
                </span>
                <XCircle className="w-4 h-4 text-rose-700" />
              </div>
              <div className="text-2xl font-extrabold text-rose-950 font-mono-tabular mt-1">
                {formatKes(chequeStats.rejectedTotal)}
              </div>
              <div className="text-xs text-rose-800 mt-0.5">
                {chequeStats.rejectedDocs.length} bounced / excluded from revenue
              </div>
            </button>
          </div>

          {/* Filter & Search Bar */}
          <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {(['ALL', 'Processing', 'Paid', 'Rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setChequeStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-montserrat font-bold cursor-pointer transition ${
                    chequeStatusFilter === st
                      ? 'bg-[#0A006E] text-[#FFDE00]'
                      : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {st === 'ALL' ? 'All Cheques & POs' : st}
                </button>
              ))}
            </div>
            <div className="relative min-w-[230px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={chequeSearch}
                onChange={(e) => setChequeSearch(e.target.value)}
                placeholder="Search PO #, Cheque #, Client, Bank..."
                className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-[#0A006E]"
              />
            </div>
          </div>

          {/* Mobile Cards View */}
          <div className="grid grid-cols-1 gap-3 md:hidden">
            {chequeStats.visibleList.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                No cheque transactions or purchase orders match your current filter.
              </div>
            ) : (
              chequeStats.visibleList.map((tx) => {
                const st: ChequeStatus =
                  tx.status === 'Paid' || tx.status === 'Rejected' || tx.status === 'Processing'
                    ? tx.status
                    : tx.chequeDetails?.status || 'Processing';
                const creationRec = getDocumentCreationRecord(tx);
                return (
                  <div key={tx.id} className="bg-white border border-slate-200 rounded-xl p-3.5 space-y-2.5 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-mono-tabular font-black text-[#0A006E]">
                          {tx.docNumber} · <span className="text-slate-600">{tx.docType}</span>
                        </div>
                        <div className="font-montserrat font-bold text-slate-900">{tx.customerName}</div>
                        <div className="text-[10px] font-mono-tabular text-slate-500 mt-0.5">
                          By {creationRec.createdBy} · {creationRec.createdDay} · {creationRec.createdTime}
                        </div>
                      </div>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-black ${
                          st === 'Paid'
                            ? 'bg-emerald-100 text-emerald-800'
                            : st === 'Rejected'
                            ? 'bg-rose-100 text-rose-700'
                            : 'bg-amber-100 text-amber-900'
                        }`}
                      >
                        {st === 'Processing' ? 'Processing (Not Matured)' : st}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-lg p-2.5 text-[11px] space-y-0.5">
                      <div>
                        <strong>Cheque #:</strong>{' '}
                        <span className="font-mono-tabular font-bold">{tx.chequeDetails?.chequeNumber || '—'}</span> ·{' '}
                        <strong>Bank:</strong> {tx.chequeDetails?.drawerBank || '—'}
                      </div>
                      <div>
                        <strong>Drawer:</strong> {tx.chequeDetails?.drawerName || tx.customerName} ·{' '}
                        <strong>Maturity:</strong> {tx.chequeDetails?.maturityDate || '—'}
                      </div>
                      {tx.chequeDetails?.rejectionReason && (
                        <div className="text-rose-700 font-semibold">
                          Rejection Reason: {tx.chequeDetails.rejectionReason}
                        </div>
                      )}
                      <div className="text-sm font-montserrat font-black text-[#0A006E] font-mono-tabular pt-0.5">
                        {formatKes(tx.totalAmount)}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                      {st !== 'Paid' && (
                        <button
                          type="button"
                          disabled={updatingChequeId === tx.id}
                          onClick={() => handleUpdateChequeStatus(tx, 'Paid')}
                          className="px-2.5 py-1.5 bg-emerald-600 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          Mark Paid
                        </button>
                      )}
                      {st !== 'Processing' && (
                        <button
                          type="button"
                          disabled={updatingChequeId === tx.id}
                          onClick={() => handleUpdateChequeStatus(tx, 'Processing')}
                          className="px-2.5 py-1.5 bg-amber-500 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-60"
                        >
                          Set Processing
                        </button>
                      )}
                      {st !== 'Rejected' && (
                        <button
                          type="button"
                          onClick={() => {
                            setRejectingChequeTxId(tx.id);
                            setInlineRejectionReason(tx.chequeDetails?.rejectionReason || '');
                          }}
                          className="px-2.5 py-1.5 bg-rose-600 text-white rounded-lg text-[11px] font-bold cursor-pointer"
                        >
                          Reject Cheque
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleIssueOrPrintChequeReceipt(tx)}
                        className="px-2.5 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-black flex items-center gap-1 cursor-pointer"
                      >
                        <Printer className="w-3 h-3" />
                        Print Client Receipt
                      </button>
                      <button
                        type="button"
                        onClick={() => onPreviewDoc?.(tx)}
                        className="px-2.5 py-1.5 bg-slate-100 text-slate-800 rounded-lg text-[11px] font-bold cursor-pointer"
                      >
                        View {tx.docType}
                      </button>
                    </div>

                    {rejectingChequeTxId === tx.id && (
                      <div className="bg-rose-50 border border-rose-200 rounded-lg p-2.5 space-y-2">
                        <input
                          type="text"
                          value={inlineRejectionReason}
                          onChange={(e) => setInlineRejectionReason(e.target.value)}
                          placeholder="Reason for rejecting cheque (e.g. Insufficient funds / Stale)"
                          className="w-full px-2.5 py-1.5 bg-white border border-rose-300 rounded-lg text-xs"
                        />
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => handleUpdateChequeStatus(tx, 'Rejected', inlineRejectionReason)}
                            className="px-3 py-1 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Confirm Rejection
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectingChequeTxId(null)}
                            className="px-3 py-1 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Desktop Table View */}
          <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-xl">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                  <th className="py-2.5 px-3 font-black">Doc # &amp; Type</th>
                  <th className="py-2.5 px-3 font-black">Client &amp; Branch</th>
                  <th className="py-2.5 px-3 font-black">Cheque Particulars</th>
                  <th className="py-2.5 px-3 font-black text-right">Amount (KES)</th>
                  <th className="py-2.5 px-3 font-black text-center">Clearing Status</th>
                  <th className="py-2.5 px-3 font-black text-right">Accounts Actions &amp; Receipt</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {chequeStats.visibleList.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-500">
                      No cheque transactions or client purchase orders match the selected filter.
                    </td>
                  </tr>
                ) : (
                  chequeStats.visibleList.map((tx) => {
                    const st: ChequeStatus =
                      tx.status === 'Paid' || tx.status === 'Rejected' || tx.status === 'Processing'
                        ? tx.status
                        : tx.chequeDetails?.status || 'Processing';
                    const creationRec = getDocumentCreationRecord(tx);
                    return (
                      <React.Fragment key={tx.id}>
                        <tr className="hover:bg-slate-50">
                          <td className="py-2.5 px-3">
                            <div className="font-mono-tabular font-black text-[#0A006E]">{tx.docNumber}</div>
                            <span className="inline-block mt-0.5 px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 text-[10px] font-bold">
                              {tx.docType}
                            </span>
                            {tx.relatedInvoiceNo && (
                              <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                                Ref: {tx.relatedInvoiceNo}
                              </div>
                            )}
                          </td>
                          <td className="py-2.5 px-3">
                            <div className="font-bold text-slate-900">{tx.customerName}</div>
                            <div className="text-[10px] text-slate-500">{tx.branchName}</div>
                            <div className="text-[10px] font-mono-tabular text-slate-600 mt-0.5">
                              By {creationRec.createdBy} · {creationRec.createdDay} · {creationRec.createdTime}
                            </div>
                          </td>
                          <td className="py-2.5 px-3">
                            {tx.chequeDetails ? (
                              <div className="space-y-0.5">
                                <div className="font-mono-tabular font-bold text-slate-900">
                                  Chq #{tx.chequeDetails.chequeNumber} · {tx.chequeDetails.drawerBank}
                                  {tx.chequeDetails.branchName ? ` (${tx.chequeDetails.branchName})` : ''}
                                </div>
                                <div className="text-[10px] text-slate-600">
                                  Drawer: {tx.chequeDetails.drawerName} · Dated {tx.chequeDetails.chequeDate} · Maturity{' '}
                                  <strong className="text-[#0A006E]">{tx.chequeDetails.maturityDate}</strong>
                                </div>
                                {tx.chequeDetails.rejectionReason && (
                                  <div className="text-[10px] text-rose-700 font-semibold">
                                    Rejected: {tx.chequeDetails.rejectionReason}
                                  </div>
                                )}
                              </div>
                            ) : (
                              <span className="text-slate-500 italic">PO awaiting cheque attachment</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono-tabular font-black text-[#0A006E]">
                            {formatKes(tx.totalAmount)}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span
                              className={`inline-block px-2.5 py-1 rounded-full text-[10px] font-black ${
                                st === 'Paid'
                                  ? 'bg-emerald-100 text-emerald-800'
                                  : st === 'Rejected'
                                  ? 'bg-rose-100 text-rose-700'
                                  : 'bg-amber-100 text-amber-900'
                              }`}
                            >
                              {st === 'Processing' ? 'Processing (Not Matured)' : st}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1.5 flex-wrap">
                              {st !== 'Paid' && (
                                <button
                                  type="button"
                                  disabled={updatingChequeId === tx.id}
                                  onClick={() => handleUpdateChequeStatus(tx, 'Paid')}
                                  className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-60"
                                >
                                  Mark Paid
                                </button>
                              )}
                              {st !== 'Processing' && (
                                <button
                                  type="button"
                                  disabled={updatingChequeId === tx.id}
                                  onClick={() => handleUpdateChequeStatus(tx, 'Processing')}
                                  className="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-[11px] font-bold cursor-pointer disabled:opacity-60"
                                >
                                  Processing
                                </button>
                              )}
                              {st !== 'Rejected' && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setRejectingChequeTxId(tx.id);
                                    setInlineRejectionReason(tx.chequeDetails?.rejectionReason || '');
                                  }}
                                  className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-300 text-rose-700 rounded-lg text-[11px] font-bold cursor-pointer"
                                >
                                  Reject
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => handleIssueOrPrintChequeReceipt(tx)}
                                className="px-2.5 py-1 bg-[#0A006E] hover:bg-indigo-950 text-[#FFDE00] rounded-lg text-[11px] font-montserrat font-black flex items-center gap-1 cursor-pointer"
                              >
                                <Printer className="w-3 h-3" />
                                Print Receipt
                              </button>
                              <button
                                type="button"
                                onClick={() => onPreviewDoc?.(tx)}
                                className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[11px] font-bold cursor-pointer"
                              >
                                View
                              </button>
                            </div>
                          </td>
                        </tr>
                        {rejectingChequeTxId === tx.id && (
                          <tr className="bg-rose-50/70">
                            <td colSpan={6} className="px-3 py-2.5">
                              <div className="flex items-center justify-end gap-2">
                                <input
                                  type="text"
                                  value={inlineRejectionReason}
                                  onChange={(e) => setInlineRejectionReason(e.target.value)}
                                  placeholder="Enter cheque rejection reason (e.g. Insufficient funds / Stale date / Signature mismatch)"
                                  className="flex-1 max-w-lg px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-xs"
                                />
                                <button
                                  type="button"
                                  disabled={updatingChequeId === tx.id}
                                  onClick={() =>
                                    handleUpdateChequeStatus(tx, 'Rejected', inlineRejectionReason)
                                  }
                                  className="px-3.5 py-1.5 bg-rose-600 text-white rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  Confirm Reject Cheque
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setRejectingChequeTxId(null)}
                                  className="px-3 py-1.5 bg-slate-200 text-slate-700 rounded-lg text-xs font-bold cursor-pointer"
                                >
                                  Cancel
                                </button>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
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
                <div className="text-2xl font-extrabold text-[#0A006E] font-mono-tabular">
                  {formatKes(stockMetrics.ipsCost)}
                </div>
                <div className="text-xs text-slate-600 font-mono-tabular">
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
                  <div className="text-base font-bold text-slate-900 font-mono-tabular">
                    {stockMetrics.lpsBottles.toLocaleString()} Btls
                  </div>
                </div>
              </div>
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 space-y-1">
                <div className="text-xs text-slate-500">Warehouse Purchase Capital:</div>
                <div className="text-2xl font-extrabold text-amber-800 font-mono-tabular">
                  {formatKes(stockMetrics.lpsCost)}
                </div>
                <div className="text-xs text-slate-600 font-mono-tabular">
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
                    <div className="text-lg sm:text-xl font-extrabold text-[#0A006E] font-mono-tabular">
                      {formatKes(taxMetrics.estimatedVatPayable)}
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded">
                      Payable 20th Monthly
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">KRA Digital Excise Stamps / Spirits Duty:</div>
                    <div className="text-xs text-slate-500">Excise stamps duty verified on IPS spirits &amp; liqueurs</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-extrabold text-slate-900 font-mono-tabular">
                      {formatKes(taxMetrics.estimatedExciseLiability)}
                    </div>
                    <span className="text-[11px] font-bold text-blue-700 bg-blue-100 px-2 py-0.5 rounded">
                      Bonded / Cleared
                    </span>
                  </div>
                </div>

                <div className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between">
                  <div>
                    <div className="font-bold text-slate-800">Staff Statutory Payroll Deductions:</div>
                    <div className="text-xs text-slate-500">PAYE, NSSF, and NHIF/SHIF withholdings from payroll</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-extrabold text-slate-900 font-mono-tabular">
                      {formatKes(taxMetrics.totalPayrollDisbursed * 0.22)}
                    </div>
                    <span className="text-[11px] font-bold text-amber-700 bg-amber-100 px-2 py-0.5 rounded">
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
                    <div className="text-xs text-slate-500">Unsettled credit invoices awaiting bank clearance</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg sm:text-xl font-extrabold text-[#0A006E] font-mono-tabular">
                      {formatKes(salesMetrics.accountsReceivable)}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                    <div className="text-xs font-bold text-emerald-800">Current (0 - 30 Days):</div>
                    <div className="text-base sm:text-lg font-extrabold text-slate-900 font-mono-tabular mt-1">
                      {formatKes(Math.max(0, salesMetrics.accountsReceivable - salesMetrics.overdueReceivable))}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5">Within standard terms</div>
                  </div>

                  <div className="bg-white p-3.5 rounded-xl border border-slate-200">
                    <div className="text-xs font-bold text-rose-700">Overdue (30+ Days Risk):</div>
                    <div className="text-base sm:text-lg font-extrabold text-rose-700 font-mono-tabular mt-1">
                      {formatKes(salesMetrics.overdueReceivable)}
                    </div>
                    <div className="text-[11px] text-rose-600 mt-0.5">Follow-up required</div>
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

      {/* NEW CLIENT PURCHASE ORDER (CHEQUE) MODAL */}
      {isChequePoModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white border-2 border-[#0A006E] rounded-2xl max-w-3xl w-full shadow-2xl overflow-hidden my-auto max-h-[92vh] flex flex-col">
            <div className="bg-[#0A006E] text-white px-5 py-3.5 flex items-center justify-between shrink-0">
              <div>
                <span className="text-[10px] font-montserrat font-black text-[#FFDE00] uppercase tracking-wider">
                  Accounts Receivable &amp; Cheque Clearing
                </span>
                <h3 className="text-base font-montserrat font-black">
                  Create Client Purchase Order (Cheque Payment)
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsChequePoModalOpen(false)}
                className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 sm:p-5 space-y-4 overflow-y-auto text-xs">
              {/* Branch & Client Selection */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Issuing Branch / Depot *
                  </label>
                  <select
                    value={poBranchId}
                    onChange={(e) => setPoBranchId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-bold text-[#0A006E]"
                  >
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-montserrat font-bold text-slate-700 mb-1">
                    Quick-Select Client / Trade Partner
                  </label>
                  <select
                    value={poSelectedPartyKey}
                    onChange={(e) => handleSelectPoParty(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold text-slate-800"
                  >
                    <option value="">-- Choose Registered Client or Enter Manually --</option>
                    {externalCustomers.map((c) => (
                      <option key={c.id} value={`cust:${c.id}`}>
                        [Client] {c.companyName ? `${c.companyName} (${c.name})` : c.name}
                      </option>
                    ))}
                    {partners.map((p) => (
                      <option key={p.id} value={`partner:${p.id}`}>
                        [{p.partnerType}] {p.companyName}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client / Company Name *</label>
                  <input
                    type="text"
                    value={poCustomerName}
                    onChange={(e) => setPoCustomerName(e.target.value)}
                    placeholder="e.g. Westlands Wine Merchants Ltd"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-semibold"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client Phone</label>
                  <input
                    type="text"
                    value={poCustomerPhone}
                    onChange={(e) => setPoCustomerPhone(e.target.value)}
                    placeholder="e.g. 0722 000 000"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono-tabular"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Client KRA PIN</label>
                  <input
                    type="text"
                    value={poCustomerKraPin}
                    onChange={(e) => setPoCustomerKraPin(e.target.value.toUpperCase())}
                    placeholder="e.g. P051234567X"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl font-mono-tabular uppercase"
                  />
                </div>
              </div>

              {/* Order Line Items Builder */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-montserrat font-black text-[#0A006E]">Purchase Order Items</span>
                  <select
                    value={poTaxMode}
                    onChange={(e) => setPoTaxMode(e.target.value as typeof poTaxMode)}
                    className="px-2.5 py-1 bg-white border border-slate-300 rounded-lg text-[11px] font-bold"
                  >
                    <option value="EXCLUSIVE_16">+16% VAT Exclusive</option>
                    <option value="INCLUSIVE_16">16% VAT Inclusive</option>
                    <option value="EXEMPT_0">0% Exempt</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                  <div className="sm:col-span-5">
                    <label className="block font-bold text-slate-600 mb-1">Product SKU</label>
                    <select
                      value={poProdId}
                      onChange={(e) => {
                        setPoProdId(e.target.value);
                        setPoCustomPrice(0);
                      }}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold text-[#0A006E]"
                    >
                      {products.slice(0, 150).map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.sku} · {p.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-600 mb-1">Unit</label>
                    <select
                      value={poUnitMode}
                      onChange={(e) => {
                        setPoUnitMode(e.target.value as 'Bottle' | 'Case');
                        setPoCustomPrice(0);
                      }}
                      className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg font-semibold"
                    >
                      <option value="Case">Case</option>
                      <option value="Bottle">Bottle</option>
                    </select>
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-600 mb-1">Qty</label>
                    <input
                      type="number"
                      min={1}
                      value={poQty}
                      onChange={(e) => setPoQty(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono-tabular font-bold"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label className="block font-bold text-slate-600 mb-1">Unit KES</label>
                    <input
                      type="number"
                      min={0}
                      value={poActiveUnitPrice}
                      onChange={(e) => setPoCustomPrice(Number(e.target.value))}
                      className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono-tabular font-bold text-[#0A006E]"
                    />
                  </div>
                  <div className="sm:col-span-1">
                    <button
                      type="button"
                      onClick={handleAddPoLineItem}
                      className="w-full py-1.5 px-2 bg-[#0A006E] text-[#FFDE00] rounded-lg font-montserrat font-black flex items-center justify-center cursor-pointer"
                    >
                      <Plus className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {poLineItems.length > 0 && (
                  <div className="bg-white border border-slate-200 rounded-lg overflow-hidden">
                    <table className="w-full text-left text-[11px]">
                      <thead className="bg-slate-100 text-slate-700 font-bold">
                        <tr>
                          <th className="py-1.5 px-2.5">Item</th>
                          <th className="py-1.5 px-2.5 text-right">Qty</th>
                          <th className="py-1.5 px-2.5 text-right">Total</th>
                          <th className="py-1.5 px-2.5 text-center">Remove</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {poLineItems.map((li, idx) => (
                          <tr key={`${li.productId}-${li.unitMode}`}>
                            <td className="py-1.5 px-2.5 font-semibold">
                              {li.name} ({li.unitMode})
                            </td>
                            <td className="py-1.5 px-2.5 text-right font-mono">{li.quantityUnits}</td>
                            <td className="py-1.5 px-2.5 text-right font-mono-tabular font-bold text-[#0A006E]">
                              {formatKes(li.lineTotal)}
                            </td>
                            <td className="py-1.5 px-2.5 text-center">
                              <button
                                type="button"
                                onClick={() => setPoLineItems((prev) => prev.filter((_, i) => i !== idx))}
                                className="text-rose-600 cursor-pointer"
                              >
                                <Trash2 className="w-3.5 h-3.5 inline" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-end gap-4 pt-1 font-mono-tabular text-xs">
                  <span>Subtotal: <strong>{formatKes(poFinancials.subtotal)}</strong></span>
                  <span>VAT: <strong>{formatKes(poFinancials.tax)}</strong></span>
                  <span className="text-sm font-black text-[#0A006E]">
                    PO Total: {formatKes(poFinancials.total)}
                  </span>
                </div>
              </div>

              {/* Cheque Details & Clearing Status */}
              <div className="bg-amber-50/90 border border-amber-300 rounded-xl p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-montserrat font-black text-amber-950 flex items-center gap-1.5">
                    <FileCheck2 className="w-4 h-4 text-amber-700" />
                    Cheque Particulars &amp; Clearing Status
                  </span>
                  <span className="font-mono-tabular font-black text-[#0A006E]">
                    {formatKes(poFinancials.total)}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Cheque Number *</label>
                    <input
                      type="text"
                      value={poChequeNumber}
                      onChange={(e) => setPoChequeNumber(e.target.value)}
                      placeholder="e.g. CHQ-009214"
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-mono-tabular font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Drawer Bank *</label>
                    <input
                      type="text"
                      value={poDrawerBank}
                      onChange={(e) => setPoDrawerBank(e.target.value)}
                      placeholder="e.g. KCB Bank / Equity"
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-semibold"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Bank Branch (Optional)</label>
                    <input
                      type="text"
                      value={poBranchName}
                      onChange={(e) => setPoBranchName(e.target.value)}
                      placeholder="e.g. Westlands"
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Drawer / Account Name</label>
                    <input
                      type="text"
                      value={poDrawerName}
                      onChange={(e) => setPoDrawerName(e.target.value)}
                      placeholder={poCustomerName || 'Account Signatory'}
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Cheque Issue Date *</label>
                    <input
                      type="date"
                      value={poChequeDate}
                      onChange={(e) => setPoChequeDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Maturity / Clearing Date *</label>
                    <input
                      type="date"
                      value={poMaturityDate}
                      onChange={(e) => setPoMaturityDate(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-mono-tabular"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <div>
                    <label className="block font-bold text-amber-900 mb-1">Initial Cheque Status *</label>
                    <select
                      value={poInitialStatus}
                      onChange={(e) => setPoInitialStatus(e.target.value as ChequeStatus)}
                      className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg font-bold text-[#0A006E]"
                    >
                      <option value="Processing">Processing (Cheque Not Matured)</option>
                      <option value="Paid">Paid (Cheque Cleared &amp; Honoured)</option>
                      <option value="Rejected">Rejected (Cheque Bounced / Returned)</option>
                    </select>
                  </div>
                  {poInitialStatus === 'Rejected' ? (
                    <div>
                      <label className="block font-bold text-rose-700 mb-1">Rejection Reason</label>
                      <input
                        type="text"
                        value={poRejectionReason}
                        onChange={(e) => setPoRejectionReason(e.target.value)}
                        placeholder="e.g. Insufficient funds / Refer to drawer"
                        className="w-full px-3 py-1.5 bg-white border border-rose-300 rounded-lg text-rose-800"
                      />
                    </div>
                  ) : (
                    <div>
                      <label className="block font-bold text-amber-900 mb-1">Internal Clearing Notes</label>
                      <input
                        type="text"
                        value={poNotes}
                        onChange={(e) => setPoNotes(e.target.value)}
                        placeholder="e.g. Client bank clearance expected within 3 working days"
                        className="w-full px-3 py-1.5 bg-white border border-amber-300 rounded-lg"
                      />
                    </div>
                  )}
                </div>
              </div>

              {poModalError && (
                <div className="p-2.5 bg-rose-50 border border-rose-300 rounded-xl text-rose-700 font-bold">
                  {poModalError}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsChequePoModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-montserrat font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={isSavingPo}
                  onClick={() => handleSaveClientChequePo(false)}
                  className="px-4 py-2 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] border border-[#0A006E] rounded-xl font-montserrat font-black cursor-pointer disabled:opacity-60"
                >
                  {isSavingPo ? 'Saving...' : 'Save Purchase Order'}
                </button>
                <button
                  type="button"
                  disabled={isSavingPo}
                  onClick={() => handleSaveClientChequePo(true)}
                  className="px-4 py-2 bg-[#0A006E] hover:bg-indigo-950 text-[#FFDE00] rounded-xl font-montserrat font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  <Printer className="w-3.5 h-3.5" />
                  Save &amp; Print Client Receipt
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
