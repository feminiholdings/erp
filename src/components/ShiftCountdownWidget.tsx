import React, { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Clock,
  Play,
  Square,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  Send,
  CheckCircle2,
  XCircle,
  X,
  Timer,
  Coins,
  Briefcase,
  History,
  Trash2,
} from 'lucide-react';
import { StaffMember, StaffShiftSession, OvertimeRequest, Branch } from '../types';
import { formatKes } from '../erpUtils';

interface ShiftCountdownWidgetProps {
  currentUser: StaffMember;
  activeBranch?: Branch | null;
  staffShifts: StaffShiftSession[];
  overtimeRequests: OvertimeRequest[];
  onStartShift: (scheduledHours: number, shiftLabel: string, notes?: string) => Promise<void>;
  onEndShift: (shiftId: string, notes?: string) => Promise<void>;
  onSubmitOvertimeRequest: (draft: {
    shiftId?: string;
    shiftNo?: string;
    shiftDate: string;
    requestedHours: number;
    reason: string;
  }) => Promise<OvertimeRequest | null>;
  onCancelOvertimeRequest?: (requestId: string) => Promise<void>;
  onOpenHrOvertimeTab?: () => void;
}

const SHIFT_DURATION_OPTIONS = [
  { hours: 6, label: '6h Short Shift' },
  { hours: 8, label: '8h Standard Shift' },
  { hours: 10, label: '10h Extended Shift' },
  { hours: 12, label: '12h Full-Day Shift' },
];

function formatCountdownMs(ms: number): string {
  const absSeconds = Math.max(0, Math.floor(Math.abs(ms) / 1000));
  const hrs = Math.floor(absSeconds / 3600);
  const mins = Math.floor((absSeconds % 3600) / 60);
  const secs = absSeconds % 60;
  return [hrs, mins, secs].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatDurationMinutes(totalMins: number): string {
  const safe = Math.max(0, Math.round(totalMins));
  const h = Math.floor(safe / 60);
  const m = safe % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export const ShiftCountdownWidget: React.FC<ShiftCountdownWidgetProps> = ({
  currentUser,
  activeBranch,
  staffShifts,
  overtimeRequests,
  onStartShift,
  onEndShift,
  onSubmitOvertimeRequest,
  onCancelOvertimeRequest,
  onOpenHrOvertimeTab,
}) => {
  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [isMinimized, setIsMinimized] = useState<boolean>(false);
  const [selectedHours, setSelectedHours] = useState<number>(8);
  const [shiftNote, setShiftNote] = useState<string>('');
  const [isSubmittingShift, setIsSubmittingShift] = useState<boolean>(false);

  // OT request modal state
  const [isOtModalOpen, setIsOtModalOpen] = useState<boolean>(false);
  const [otModalTab, setOtModalTab] = useState<'request' | 'history'>('request');
  const [otHours, setOtHours] = useState<string>('2');
  const [otShiftDate, setOtShiftDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
  const [otReason, setOtReason] = useState<string>('');
  const [isSubmittingOt, setIsSubmittingOt] = useState<boolean>(false);

  // Live 1-second tick for shift countdown
  useEffect(() => {
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  const myActiveShift = useMemo(() => {
    const userEmailLower = (currentUser.email || '').toLowerCase();
    return staffShifts.find(
      (s) =>
        s.status === 'Active' &&
        (s.staffId === currentUser.id ||
          (userEmailLower && (s.staffEmail || '').toLowerCase() === userEmailLower))
    );
  }, [staffShifts, currentUser.id, currentUser.email]);

  const myRecentShifts = useMemo(() => {
    const userEmailLower = (currentUser.email || '').toLowerCase();
    return staffShifts
      .filter(
        (s) =>
          s.staffId === currentUser.id ||
          (userEmailLower && (s.staffEmail || '').toLowerCase() === userEmailLower)
      )
      .sort((a, b) => (b.clockInAt || '').localeCompare(a.clockInAt || ''))
      .slice(0, 8);
  }, [staffShifts, currentUser.id, currentUser.email]);

  const myOvertimeRequests = useMemo(() => {
    const userEmailLower = (currentUser.email || '').toLowerCase();
    return overtimeRequests
      .filter(
        (r) =>
          r.staffId === currentUser.id ||
          (userEmailLower && (r.staffEmail || '').toLowerCase() === userEmailLower)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [overtimeRequests, currentUser.id, currentUser.email]);

  const pendingMyOtCount = useMemo(
    () => myOvertimeRequests.filter((r) => r.status === 'Pending HR Rate').length,
    [myOvertimeRequests]
  );

  const approvedMyOtTotalKes = useMemo(
    () =>
      myOvertimeRequests
        .filter((r) => r.status === 'Approved')
        .reduce((sum, r) => sum + (r.calculatedOtPayKes || 0), 0),
    [myOvertimeRequests]
  );

  const shiftMetrics = useMemo(() => {
    if (!myActiveShift) return null;
    const startMs = new Date(myActiveShift.clockInAt).getTime();
    const endMs = new Date(myActiveShift.scheduledEndAt).getTime();
    const totalMs = Math.max(1000, endMs - startMs);
    const remainingMs = endMs - nowMs;
    const elapsedMs = Math.max(0, nowMs - startMs);
    const isWorkingLate = remainingMs <= 0;
    const lateMs = isWorkingLate ? Math.abs(remainingMs) : 0;
    const progressPct = Math.min(100, Math.max(0, Math.round((elapsedMs / totalMs) * 100)));

    return {
      remainingMs,
      elapsedMs,
      lateMs,
      isWorkingLate,
      progressPct,
      countdownText: isWorkingLate ? `+${formatCountdownMs(lateMs)}` : formatCountdownMs(remainingMs),
      clockInLabel: Number.isNaN(startMs)
        ? 'Active'
        : new Date(startMs).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
      scheduledEndLabel: Number.isNaN(endMs)
        ? 'Target'
        : new Date(endMs).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' }),
    };
  }, [myActiveShift, nowMs]);

  const handleOpenOtModal = () => {
    if (shiftMetrics?.isWorkingLate && shiftMetrics.lateMs > 0) {
      const suggestedHrs = Math.max(0.5, Math.ceil((shiftMetrics.lateMs / 3600000) * 2) / 2);
      setOtHours(String(suggestedHrs));
    } else {
      setOtHours('2');
    }
    setOtShiftDate(new Date().toISOString().slice(0, 10));
    setOtModalTab('request');
    setIsOtModalOpen(true);
  };

  const handleLoginShift = async () => {
    setIsSubmittingShift(true);
    try {
      const preset = SHIFT_DURATION_OPTIONS.find((o) => o.hours === selectedHours);
      await onStartShift(
        selectedHours,
        preset?.label || `${selectedHours}h Shift`,
        shiftNote.trim() || undefined
      );
      setShiftNote('');
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const handleClockOut = async () => {
    if (!myActiveShift) return;
    setIsSubmittingShift(true);
    try {
      await onEndShift(myActiveShift.id, shiftNote.trim() || undefined);
      setShiftNote('');
    } finally {
      setIsSubmittingShift(false);
    }
  };

  const handleSubmitOt = async (e: React.FormEvent) => {
    e.preventDefault();
    const numericHours = Number(otHours);
    if (!Number.isFinite(numericHours) || numericHours <= 0 || numericHours > 24) {
      return;
    }
    if (!otReason.trim()) {
      return;
    }
    setIsSubmittingOt(true);
    try {
      const created = await onSubmitOvertimeRequest({
        shiftId: myActiveShift?.id,
        shiftNo: myActiveShift?.shiftNo,
        shiftDate: otShiftDate || new Date().toISOString().slice(0, 10),
        requestedHours: Number(numericHours.toFixed(2)),
        reason: otReason.trim(),
      });
      if (created) {
        setOtReason('');
        setOtModalTab('history');
      }
    } finally {
      setIsSubmittingOt(false);
    }
  };

  const isWorkingLate = Boolean(shiftMetrics?.isWorkingLate);

  return (
    <>
      {/* =====================================================================
          BOTTOM-LEFT SHIFT ATTENDANCE & COUNTDOWN DOCK
          ===================================================================== */}
      <div
        aria-label="Staff Shift Countdown Dock"
        className="fixed left-3 sm:left-4 bottom-[92px] md:bottom-[96px] z-[35] max-w-[calc(100vw-24px)]"
      >
        {isMinimized ? (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-center gap-2 px-3 py-2 rounded-2xl shadow-xl border-2 backdrop-blur-md ${
              myActiveShift
                ? isWorkingLate
                  ? 'bg-rose-950/95 text-white border-amber-400'
                  : 'bg-[#0A006E]/95 text-white border-[#FFDE00]'
                : 'bg-white/95 text-[#0A006E] border-[#0A006E]'
            }`}
          >
            <button
              type="button"
              onClick={() => setIsMinimized(false)}
              className="flex items-center gap-2 cursor-pointer text-left"
              title="Expand Shift Controls"
            >
              <span
                className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                  myActiveShift
                    ? isWorkingLate
                      ? 'bg-amber-400 animate-ping'
                      : 'bg-[#34D186] animate-pulse'
                    : 'bg-slate-400'
                }`}
              />
              <div className="leading-tight">
                <div className="text-[9px] font-montserrat font-black uppercase tracking-wider opacity-80">
                  {myActiveShift ? (isWorkingLate ? 'Overtime' : 'Shift Ends In') : 'Shift Off'}
                </div>
                <div className="text-xs sm:text-sm font-mono-tabular font-black tracking-tight">
                  {myActiveShift && shiftMetrics ? shiftMetrics.countdownText : 'Not Started'}
                </div>
              </div>
              <ChevronUp className="w-4 h-4 opacity-80 ml-1 shrink-0" />
            </button>

            {myActiveShift && (
              <button
                type="button"
                onClick={handleOpenOtModal}
                className="px-2 py-1 rounded-xl bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] text-[10px] font-montserrat font-black cursor-pointer whitespace-nowrap"
              >
                + OT
              </button>
            )}
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className={`w-[276px] sm:w-[300px] rounded-2xl shadow-2xl border-2 overflow-hidden ${
              myActiveShift
                ? isWorkingLate
                  ? 'bg-white border-rose-600'
                  : 'bg-white border-[#0A006E]'
                : 'bg-white border-[#0A006E]'
            }`}
          >
            {/* Compact Header Bar */}
            <div
              className={`px-3 py-2 flex items-center justify-between gap-2 ${
                myActiveShift
                  ? isWorkingLate
                    ? 'bg-rose-700 text-white'
                    : 'bg-[#0A006E] text-white'
                  : 'bg-[#0A006E] text-white'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Timer className="w-4 h-4 text-[#FFDE00] shrink-0" />
                <div className="min-w-0">
                  <div className="text-[11px] font-montserrat font-black tracking-wide uppercase text-[#FFDE00] truncate">
                    {myActiveShift
                      ? isWorkingLate
                        ? 'Working Late · OT Mode'
                        : `${myActiveShift.shiftLabel}`
                      : 'Staff Shift Clock'}
                  </div>
                  <div className="text-[10px] text-white/80 font-medium truncate">
                    {currentUser.name} · {activeBranch?.name || currentUser.branchName}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setOtModalTab('history');
                    setIsOtModalOpen(true);
                  }}
                  title="View My Shifts & Overtime Requests"
                  className="px-2 py-1 rounded-lg bg-white/10 hover:bg-white/20 text-[10px] font-montserrat font-bold text-[#FFDE00] cursor-pointer flex items-center gap-1"
                >
                  <History className="w-3 h-3" />
                  <span>OT</span>
                  {pendingMyOtCount > 0 && (
                    <span className="px-1 rounded bg-[#FFDE00] text-[#0A006E] font-mono-tabular font-black text-[9px]">
                      {pendingMyOtCount}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  title="Minimize Countdown Dock"
                  aria-label="Minimize Shift Countdown"
                  className="w-6 h-6 rounded-lg bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <ChevronDown className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-3 space-y-2.5 bg-white">
              {myActiveShift && shiftMetrics ? (
                <>
                  {/* Live Countdown Display */}
                  <div
                    className={`rounded-xl p-2.5 border ${
                      isWorkingLate
                        ? 'bg-rose-50 border-rose-200'
                        : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between text-[10px] font-montserrat font-bold uppercase tracking-wider mb-1">
                      <span className={isWorkingLate ? 'text-rose-700' : 'text-slate-500'}>
                        {isWorkingLate ? 'Extra Time Past Shift' : 'Shift Countdown'}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 rounded-md font-black ${
                          isWorkingLate
                            ? 'bg-rose-600 text-white animate-pulse'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {isWorkingLate ? 'LATE / OT' : 'ON SHIFT'}
                      </span>
                    </div>

                    <div
                      className={`text-2xl font-mono-tabular font-black tracking-tight leading-none ${
                        isWorkingLate ? 'text-rose-700' : 'text-[#0A006E]'
                      }`}
                    >
                      {shiftMetrics.countdownText}
                    </div>

                    {/* Progress bar */}
                    <div className="w-full h-1.5 bg-slate-200 rounded-full overflow-hidden mt-2">
                      <div
                        className={`h-full transition-all duration-500 ${
                          isWorkingLate ? 'bg-rose-600' : 'bg-[#34D186]'
                        }`}
                        style={{ width: `${shiftMetrics.progressPct}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono-tabular mt-1.5">
                      <span>In: {shiftMetrics.clockInLabel}</span>
                      <span>{shiftMetrics.progressPct}%</span>
                      <span>End: {shiftMetrics.scheduledEndLabel}</span>
                    </div>
                  </div>

                  {/* Quick HR Approved OT Badge if any */}
                  {(pendingMyOtCount > 0 || approvedMyOtTotalKes > 0) && (
                    <button
                      type="button"
                      onClick={() => {
                        setOtModalTab('history');
                        setIsOtModalOpen(true);
                      }}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 flex items-center justify-between text-[10px] font-montserrat font-bold text-amber-900 cursor-pointer transition"
                    >
                      <span>
                        {pendingMyOtCount > 0
                          ? `${pendingMyOtCount} OT Pending HR Rate`
                          : 'HR OT Approved'}
                      </span>
                      {approvedMyOtTotalKes > 0 && (
                        <span className="font-mono-tabular font-black text-emerald-700">
                          +{formatKes(approvedMyOtTotalKes)}
                        </span>
                      )}
                    </button>
                  )}

                  {/* Primary Shift Actions: End Shift + Request HR OT */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={isSubmittingShift}
                      onClick={handleClockOut}
                      className="px-3 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-montserrat font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer shadow-xs transition disabled:opacity-50"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                      <span>{isSubmittingShift ? 'Ending...' : 'End Shift'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleOpenOtModal}
                      className={`px-3 py-2 rounded-xl font-montserrat font-black text-[11px] flex items-center justify-center gap-1.5 cursor-pointer border transition shadow-xs ${
                        isWorkingLate
                          ? 'bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] border-[#0A006E] ring-2 ring-amber-200'
                          : 'bg-indigo-50 hover:bg-indigo-100 text-[#0A006E] border-indigo-200'
                      }`}
                    >
                      <Clock className="w-3.5 h-3.5 shrink-0" />
                      <span>Request OT</span>
                    </button>
                  </div>
                </>
              ) : (
                <>
                  {/* Not Clocked In State */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-montserrat font-bold text-slate-600">
                      <span>Select Shift Length</span>
                      <span className="font-mono-tabular text-[#0A006E] font-black">
                        {selectedHours} Hours
                      </span>
                    </div>
                    <div className="grid grid-cols-4 gap-1.5">
                      {SHIFT_DURATION_OPTIONS.map((opt) => (
                        <button
                          key={opt.hours}
                          type="button"
                          onClick={() => setSelectedHours(opt.hours)}
                          className={`py-1.5 rounded-lg text-[11px] font-mono-tabular font-black border cursor-pointer transition ${
                            selectedHours === opt.hours
                              ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                              : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.hours}h
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      value={shiftNote}
                      onChange={(e) => setShiftNote(e.target.value)}
                      placeholder="Optional handover / counter note..."
                      maxLength={120}
                      className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-[11px] font-medium text-slate-800 outline-none focus:border-[#0A006E]"
                    />

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        disabled={isSubmittingShift}
                        onClick={handleLoginShift}
                        className="col-span-2 px-3 py-2 rounded-xl bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] font-montserrat font-black text-xs flex items-center justify-center gap-1.5 cursor-pointer shadow-sm transition disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isSubmittingShift ? 'Starting...' : 'Login Shift'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleOpenOtModal}
                        title="Request Working-Late Overtime from HR"
                        className="px-2.5 py-2 rounded-xl bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] border border-[#0A006E] font-montserrat font-black text-[11px] flex items-center justify-center gap-1 cursor-pointer transition"
                      >
                        <Clock className="w-3.5 h-3.5 shrink-0" />
                        <span>OT</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </motion.div>
        )}
      </div>

      {/* =====================================================================
          WORKING LATE OVERTIME REQUEST & MY OT HISTORY MODAL
          ===================================================================== */}
      <AnimatePresence>
        {isOtModalOpen && (
          <div
            onClick={() => setIsOtModalOpen(false)}
            className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4"
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white rounded-3xl border-2 border-[#0A006E] shadow-2xl w-full max-w-xl max-h-[90vh] flex flex-col overflow-hidden"
            >
              {/* Modal Header */}
              <div className="px-5 py-4 bg-[#0A006E] text-white flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center shrink-0">
                    <Clock className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-montserrat font-black text-[#FFDE00]">
                      Working Late &amp; Overtime (OT) Request
                    </h3>
                    <p className="text-[11px] text-white/80">
                      Submit late-shift OT hours to HR — HR sets and approves your hourly OT rate.
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setIsOtModalOpen(false)}
                  className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Tab Switcher */}
              <div className="px-5 pt-3 pb-2 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOtModalTab('request')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-montserrat font-black cursor-pointer transition ${
                      otModalTab === 'request'
                        ? 'bg-[#0A006E] text-[#FFDE00]'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    New OT Request
                  </button>
                  <button
                    type="button"
                    onClick={() => setOtModalTab('history')}
                    className={`px-3.5 py-1.5 rounded-xl text-xs font-montserrat font-black cursor-pointer transition flex items-center gap-1.5 ${
                      otModalTab === 'history'
                        ? 'bg-[#0A006E] text-[#FFDE00]'
                        : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span>My OT &amp; Shifts ({myOvertimeRequests.length})</span>
                  </button>
                </div>

                {(currentUser.role === 'HR' || currentUser.role === 'Admin') && onOpenHrOvertimeTab && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOtModalOpen(false);
                      onOpenHrOvertimeTab();
                    }}
                    className="px-3 py-1.5 rounded-xl bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] border border-[#0A006E] text-[11px] font-montserrat font-black cursor-pointer"
                  >
                    Open HR OT Rate Queue
                  </button>
                )}
              </div>

              {/* Modal Content */}
              <div className="p-5 overflow-y-auto space-y-4 flex-1">
                {otModalTab === 'request' ? (
                  <form onSubmit={handleSubmitOt} className="space-y-4 text-xs">
                    {myActiveShift && (
                      <div className="p-3 rounded-2xl bg-indigo-50 border border-indigo-200 flex items-center justify-between gap-2">
                        <div>
                          <div className="font-montserrat font-black text-[#0A006E]">
                            Active Shift: {myActiveShift.shiftNo} ({myActiveShift.shiftLabel})
                          </div>
                          <div className="text-[11px] text-slate-600">
                            Started {shiftMetrics?.clockInLabel} · Target End {shiftMetrics?.scheduledEndLabel}
                          </div>
                        </div>
                        {isWorkingLate && shiftMetrics && (
                          <span className="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-mono-tabular font-black text-[11px]">
                            Late {shiftMetrics.countdownText}
                          </span>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div>
                        <label className="block font-montserrat font-bold text-slate-700 mb-1">
                          Shift / OT Date *
                        </label>
                        <input
                          required
                          type="date"
                          value={otShiftDate}
                          onChange={(e) => setOtShiftDate(e.target.value)}
                          className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-mono-tabular font-bold text-slate-900"
                        />
                      </div>

                      <div>
                        <label className="block font-montserrat font-bold text-slate-700 mb-1">
                          Extra OT Hours Requested *
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            required
                            type="number"
                            step="0.5"
                            min="0.5"
                            max="16"
                            value={otHours}
                            onChange={(e) => setOtHours(e.target.value)}
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-mono-tabular font-black text-[#0A006E] text-sm"
                          />
                          {['1', '2', '3', '4'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() => setOtHours(preset)}
                              className={`px-2.5 py-2 rounded-xl border font-mono-tabular font-bold cursor-pointer ${
                                otHours === preset
                                  ? 'bg-[#0A006E] text-[#FFDE00] border-[#0A006E]'
                                  : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset}h
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>

                    <div>
                      <label className="block font-montserrat font-bold text-slate-700 mb-1">
                        Reason for Working Late / Tasks Covered *
                      </label>
                      <textarea
                        required
                        rows={3}
                        maxLength={550}
                        value={otReason}
                        onChange={(e) => setOtReason(e.target.value)}
                        placeholder="e.g. Stock reconciliation after late supplier dispatch, closing cash register audit, or late wholesale order loading..."
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl font-medium text-slate-800 outline-none focus:border-[#0A006E]"
                      />
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 flex items-start gap-2.5 text-[11px] text-amber-900">
                      <Coins className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <strong>HR Rate Assignment:</strong> Once submitted, HR reviews your working-late request, sets your hourly OT rate (KES/hr), and approves your total overtime payout.
                      </div>
                    </div>

                    <div className="flex items-center justify-end gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => setIsOtModalOpen(false)}
                        className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-montserrat font-bold cursor-pointer"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmittingOt || !otReason.trim() || Number(otHours) <= 0}
                        className="px-5 py-2.5 rounded-xl bg-[#0A006E] hover:bg-[#150099] text-[#FFDE00] font-montserrat font-black flex items-center gap-2 cursor-pointer shadow-md disabled:opacity-50"
                      >
                        <Send className="w-4 h-4" />
                        <span>{isSubmittingOt ? 'Sending to HR...' : 'Send OT Request to HR'}</span>
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="space-y-4 text-xs">
                    {/* My OT Requests List */}
                    <div className="space-y-2.5">
                      <div className="font-montserrat font-black text-[#0A006E] text-xs uppercase tracking-wider">
                        My Overtime Requests ({myOvertimeRequests.length})
                      </div>

                      {myOvertimeRequests.length === 0 ? (
                        <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200 text-center text-slate-500">
                          <Clock className="w-7 h-7 text-slate-300 mx-auto mb-1.5" />
                          No overtime requests submitted yet.
                        </div>
                      ) : (
                        myOvertimeRequests.map((req) => (
                          <div
                            key={req.id}
                            className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 space-y-2"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="font-mono-tabular font-black text-[#0A006E]">
                                    {req.requestNo}
                                  </span>
                                  <span className="text-[11px] font-mono-tabular text-slate-500">
                                    {req.shiftDate}
                                  </span>
                                  {req.shiftNo && (
                                    <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-800 font-mono-tabular text-[10px] font-bold">
                                      {req.shiftNo}
                                    </span>
                                  )}
                                </div>
                                <p className="text-slate-700 mt-1 leading-snug">{req.reason}</p>
                              </div>

                              <span
                                className={`px-2.5 py-1 rounded-xl text-[10px] font-montserrat font-black whitespace-nowrap shrink-0 ${
                                  req.status === 'Approved'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : req.status === 'Declined'
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : req.status === 'Cancelled'
                                        ? 'bg-slate-200 text-slate-600'
                                        : 'bg-amber-100 text-amber-900 border border-amber-300'
                                }`}
                              >
                                {req.status}
                              </span>
                            </div>

                            <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/80 text-[11px]">
                              <div className="flex flex-wrap items-center gap-3 font-mono-tabular">
                                <span>
                                  Requested: <strong>{req.requestedHours}h</strong>
                                </span>
                                {req.status === 'Approved' && (
                                  <>
                                    <span>
                                      Approved: <strong>{req.approvedHours ?? req.requestedHours}h</strong>
                                    </span>
                                    <span className="text-[#0A006E] font-bold">
                                      HR Rate: {formatKes(req.otRatePerHourKes || 0)}/hr
                                    </span>
                                    <span className="text-emerald-700 font-black">
                                      OT Pay: {formatKes(req.calculatedOtPayKes || 0)}
                                    </span>
                                  </>
                                )}
                              </div>

                              {req.status === 'Pending HR Rate' && onCancelOvertimeRequest && (
                                <button
                                  type="button"
                                  onClick={() => onCancelOvertimeRequest(req.id)}
                                  className="px-2.5 py-1 rounded-lg bg-white hover:bg-rose-50 text-rose-700 border border-rose-200 text-[10px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Withdraw</span>
                                </button>
                              )}
                            </div>

                            {req.hrDecisionNote && (
                              <div className="text-[11px] text-slate-600 bg-white px-2.5 py-1.5 rounded-xl border border-slate-200">
                                <strong>HR Note ({req.hrReviewerName || 'HR'}):</strong> {req.hrDecisionNote}
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Recent Shifts History */}
                    {myRecentShifts.length > 0 && (
                      <div className="space-y-2 pt-2 border-t border-slate-200">
                        <div className="font-montserrat font-black text-slate-700 text-xs uppercase tracking-wider">
                          My Recent Shifts
                        </div>
                        <div className="space-y-1.5">
                          {myRecentShifts.map((sh) => (
                            <div
                              key={sh.id}
                              className="px-3 py-2 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-2 text-[11px]"
                            >
                              <div>
                                <div className="font-mono-tabular font-bold text-slate-900">
                                  {sh.shiftNo} · {sh.shiftLabel}
                                </div>
                                <div className="text-slate-500 font-mono-tabular">
                                  {new Date(sh.clockInAt).toLocaleString('en-KE', {
                                    month: 'short',
                                    day: 'numeric',
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                  {sh.clockOutAt &&
                                    ` → ${new Date(sh.clockOutAt).toLocaleTimeString('en-KE', {
                                      hour: '2-digit',
                                      minute: '2-digit',
                                    })}`}
                                </div>
                              </div>
                              <div className="text-right font-mono-tabular">
                                <span
                                  className={`px-2 py-0.5 rounded-lg font-bold text-[10px] ${
                                    sh.status === 'Active'
                                      ? 'bg-emerald-100 text-emerald-800'
                                      : 'bg-slate-100 text-slate-700'
                                  }`}
                                >
                                  {sh.status === 'Active'
                                    ? 'Active'
                                    : formatDurationMinutes(sh.workedMinutes || 0)}
                                </span>
                                {(sh.overtimeMinutes || 0) > 0 && (
                                  <div className="text-[10px] text-rose-700 font-bold mt-0.5">
                                    +{formatDurationMinutes(sh.overtimeMinutes || 0)} OT
                                  </div>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
