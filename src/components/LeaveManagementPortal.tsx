import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  AlertTriangle,
  HeartHandshake,
  Baby,
  Stethoscope,
  Briefcase,
  CheckCircle2,
  XCircle,
  Send,
  UserCheck,
  Phone,
  FileText,
  Download,
  Search,
  Filter,
  ShieldCheck,
  Users,
  Trash2,
  ChevronRight,
  Sparkles,
} from 'lucide-react';
import {
  StaffMember,
  Branch,
  LeaveRequest,
  LeaveType,
  LeaveDurationMode,
  LeaveUrgency,
} from '../types';
import { exportToCSV, exportReportToPDF } from '../erpUtils';

const COMPANY_ENTITLEMENTS: Record<string, number> = {
  'Annual Leave': 21,
  'Sick / Medical Leave': 14,
  'Maternity Leave': 90,
  'Paternity Leave': 14,
  'Emergency Leave': 7,
  'Off-Day': 52,
  'Compassionate / Study Leave': 10,
};

const LEAVE_CATEGORY_META: Array<{
  type: LeaveType;
  label: string;
  badge: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  accent: string;
}> = [
  {
    type: 'Annual Leave',
    label: 'Annual Leave',
    badge: '21 Days / Yr',
    desc: 'Planned paid vacation / rest',
    icon: Calendar,
    accent: 'bg-[#0A006E] text-[#FFDE00]',
  },
  {
    type: 'Off-Day',
    label: 'Off-Day / Rest',
    badge: 'Full / Half Day',
    desc: 'Scheduled shift off or comp-off',
    icon: Clock,
    accent: 'bg-sky-600 text-white',
  },
  {
    type: 'Emergency Leave',
    label: 'Emergency Request',
    badge: 'Priority HR Alert',
    desc: 'Urgent family / crisis absence',
    icon: AlertTriangle,
    accent: 'bg-rose-600 text-white',
  },
  {
    type: 'Maternity Leave',
    label: 'Maternity Leave',
    badge: '90 Days Statutory',
    desc: 'Full-pay maternity protection',
    icon: Baby,
    accent: 'bg-fuchsia-600 text-white',
  },
  {
    type: 'Paternity Leave',
    label: 'Paternity Leave',
    badge: '14 Days Statutory',
    desc: 'New child family bonding leave',
    icon: HeartHandshake,
    accent: 'bg-indigo-600 text-white',
  },
  {
    type: 'Sick / Medical Leave',
    label: 'Sick / Medical',
    badge: '14 Days / Yr',
    desc: 'Clinical treatment & recovery',
    icon: Stethoscope,
    accent: 'bg-emerald-600 text-white',
  },
  {
    type: 'Compassionate / Study Leave',
    label: 'Compassionate / Special',
    badge: 'Special Review',
    desc: 'Bereavement, exams, or unpaid',
    icon: Briefcase,
    accent: 'bg-amber-500 text-[#0A006E]',
  },
];

function getTodayIso(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDaysIso(startIso: string, addDays: number): string {
  const parts = startIso.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return startIso;
  const d = new Date(parts[0], parts[1] - 1, parts[2]);
  d.setDate(d.getDate() + addDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function calcLeaveDays(startIso: string, endIso: string, mode: LeaveDurationMode): number {
  if (!startIso || !endIso) return 1;
  const s = new Date(startIso + 'T00:00:00');
  const e = new Date(endIso + 'T00:00:00');
  if (Number.isNaN(s.getTime()) || Number.isNaN(e.getTime())) return 1;
  const diffDays = Math.floor((e.getTime() - s.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  if (diffDays <= 1 && mode !== 'Full Days') {
    return 0.5;
  }
  return Math.max(1, diffDays);
}

interface LeaveManagementPortalProps {
  mode?: 'staff_portal' | 'hr_inbox';
  currentUser: StaffMember;
  leaveRequests: LeaveRequest[];
  staffList: StaffMember[];
  branches: Branch[];
  onSubmitLeaveRequest: (
    draft: Omit<LeaveRequest, 'id' | 'requestNo' | 'createdAt' | 'status'>
  ) => Promise<LeaveRequest | null>;
  onReviewLeaveRequest?: (
    requestId: string,
    decision: 'Approved' | 'Declined',
    decisionNote: string
  ) => Promise<void>;
  onCancelLeaveRequest?: (requestId: string) => Promise<void>;
  onTriggerToast?: (type: 'success' | 'error', title: string, message: string) => void;
}

export const LeaveManagementPortal: React.FC<LeaveManagementPortalProps> = ({
  mode = 'staff_portal',
  currentUser,
  leaveRequests,
  staffList,
  branches,
  onSubmitLeaveRequest,
  onReviewLeaveRequest,
  onCancelLeaveRequest,
  onTriggerToast,
}) => {
  const canReviewAsHr = currentUser.role === 'HR' || currentUser.role === 'Admin';
  const [viewMode, setViewMode] = useState<'hr_approvals' | 'my_requests'>(() =>
    mode === 'hr_inbox' && canReviewAsHr ? 'hr_approvals' : 'my_requests'
  );

  // Request Form State
  const today = useMemo(() => getTodayIso(), []);
  const [leaveType, setLeaveType] = useState<LeaveType>('Annual Leave');
  const [durationMode, setDurationMode] = useState<LeaveDurationMode>('Full Days');
  const [startDate, setStartDate] = useState<string>(today);
  const [endDate, setEndDate] = useState<string>(today);
  const [urgency, setUrgency] = useState<LeaveUrgency>('Standard');
  const [reason, setReason] = useState<string>('');
  const [reliefStaffId, setReliefStaffId] = useState<string>('');
  const [emergencyContactName, setEmergencyContactName] = useState<string>('');
  const [emergencyContactPhone, setEmergencyContactPhone] = useState<string>('');
  const [expectedDeliveryDate, setExpectedDeliveryDate] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // HR Approval Filters & Decision Modal State
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [branchFilter, setBranchFilter] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [decisionTarget, setDecisionTarget] = useState<{
    req: LeaveRequest;
    action: 'Approved' | 'Declined';
  } | null>(null);
  const [decisionNote, setDecisionNote] = useState<string>('');
  const [isProcessingDecision, setIsProcessingDecision] = useState<boolean>(false);

  const computedTotalDays = useMemo(
    () => calcLeaveDays(startDate, endDate, durationMode),
    [startDate, endDate, durationMode]
  );

  const reliefColleagues = useMemo(() => {
    return staffList
      .filter((s) => s.status === 'Active' && s.id !== currentUser.id)
      .sort((a, b) => {
        const aSame = a.branchId === currentUser.branchId ? 0 : 1;
        const bSame = b.branchId === currentUser.branchId ? 0 : 1;
        return aSame - bSame || a.name.localeCompare(b.name);
      });
  }, [staffList, currentUser.id, currentUser.branchId]);

  const handleSelectCategory = (type: LeaveType) => {
    setLeaveType(type);
    setFormError(null);
    if (type === 'Emergency Leave') {
      setUrgency('Emergency');
      setDurationMode('Full Days');
      setEndDate(startDate);
    } else if (type === 'Maternity Leave') {
      setUrgency('Urgent');
      setDurationMode('Full Days');
      setEndDate(addDaysIso(startDate, 89)); // 90 calendar days inclusive
    } else if (type === 'Paternity Leave') {
      setUrgency('Standard');
      setDurationMode('Full Days');
      setEndDate(addDaysIso(startDate, 13)); // 14 calendar days inclusive
    } else if (type === 'Off-Day') {
      setUrgency('Standard');
      setEndDate(startDate);
    } else {
      setUrgency('Standard');
      setDurationMode('Full Days');
    }
  };

  const handleStartDateChange = (nextStart: string) => {
    setStartDate(nextStart);
    if (leaveType === 'Maternity Leave') {
      setEndDate(addDaysIso(nextStart, 89));
    } else if (leaveType === 'Paternity Leave') {
      setEndDate(addDaysIso(nextStart, 13));
    } else if (nextStart > endDate) {
      setEndDate(nextStart);
    }
  };

  // Current employee's requests & balance calculations for the current year
  const currentYear = String(new Date().getFullYear());
  const myRequests = useMemo(() => {
    return [...leaveRequests]
      .filter(
        (r) =>
          r.staffId === currentUser.id ||
          (r.staffEmail &&
            currentUser.email &&
            r.staffEmail.toLowerCase() === currentUser.email.toLowerCase())
      )
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [leaveRequests, currentUser.id, currentUser.email]);

  const myBalances = useMemo(() => {
    const calcUsedAndPending = (type: LeaveType) => {
      const yearReqs = myRequests.filter(
        (r) => r.leaveType === type && r.startDate.startsWith(currentYear)
      );
      const used = yearReqs
        .filter((r) => r.status === 'Approved')
        .reduce((s, r) => s + Number(r.totalDays || 0), 0);
      const pending = yearReqs
        .filter((r) => r.status === 'Pending HR Approval')
        .reduce((s, r) => s + Number(r.totalDays || 0), 0);
      const entitlement = COMPANY_ENTITLEMENTS[type] || 0;
      return {
        entitlement,
        used,
        pending,
        remaining: Math.max(0, entitlement - used),
      };
    };

    return {
      annual: calcUsedAndPending('Annual Leave'),
      sick: calcUsedAndPending('Sick / Medical Leave'),
      offDay: calcUsedAndPending('Off-Day'),
      emergency: calcUsedAndPending('Emergency Leave'),
      maternity: calcUsedAndPending('Maternity Leave'),
      paternity: calcUsedAndPending('Paternity Leave'),
    };
  }, [myRequests, currentYear]);

  // HR summary stats & queue
  const sortedAllRequests = useMemo(() => {
    return [...leaveRequests].sort((a, b) => {
      // Pending Emergency / Urgent requests surface first
      const aPending = a.status === 'Pending HR Approval' ? 0 : 1;
      const bPending = b.status === 'Pending HR Approval' ? 0 : 1;
      if (aPending !== bPending) return aPending - bPending;
      const urgencyWeight = { Emergency: 0, Urgent: 1, Standard: 2 };
      const uDiff = (urgencyWeight[a.urgency] ?? 2) - (urgencyWeight[b.urgency] ?? 2);
      if (uDiff !== 0) return uDiff;
      return b.createdAt.localeCompare(a.createdAt);
    });
  }, [leaveRequests]);

  const pendingRequests = useMemo(
    () => sortedAllRequests.filter((r) => r.status === 'Pending HR Approval'),
    [sortedAllRequests]
  );

  const urgentPendingRequests = useMemo(
    () =>
      pendingRequests.filter(
        (r) =>
          r.urgency === 'Emergency' ||
          r.leaveType === 'Emergency Leave' ||
          r.leaveType === 'Maternity Leave'
      ),
    [pendingRequests]
  );

  const awayTodayAndUpcoming = useMemo(() => {
    const windowEnd = addDaysIso(today, 14);
    return sortedAllRequests.filter(
      (r) => r.status === 'Approved' && r.endDate >= today && r.startDate <= windowEnd
    );
  }, [sortedAllRequests, today]);

  const filteredHrRequests = useMemo(() => {
    return sortedAllRequests.filter((r) => {
      if (statusFilter !== 'ALL' && r.status !== statusFilter) return false;
      if (typeFilter !== 'ALL' && r.leaveType !== typeFilter) return false;
      if (branchFilter !== 'ALL' && r.branchId !== branchFilter && r.branchName !== branchFilter)
        return false;
      const q = searchQuery.trim().toLowerCase();
      if (q) {
        return (
          r.staffName.toLowerCase().includes(q) ||
          r.requestNo.toLowerCase().includes(q) ||
          r.staffRole.toLowerCase().includes(q) ||
          r.branchName.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [sortedAllRequests, statusFilter, typeFilter, branchFilter, searchQuery]);

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!startDate || !endDate) {
      setFormError('Please select valid Start Date and End Date.');
      return;
    }
    if (endDate < startDate) {
      setFormError('End Date cannot be earlier than Start Date.');
      return;
    }
    if (!reason.trim() || reason.trim().length < 5) {
      setFormError('Please provide a clear reason and shift handover note (at least 5 characters).');
      return;
    }
    if (leaveType === 'Emergency Leave' && !emergencyContactPhone.trim()) {
      setFormError('Please provide an Emergency Contact Phone number for Emergency requests.');
      return;
    }

    const reliefStaff = staffList.find((s) => s.id === reliefStaffId);

    setIsSubmitting(true);
    try {
      await onSubmitLeaveRequest({
        staffId: currentUser.id,
        staffName: currentUser.name,
        staffEmail: currentUser.email,
        staffPhone: currentUser.phone,
        staffRole: currentUser.role,
        branchId: currentUser.branchId,
        branchName: currentUser.branchName,
        leaveType,
        durationMode: startDate === endDate ? durationMode : 'Full Days',
        startDate,
        endDate,
        totalDays: computedTotalDays,
        urgency,
        reason: reason.trim(),
        reliefStaffId: reliefStaff?.id,
        reliefStaffName: reliefStaff?.name,
        emergencyContactName: emergencyContactName.trim() || undefined,
        emergencyContactPhone: emergencyContactPhone.trim() || undefined,
        expectedDeliveryDate:
          leaveType === 'Maternity Leave' && expectedDeliveryDate
            ? expectedDeliveryDate
            : undefined,
      });

      setReason('');
      setEmergencyContactName('');
      setEmergencyContactPhone('');
      setExpectedDeliveryDate('');
      setReliefStaffId('');
    } catch (err: any) {
      setFormError(err?.message || 'Unable to submit leave request.');
      onTriggerToast?.('error', 'Request Failed', 'Could not submit leave request.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenDecision = (req: LeaveRequest, action: 'Approved' | 'Declined') => {
    setDecisionTarget({ req, action });
    setDecisionNote(
      action === 'Approved'
        ? `Approved for ${req.totalDays} day(s) (${req.startDate} to ${req.endDate}).${
            req.reliefStaffName ? ` Relief cover: ${req.reliefStaffName}.` : ''
          }`
        : ''
    );
  };

  const handleConfirmDecision = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!decisionTarget || !onReviewLeaveRequest) return;
    if (decisionTarget.action === 'Declined' && !decisionNote.trim()) {
      onTriggerToast?.('error', 'Reason Required', 'Please provide a reason when declining a request.');
      return;
    }
    setIsProcessingDecision(true);
    try {
      await onReviewLeaveRequest(
        decisionTarget.req.id,
        decisionTarget.action,
        decisionNote.trim() ||
          (decisionTarget.action === 'Approved' ? 'Approved by HR.' : 'Declined by HR.')
      );
      setDecisionTarget(null);
      setDecisionNote('');
    } finally {
      setIsProcessingDecision(false);
    }
  };

  const handlePrintLeaveLetter = (req: LeaveRequest) => {
    exportReportToPDF(
      `Official ${req.leaveType} Authorization (${req.requestNo})`,
      `Employee: ${req.staffName} (${req.staffRole}) · Branch: ${req.branchName}`,
      ['Field', 'Details'],
      [
        ['Request Number', req.requestNo],
        ['Employee Name & Role', `${req.staffName} (${req.staffRole})`],
        ['Branch / Department', req.branchName],
        ['Leave Category', `${req.leaveType}${req.durationMode ? ` (${req.durationMode})` : ''}`],
        ['Period', `${req.startDate} to ${req.endDate} (${req.totalDays} day(s))`],
        ['Priority / Urgency', req.urgency],
        ['Relief / Cover Staff', req.reliefStaffName || 'Line Supervisor Handover'],
        ['Employee Notes', req.reason],
        ['HR Decision Status', req.status],
        ['Reviewed By', req.hrReviewerName ? `${req.hrReviewerName} (${req.hrReviewerRole || 'HR'})` : 'Pending'],
        ['HR Remarks', req.hrDecisionNote || '—'],
      ],
      `Vaairo_${req.requestNo}`
    );
  };

  const getStatusBadgeClass = (status: LeaveRequest['status']) => {
    if (status === 'Approved')
      return 'bg-[#34D186]/20 text-[#1E9E60] border-[#34D186]/50';
    if (status === 'Declined')
      return 'bg-rose-100 text-rose-800 border-rose-300';
    if (status === 'Cancelled')
      return 'bg-slate-100 text-slate-500 border-slate-300';
    return 'bg-amber-100 text-amber-900 border-amber-300';
  };

  const getUrgencyBadgeClass = (u: LeaveUrgency) => {
    if (u === 'Emergency') return 'bg-rose-600 text-white border-rose-700';
    if (u === 'Urgent') return 'bg-amber-500 text-[#0A006E] border-amber-600';
    return 'bg-slate-100 text-slate-700 border-slate-200';
  };

  return (
    <div className="space-y-6">
      {/* Top Banner + Mode Switch for HR/Admin */}
      <div className="bg-[#FFDE00] border-2 border-[#0A006E] rounded-2xl p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 relative overflow-hidden">
        <div className="silent-scanner-beam-dark" />
        <div className="relative z-10">
          <span className="text-xs font-montserrat font-black text-[#0A006E] uppercase tracking-wider">
            Company Leave, Off-Day, Emergency &amp; Maternity Governance
          </span>
          <h2 className="text-xl font-montserrat font-black italic text-[#0A006E] mt-1">
            {viewMode === 'hr_approvals'
              ? 'HR Leave, Off-Days & Emergency Approvals Desk'
              : 'My Leave, Off-Day & Emergency Request Portal'}
          </h2>
          <p className="text-xs font-medium text-slate-900 mt-0.5">
            {viewMode === 'hr_approvals'
              ? 'Review incoming staff requests across all branches, check relief cover, and approve or decline with instant employee notification.'
              : 'Track your leave balances and submit Annual Leave, Off-Days, Emergency, Sick, Maternity, or Paternity requests directly to HR.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 relative z-10">
          {canReviewAsHr && (
            <div className="inline-flex bg-white border-2 border-[#0A006E] rounded-xl p-1 shadow-xs">
              <button
                type="button"
                onClick={() => setViewMode('hr_approvals')}
                className={`px-3.5 py-2 rounded-lg text-xs font-montserrat font-black cursor-pointer transition flex items-center gap-1.5 ${
                  viewMode === 'hr_approvals'
                    ? 'bg-[#0A006E] text-[#FFDE00]'
                    : 'text-[#0A006E] hover:bg-slate-100'
                }`}
              >
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>HR Approvals Desk</span>
                {pendingRequests.length > 0 && (
                  <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-rose-600 text-white font-mono-tabular">
                    {pendingRequests.length}
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setViewMode('my_requests')}
                className={`px-3.5 py-2 rounded-lg text-xs font-montserrat font-black cursor-pointer transition flex items-center gap-1.5 ${
                  viewMode === 'my_requests'
                    ? 'bg-[#0A006E] text-[#FFDE00]'
                    : 'text-[#0A006E] hover:bg-slate-100'
                }`}
              >
                <Calendar className="w-3.5 h-3.5" />
                <span>Submit / My Requests</span>
              </button>
            </div>
          )}

          {viewMode === 'hr_approvals' && (
            <>
              <button
                type="button"
                onClick={() =>
                  exportToCSV(
                    'Vaairo_HR_Leave_Register',
                    [
                      'Request No',
                      'Staff Name',
                      'Role',
                      'Branch',
                      'Category',
                      'Start Date',
                      'End Date',
                      'Days',
                      'Urgency',
                      'Relief Staff',
                      'Status',
                      'HR Reviewer',
                      'HR Remarks',
                      'Submitted At',
                    ],
                    filteredHrRequests.map((r) => [
                      r.requestNo,
                      r.staffName,
                      r.staffRole,
                      r.branchName,
                      r.leaveType,
                      r.startDate,
                      r.endDate,
                      r.totalDays,
                      r.urgency,
                      r.reliefStaffName || 'None',
                      r.status,
                      r.hrReviewerName || 'Pending',
                      r.hrDecisionNote || '',
                      r.createdAt,
                    ])
                  )
                }
                className="px-3.5 py-2 bg-white hover:bg-slate-50 border-2 border-[#0A006E] text-[#0A006E] rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export CSV
              </button>
              <button
                type="button"
                onClick={() =>
                  exportReportToPDF(
                    'Company Leave, Off-Day & Emergency Register',
                    `Generated by ${currentUser.name} (${currentUser.role})`,
                    ['Req No', 'Staff', 'Branch', 'Type', 'Dates', 'Days', 'Urgency', 'Status'],
                    filteredHrRequests.map((r) => [
                      r.requestNo,
                      `${r.staffName} (${r.staffRole})`,
                      r.branchName,
                      r.leaveType,
                      `${r.startDate} → ${r.endDate}`,
                      String(r.totalDays),
                      r.urgency,
                      r.status,
                    ]),
                    'Vaairo_Leave_Register'
                  )
                }
                className="px-3.5 py-2 bg-[#0A006E] text-[#FFDE00] rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                Export PDF
              </button>
            </>
          )}
        </div>
      </div>

      {/* =================================================================== */}
      {/* HR APPROVALS DESK VIEW                                              */}
      {/* =================================================================== */}
      {viewMode === 'hr_approvals' && canReviewAsHr && (
        <div className="space-y-6">
          {/* HR Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Pending HR Review
              </div>
              <div className="text-2xl font-montserrat font-black text-[#0A006E] font-mono-tabular mt-1">
                {pendingRequests.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Awaiting HR approval / decline
              </div>
            </div>

            <div
              className={`rounded-2xl p-4 border-2 ${
                urgentPendingRequests.length > 0
                  ? 'bg-rose-50 border-rose-400'
                  : 'bg-[#F0F2F0] border-slate-200'
              }`}
            >
              <div className="text-xs font-montserrat font-bold text-rose-800">
                Urgent / Emergency / Maternity
              </div>
              <div className="text-2xl font-montserrat font-black text-rose-600 font-mono-tabular mt-1">
                {urgentPendingRequests.length}
              </div>
              <div className="text-[11px] text-rose-700 mt-1">
                Priority humanitarian &amp; emergency queue
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Away Today / Next 14 Days
              </div>
              <div className="text-2xl font-montserrat font-black text-[#1E9E60] font-mono-tabular mt-1">
                {awayTodayAndUpcoming.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Approved active &amp; upcoming absences
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Total Requests Logged
              </div>
              <div className="text-2xl font-montserrat font-black text-slate-800 font-mono-tabular mt-1">
                {leaveRequests.length}
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                {leaveRequests.filter((r) => r.status === 'Approved').length} approved ·{' '}
                {leaveRequests.filter((r) => r.status === 'Declined').length} declined
              </div>
            </div>
          </div>

          {/* Urgent Emergency / Maternity Priority Alert Queue */}
          {urgentPendingRequests.length > 0 && (
            <div className="bg-rose-50 border-2 border-rose-500 rounded-2xl p-4 sm:p-5 space-y-3 shadow-sm">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-rose-600 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-montserrat font-black text-rose-900">
                      Priority Emergency &amp; Maternity Requests ({urgentPendingRequests.length})
                    </h3>
                    <p className="text-xs text-rose-700">
                      Time-sensitive staff requests flagged for immediate HR attention.
                    </p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {urgentPendingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white border-2 border-rose-300 rounded-2xl p-4 space-y-2.5 shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono-tabular font-black text-xs text-[#0A006E]">
                            {req.requestNo}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-rose-600 text-white">
                            {req.leaveType}
                          </span>
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                            {req.totalDays} day(s)
                          </span>
                        </div>
                        <div className="font-montserrat font-black text-sm text-slate-900 mt-1">
                          {req.staffName}{' '}
                          <span className="text-xs font-semibold text-slate-500">
                            ({req.staffRole} · {req.branchName})
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1">
                      <div>
                        <strong>Dates:</strong> {req.startDate} to {req.endDate}
                        {req.expectedDeliveryDate && ` · EDD: ${req.expectedDeliveryDate}`}
                      </div>
                      <div>
                        <strong>Reason:</strong> {req.reason}
                      </div>
                      {(req.reliefStaffName || req.emergencyContactPhone) && (
                        <div className="text-[11px] text-slate-600 pt-1 border-t border-slate-200 flex flex-wrap gap-3">
                          {req.reliefStaffName && (
                            <span>Relief Cover: <strong>{req.reliefStaffName}</strong></span>
                          )}
                          {req.emergencyContactPhone && (
                            <span>Emergency Tel: <strong>{req.emergencyContactPhone}</strong></span>
                          )}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleOpenDecision(req, 'Approved')}
                        className="flex-1 py-2 bg-[#34D186] hover:bg-[#28B873] text-[#0A006E] font-montserrat font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-[#0A006E]"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve Now
                      </button>
                      <button
                        type="button"
                        onClick={() => handleOpenDecision(req, 'Declined')}
                        className="flex-1 py-2 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white font-montserrat font-black text-xs rounded-xl flex items-center justify-center gap-1.5 cursor-pointer border border-rose-300 transition"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Decline
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Away Today / Upcoming Roster Coverage Strip */}
          {awayTodayAndUpcoming.length > 0 && (
            <div className="bg-[#0A006E]/5 border border-[#0A006E]/20 rounded-2xl p-4 space-y-2.5">
              <div className="text-xs font-montserrat font-black text-[#0A006E] flex items-center gap-2">
                <Users className="w-4 h-4 text-[#0A006E]" />
                Active &amp; Upcoming Approved Staff Absences (Today + Next 14 Days)
              </div>
              <div className="flex flex-wrap gap-2">
                {awayTodayAndUpcoming.map((r) => {
                  const isAwayNow = r.startDate <= today && r.endDate >= today;
                  return (
                    <div
                      key={r.id}
                      className={`px-3 py-2 rounded-xl border text-xs flex items-center gap-2 bg-white ${
                        isAwayNow ? 'border-[#34D186] shadow-2xs' : 'border-slate-200'
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isAwayNow ? 'bg-[#34D186] animate-pulse' : 'bg-amber-400'
                        }`}
                      />
                      <div>
                        <span className="font-montserrat font-black text-[#0A006E]">
                          {r.staffName}
                        </span>{' '}
                        <span className="text-slate-500">({r.leaveType})</span>
                        <div className="text-[10px] text-slate-500 font-mono-tabular">
                          {r.startDate} → {r.endDate} · Cover: {r.reliefStaffName || 'Supervisor'}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Filter & Search Bar */}
          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search staff, request #, branch..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
              >
                <option value="ALL">All Statuses ({leaveRequests.length})</option>
                <option value="Pending HR Approval">
                  Pending HR Approval ({pendingRequests.length})
                </option>
                <option value="Approved">Approved</option>
                <option value="Declined">Declined</option>
                <option value="Cancelled">Cancelled</option>
              </select>

              <select
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
              >
                <option value="ALL">All Leave &amp; Off Categories</option>
                {LEAVE_CATEGORY_META.map((c) => (
                  <option key={c.type} value={c.type}>
                    {c.type}
                  </option>
                ))}
              </select>

              <select
                value={branchFilter}
                onChange={(e) => setBranchFilter(e.target.value)}
                className="px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800"
              >
                <option value="ALL">All Branches &amp; Warehouses</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Mobile Card List */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {filteredHrRequests.length === 0 ? (
                <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                  No leave, off-day, or emergency requests match the active filters.
                </div>
              ) : (
                filteredHrRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-mono-tabular font-black text-[#0A006E]">
                            {req.requestNo}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getUrgencyBadgeClass(
                              req.urgency
                            )}`}
                          >
                            {req.urgency}
                          </span>
                        </div>
                        <div className="font-montserrat font-black text-slate-900 text-sm mt-1">
                          {req.staffName}
                        </div>
                        <div className="text-[11px] text-slate-500">
                          {req.staffRole} · {req.branchName}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getStatusBadgeClass(
                          req.status
                        )}`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1">
                      <div className="font-bold text-[#0A006E]">
                        {req.leaveType} ({req.totalDays} day{req.totalDays === 1 ? '' : 's'}
                        {req.durationMode && req.durationMode !== 'Full Days'
                          ? ` · ${req.durationMode}`
                          : ''}
                        )
                      </div>
                      <div className="font-mono-tabular text-[11px] text-slate-700">
                        {req.startDate} → {req.endDate}
                      </div>
                      <div className="text-slate-700">{req.reason}</div>
                      {req.reliefStaffName && (
                        <div className="text-[11px] text-slate-500">
                          Relief Cover: <strong>{req.reliefStaffName}</strong>
                        </div>
                      )}
                      {req.hrDecisionNote && (
                        <div className="text-[11px] text-[#0A006E] pt-1 border-t border-slate-200">
                          <strong>HR Note:</strong> {req.hrDecisionNote}
                        </div>
                      )}
                    </div>

                    {req.status === 'Pending HR Approval' ? (
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleOpenDecision(req, 'Approved')}
                          className="flex-1 py-2 bg-[#34D186] text-[#0A006E] border border-[#0A006E] rounded-xl font-montserrat font-black text-xs cursor-pointer"
                        >
                          Approve
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenDecision(req, 'Declined')}
                          className="flex-1 py-2 bg-rose-50 text-rose-700 border border-rose-300 rounded-xl font-montserrat font-black text-xs cursor-pointer"
                        >
                          Decline
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handlePrintLeaveLetter(req)}
                        className="w-full py-2 bg-[#0A006E] text-[#FFDE00] rounded-xl font-montserrat font-black text-xs cursor-pointer"
                      >
                        Print Decision Record (PDF)
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table */}
            <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-xl">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-[#0A006E] text-[#FFDE00] font-montserrat">
                    <th className="py-2.5 px-3 font-black">Request #</th>
                    <th className="py-2.5 px-3 font-black">Employee &amp; Branch</th>
                    <th className="py-2.5 px-3 font-black">Category &amp; Urgency</th>
                    <th className="py-2.5 px-3 font-black">Dates &amp; Days</th>
                    <th className="py-2.5 px-3 font-black">Reason &amp; Relief Cover</th>
                    <th className="py-2.5 px-3 font-black">Status</th>
                    <th className="py-2.5 px-3 font-black text-right">HR Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredHrRequests.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="py-10 text-center text-slate-500 font-medium">
                        No leave, off-day, emergency, or maternity requests found. Staff can submit requests from their own dashboards.
                      </td>
                    </tr>
                  ) : (
                    filteredHrRequests.map((req) => (
                      <tr key={req.id} className="hover:bg-slate-50 align-top">
                        <td className="py-3 px-3 font-mono-tabular font-bold text-[#0A006E] whitespace-nowrap">
                          <div>{req.requestNo}</div>
                          <div className="text-[10px] font-normal text-slate-400">
                            {new Date(req.createdAt).toLocaleDateString()}
                          </div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-montserrat font-black text-slate-900">
                            {req.staffName}
                          </div>
                          <div className="text-[11px] font-semibold text-[#0A006E]">
                            {req.staffRole}
                          </div>
                          <div className="text-[11px] text-slate-500">{req.branchName}</div>
                        </td>
                        <td className="py-3 px-3">
                          <div className="font-montserrat font-bold text-slate-900">
                            {req.leaveType}
                          </div>
                          <span
                            className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${getUrgencyBadgeClass(
                              req.urgency
                            )}`}
                          >
                            {req.urgency}
                          </span>
                        </td>
                        <td className="py-3 px-3 font-mono-tabular whitespace-nowrap">
                          <div className="font-bold text-slate-900">
                            {req.startDate} → {req.endDate}
                          </div>
                          <div className="text-[11px] text-[#0A006E] font-bold">
                            {req.totalDays} day{req.totalDays === 1 ? '' : 's'}
                            {req.durationMode && req.durationMode !== 'Full Days'
                              ? ` · ${req.durationMode}`
                              : ''}
                          </div>
                          {req.expectedDeliveryDate && (
                            <div className="text-[10px] text-fuchsia-700 font-semibold">
                              EDD: {req.expectedDeliveryDate}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 max-w-xs">
                          <p className="text-slate-800 leading-relaxed">{req.reason}</p>
                          {(req.reliefStaffName || req.emergencyContactPhone) && (
                            <div className="text-[11px] text-slate-500 mt-1 space-y-0.5">
                              {req.reliefStaffName && (
                                <div>
                                  Relief: <strong className="text-slate-700">{req.reliefStaffName}</strong>
                                </div>
                              )}
                              {req.emergencyContactPhone && (
                                <div>
                                  Emergency Contact:{' '}
                                  <strong className="text-slate-700">
                                    {req.emergencyContactName ? `${req.emergencyContactName} · ` : ''}
                                    {req.emergencyContactPhone}
                                  </strong>
                                </div>
                              )}
                            </div>
                          )}
                          {req.hrDecisionNote && (
                            <div className="mt-1.5 text-[11px] bg-slate-100 border border-slate-200 rounded-lg px-2 py-1 text-slate-700">
                              <strong>HR:</strong> {req.hrDecisionNote}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3">
                          <span
                            className={`inline-flex px-2.5 py-0.5 rounded-full text-[10px] font-bold border whitespace-nowrap ${getStatusBadgeClass(
                              req.status
                            )}`}
                          >
                            {req.status}
                          </span>
                          {req.hrReviewerName && (
                            <div className="text-[10px] text-slate-500 mt-1">
                              By {req.hrReviewerName}
                            </div>
                          )}
                        </td>
                        <td className="py-3 px-3 text-right whitespace-nowrap">
                          {req.status === 'Pending HR Approval' ? (
                            <div className="inline-flex items-center gap-1.5">
                              <button
                                type="button"
                                onClick={() => handleOpenDecision(req, 'Approved')}
                                className="px-3 py-1.5 bg-[#34D186] hover:bg-[#28B873] text-[#0A006E] border border-[#0A006E] rounded-lg font-montserrat font-black text-[11px] cursor-pointer flex items-center gap-1"
                              >
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenDecision(req, 'Declined')}
                                className="px-3 py-1.5 bg-rose-50 hover:bg-rose-600 text-rose-700 hover:text-white border border-rose-300 rounded-lg font-montserrat font-black text-[11px] cursor-pointer flex items-center gap-1 transition"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Decline
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handlePrintLeaveLetter(req)}
                              className="px-3 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg font-montserrat font-black text-[11px] cursor-pointer inline-flex items-center gap-1"
                            >
                              <FileText className="w-3 h-3" />
                              PDF Record
                            </button>
                          )}
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

      {/* =================================================================== */}
      {/* STAFF SELF-SERVICE LEAVE, OFF & EMERGENCY REQUEST PORTAL            */}
      {/* =================================================================== */}
      {viewMode === 'my_requests' && (
        <div className="space-y-6">
          {/* Entitlement Balances Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Annual Leave Balance ({currentYear})
              </div>
              <div className="text-2xl font-montserrat font-black text-[#0A006E] font-mono-tabular mt-1">
                {myBalances.annual.remaining} / {myBalances.annual.entitlement}{' '}
                <span className="text-xs font-bold">days</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Used: {myBalances.annual.used} · Pending: {myBalances.annual.pending}
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Sick / Medical Balance
              </div>
              <div className="text-2xl font-montserrat font-black text-[#1E9E60] font-mono-tabular mt-1">
                {myBalances.sick.remaining} / {myBalances.sick.entitlement}{' '}
                <span className="text-xs font-bold">days</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Company medical recovery allowance
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Maternity / Paternity
              </div>
              <div className="text-xl sm:text-2xl font-montserrat font-black text-fuchsia-700 font-mono-tabular mt-1">
                90d <span className="text-xs text-slate-400">/</span> 14d
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Full statutory parental protection
              </div>
            </div>

            <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4">
              <div className="text-xs font-montserrat font-bold text-slate-600">
                Off-Days &amp; Emergencies Logged
              </div>
              <div className="text-2xl font-montserrat font-black text-amber-600 font-mono-tabular mt-1">
                {myBalances.offDay.used + myBalances.emergency.used}{' '}
                <span className="text-xs font-bold">days</span>
              </div>
              <div className="text-[11px] text-slate-500 mt-1">
                Pending HR review: {myRequests.filter((r) => r.status === 'Pending HR Approval').length}
              </div>
            </div>
          </div>

          {/* Submit Request Form */}
          <form
            onSubmit={handleSubmitForm}
            className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-4 shadow-xs"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-200 pb-3">
              <div>
                <h3 className="text-sm font-montserrat font-black text-[#0A006E] flex items-center gap-2">
                  <Send className="w-4 h-4 text-[#0A006E]" />
                  Submit New Leave, Off-Day, Emergency, or Maternity Request
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Submitted as <strong>{currentUser.name}</strong> ({currentUser.role} ·{' '}
                  {currentUser.branchName}) directly to HR.
                </p>
              </div>
              <span className="px-3 py-1 rounded-xl bg-white border border-slate-200 font-mono-tabular font-black text-xs text-[#0A006E] w-fit">
                Requested Duration: {computedTotalDays} day{computedTotalDays === 1 ? '' : 's'}
              </span>
            </div>

            {/* Category Selector Cards */}
            <div className="space-y-2">
              <label className="block text-xs font-montserrat font-bold text-slate-700">
                1. Select Request Category *
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
                {LEAVE_CATEGORY_META.map((cat) => {
                  const IconComp = cat.icon;
                  const active = leaveType === cat.type;
                  return (
                    <button
                      key={cat.type}
                      type="button"
                      onClick={() => handleSelectCategory(cat.type)}
                      className={`p-3 rounded-2xl border-2 text-left transition cursor-pointer flex flex-col justify-between gap-2 ${
                        active
                          ? 'bg-white border-[#0A006E] ring-2 ring-[#FFDE00] shadow-sm'
                          : 'bg-white/80 border-slate-200 hover:border-[#0A006E]'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${cat.accent}`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <span className="text-[10px] font-montserrat font-bold text-slate-500">
                          {cat.badge}
                        </span>
                      </div>
                      <div>
                        <div className="text-xs font-montserrat font-black text-[#0A006E]">
                          {cat.label}
                        </div>
                        <div className="text-[10px] text-slate-500 leading-snug">{cat.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Dates, Urgency & Relief */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-xs">
              <div>
                <label className="font-montserrat font-bold text-slate-700">Start Date *</label>
                <input
                  required
                  type="date"
                  value={startDate}
                  onChange={(e) => handleStartDateChange(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono-tabular font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-montserrat font-bold text-slate-700">End Date *</label>
                <input
                  required
                  type="date"
                  min={startDate}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono-tabular font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="font-montserrat font-bold text-slate-700">Day Format</label>
                <select
                  disabled={startDate !== endDate}
                  value={startDate === endDate ? durationMode : 'Full Days'}
                  onChange={(e) => setDurationMode(e.target.value as LeaveDurationMode)}
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-semibold text-slate-800 disabled:bg-slate-100"
                >
                  <option value="Full Days">Full Day(s)</option>
                  <option value="Half Day (Morning)">Half Day (Morning AM)</option>
                  <option value="Half Day (Afternoon)">Half Day (Afternoon PM)</option>
                </select>
              </div>

              <div>
                <label className="font-montserrat font-bold text-slate-700">Priority Level</label>
                <select
                  value={urgency}
                  onChange={(e) => setUrgency(e.target.value as LeaveUrgency)}
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-montserrat font-bold text-[#0A006E]"
                >
                  <option value="Standard">Standard Request</option>
                  <option value="Urgent">Urgent Review</option>
                  <option value="Emergency">Critical Emergency</option>
                </select>
              </div>

              <div className="sm:col-span-2">
                <label className="font-montserrat font-bold text-slate-700">
                  Relief / Shift Handover Colleague (Optional)
                </label>
                <select
                  value={reliefStaffId}
                  onChange={(e) => setReliefStaffId(e.target.value)}
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl"
                >
                  <option value="">-- Assign Line Manager / No Specific Colleague --</option>
                  {reliefColleagues.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.role} · {s.branchName})
                    </option>
                  ))}
                </select>
              </div>

              {leaveType === 'Maternity Leave' && (
                <div className="sm:col-span-2">
                  <label className="font-montserrat font-bold text-fuchsia-800">
                    Expected Delivery Date (EDD - Optional)
                  </label>
                  <input
                    type="date"
                    value={expectedDeliveryDate}
                    onChange={(e) => setExpectedDeliveryDate(e.target.value)}
                    className="w-full mt-1 px-3 py-2 bg-white border border-fuchsia-300 rounded-xl font-mono-tabular"
                  />
                </div>
              )}

              <div>
                <label className="font-montserrat font-bold text-slate-700">
                  Emergency / Alternate Contact Name
                </label>
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  placeholder="Next of kin / alternate contact"
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="font-montserrat font-bold text-slate-700">
                  Reachable Phone {leaveType === 'Emergency Leave' ? '*' : '(Optional)'}
                </label>
                <input
                  type="tel"
                  required={leaveType === 'Emergency Leave'}
                  value={emergencyContactPhone}
                  onChange={(e) => setEmergencyContactPhone(e.target.value)}
                  placeholder="+254 7XX XXX XXX"
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl font-mono-tabular"
                />
              </div>

              <div className="sm:col-span-2 lg:col-span-4">
                <label className="font-montserrat font-bold text-slate-700">
                  Reason &amp; Handover Instructions *
                </label>
                <textarea
                  required
                  rows={2}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Explain the leave/off/emergency details and pending duties handed over..."
                  className="w-full mt-1 px-3 py-2 bg-white border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-300 rounded-xl text-xs text-rose-800 font-semibold flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                {formError}
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
              <div className="text-[11px] text-slate-600 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-[#0A006E]" />
                HR will receive this request immediately on their HR Approvals Desk.
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-6 py-3 bg-[#0A006E] hover:bg-[#060046] disabled:opacity-50 text-[#FFDE00] rounded-xl font-montserrat font-black text-xs flex items-center justify-center gap-2 cursor-pointer shadow-md transition"
              >
                <Send className="w-4 h-4" />
                {isSubmitting ? 'Sending to HR...' : `Submit ${leaveType} Request to HR`}
              </button>
            </div>
          </form>

          {/* My Submitted Requests History */}
          <div className="bg-[#F0F2F0] border border-slate-200 rounded-2xl p-4 sm:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-montserrat font-black text-[#0A006E]">
                My Leave, Off &amp; Emergency Request History ({myRequests.length})
              </h3>
            </div>

            {myRequests.length === 0 ? (
              <div className="bg-white border border-slate-200 rounded-xl p-6 text-center text-xs text-slate-500">
                You have not submitted any leave, off-day, emergency, or maternity requests yet.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {myRequests.map((req) => (
                  <div
                    key={req.id}
                    className="bg-white border border-slate-200 rounded-2xl p-4 space-y-2.5 text-xs shadow-2xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono-tabular font-black text-[#0A006E]">
                            {req.requestNo}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getUrgencyBadgeClass(
                              req.urgency
                            )}`}
                          >
                            {req.urgency}
                          </span>
                        </div>
                        <div className="font-montserrat font-black text-sm text-slate-900 mt-1">
                          {req.leaveType}
                        </div>
                      </div>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 ${getStatusBadgeClass(
                          req.status
                        )}`}
                      >
                        {req.status}
                      </span>
                    </div>

                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 space-y-1">
                      <div className="font-mono-tabular font-bold text-[#0A006E]">
                        {req.startDate} → {req.endDate} ({req.totalDays} day
                        {req.totalDays === 1 ? '' : 's'})
                      </div>
                      <div className="text-slate-700">{req.reason}</div>
                      {req.reliefStaffName && (
                        <div className="text-[11px] text-slate-500">
                          Relief Staff: <strong>{req.reliefStaffName}</strong>
                        </div>
                      )}
                      {req.hrDecisionNote && (
                        <div className="text-[11px] pt-1 border-t border-slate-200 text-slate-800">
                          <strong>HR Response ({req.hrReviewerName || 'HR'}):</strong>{' '}
                          {req.hrDecisionNote}
                        </div>
                      )}
                    </div>

                    <div className="flex items-center justify-between gap-2 pt-1">
                      <span className="text-[10px] text-slate-400">
                        Submitted {new Date(req.createdAt).toLocaleString()}
                      </span>
                      <div className="flex items-center gap-2">
                        {req.status === 'Pending HR Approval' && onCancelLeaveRequest && (
                          <button
                            type="button"
                            onClick={() => onCancelLeaveRequest(req.id)}
                            className="px-3 py-1.5 bg-slate-100 hover:bg-rose-100 text-slate-700 hover:text-rose-800 rounded-lg font-montserrat font-bold text-[11px] cursor-pointer transition"
                          >
                            Withdraw
                          </button>
                        )}
                        {req.status === 'Approved' && (
                          <button
                            type="button"
                            onClick={() => handlePrintLeaveLetter(req)}
                            className="px-3 py-1.5 bg-[#0A006E] text-[#FFDE00] rounded-lg font-montserrat font-black text-[11px] cursor-pointer flex items-center gap-1"
                          >
                            <Download className="w-3 h-3" />
                            Approval Letter PDF
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* HR APPROVAL / DECLINE CONFIRMATION MODAL                            */}
      {/* =================================================================== */}
      {decisionTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmDecision}
            className="bg-white border-2 border-[#0A006E] rounded-3xl max-w-md w-full p-5 sm:p-6 space-y-4 shadow-2xl animate-scale-in"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                    decisionTarget.action === 'Approved'
                      ? 'bg-[#34D186] text-[#0A006E]'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  {decisionTarget.action === 'Approved' ? (
                    <CheckCircle2 className="w-5 h-5" />
                  ) : (
                    <XCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h4 className="font-montserrat font-black text-sm text-[#0A006E]">
                    {decisionTarget.action === 'Approved'
                      ? 'Approve Staff Leave Request'
                      : 'Decline Staff Leave Request'}
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    {decisionTarget.req.requestNo} · {decisionTarget.req.staffName}
                  </p>
                </div>
              </div>
            </div>

            <div className="bg-[#F0F2F0] rounded-2xl p-3 text-xs space-y-1">
              <div>
                <strong>Type:</strong> {decisionTarget.req.leaveType} (
                {decisionTarget.req.totalDays} day{decisionTarget.req.totalDays === 1 ? '' : 's'})
              </div>
              <div>
                <strong>Dates:</strong> {decisionTarget.req.startDate} →{' '}
                {decisionTarget.req.endDate}
              </div>
              <div>
                <strong>Branch:</strong> {decisionTarget.req.branchName}
              </div>
            </div>

            <div>
              <label className="block text-xs font-montserrat font-bold text-slate-700 mb-1">
                HR Decision Remarks{' '}
                {decisionTarget.action === 'Declined' ? '(Required)' : '(Optional)'}
              </label>
              <textarea
                rows={3}
                required={decisionTarget.action === 'Declined'}
                value={decisionNote}
                onChange={(e) => setDecisionNote(e.target.value)}
                placeholder={
                  decisionTarget.action === 'Approved'
                    ? 'Add handover or resumption notes...'
                    : 'Explain why this request is declined so the employee knows next steps...'
                }
                className="w-full px-3 py-2 bg-slate-50 border-2 border-slate-200 focus:border-[#0A006E] rounded-xl text-xs outline-none"
              />
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDecisionTarget(null)}
                className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl font-montserrat font-bold text-xs cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isProcessingDecision}
                className={`flex-1 py-2.5 rounded-xl font-montserrat font-black text-xs cursor-pointer shadow-sm ${
                  decisionTarget.action === 'Approved'
                    ? 'bg-[#34D186] hover:bg-[#28B873] text-[#0A006E] border border-[#0A006E]'
                    : 'bg-rose-600 hover:bg-rose-700 text-white'
                }`}
              >
                {isProcessingDecision
                  ? 'Saving...'
                  : decisionTarget.action === 'Approved'
                  ? 'Confirm Approval'
                  : 'Confirm Decline'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
