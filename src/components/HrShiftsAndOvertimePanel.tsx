import React, { useMemo, useState } from 'react';
import {
  Clock,
  CheckCircle2,
  XCircle,
  Coins,
  Search,
  Download,
  Users,
  AlertTriangle,
  Pencil,
  Square,
  Timer,
} from 'lucide-react';
import { StaffMember, StaffShiftSession, OvertimeRequest } from '../types';
import { formatKes, exportToCSV } from '../erpUtils';

interface HrShiftsAndOvertimePanelProps {
  currentUser: StaffMember;
  staffList: StaffMember[];
  staffShifts: StaffShiftSession[];
  overtimeRequests: OvertimeRequest[];
  onReviewOvertimeRequest?: (
    requestId: string,
    decision: 'Approved' | 'Declined',
    otRatePerHourKes: number,
    approvedHours: number,
    otMultiplier?: number,
    decisionNote?: string
  ) => Promise<void>;
  onEndStaffShift?: (shiftId: string, notes?: string) => Promise<void>;
  onTriggerToast: (type: 'success' | 'error', title: string, message: string) => void;
}

function formatDurationMinutes(mins: number): string {
  const safe = Math.max(0, Math.round(mins));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

export const HrShiftsAndOvertimePanel: React.FC<HrShiftsAndOvertimePanelProps> = ({
  currentUser,
  staffList,
  staffShifts,
  overtimeRequests,
  onReviewOvertimeRequest,
  onEndStaffShift,
  onTriggerToast,
}) => {
  const canSetOtRate = currentUser.role === 'HR' || currentUser.role === 'Admin';
  const [subView, setSubView] = useState<'overtime' | 'shifts'>('overtime');
  const [otStatusFilter, setOtStatusFilter] = useState<'ALL' | 'Pending HR Rate' | 'Approved' | 'Declined'>('ALL');
  const [shiftStatusFilter, setShiftStatusFilter] = useState<'ALL' | 'Active' | 'Completed'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Per-request HR rate drafting state
  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);
  const [draftRates, setDraftRates] = useState<Record<string, string>>({});
  const [draftHours, setDraftHours] = useState<Record<string, string>>({});
  const [draftMultipliers, setDraftMultipliers] = useState<Record<string, number>>({});
  const [draftNotes, setDraftNotes] = useState<Record<string, string>>({});
  const [submittingId, setSubmittingId] = useState<string | null>(null);

  const staffLookup = useMemo(() => {
    const map = new Map<string, StaffMember>();
    staffList.forEach((s) => {
      map.set(s.id, s);
      if (s.email) map.set(s.email.toLowerCase(), s);
    });
    return map;
  }, [staffList]);

  const getSuggestedHourlyRate = (req: OvertimeRequest, multiplier = 1.5) => {
    const staff =
      staffLookup.get(req.staffId) ||
      (req.staffEmail ? staffLookup.get(req.staffEmail.toLowerCase()) : undefined);
    const monthlySalary =
      staff?.baseSalaryKes ??
      (req.staffRole === 'Admin'
        ? 180000
        : req.staffRole === 'Accountant'
          ? 120000
          : req.staffRole === 'Branch Manager'
            ? 95000
            : 65000);
    // Standard ~160 monthly working hours (20 days x 8 hrs)
    const baseHourly = monthlySalary / 160;
    return {
      monthlySalary,
      baseHourly: Math.round(baseHourly),
      otHourly: Math.round(baseHourly * multiplier),
    };
  };

  const kpis = useMemo(() => {
    const activeShiftsNow = staffShifts.filter((s) => s.status === 'Active').length;
    const pendingOtCount = overtimeRequests.filter((r) => r.status === 'Pending HR Rate').length;
    const approvedOtRequests = overtimeRequests.filter((r) => r.status === 'Approved');
    const approvedOtHours = approvedOtRequests.reduce(
      (sum, r) => sum + (r.approvedHours ?? r.requestedHours ?? 0),
      0
    );
    const approvedOtPayoutKes = approvedOtRequests.reduce(
      (sum, r) => sum + (r.calculatedOtPayKes ?? 0),
      0
    );
    return {
      activeShiftsNow,
      pendingOtCount,
      approvedOtHours: Number(approvedOtHours.toFixed(1)),
      approvedOtPayoutKes,
    };
  }, [staffShifts, overtimeRequests]);

  const filteredOvertimeRequests = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...overtimeRequests]
      .filter((r) => (otStatusFilter === 'ALL' ? true : r.status === otStatusFilter))
      .filter((r) => {
        if (!q) return true;
        return (
          r.staffName.toLowerCase().includes(q) ||
          r.requestNo.toLowerCase().includes(q) ||
          r.branchName.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        // Pending HR Rate always first
        if (a.status === 'Pending HR Rate' && b.status !== 'Pending HR Rate') return -1;
        if (b.status === 'Pending HR Rate' && a.status !== 'Pending HR Rate') return 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
  }, [overtimeRequests, otStatusFilter, searchQuery]);

  const filteredShifts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...staffShifts]
      .filter((s) => (shiftStatusFilter === 'ALL' ? true : s.status === shiftStatusFilter))
      .filter((s) => {
        if (!q) return true;
        return (
          s.staffName.toLowerCase().includes(q) ||
          s.shiftNo.toLowerCase().includes(q) ||
          s.branchName.toLowerCase().includes(q) ||
          s.staffRole.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.status === 'Active' && b.status !== 'Active') return -1;
        if (b.status === 'Active' && a.status !== 'Active') return 1;
        return (b.clockInAt || '').localeCompare(a.clockInAt || '');
      });
  }, [staffShifts, shiftStatusFilter, searchQuery]);

  const applyPresetMultiplier = (req: OvertimeRequest, mult: number) => {
    const calc = getSuggestedHourlyRate(req, mult);
    setDraftMultipliers((prev) => ({ ...prev, [req.id]: mult }));
    setDraftRates((prev) => ({ ...prev, [req.id]: String(calc.otHourly) }));
  };

  const handleReviewDecision = async (req: OvertimeRequest, decision: 'Approved' | 'Declined') => {
    if (!onReviewOvertimeRequest) return;
    const defaultCalc = getSuggestedHourlyRate(req, draftMultipliers[req.id] ?? 1.5);
    const rateVal = Number(
      draftRates[req.id] ?? req.otRatePerHourKes ?? (decision === 'Approved' ? defaultCalc.otHourly : 0)
    );
    const hoursVal = Number(draftHours[req.id] ?? req.approvedHours ?? req.requestedHours);

    if (decision === 'Approved' && (!Number.isFinite(rateVal) || rateVal <= 0)) {
      onTriggerToast('error', 'Valid OT Rate Required', 'Please enter an hourly OT rate (KES/hr) greater than 0 before approving.');
      return;
    }
    if (decision === 'Approved' && (!Number.isFinite(hoursVal) || hoursVal <= 0)) {
      onTriggerToast('error', 'Invalid OT Hours', 'Approved overtime hours must be greater than 0.');
      return;
    }

    setSubmittingId(req.id);
    try {
      await onReviewOvertimeRequest(
        req.id,
        decision,
        decision === 'Approved' ? Math.round(rateVal) : 0,
        decision === 'Approved' ? Number(hoursVal.toFixed(2)) : 0,
        draftMultipliers[req.id] ?? req.otMultiplier ?? 1.5,
        (draftNotes[req.id] ?? req.hrDecisionNote ?? '').trim()
      );
      setEditingRequestId(null);
    } finally {
      setSubmittingId(null);
    }
  };

  const handleExportCsv = () => {
    if (subView === 'overtime') {
      exportToCSV(
        `HR_Overtime_Rates_${new Date().toISOString().slice(0, 10)}`,
        ['Request No', 'Staff Name', 'Role', 'Branch', 'Shift Date', 'Requested Hrs', 'Approved Hrs', 'HR OT Rate (KES/hr)', 'Total OT Pay (KES)', 'Status', 'Reason', 'HR Reviewer'],
        filteredOvertimeRequests.map((r) => [
          r.requestNo,
          r.staffName,
          r.staffRole,
          r.branchName,
          r.shiftDate,
          String(r.requestedHours),
          String(r.approvedHours ?? ''),
          String(r.otRatePerHourKes ?? ''),
          String(r.calculatedOtPayKes ?? ''),
          r.status,
          r.reason,
          r.hrReviewerName || '',
        ])
      );
      onTriggerToast('success', 'CSV Exported', 'Overtime & HR Rate ledger exported to CSV.');
    } else {
      exportToCSV(
        `Staff_Shift_Attendance_${new Date().toISOString().slice(0, 10)}`,
        ['Shift No', 'Staff Name', 'Role', 'Branch', 'Shift Label', 'Clock In', 'Scheduled End', 'Clock Out', 'Worked Minutes', 'Overtime Minutes', 'Status'],
        filteredShifts.map((s) => [
          s.shiftNo,
          s.staffName,
          s.staffRole,
          s.branchName,
          s.shiftLabel,
          s.clockInAt,
          s.scheduledEndAt,
          s.clockOutAt || '',
          String(s.workedMinutes ?? ''),
          String(s.overtimeMinutes ?? ''),
          s.status,
        ])
      );
      onTriggerToast('success', 'CSV Exported', 'Staff shift attendance manifest exported to CSV.');
    }
  };

  return (
    <div className="space-y-4">
      {/* 4 KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="beta-kpi-card rounded-2xl p-4">
          <div className="text-xs font-montserrat font-semibold text-slate-500">Active Shifts Now</div>
          <div className="text-2xl font-extrabold text-emerald-700 font-mono-tabular mt-1">
            {kpis.activeShiftsNow}
          </div>
        </div>
        <div className="beta-kpi-card rounded-2xl p-4">
          <div className="text-xs font-montserrat font-semibold text-slate-500">Pending HR OT Rate</div>
          <div className="text-2xl font-extrabold text-amber-600 font-mono-tabular mt-1">
            {kpis.pendingOtCount}
          </div>
        </div>
        <div className="beta-kpi-card rounded-2xl p-4">
          <div className="text-xs font-montserrat font-semibold text-slate-500">Approved OT Hours</div>
          <div className="text-2xl font-extrabold text-[#0A006E] font-mono-tabular mt-1">
            {kpis.approvedOtHours}h
          </div>
        </div>
        <div className="beta-kpi-card rounded-2xl p-4">
          <div className="text-xs font-montserrat font-semibold text-slate-500">Approved OT Payout</div>
          <div className="text-2xl font-extrabold text-[#0A006E] font-mono-tabular mt-1">
            {formatKes(kpis.approvedOtPayoutKes)}
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="beta-kpi-card rounded-2xl p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setSubView('overtime')}
            className={`px-4 py-2 rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer transition ${
              subView === 'overtime'
                ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Overtime Requests &amp; HR Rates ({overtimeRequests.length})</span>
            {kpis.pendingOtCount > 0 && (
              <span className="px-1.5 py-0.5 rounded-full bg-rose-600 text-white text-[10px] font-mono-tabular">
                {kpis.pendingOtCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setSubView('shifts')}
            className={`px-4 py-2 rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer transition ${
              subView === 'shifts'
                ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>Shift Attendance Log ({staffShifts.length})</span>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 sm:w-56">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff, branch, #..."
              className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold outline-none focus:border-[#0A006E]"
            />
          </div>

          {subView === 'overtime' ? (
            <select
              value={otStatusFilter}
              onChange={(e) => setOtStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-montserrat font-bold text-slate-700"
            >
              <option value="ALL">All OT Statuses</option>
              <option value="Pending HR Rate">Pending HR Rate</option>
              <option value="Approved">Approved</option>
              <option value="Declined">Declined</option>
            </select>
          ) : (
            <select
              value={shiftStatusFilter}
              onChange={(e) => setShiftStatusFilter(e.target.value as any)}
              className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-montserrat font-bold text-slate-700"
            >
              <option value="ALL">All Shifts</option>
              <option value="Active">Active On Shift</option>
              <option value="Completed">Completed Shifts</option>
            </select>
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0A006E] text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* SUBVIEW 1: OVERTIME REQUESTS & HR RATE SETTING */}
      {subView === 'overtime' && (
        <div className="space-y-3">
          {filteredOvertimeRequests.length === 0 ? (
            <div className="beta-kpi-card rounded-2xl p-10 text-center space-y-2">
              <Clock className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-montserrat font-black text-slate-700 text-sm">
                No Overtime Requests Found
              </div>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                When staff work late and submit an OT request from their bottom-left shift countdown dock, it appears here for HR to set the hourly OT rate and approve.
              </p>
            </div>
          ) : (
            filteredOvertimeRequests.map((req) => {
              const activeMultiplier = draftMultipliers[req.id] ?? req.otMultiplier ?? 1.5;
              const suggestion = getSuggestedHourlyRate(req, activeMultiplier);
              const isRateFormOpen =
                canSetOtRate && (req.status === 'Pending HR Rate' || editingRequestId === req.id);

              const currentRateInput =
                draftRates[req.id] ??
                String(req.otRatePerHourKes ?? suggestion.otHourly);
              const currentHoursInput =
                draftHours[req.id] ??
                String(req.approvedHours ?? req.requestedHours);
              const previewPay = Math.round(
                Math.max(0, Number(currentRateInput) || 0) * Math.max(0, Number(currentHoursInput) || 0)
              );

              return (
                <div
                  key={req.id}
                  className={`beta-kpi-card rounded-2xl p-4 sm:p-5 space-y-3 border-2 ${
                    req.status === 'Pending HR Rate'
                      ? 'border-amber-300 bg-amber-50/20'
                      : req.status === 'Approved'
                        ? 'border-emerald-200'
                        : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                    <div className="space-y-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="px-2.5 py-0.5 rounded-lg bg-[#0A006E] text-[#FFDE00] font-mono-tabular font-black text-xs">
                          {req.requestNo}
                        </span>
                        <span className="font-montserrat font-black text-slate-900 text-sm">
                          {req.staffName}
                        </span>
                        <span className="px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-bold">
                          {req.staffRole} · {req.branchName}
                        </span>
                        {req.shiftNo && (
                          <span className="px-2 py-0.5 rounded-lg bg-indigo-50 text-indigo-800 font-mono-tabular text-[11px] font-bold">
                            Shift {req.shiftNo}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-700">
                        <strong className="text-slate-900">Working Late Reason:</strong> {req.reason}
                      </div>

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-slate-500 font-mono-tabular pt-0.5">
                        <span>Date: <strong>{req.shiftDate}</strong></span>
                        <span>Requested OT: <strong className="text-[#0A006E]">{req.requestedHours} hrs</strong></span>
                        <span>Base Monthly: <strong>{formatKes(suggestion.monthlySalary)}</strong> (~{formatKes(suggestion.baseHourly)}/hr)</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span
                        className={`px-3 py-1.5 rounded-xl text-xs font-montserrat font-black whitespace-nowrap ${
                          req.status === 'Approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : req.status === 'Declined'
                              ? 'bg-rose-100 text-rose-800 border border-rose-300'
                              : req.status === 'Cancelled'
                                ? 'bg-slate-200 text-slate-600'
                                : 'bg-[#FFDE00] text-[#0A006E] border border-[#0A006E]'
                        }`}
                      >
                        {req.status}
                      </span>

                      {canSetOtRate && req.status === 'Approved' && editingRequestId !== req.id && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingRequestId(req.id);
                            setDraftRates((prev) => ({
                              ...prev,
                              [req.id]: String(req.otRatePerHourKes ?? suggestion.otHourly),
                            }));
                            setDraftHours((prev) => ({
                              ...prev,
                              [req.id]: String(req.approvedHours ?? req.requestedHours),
                            }));
                            setDraftNotes((prev) => ({
                              ...prev,
                              [req.id]: req.hrDecisionNote || '',
                            }));
                          }}
                          className="px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-[#0A006E] text-xs font-montserrat font-bold flex items-center gap-1 cursor-pointer"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>Adjust Rate</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Approved summary bar */}
                  {req.status === 'Approved' && editingRequestId !== req.id && (
                    <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-4 font-mono-tabular">
                        <span>
                          Approved Hours: <strong className="text-slate-900">{req.approvedHours ?? req.requestedHours}h</strong>
                        </span>
                        <span>
                          HR OT Rate: <strong className="text-[#0A006E]">{formatKes(req.otRatePerHourKes || 0)}/hr</strong>
                          {req.otMultiplier ? ` (${req.otMultiplier}x)` : ''}
                        </span>
                        <span>
                          Total OT Payout: <strong className="text-emerald-800 text-sm">{formatKes(req.calculatedOtPayKes || 0)}</strong>
                        </span>
                      </div>
                      <div className="text-[11px] text-emerald-900">
                        Approved by <strong>{req.hrReviewerName || 'HR'}</strong>
                        {req.hrDecisionNote ? ` · "${req.hrDecisionNote}"` : ''}
                      </div>
                    </div>
                  )}

                  {/* HR OT Rate Setter Form */}
                  {isRateFormOpen && (
                    <div className="p-3.5 rounded-2xl bg-white border-2 border-[#0A006E]/25 space-y-3 text-xs">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="font-montserrat font-black text-[#0A006E] flex items-center gap-1.5">
                          <Coins className="w-4 h-4 text-amber-600" />
                          <span>HR Overtime Rate Configuration</span>
                        </div>

                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="text-[11px] text-slate-500 font-semibold">Quick Presets:</span>
                          {[
                            { mult: 1.0, label: '1.0x Normal' },
                            { mult: 1.5, label: '1.5x Weekday OT' },
                            { mult: 2.0, label: '2.0x Night/Holiday' },
                          ].map((preset) => (
                            <button
                              key={preset.mult}
                              type="button"
                              onClick={() => applyPresetMultiplier(req, preset.mult)}
                              className={`px-2.5 py-1 rounded-lg border text-[11px] font-montserrat font-bold cursor-pointer transition ${
                                activeMultiplier === preset.mult
                                  ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div>
                          <label className="block font-montserrat font-bold text-slate-700 mb-1">
                            HR OT Rate (KES / hr) *
                          </label>
                          <input
                            type="number"
                            min={0}
                            step={10}
                            value={currentRateInput}
                            onChange={(e) =>
                              setDraftRates((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono-tabular font-black text-[#0A006E] text-sm"
                          />
                        </div>

                        <div>
                          <label className="block font-montserrat font-bold text-slate-700 mb-1">
                            Approved OT Hours *
                          </label>
                          <input
                            type="number"
                            min={0.5}
                            max={24}
                            step={0.5}
                            value={currentHoursInput}
                            onChange={(e) =>
                              setDraftHours((prev) => ({ ...prev, [req.id]: e.target.value }))
                            }
                            className="w-full px-3 py-2 border border-slate-300 rounded-xl font-mono-tabular font-black text-slate-900 text-sm"
                          />
                        </div>

                        <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 flex flex-col justify-center">
                          <span className="text-[10px] font-montserrat font-bold uppercase text-emerald-800">
                            Computed OT Payout
                          </span>
                          <span className="text-lg font-mono-tabular font-black text-emerald-700">
                            {formatKes(previewPay)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                        <input
                          type="text"
                          value={draftNotes[req.id] ?? req.hrDecisionNote ?? ''}
                          onChange={(e) =>
                            setDraftNotes((prev) => ({ ...prev, [req.id]: e.target.value }))
                          }
                          placeholder="Optional HR approval/rate note..."
                          className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs font-medium"
                        />

                        <div className="flex items-center gap-2 shrink-0">
                          {editingRequestId === req.id && (
                            <button
                              type="button"
                              onClick={() => setEditingRequestId(null)}
                              className="px-3 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-montserrat font-bold cursor-pointer"
                            >
                              Cancel
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={submittingId === req.id}
                            onClick={() => handleReviewDecision(req, 'Declined')}
                            className="px-3.5 py-2 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 font-montserrat font-black flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                          >
                            <XCircle className="w-4 h-4" />
                            <span>Decline</span>
                          </button>

                          <button
                            type="button"
                            disabled={submittingId === req.id}
                            onClick={() => handleReviewDecision(req, 'Approved')}
                            className="px-4 py-2 rounded-xl bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] font-montserrat font-black flex items-center gap-1.5 cursor-pointer shadow-sm disabled:opacity-50"
                          >
                            <CheckCircle2 className="w-4 h-4" />
                            <span>
                              {submittingId === req.id ? 'Saving...' : 'Approve & Set Rate'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {/* SUBVIEW 2: STAFF SHIFT ATTENDANCE LOG */}
      {subView === 'shifts' && (
        <div className="beta-kpi-card rounded-2xl overflow-hidden">
          {filteredShifts.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <div className="font-montserrat font-black text-slate-700 text-sm">
                No Shift Records Found
              </div>
              <p className="text-xs text-slate-500">
                Staff clock-ins and shift endings from the bottom-left Shift Countdown dock appear here in real time.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 text-slate-700 font-montserrat">
                    <th className="py-2.5 px-3 font-bold">Shift #</th>
                    <th className="py-2.5 px-3 font-bold">Staff Member</th>
                    <th className="py-2.5 px-3 font-bold">Branch</th>
                    <th className="py-2.5 px-3 font-bold">Schedule</th>
                    <th className="py-2.5 px-3 font-bold">Clock In</th>
                    <th className="py-2.5 px-3 font-bold">Clock Out</th>
                    <th className="py-2.5 px-3 font-bold">Worked</th>
                    <th className="py-2.5 px-3 font-bold">Status</th>
                    {canSetOtRate && <th className="py-2.5 px-3 font-bold text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredShifts.map((sh) => (
                    <tr key={sh.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono-tabular font-black text-[#0A006E]">
                        {sh.shiftNo}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="font-montserrat font-bold text-slate-900">{sh.staffName}</div>
                        <div className="text-[11px] text-slate-500">{sh.staffRole}</div>
                      </td>
                      <td className="py-2.5 px-3 text-slate-700">{sh.branchName}</td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-700">{sh.shiftLabel}</td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-700">
                        {new Date(sh.clockInAt).toLocaleString('en-KE', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular text-slate-700">
                        {sh.clockOutAt
                          ? new Date(sh.clockOutAt).toLocaleTimeString('en-KE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })
                          : `Target ${new Date(sh.scheduledEndAt).toLocaleTimeString('en-KE', {
                              hour: '2-digit',
                              minute: '2-digit',
                            })}`}
                      </td>
                      <td className="py-2.5 px-3 font-mono-tabular">
                        {sh.status === 'Completed' ? (
                          <div>
                            <span className="font-bold text-slate-900">
                              {formatDurationMinutes(sh.workedMinutes || 0)}
                            </span>
                            {(sh.overtimeMinutes || 0) > 0 && (
                              <div className="text-[10px] font-bold text-rose-700">
                                +{formatDurationMinutes(sh.overtimeMinutes || 0)} late
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-bold">In Progress</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        <span
                          className={`px-2 py-0.5 rounded-lg text-[10px] font-montserrat font-black ${
                            sh.status === 'Active'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {sh.status}
                        </span>
                      </td>
                      {canSetOtRate && (
                        <td className="py-2.5 px-3 text-right">
                          {sh.status === 'Active' && onEndStaffShift ? (
                            <button
                              type="button"
                              onClick={() => onEndStaffShift(sh.id, `Closed by HR (${currentUser.name})`)}
                              className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-montserrat font-bold inline-flex items-center gap-1 cursor-pointer"
                            >
                              <Square className="w-3 h-3 fill-current" />
                              <span>Close Shift</span>
                            </button>
                          ) : (
                            <span className="text-slate-400 text-[11px]">—</span>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
