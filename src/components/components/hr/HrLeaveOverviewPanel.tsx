import React, { useMemo, useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Clock,
  Download,
  FileText,
  Search,
  UserCheck,
  X,
  XCircle,
  Ban,
  ArrowRight,
  AlertTriangle,
} from 'lucide-react';
import { Branch, LeaveRequest, LeaveRequestStatus, StaffMember } from '../../types';
import { exportReportToPDF, exportToCSV } from '../../erpUtils';

const ANNUAL_LEAVE_ENTITLEMENT_DAYS = 21;

type StatementTab = 'staff' | 'ledger';
type PeriodFilter = 'all' | 'this_month' | 'this_year';
type StatusFilter = 'ALL' | LeaveRequestStatus;

export interface HrLeaveOverviewPanelProps {
  leaveRequests: LeaveRequest[];
  staffList: StaffMember[];
  branches: Branch[];
  onOpenLeaveInbox?: () => void;
  onOpenMyLeave?: () => void;
  defaultShowStatement?: boolean;
  compactHeader?: boolean;
}

function getTodayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function getMonthBounds(now: Date): { monthStartIso: string; monthEndIso: string; monthLabel: string; year: number; monthIndex: number } {
  const year = now.getFullYear();
  const monthIndex = now.getMonth();
  const lastDay = new Date(year, monthIndex + 1, 0).getDate();
  const mm = String(monthIndex + 1).padStart(2, '0');
  const monthStartIso = `${year}-${mm}-01`;
  const monthEndIso = `${year}-${mm}-${String(lastDay).padStart(2, '0')}`;
  const monthLabel = now.toLocaleDateString('en-KE', { month: 'short', year: 'numeric' });
  return { monthStartIso, monthEndIso, monthLabel, year, monthIndex };
}

function normalizeIsoDate(raw?: string): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return '';
  const y = parsed.getFullYear();
  const m = String(parsed.getMonth() + 1).padStart(2, '0');
  const d = String(parsed.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function requestFallsInMonth(req: LeaveRequest, monthStartIso: string, monthEndIso: string): boolean {
  const start = normalizeIsoDate(req.startDate) || normalizeIsoDate(req.hrReviewedAt) || normalizeIsoDate(req.createdAt);
  const end = normalizeIsoDate(req.endDate) || start;
  if (!start) return false;
  return start <= monthEndIso && end >= monthStartIso;
}

function requestFallsInYear(req: LeaveRequest, year: number): boolean {
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;
  const start = normalizeIsoDate(req.startDate) || normalizeIsoDate(req.hrReviewedAt) || normalizeIsoDate(req.createdAt);
  const end = normalizeIsoDate(req.endDate) || start;
  if (!start) return false;
  return start <= yearEnd && end >= yearStart;
}

function formatDays(days: number): string {
  const rounded = Math.round(days * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function formatShortDate(iso?: string): string {
  const norm = normalizeIsoDate(iso);
  if (!norm) return '—';
  const [y, m, d] = norm.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return norm;
  return dt.toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: '2-digit' });
}

interface StaffLeaveStatementRow {
  staffId: string;
  staffName: string;
  staffRole: string;
  branchName: string;
  staffStatus: string;
  approvedMonthCount: number;
  approvedMonthDays: number;
  approvedYearCount: number;
  approvedYearDays: number;
  annualUsedYearDays: number;
  annualRemainingDays: number;
  pendingCount: number;
  declinedCount: number;
  cancelledCount: number;
  totalRequests: number;
  isOnLeaveToday: boolean;
}

export const HrLeaveOverviewPanel: React.FC<HrLeaveOverviewPanelProps> = ({
  leaveRequests,
  staffList,
  branches,
  onOpenLeaveInbox,
  onOpenMyLeave,
  defaultShowStatement = true,
  compactHeader = false,
}) => {
  const [showStatement, setShowStatement] = useState<boolean>(defaultShowStatement);
  const [statementTab, setStatementTab] = useState<StatementTab>('staff');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedStaffId, setSelectedStaffId] = useState<string | null>(null);
  const [showAllRows, setShowAllRows] = useState<boolean>(false);

  const now = useMemo(() => new Date(), []);
  const todayIso = useMemo(() => getTodayIso(), []);
  const { monthStartIso, monthEndIso, monthLabel, year: currentYear } = useMemo(
    () => getMonthBounds(now),
    [now]
  );

  // Core notification counts & period rollups
  const summary = useMemo(() => {
    let pendingCount = 0;
    let urgentPendingCount = 0;
    let approvedCount = 0;
    let approvedTotalDays = 0;
    let declinedCount = 0;
    let declinedThisYearCount = 0;
    let cancelledCount = 0;

    let approvedMonthCount = 0;
    let approvedMonthDays = 0;
    let approvedYearCount = 0;
    let approvedYearDays = 0;

    const onLeaveTodayMap = new Map<string, { staffId: string; staffName: string; leaveType: string }>();
    const yearlyApprovedByType = new Map<string, number>();

    for (const req of leaveRequests) {
      const days = Math.max(0, Number(req.totalDays) || 0);
      const inMonth = requestFallsInMonth(req, monthStartIso, monthEndIso);
      const inYear = requestFallsInYear(req, currentYear);

      if (req.status === 'Pending HR Approval') {
        pendingCount += 1;
        if (
          req.leaveType === 'Emergency Leave' ||
          req.leaveType === 'Maternity Leave' ||
          req.urgency === 'Emergency' ||
          req.urgency === 'Urgent'
        ) {
          urgentPendingCount += 1;
        }
      } else if (req.status === 'Approved') {
        approvedCount += 1;
        approvedTotalDays += days;

        if (inMonth) {
          approvedMonthCount += 1;
          approvedMonthDays += days;
        }
        if (inYear) {
          approvedYearCount += 1;
          approvedYearDays += days;
          yearlyApprovedByType.set(req.leaveType, (yearlyApprovedByType.get(req.leaveType) || 0) + days);
        }

        const start = normalizeIsoDate(req.startDate);
        const end = normalizeIsoDate(req.endDate) || start;
        if (start && end && todayIso >= start && todayIso <= end) {
          onLeaveTodayMap.set(req.staffId || req.staffName, {
            staffId: req.staffId,
            staffName: req.staffName,
            leaveType: req.leaveType,
          });
        }
      } else if (req.status === 'Declined') {
        declinedCount += 1;
        if (inYear) declinedThisYearCount += 1;
      } else if (req.status === 'Cancelled') {
        cancelledCount += 1;
      }
    }

    const typeBreakdown = Array.from(yearlyApprovedByType.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4);

    return {
      totalCount: leaveRequests.length,
      pendingCount,
      urgentPendingCount,
      approvedCount,
      approvedTotalDays,
      declinedCount,
      declinedThisYearCount,
      cancelledCount,
      approvedMonthCount,
      approvedMonthDays,
      approvedYearCount,
      approvedYearDays,
      onLeaveToday: Array.from(onLeaveTodayMap.values()),
      typeBreakdown,
    };
  }, [leaveRequests, monthStartIso, monthEndIso, currentYear, todayIso]);

  // Per-staff leave statement aggregation
  const staffStatementRows = useMemo<StaffLeaveStatementRow[]>(() => {
    const branchMap = new Map<string, string>();
    for (const b of branches) branchMap.set(b.id, b.name);

    const rowsByStaff = new Map<string, StaffLeaveStatementRow>();

    for (const member of staffList) {
      rowsByStaff.set(member.id, {
        staffId: member.id,
        staffName: member.name,
        staffRole: member.role,
        branchName: member.branchName || branchMap.get(member.branchId) || 'HQ',
        staffStatus: member.status,
        approvedMonthCount: 0,
        approvedMonthDays: 0,
        approvedYearCount: 0,
        approvedYearDays: 0,
        annualUsedYearDays: 0,
        annualRemainingDays: ANNUAL_LEAVE_ENTITLEMENT_DAYS,
        pendingCount: 0,
        declinedCount: 0,
        cancelledCount: 0,
        totalRequests: 0,
        isOnLeaveToday: false,
      });
    }

    for (const req of leaveRequests) {
      const key = req.staffId || `unknown_${req.staffEmail || req.staffName}`;
      let row = rowsByStaff.get(key);
      if (!row) {
        row = {
          staffId: key,
          staffName: req.staffName || 'Unknown Staff',
          staffRole: req.staffRole || 'Staff',
          branchName: req.branchName || branchMap.get(req.branchId) || 'HQ',
          staffStatus: 'Active',
          approvedMonthCount: 0,
          approvedMonthDays: 0,
          approvedYearCount: 0,
          approvedYearDays: 0,
          annualUsedYearDays: 0,
          annualRemainingDays: ANNUAL_LEAVE_ENTITLEMENT_DAYS,
          pendingCount: 0,
          declinedCount: 0,
          cancelledCount: 0,
          totalRequests: 0,
          isOnLeaveToday: false,
        };
        rowsByStaff.set(key, row);
      }

      const days = Math.max(0, Number(req.totalDays) || 0);
      const inMonth = requestFallsInMonth(req, monthStartIso, monthEndIso);
      const inYear = requestFallsInYear(req, currentYear);

      row.totalRequests += 1;

      if (req.status === 'Pending HR Approval') {
        row.pendingCount += 1;
      } else if (req.status === 'Declined') {
        row.declinedCount += 1;
      } else if (req.status === 'Cancelled') {
        row.cancelledCount += 1;
      } else if (req.status === 'Approved') {
        if (inMonth) {
          row.approvedMonthCount += 1;
          row.approvedMonthDays += days;
        }
        if (inYear) {
          row.approvedYearCount += 1;
          row.approvedYearDays += days;
          if (req.leaveType === 'Annual Leave') {
            row.annualUsedYearDays += days;
            row.annualRemainingDays = Math.max(0, ANNUAL_LEAVE_ENTITLEMENT_DAYS - row.annualUsedYearDays);
          }
        }
        const start = normalizeIsoDate(req.startDate);
        const end = normalizeIsoDate(req.endDate) || start;
        if (start && end && todayIso >= start && todayIso <= end) {
          row.isOnLeaveToday = true;
        }
      }
    }

    const q = searchQuery.trim().toLowerCase();
    return Array.from(rowsByStaff.values())
      .filter((row) => {
        if (statusFilter === 'Pending HR Approval' && row.pendingCount === 0) return false;
        if (statusFilter === 'Approved' && row.approvedYearCount === 0 && row.approvedMonthCount === 0) return false;
        if (statusFilter === 'Declined' && row.declinedCount === 0) return false;
        if (statusFilter === 'Cancelled' && row.cancelledCount === 0) return false;

        if (periodFilter === 'this_month' && row.approvedMonthCount === 0 && statusFilter === 'Approved') return false;
        if (periodFilter === 'this_year' && row.approvedYearCount === 0 && statusFilter === 'Approved') return false;

        if (!q) return true;
        return (
          row.staffName.toLowerCase().includes(q) ||
          row.staffRole.toLowerCase().includes(q) ||
          row.branchName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.pendingCount !== b.pendingCount) return b.pendingCount - a.pendingCount;
        if (a.isOnLeaveToday !== b.isOnLeaveToday) return a.isOnLeaveToday ? -1 : 1;
        if (a.approvedYearDays !== b.approvedYearDays) return b.approvedYearDays - a.approvedYearDays;
        return a.staffName.localeCompare(b.staffName);
      });
  }, [staffList, branches, leaveRequests, monthStartIso, monthEndIso, currentYear, todayIso, statusFilter, periodFilter, searchQuery]);

  // Filtered request ledger rows
  const filteredLedgerRows = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leaveRequests
      .filter((req) => {
        if (selectedStaffId && req.staffId !== selectedStaffId) return false;
        if (statusFilter !== 'ALL' && req.status !== statusFilter) return false;
        if (periodFilter === 'this_month' && !requestFallsInMonth(req, monthStartIso, monthEndIso)) return false;
        if (periodFilter === 'this_year' && !requestFallsInYear(req, currentYear)) return false;
        if (!q) return true;
        return (
          (req.requestNo || '').toLowerCase().includes(q) ||
          (req.staffName || '').toLowerCase().includes(q) ||
          (req.branchName || '').toLowerCase().includes(q) ||
          (req.leaveType || '').toLowerCase().includes(q) ||
          (req.reason || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const aPending = a.status === 'Pending HR Approval' ? 0 : 1;
        const bPending = b.status === 'Pending HR Approval' ? 0 : 1;
        if (aPending !== bPending) return aPending - bPending;
        return (b.createdAt || b.startDate || '').localeCompare(a.createdAt || a.startDate || '');
      });
  }, [leaveRequests, selectedStaffId, statusFilter, periodFilter, monthStartIso, monthEndIso, currentYear, searchQuery]);

  const selectedStaffName = useMemo(() => {
    if (!selectedStaffId) return null;
    return (
      staffList.find((s) => s.id === selectedStaffId)?.name ||
      leaveRequests.find((r) => r.staffId === selectedStaffId)?.staffName ||
      'Selected Staff'
    );
  }, [selectedStaffId, staffList, leaveRequests]);

  const handleToggleStatusCard = (target: LeaveRequestStatus) => {
    setShowStatement(true);
    setStatusFilter((prev) => (prev === target ? 'ALL' : target));
    if (target === 'Pending HR Approval' || target === 'Declined' || target === 'Cancelled') {
      setStatementTab('ledger');
    }
    setShowAllRows(false);
  };

  const handleSelectPeriodShortcut = (period: 'this_month' | 'this_year') => {
    setShowStatement(true);
    setStatusFilter('Approved');
    setPeriodFilter((prev) => (prev === period && statusFilter === 'Approved' ? 'all' : period));
    setStatementTab('ledger');
    setShowAllRows(false);
  };

  const handleResetFilters = () => {
    setStatusFilter('ALL');
    setPeriodFilter('all');
    setSearchQuery('');
    setSelectedStaffId(null);
    setShowAllRows(false);
  };

  const handleExportPdf = () => {
    if (statementTab === 'staff') {
      const headers = [
        'Staff Name',
        'Role',
        'Branch',
        `Approved (${monthLabel})`,
        `Approved (${currentYear})`,
        `Annual Used (${currentYear})`,
        'Annual Balance',
        'Pending',
        'Rejected',
      ];
      const rows = staffStatementRows.map((r) => [
        r.staffName,
        r.staffRole,
        r.branchName,
        `${formatDays(r.approvedMonthDays)}d (${r.approvedMonthCount})`,
        `${formatDays(r.approvedYearDays)}d (${r.approvedYearCount})`,
        `${formatDays(r.annualUsedYearDays)}d`,
        `${formatDays(r.annualRemainingDays)} / ${ANNUAL_LEAVE_ENTITLEMENT_DAYS}d`,
        r.pendingCount,
        r.declinedCount,
      ]);
      exportReportToPDF(
        `HR STAFF LEAVE STATEMENT (${currentYear})`,
        `Pending: ${summary.pendingCount} | Approved This Month: ${summary.approvedMonthCount} (${formatDays(summary.approvedMonthDays)}d) | Approved This Year: ${summary.approvedYearCount} (${formatDays(summary.approvedYearDays)}d)`,
        headers,
        rows,
        `VAAIRO_HR_Leave_Statement_${currentYear}`
      );
    } else {
      const headers = [
        'Request No',
        'Staff Name',
        'Branch',
        'Leave Type',
        'Dates',
        'Days',
        'Status',
        'Reviewer',
      ];
      const rows = filteredLedgerRows.map((r) => [
        r.requestNo || r.id.slice(0, 8),
        r.staffName,
        r.branchName,
        r.leaveType,
        `${r.startDate} to ${r.endDate}`,
        formatDays(Number(r.totalDays) || 0),
        r.status === 'Pending HR Approval' ? 'Pending' : r.status,
        r.hrReviewerName || '—',
      ]);
      exportReportToPDF(
        `HR LEAVE REQUEST LEDGER (${currentYear})`,
        `Filtered: ${filteredLedgerRows.length} entries | Pending: ${summary.pendingCount} | Approved: ${summary.approvedCount} | Rejected: ${summary.declinedCount}`,
        headers,
        rows,
        `VAAIRO_HR_Leave_Ledger_${currentYear}`
      );
    }
  };

  const handleExportCsv = () => {
    if (statementTab === 'staff') {
      exportToCSV(
        `VAAIRO_HR_Leave_Statement_${currentYear}`,
        [
          'Staff Name',
          'Role',
          'Branch',
          `Approved Requests (${monthLabel})`,
          `Approved Days (${monthLabel})`,
          `Approved Requests (${currentYear})`,
          `Approved Days (${currentYear})`,
          'Annual Leave Used (Days)',
          'Annual Leave Remaining (Days)',
          'Pending Requests',
          'Rejected Requests',
          'Cancelled Requests',
        ],
        staffStatementRows.map((r) => [
          r.staffName,
          r.staffRole,
          r.branchName,
          r.approvedMonthCount,
          formatDays(r.approvedMonthDays),
          r.approvedYearCount,
          formatDays(r.approvedYearDays),
          formatDays(r.annualUsedYearDays),
          formatDays(r.annualRemainingDays),
          r.pendingCount,
          r.declinedCount,
          r.cancelledCount,
        ])
      );
    } else {
      exportToCSV(
        `VAAIRO_HR_Leave_Ledger_${currentYear}`,
        [
          'Request No',
          'Staff Name',
          'Role',
          'Branch',
          'Leave Type',
          'Start Date',
          'End Date',
          'Total Days',
          'Urgency',
          'Status',
          'HR Reviewer',
          'Decision Note',
        ],
        filteredLedgerRows.map((r) => [
          r.requestNo || r.id,
          r.staffName,
          r.staffRole,
          r.branchName,
          r.leaveType,
          r.startDate,
          r.endDate,
          formatDays(Number(r.totalDays) || 0),
          r.urgency,
          r.status,
          r.hrReviewerName || '',
          r.hrDecisionNote || '',
        ])
      );
    }
  };

  const hasActiveFilters =
    statusFilter !== 'ALL' || periodFilter !== 'all' || searchQuery.trim().length > 0 || Boolean(selectedStaffId);

  const DEFAULT_VISIBLE_LIMIT = 6;
  const visibleStaffRows = showAllRows ? staffStatementRows : staffStatementRows.slice(0, DEFAULT_VISIBLE_LIMIT);
  const visibleLedgerRows = showAllRows ? filteredLedgerRows : filteredLedgerRows.slice(0, DEFAULT_VISIBLE_LIMIT);

  return (
    <section
      aria-label="HR Leave Overview and Statement"
      className="bg-white border border-slate-200 rounded-2xl overflow-hidden"
    >
      {/* Top Bar */}
      <div
        className={`px-4 ${
          compactHeader ? 'py-3' : 'py-3.5'
        } border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5`}
      >
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-[#0A006E] shrink-0" />
            <h3 className="text-sm font-montserrat font-extrabold text-[#0A006E] tracking-tight truncate">
              Leave Notifications &amp; Statement
            </h3>
          </div>
          <p className="text-xs text-slate-500 mt-0.5 truncate font-mono-tabular tabular-nums">
            {summary.totalCount} total requests ·{' '}
            {summary.onLeaveToday.length > 0
              ? `${summary.onLeaveToday.length} staff on leave today`
              : 'Full team on duty today'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {onOpenMyLeave && (
            <button
              type="button"
              onClick={onOpenMyLeave}
              className="min-h-[38px] px-3 py-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-montserrat font-bold cursor-pointer transition"
            >
              My Leave
            </button>
          )}
          {onOpenLeaveInbox && (
            <button
              type="button"
              onClick={onOpenLeaveInbox}
              className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer transition ${
                summary.pendingCount > 0
                  ? 'bg-[#0A006E] hover:bg-[#130791] text-[#FFDE00]'
                  : 'bg-slate-100 hover:bg-slate-200 text-slate-800'
              }`}
            >
              <span>Review Queue</span>
              <span className="font-mono-tabular tabular-nums">({summary.pendingCount})</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowStatement((prev) => !prev)}
            className="min-h-[38px] px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 rounded-lg text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer transition"
            aria-expanded={showStatement}
          >
            <FileText className="w-3.5 h-3.5 text-[#0A006E]" />
            <span>{showStatement ? 'Hide Statement' : 'Leave Statement'}</span>
            {showStatement ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>
      </div>

      {/* Section 1: Leave Notification Counts Strip (Interactive Click-to-Filter) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 divide-x divide-slate-200 border-b border-slate-200">
        <button
          type="button"
          onClick={() => handleToggleStatusCard('Pending HR Approval')}
          className={`p-3.5 sm:p-4 text-left transition cursor-pointer ${
            statusFilter === 'Pending HR Approval'
              ? 'bg-amber-50/80'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
              Pending
            </span>
            <Clock className="w-4 h-4 text-amber-600 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono-tabular tabular-nums text-amber-700">
              {summary.pendingCount}
            </span>
            {summary.urgentPendingCount > 0 && (
              <span className="text-[11px] font-montserrat font-bold text-rose-700 inline-flex items-center gap-1">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {summary.urgentPendingCount} priority
              </span>
            )}
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            {summary.pendingCount > 0 ? 'Awaiting HR decision' : 'No pending queue'}
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleToggleStatusCard('Approved')}
          className={`p-3.5 sm:p-4 text-left transition cursor-pointer ${
            statusFilter === 'Approved'
              ? 'bg-emerald-50/80'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
              Approved
            </span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono-tabular tabular-nums text-emerald-700">
              {summary.approvedCount}
            </span>
            <span className="text-xs font-mono-tabular tabular-nums font-semibold text-slate-600">
              {formatDays(summary.approvedTotalDays)}d
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            Cumulative approved days
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleToggleStatusCard('Declined')}
          className={`p-3.5 sm:p-4 text-left transition cursor-pointer ${
            statusFilter === 'Declined'
              ? 'bg-rose-50/80'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
              Rejected
            </span>
            <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono-tabular tabular-nums text-rose-700">
              {summary.declinedCount}
            </span>
            <span className="text-[11px] font-mono-tabular tabular-nums text-slate-500">
              {summary.declinedThisYearCount} in {currentYear}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            Declined by HR review
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleToggleStatusCard('Cancelled')}
          className={`p-3.5 sm:p-4 text-left transition cursor-pointer ${
            statusFilter === 'Cancelled'
              ? 'bg-slate-100'
              : 'bg-white hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
              Cancelled
            </span>
            <Ban className="w-4 h-4 text-slate-500 shrink-0" />
          </div>
          <div className="mt-1 flex items-baseline gap-2">
            <span className="text-2xl font-extrabold font-mono-tabular tabular-nums text-slate-700">
              {summary.cancelledCount}
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-0.5 truncate">
            Withdrawn by staff
          </div>
        </button>
      </div>

      {/* Section 2: Period Totals (This Month, This Year & On Leave Today) */}
      <div className="grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-slate-200 bg-slate-50/70">
        <button
          type="button"
          onClick={() => handleSelectPeriodShortcut('this_month')}
          className={`px-4 py-3 text-left transition cursor-pointer ${
            periodFilter === 'this_month' && statusFilter === 'Approved'
              ? 'bg-[#0A006E]/[0.06]'
              : 'hover:bg-slate-100/80'
          }`}
        >
          <div className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
            Approved This Month · {monthLabel}
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono-tabular tabular-nums">
            <span className="text-lg font-extrabold text-[#0A006E]">
              {summary.approvedMonthCount}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {summary.approvedMonthCount === 1 ? 'request' : 'requests'} · {formatDays(summary.approvedMonthDays)} days
            </span>
          </div>
        </button>

        <button
          type="button"
          onClick={() => handleSelectPeriodShortcut('this_year')}
          className={`px-4 py-3 text-left transition cursor-pointer ${
            periodFilter === 'this_year' && statusFilter === 'Approved'
              ? 'bg-[#0A006E]/[0.06]'
              : 'hover:bg-slate-100/80'
          }`}
        >
          <div className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
            Approved This Year · {currentYear}
          </div>
          <div className="mt-1 flex items-baseline gap-2 font-mono-tabular tabular-nums">
            <span className="text-lg font-extrabold text-[#0A006E]">
              {summary.approvedYearCount}
            </span>
            <span className="text-xs font-semibold text-slate-600">
              {summary.approvedYearCount === 1 ? 'request' : 'requests'} · {formatDays(summary.approvedYearDays)} days
            </span>
          </div>
        </button>

        <div className="px-4 py-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
              On Leave Today
            </span>
            <UserCheck className="w-3.5 h-3.5 text-[#0A006E] shrink-0" />
          </div>
          <div className="mt-1 text-xs font-semibold text-slate-800 truncate">
            {summary.onLeaveToday.length > 0 ? (
              <>
                <span className="font-mono-tabular tabular-nums font-extrabold text-[#0A006E] mr-1.5">
                  {summary.onLeaveToday.length}
                </span>
                <span className="text-slate-600">
                  {summary.onLeaveToday.slice(0, 2).map((s) => s.staffName).join(', ')}
                  {summary.onLeaveToday.length > 2 ? ` +${summary.onLeaveToday.length - 2} more` : ''}
                </span>
              </>
            ) : (
              <span className="text-emerald-700 font-semibold">0 absent · Full team on duty</span>
            )}
          </div>
          {summary.typeBreakdown.length > 0 && (
            <div className="text-[11px] text-slate-500 mt-0.5 truncate font-mono-tabular tabular-nums">
              {currentYear} mix:{' '}
              {summary.typeBreakdown
                .map(([type, days]) => `${type.replace(' Leave', '')} ${formatDays(days)}d`)
                .join(' · ')}
            </div>
          )}
        </div>
      </div>

      {/* Section 3: Simplified Leave Statement */}
      {showStatement && (
        <div className="border-t border-slate-200">
          {/* Statement Controls Bar */}
          <div className="px-4 py-3 border-b border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 bg-white">
            <div className="flex flex-wrap items-center gap-2">
              {/* Segmented View Toggle */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                <button
                  type="button"
                  onClick={() => {
                    setStatementTab('staff');
                    setSelectedStaffId(null);
                    setShowAllRows(false);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-montserrat font-bold cursor-pointer transition ${
                    statementTab === 'staff'
                      ? 'bg-[#0A006E] text-[#FFDE00]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Staff Statement
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatementTab('ledger');
                    setShowAllRows(false);
                  }}
                  className={`px-3 py-1.5 rounded-md text-xs font-montserrat font-bold cursor-pointer transition ${
                    statementTab === 'ledger'
                      ? 'bg-[#0A006E] text-[#FFDE00]'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Request Log ({filteredLedgerRows.length})
                </button>
              </div>

              {/* Period Segmented Filter */}
              <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                {(
                  [
                    { id: 'all', label: 'All Time' },
                    { id: 'this_month', label: 'This Month' },
                    { id: 'this_year', label: String(currentYear) },
                  ] as Array<{ id: PeriodFilter; label: string }>
                ).map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => {
                      setPeriodFilter(opt.id);
                      setShowAllRows(false);
                    }}
                    className={`px-2.5 py-1.5 rounded-md text-[11px] font-montserrat font-bold cursor-pointer transition ${
                      periodFilter === opt.id
                        ? 'bg-white text-[#0A006E] shadow-xs border border-slate-200'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>

              {/* Status Select */}
              <select
                aria-label="Filter leave status"
                value={statusFilter}
                onChange={(e) => {
                  setStatusFilter(e.target.value as StatusFilter);
                  setShowAllRows(false);
                }}
                className="min-h-[34px] px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-montserrat font-semibold text-slate-700 outline-none focus:border-[#0A006E]"
              >
                <option value="ALL">All Statuses</option>
                <option value="Pending HR Approval">Pending ({summary.pendingCount})</option>
                <option value="Approved">Approved ({summary.approvedCount})</option>
                <option value="Declined">Rejected ({summary.declinedCount})</option>
                <option value="Cancelled">Cancelled ({summary.cancelledCount})</option>
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative flex-1 sm:flex-initial sm:w-52">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff, ref, branch..."
                  className="w-full min-h-[34px] pl-8 pr-7 py-1 bg-slate-50 border border-slate-200 focus:bg-white focus:border-[#0A006E] rounded-lg text-xs text-slate-800 outline-none transition"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    aria-label="Clear search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleExportPdf}
                className="min-h-[34px] px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                title="Download PDF Leave Statement"
              >
                <FileText className="w-3.5 h-3.5 text-[#0A006E]" />
                <span>PDF</span>
              </button>
              <button
                type="button"
                onClick={handleExportCsv}
                className="min-h-[34px] px-2.5 py-1 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 rounded-lg text-xs font-montserrat font-bold flex items-center gap-1 cursor-pointer transition"
                title="Export CSV Spreadsheet"
              >
                <Download className="w-3.5 h-3.5 text-emerald-700" />
                <span>CSV</span>
              </button>
            </div>
          </div>

          {/* Active filter indicator bar (inline unboxed text) */}
          {hasActiveFilters && (
            <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2 text-xs">
              <span className="text-slate-600">
                Active filters:{' '}
                <strong className="text-slate-900">
                  {[
                    statusFilter !== 'ALL'
                      ? statusFilter === 'Pending HR Approval'
                        ? 'Pending'
                        : statusFilter === 'Declined'
                        ? 'Rejected'
                        : statusFilter
                      : null,
                    periodFilter === 'this_month'
                      ? `Month (${monthLabel})`
                      : periodFilter === 'this_year'
                      ? `Year (${currentYear})`
                      : null,
                    selectedStaffName ? `Staff: ${selectedStaffName}` : null,
                    searchQuery.trim() ? `"${searchQuery.trim()}"` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </strong>
              </span>
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-xs font-montserrat font-bold text-[#0A006E] hover:underline cursor-pointer"
              >
                Reset filters
              </button>
            </div>
          )}

          {/* TAB A: STAFF LEAVE STATEMENT */}
          {statementTab === 'staff' && (
            <>
              {visibleStaffRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  <p className="font-montserrat font-semibold text-slate-700">
                    No staff leave records match the current filter.
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-2 text-xs font-montserrat font-bold text-[#0A006E] hover:underline cursor-pointer"
                    >
                      Clear filters to view all staff
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4">Staff Member</th>
                          <th className="py-2.5 px-3 text-right">Approved ({monthLabel})</th>
                          <th className="py-2.5 px-3 text-right">Approved ({currentYear})</th>
                          <th className="py-2.5 px-3">Annual Balance (21d)</th>
                          <th className="py-2.5 px-4 text-right">Queue / History</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {visibleStaffRows.map((row) => {
                          const usedPct = Math.min(
                            100,
                            Math.round((row.annualUsedYearDays / ANNUAL_LEAVE_ENTITLEMENT_DAYS) * 100)
                          );
                          return (
                            <tr
                              key={row.staffId}
                              onClick={() => {
                                setSelectedStaffId(row.staffId);
                                setStatementTab('ledger');
                                setShowAllRows(false);
                              }}
                              className="hover:bg-slate-50 transition cursor-pointer"
                              title={`Click to view ${row.staffName}'s leave requests`}
                            >
                              <td className="py-2.5 px-4">
                                <div className="font-montserrat font-bold text-slate-900">
                                  {row.staffName}
                                  {row.isOnLeaveToday && (
                                    <span className="ml-2 text-[11px] font-semibold text-amber-700">
                                      · On leave today
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {row.staffRole} · {row.branchName}
                                </div>
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-tabular tabular-nums">
                                <span className={row.approvedMonthDays > 0 ? 'font-bold text-[#0A006E]' : 'text-slate-400'}>
                                  {formatDays(row.approvedMonthDays)}d
                                </span>
                                {row.approvedMonthCount > 0 && (
                                  <span className="text-[11px] text-slate-500 ml-1">({row.approvedMonthCount})</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-tabular tabular-nums">
                                <span className={row.approvedYearDays > 0 ? 'font-bold text-emerald-700' : 'text-slate-400'}>
                                  {formatDays(row.approvedYearDays)}d
                                </span>
                                {row.approvedYearCount > 0 && (
                                  <span className="text-[11px] text-slate-500 ml-1">({row.approvedYearCount})</span>
                                )}
                              </td>
                              <td className="py-2.5 px-3 min-w-[150px]">
                                <div className="flex items-center justify-between text-[11px] font-mono-tabular tabular-nums mb-1">
                                  <span className="font-bold text-slate-800">
                                    {formatDays(row.annualRemainingDays)}d left
                                  </span>
                                  <span className="text-slate-500">
                                    {formatDays(row.annualUsedYearDays)} / {ANNUAL_LEAVE_ENTITLEMENT_DAYS}d
                                  </span>
                                </div>
                                <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full rounded-full ${
                                      usedPct >= 90 ? 'bg-rose-600' : usedPct >= 65 ? 'bg-amber-500' : 'bg-[#0A006E]'
                                    }`}
                                    style={{ width: `${usedPct}%` }}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 px-4 text-right font-mono-tabular tabular-nums whitespace-nowrap text-[11px]">
                                <span className={row.pendingCount > 0 ? 'font-bold text-amber-700' : 'text-slate-400'}>
                                  {row.pendingCount} Pend
                                </span>
                                <span className="text-slate-300 mx-1">·</span>
                                <span className={row.declinedCount > 0 ? 'font-bold text-rose-700' : 'text-slate-400'}>
                                  {row.declinedCount} Rej
                                </span>
                                <span className="text-slate-300 mx-1">·</span>
                                <span className="text-slate-500">{row.totalRequests} Total</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Compact List */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {visibleStaffRows.map((row) => (
                      <button
                        key={row.staffId}
                        type="button"
                        onClick={() => {
                          setSelectedStaffId(row.staffId);
                          setStatementTab('ledger');
                          setShowAllRows(false);
                        }}
                        className="w-full p-3.5 text-left hover:bg-slate-50 transition cursor-pointer space-y-1.5"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-xs font-montserrat font-bold text-slate-900 truncate">
                              {row.staffName}
                            </div>
                            <div className="text-[11px] text-slate-500 truncate">
                              {row.staffRole} · {row.branchName}
                            </div>
                          </div>
                          <div className="text-right font-mono-tabular tabular-nums shrink-0">
                            <div className="text-xs font-extrabold text-[#0A006E]">
                              {formatDays(row.annualRemainingDays)}d left
                            </div>
                            <div className="text-[10px] text-slate-500">
                              of {ANNUAL_LEAVE_ENTITLEMENT_DAYS}d annual
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] font-mono-tabular tabular-nums text-slate-600">
                          <span>Month: {formatDays(row.approvedMonthDays)}d</span>
                          <span>·</span>
                          <span>Year: {formatDays(row.approvedYearDays)}d</span>
                          {row.pendingCount > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-bold text-amber-700">{row.pendingCount} pending</span>
                            </>
                          )}
                          {row.declinedCount > 0 && (
                            <>
                              <span>·</span>
                              <span className="font-bold text-rose-700">{row.declinedCount} rejected</span>
                            </>
                          )}
                        </div>
                      </button>
                    ))}
                  </div>

                  {staffStatementRows.length > DEFAULT_VISIBLE_LIMIT && (
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-mono-tabular tabular-nums">
                        Showing {visibleStaffRows.length} of {staffStatementRows.length} staff members
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAllRows((prev) => !prev)}
                        className="font-montserrat font-bold text-[#0A006E] hover:underline cursor-pointer"
                      >
                        {showAllRows ? 'Show fewer' : `Show all ${staffStatementRows.length}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}

          {/* TAB B: REQUEST LEDGER */}
          {statementTab === 'ledger' && (
            <>
              {visibleLedgerRows.length === 0 ? (
                <div className="px-4 py-8 text-center text-xs text-slate-500">
                  <p className="font-montserrat font-semibold text-slate-700">
                    {leaveRequests.length === 0
                      ? 'No leave requests have been submitted yet.'
                      : 'No leave requests match the active filters.'}
                  </p>
                  {hasActiveFilters && (
                    <button
                      type="button"
                      onClick={handleResetFilters}
                      className="mt-2 text-xs font-montserrat font-bold text-[#0A006E] hover:underline cursor-pointer"
                    >
                      Reset filters
                    </button>
                  )}
                </div>
              ) : (
                <>
                  {/* Desktop Ledger Table */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 bg-slate-50/50 text-[11px] font-montserrat font-bold uppercase tracking-wider text-slate-500">
                          <th className="py-2.5 px-4">Ref &amp; Period</th>
                          <th className="py-2.5 px-3">Staff Member</th>
                          <th className="py-2.5 px-3">Leave Type</th>
                          <th className="py-2.5 px-3 text-right">Days</th>
                          <th className="py-2.5 px-3">Status</th>
                          <th className="py-2.5 px-4">Reviewer / Notes</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-xs">
                        {visibleLedgerRows.map((req) => {
                          const statusColor =
                            req.status === 'Approved'
                              ? 'text-emerald-700'
                              : req.status === 'Pending HR Approval'
                              ? 'text-amber-700'
                              : req.status === 'Declined'
                              ? 'text-rose-700'
                              : 'text-slate-500';
                          const statusLabel =
                            req.status === 'Pending HR Approval'
                              ? 'Pending'
                              : req.status === 'Declined'
                              ? 'Rejected'
                              : req.status;
                          return (
                            <tr key={req.id} className="hover:bg-slate-50 transition">
                              <td className="py-2.5 px-4 whitespace-nowrap font-mono-tabular tabular-nums">
                                <div className="font-bold text-[#0A006E]">{req.requestNo || req.id.slice(0, 8)}</div>
                                <div className="text-[11px] text-slate-500">
                                  {formatShortDate(req.startDate)} → {formatShortDate(req.endDate)}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-montserrat font-bold text-slate-900">{req.staffName}</div>
                                <div className="text-[11px] text-slate-500">
                                  {req.staffRole} · {req.branchName}
                                </div>
                              </td>
                              <td className="py-2.5 px-3">
                                <div className="font-semibold text-slate-800">{req.leaveType}</div>
                                {(req.urgency === 'Emergency' || req.urgency === 'Urgent') && (
                                  <div className="text-[11px] font-bold text-rose-700">{req.urgency} priority</div>
                                )}
                              </td>
                              <td className="py-2.5 px-3 text-right font-mono-tabular tabular-nums font-bold text-slate-900 whitespace-nowrap">
                                {formatDays(Number(req.totalDays) || 0)}d
                              </td>
                              <td className={`py-2.5 px-3 font-montserrat font-bold whitespace-nowrap ${statusColor}`}>
                                {statusLabel}
                              </td>
                              <td className="py-2.5 px-4 text-[11px] text-slate-600 max-w-[220px] truncate">
                                {req.hrReviewerName
                                  ? `${req.hrReviewerName}${req.hrDecisionNote ? ` · ${req.hrDecisionNote}` : ''}`
                                  : req.reason || 'Awaiting HR review'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Mobile Ledger Cards */}
                  <div className="md:hidden divide-y divide-slate-100">
                    {visibleLedgerRows.map((req) => {
                      const statusColor =
                        req.status === 'Approved'
                          ? 'text-emerald-700'
                          : req.status === 'Pending HR Approval'
                          ? 'text-amber-700'
                          : req.status === 'Declined'
                          ? 'text-rose-700'
                          : 'text-slate-500';
                      const statusLabel =
                        req.status === 'Pending HR Approval'
                          ? 'Pending'
                          : req.status === 'Declined'
                          ? 'Rejected'
                          : req.status;
                      return (
                        <div key={req.id} className="p-3.5 space-y-1 text-xs">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-montserrat font-bold text-slate-900 truncate">
                                {req.staffName}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {req.leaveType} · {req.branchName}
                              </div>
                            </div>
                            <span className={`font-montserrat font-bold shrink-0 ${statusColor}`}>
                              {statusLabel}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-[11px] font-mono-tabular tabular-nums text-slate-600">
                            <span>
                              {formatShortDate(req.startDate)} → {formatShortDate(req.endDate)}
                            </span>
                            <span className="font-bold text-[#0A006E]">
                              {formatDays(Number(req.totalDays) || 0)}d
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {filteredLedgerRows.length > DEFAULT_VISIBLE_LIMIT && (
                    <div className="px-4 py-2.5 border-t border-slate-100 bg-slate-50/60 flex items-center justify-between text-xs">
                      <span className="text-slate-500 font-mono-tabular tabular-nums">
                        Showing {visibleLedgerRows.length} of {filteredLedgerRows.length} requests
                      </span>
                      <button
                        type="button"
                        onClick={() => setShowAllRows((prev) => !prev)}
                        className="font-montserrat font-bold text-[#0A006E] hover:underline cursor-pointer"
                      >
                        {showAllRows ? 'Show fewer' : `Show all ${filteredLedgerRows.length}`}
                      </button>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  );
};
