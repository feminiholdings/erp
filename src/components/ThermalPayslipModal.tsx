import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'motion/react';
import {
  Printer,
  Download,
  X,
  CheckCircle2,
  ShieldCheck,
  Award,
  Receipt,
} from 'lucide-react';
import { jsPDF } from 'jspdf';
import { PayrollRecord } from '../types';
import { formatKes, generateSimpleQrSvg } from '../erpUtils';

export interface ThermalPayslipModalProps {
  record: PayrollRecord;
  onClose: () => void;
}

type ThermalRollWidth = '80mm' | '58mm';

interface ParsedDeductionRow {
  label: string;
  amountKes: number | null;
  amountFormatted: string;
  category: string;
}

const ThermalPaperTearEdge: React.FC<{ position: 'top' | 'bottom' }> = ({ position }) => (
  <div
    aria-hidden="true"
    className={`w-full h-2.5 bg-repeat-x opacity-85 ${
      position === 'top' ? 'rotate-180' : ''
    }`}
    style={{
      backgroundImage:
        'radial-gradient(circle at 6px 0, transparent 5px, #ffffff 5.5px)',
      backgroundSize: '12px 10px',
    }}
  />
);

const ThermalPayslipSheet: React.FC<{
  record: PayrollRecord;
  parsedDeductionRows: ParsedDeductionRow[];
  rollWidth: ThermalRollWidth;
  forPrint?: boolean;
}> = ({ record, parsedDeductionRows, rollWidth, forPrint = false }) => {
  const isCompactRoll = rollWidth === '58mm';
  const slipRef = useMemo(() => {
    const cleanRun = (record.payrollRunId || 'PAY').replace(/[^A-Z0-9-]/gi, '').slice(0, 14);
    const cleanStaff = (record.staffId || 'STF').replace(/[^A-Z0-9-]/gi, '').slice(0, 10);
    return `${cleanRun}-${cleanStaff}`;
  }, [record.payrollRunId, record.staffId]);

  const issuedDateObj = useMemo(() => new Date(record.runDate), [record.runDate]);
  const issuedDay = Number.isNaN(issuedDateObj.getTime())
    ? record.runDate
    : issuedDateObj.toLocaleDateString('en-KE', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
      });
  const issuedTime = Number.isNaN(issuedDateObj.getTime())
    ? ''
    : issuedDateObj.toLocaleTimeString('en-KE', {
        hour: '2-digit',
        minute: '2-digit',
      });

  const qrSvg = useMemo(
    () =>
      generateSimpleQrSvg(
        `VAAIRO-PAYSLIP|${slipRef}|${record.staffName}|${record.period}|NET:${record.netSalary}`,
        isCompactRoll ? 84 : 96
      ),
    [slipRef, record.staffName, record.period, record.netSalary, isCompactRoll]
  );

  return (
    <div
      id={forPrint ? undefined : 'printable-erp-document'}
      className={`mx-auto select-none print:shadow-none print:m-0 ${
        isCompactRoll ? 'w-full max-w-[264px]' : 'w-full max-w-[336px]'
      }`}
    >
      {!forPrint && <ThermalPaperTearEdge position="top" />}

      <div
        className={`bg-white text-slate-900 relative overflow-hidden ${
          isCompactRoll ? 'px-3.5 py-4 space-y-3' : 'px-4 py-5 space-y-3.5'
        } ${forPrint ? 'p-3' : 'shadow-xl border-x border-slate-200/90'}`}
      >
        {/* Subtle Vaairo Bonded Watermark Stamp (matching DocumentPrintModal) */}
        <div
          aria-hidden="true"
          className="absolute right-3 top-14 pointer-events-none opacity-[0.07] border-2 border-[#0A006E] rounded-xl px-2 py-1.5 transform rotate-12 flex items-center gap-1"
        >
          <Award className="w-7 h-7 text-[#0A006E]" />
          <div className="text-right leading-tight">
            <div className="font-montserrat font-black text-[7px] uppercase text-[#0A006E]">
              VAAIRO BONDED
            </div>
            <div className="font-montserrat font-bold text-[6px] text-slate-700">
              AUDITED PAYROLL
            </div>
          </div>
        </div>

        {/* 1. DOCUMENT LETTERHEAD IN THERMAL WIDTH */}
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-3 space-y-1 relative z-10">
          <div className="text-[10px] font-montserrat font-black text-[#0A006E] tracking-widest uppercase">
            VAAIRO BEVERAGES &amp; MERCHANTS LTD
          </div>
          <h1
            className={`font-montserrat font-black italic text-[#0A006E] tracking-tight leading-none ${
              isCompactRoll ? 'text-xl' : 'text-2xl'
            }`}
          >
            PAYSLIP
          </h1>
          <div className="text-[10px] text-slate-600 font-medium leading-snug">
            Issuing Branch:{' '}
            <span className="font-bold text-slate-900">{record.branchName}</span>
          </div>
          <div className="text-[9.5px] font-mono-tabular text-slate-500">
            Employer PIN: P051928471Z · Industrial Area, Nairobi
          </div>
        </div>

        {/* 2. DOCUMENT METADATA CARD (Matches DocumentPrintModal right meta card) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono-tabular text-[10px] space-y-1 relative z-10">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Slip Ref:</span>
            <span className="font-black text-[#0A006E] truncate">{slipRef}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Pay Period:</span>
            <span className="font-bold text-slate-900">{record.period}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Issued:</span>
            <span className="font-semibold text-slate-800">
              {issuedDay}
              {issuedTime ? ` · ${issuedTime}` : ''}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-slate-200">
            <span className="text-slate-500">Status:</span>
            <span className="font-bold text-emerald-700 inline-flex items-center gap-1">
              <ShieldCheck className="w-3 h-3 shrink-0" />
              <span>Approved · Cleared</span>
            </span>
          </div>
        </div>

        {/* 3. EMPLOYEE & STATUTORY PARTICULARS (#F8FAFC document box) */}
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 space-y-2 text-[10px]">
          <div>
            <div className="text-[9px] text-[#0A006E] font-montserrat font-black uppercase tracking-wider">
              Employee Details
            </div>
            <div className="text-xs font-montserrat font-black text-slate-900 mt-0.5 leading-tight">
              {record.staffName}
            </div>
            <div className="text-[10px] text-slate-600 mt-0.5">
              {record.staffRole} · ID:{' '}
              <span className="font-mono-tabular font-bold text-slate-900">
                {record.staffId}
              </span>
            </div>
          </div>

          <div className="pt-1.5 border-t border-dashed border-slate-300 space-y-0.5 font-mono-tabular">
            <div className="text-[9px] text-[#1E9E60] font-montserrat font-black uppercase tracking-wider mb-0.5">
              Statutory &amp; Tax Identifiers
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">KRA PIN:</span>
              <span className="font-bold text-slate-900">{record.kraPin || 'A009182741Z'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">NSSF No:</span>
              <span className="font-bold text-slate-900">{record.nssfNo || '092837192'}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="text-slate-500">SHIF/NHIF:</span>
              <span className="font-bold text-slate-900">{record.nhifNo || '88392019'}</span>
            </div>
          </div>
        </div>

        {/* 4. EARNINGS & DEDUCTIONS THERMAL TABLES (#0A006E header + #FFDE00 text) */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          {/* Earnings Header */}
          <div className="bg-[#0A006E] text-[#FFDE00] px-2.5 py-1.5 flex items-center justify-between text-[10px] font-montserrat font-black uppercase tracking-wide">
            <span>Earnings</span>
            <span>Amount (KES)</span>
          </div>
          <div className="divide-y divide-dashed divide-slate-200 text-[10.5px] bg-white">
            <div className="px-2.5 py-1.5 flex items-center justify-between gap-2">
              <span className="font-semibold text-slate-800">Basic Monthly Salary</span>
              <span className="font-mono-tabular tabular-nums font-bold text-slate-900 shrink-0">
                {formatKes(record.baseSalary)}
              </span>
            </div>
            <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-slate-50/70">
              <span className="font-montserrat font-bold text-[#0A006E]">
                Gross Taxable Pay
              </span>
              <span className="font-mono-tabular tabular-nums font-black text-[#0A006E] shrink-0">
                {formatKes(record.baseSalary)}
              </span>
            </div>
          </div>

          {/* Deductions Header */}
          <div className="bg-[#0A006E] text-[#FFDE00] px-2.5 py-1.5 flex items-center justify-between text-[10px] font-montserrat font-black uppercase tracking-wide border-t border-slate-200">
            <span>Deductions ({parsedDeductionRows.length})</span>
            <span>Amount (KES)</span>
          </div>
          <div className="divide-y divide-dashed divide-slate-200 text-[10.5px] bg-white">
            {parsedDeductionRows.map((row, idx) => (
              <div
                key={idx}
                className="px-2.5 py-1.5 flex items-start justify-between gap-2"
              >
                <span className="text-slate-800 font-medium leading-snug break-words min-w-0">
                  {row.label}
                </span>
                <span className="font-mono-tabular tabular-nums font-bold text-slate-900 shrink-0">
                  {row.amountFormatted ? `-${row.amountFormatted}` : '—'}
                </span>
              </div>
            ))}
            <div className="px-2.5 py-1.5 flex items-center justify-between gap-2 bg-rose-50/60">
              <span className="font-montserrat font-bold text-rose-800">
                Total Deductions
              </span>
              <span className="font-mono-tabular tabular-nums font-black text-rose-700 shrink-0">
                -{formatKes(record.deductions)}
              </span>
            </div>
          </div>

          {/* Penalties Section if applicable */}
          {record.penalties > 0 && (
            <>
              <div className="bg-rose-700 text-white px-2.5 py-1.5 flex items-center justify-between text-[10px] font-montserrat font-black uppercase tracking-wide">
                <span>Penalties / Variances</span>
                <span>Amount</span>
              </div>
              <div className="px-2.5 py-1.5 flex items-start justify-between gap-2 text-[10.5px] bg-rose-50/40">
                <span className="text-rose-900 font-medium leading-snug break-words min-w-0">
                  {record.penaltiesReason || 'Shift Variance / Penalty'}
                </span>
                <span className="font-mono-tabular tabular-nums font-black text-rose-700 shrink-0">
                  -{formatKes(record.penalties)}
                </span>
              </div>
            </>
          )}
        </div>

        {/* 5. NET PAY SUMMARY CARD (Signature #F0FDF4 + #34D186 Document Totals Box) */}
        <div className="bg-[#F0FDF4] border-2 border-[#34D186] rounded-xl p-3 space-y-1 font-mono-tabular">
          <div className="flex justify-between text-[10px] text-slate-700">
            <span>Gross Basic Salary:</span>
            <span className="tabular-nums font-semibold">{formatKes(record.baseSalary)}</span>
          </div>
          {(record.overtimePayKes ?? 0) > 0 && (
            <div className="flex justify-between text-[10px] text-emerald-800">
              <span>
                Overtime ({record.overtimeHours ?? 0}h Approved):
              </span>
              <span className="tabular-nums font-bold">
                +{formatKes(record.overtimePayKes ?? 0)}
              </span>
            </div>
          )}
          <div className="flex justify-between text-[10px] text-slate-700">
            <span>Total Deductions:</span>
            <span className="tabular-nums font-semibold text-rose-700">
              -{formatKes(record.deductions)}
            </span>
          </div>
          {record.penalties > 0 && (
            <div className="flex justify-between text-[10px] text-slate-700">
              <span>Penalties Deducted:</span>
              <span className="tabular-nums font-semibold text-rose-700">
                -{formatKes(record.penalties)}
              </span>
            </div>
          )}
          <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-emerald-300 text-[#0A006E]">
            <span className="font-montserrat font-black text-xs uppercase tracking-tight">
              Net Pay
            </span>
            <span
              className={`font-montserrat font-black tabular-nums ${
                isCompactRoll ? 'text-base' : 'text-lg'
              }`}
            >
              {formatKes(record.netSalary)}
            </span>
          </div>
          <div className="flex items-center justify-between text-[9.5px] font-bold text-emerald-800 pt-1">
            <span className="inline-flex items-center gap-1">
              <CheckCircle2 className="w-3 h-3 shrink-0" />
              Disbursed &amp; Cleared
            </span>
            <span>{record.period}</span>
          </div>
        </div>

        {/* 6. STATUTORY NOTICE BOX (Matches DocumentPrintModal left notice box) */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 flex items-start gap-2 text-[9.5px] text-slate-600 leading-snug">
          <ShieldCheck className="w-3.5 h-3.5 text-[#0A006E] shrink-0 mt-0.5" />
          <span>
            Computed under KRA PAYE, SHIF, NSSF &amp; Affordable Housing statutory rules. Valid electronic payroll receipt.
          </span>
        </div>

        {/* 7. THERMAL QR CODE, BARCODE & CUT LINE */}
        <div className="pt-1 border-t border-dashed border-slate-300 text-center space-y-2">
          <div
            className="inline-block p-1 bg-white border border-slate-200 rounded-lg"
            dangerouslySetInnerHTML={{ __html: qrSvg }}
          />
          <div className="flex justify-center items-center gap-[1.5px] h-5 overflow-hidden px-4">
            {Array.from({ length: 38 }).map((_, i) => (
              <div
                key={i}
                className={`bg-slate-900 h-full ${
                  i % 4 === 0 ? 'w-[2.5px]' : i % 2 === 0 ? 'w-[1.5px]' : 'w-[1px]'
                }`}
              />
            ))}
          </div>
          <div className="text-[8.5px] font-mono-tabular text-slate-500">
            *{record.staffId}-{record.period.replace(/\s+/g, '').toUpperCase()}*
          </div>
          <div className="text-[8.5px] text-slate-400 font-medium">
            Vaairo Beverages &amp; Merchants Ltd · Official Payroll Receipt
          </div>
        </div>
      </div>

      {!forPrint && <ThermalPaperTearEdge position="bottom" />}
    </div>
  );
};

export const ThermalPayslipModal: React.FC<ThermalPayslipModalProps> = ({
  record,
  onClose,
}) => {
  const [rollWidth, setRollWidth] = useState<ThermalRollWidth>('80mm');

  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.body.classList.add('erp-printing-document');
    return () => {
      document.body.classList.remove('erp-printing-document');
    };
  }, []);

  const parsedDeductionRows = useMemo<ParsedDeductionRow[]>(() => {
    if (Array.isArray(record.deductionItems) && record.deductionItems.length > 0) {
      return record.deductionItems.map((it) => ({
        label: it.referenceNote ? `${it.name} (${it.referenceNote})` : it.name,
        amountKes: Math.round(it.amountKes),
        amountFormatted: formatKes(it.amountKes),
        category: it.category,
      }));
    }
    if (record.deductionsBreakdown) {
      return record.deductionsBreakdown
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
        .map((p) => {
          const colonIdx = p.indexOf(':');
          if (colonIdx === -1) {
            return {
              label: p,
              amountKes: null,
              amountFormatted: '',
              category: 'Statutory',
            };
          }
          const rawVal = p.slice(colonIdx + 1).trim();
          const numMatch = Number(rawVal.replace(/[^\d.-]/g, ''));
          return {
            label: p.slice(0, colonIdx).trim(),
            amountKes: Number.isFinite(numMatch) && numMatch > 0 ? Math.round(numMatch) : null,
            amountFormatted: rawVal,
            category: 'Statutory',
          };
        });
    }
    return [
      {
        label: 'PAYE / SHIF / NSSF / Housing',
        amountKes: Math.round(record.deductions),
        amountFormatted: formatKes(record.deductions),
        category: 'Statutory',
      },
    ];
  }, [record.deductionItems, record.deductionsBreakdown, record.deductions]);

  const handleDownloadPDF = () => {
    const widthMm = rollWidth === '58mm' ? 58 : 80;
    const marginX = rollWidth === '58mm' ? 3.5 : 4.5;
    const contentW = widthMm - marginX * 2;
    const rightX = widthMm - marginX;
    const dynamicHeightMm = Math.max(
      205,
      168 + parsedDeductionRows.length * 6.5 + (record.penalties > 0 ? 18 : 0)
    );

    const doc = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: [widthMm, dynamicHeightMm],
    });

    const slipRef = `${(record.payrollRunId || 'PAY').replace(/[^A-Z0-9-]/gi, '').slice(0, 12)}-${(record.staffId || 'STF').replace(/[^A-Z0-9-]/gi, '').slice(0, 8)}`;

    let y = 7;

    // 1. Document Letterhead (matching #0A006E italic title + merchant name)
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(rollWidth === '58mm' ? 6.5 : 7.5);
    doc.setTextColor(10, 0, 110);
    doc.text('VAAIRO BEVERAGES & MERCHANTS LTD', widthMm / 2, y, { align: 'center' });

    y += 5.5;
    doc.setFont('helvetica', 'bolditalic');
    doc.setFontSize(rollWidth === '58mm' ? 14 : 16);
    doc.setTextColor(10, 0, 110);
    doc.text('PAYSLIP', widthMm / 2, y, { align: 'center' });

    y += 4;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(71, 85, 105);
    doc.text(`Branch: ${record.branchName}`, widthMm / 2, y, { align: 'center' });

    y += 3.3;
    doc.text('Employer PIN: P051928471Z · Nairobi', widthMm / 2, y, { align: 'center' });

    y += 3.5;
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1.2, 1.2], 0);
    doc.line(marginX, y, rightX, y);
    doc.setLineDashPattern([], 0);

    // 2. Metadata Card (#F8FAFC)
    y += 3;
    const metaH = 21;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.roundedRect(marginX, y, contentW, metaH, 2, 2, 'FD');

    let my = y + 4.5;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(100, 116, 139);
    doc.text('Slip Ref:', marginX + 2.5, my);
    doc.setFont('courier', 'bold');
    doc.setTextColor(10, 0, 110);
    doc.text(slipRef, rightX - 2.5, my, { align: 'right' });

    my += 4.3;
    doc.setFont('courier', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Pay Period:', marginX + 2.5, my);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(record.period, rightX - 2.5, my, { align: 'right' });

    my += 4.3;
    doc.setFont('courier', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('Issued:', marginX + 2.5, my);
    doc.setTextColor(51, 65, 85);
    doc.text(new Date(record.runDate).toLocaleDateString('en-KE'), rightX - 2.5, my, { align: 'right' });

    my += 4.6;
    doc.setTextColor(100, 116, 139);
    doc.text('Status:', marginX + 2.5, my);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(4, 120, 87);
    doc.text('Approved · Cleared', rightX - 2.5, my, { align: 'right' });

    y += metaH + 3;

    // 3. Employee Particulars Card (#F8FAFC)
    const empH = 29;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.roundedRect(marginX, y, contentW, empH, 2, 2, 'FD');

    let ey = y + 4.3;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.2);
    doc.setTextColor(10, 0, 110);
    doc.text('EMPLOYEE DETAILS', marginX + 2.5, ey);

    ey += 4.2;
    doc.setFontSize(8.2);
    doc.setTextColor(15, 23, 42);
    doc.text(record.staffName, marginX + 2.5, ey);

    ey += 3.6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6.6);
    doc.setTextColor(71, 85, 105);
    doc.text(`${record.staffRole} · ${record.staffId}`, marginX + 2.5, ey);

    ey += 2.6;
    doc.setDrawColor(203, 213, 225);
    doc.setLineDashPattern([1, 1], 0);
    doc.line(marginX + 2.5, ey, rightX - 2.5, ey);
    doc.setLineDashPattern([], 0);

    ey += 3.8;
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.5);
    doc.setTextColor(100, 116, 139);
    doc.text('KRA PIN:', marginX + 2.5, ey);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(record.kraPin || 'A009182741Z', rightX - 2.5, ey, { align: 'right' });

    ey += 3.5;
    doc.setFont('courier', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('NSSF No:', marginX + 2.5, ey);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(record.nssfNo || '092837192', rightX - 2.5, ey, { align: 'right' });

    ey += 3.5;
    doc.setFont('courier', 'normal');
    doc.setTextColor(100, 116, 139);
    doc.text('SHIF/NHIF:', marginX + 2.5, ey);
    doc.setFont('courier', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(record.nhifNo || '88392019', rightX - 2.5, ey, { align: 'right' });

    y += empH + 3.5;

    // 4. Earnings Section Header (#0A006E + #FFDE00)
    doc.setFillColor(10, 0, 110);
    doc.rect(marginX, y, contentW, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(255, 222, 0);
    doc.text('EARNINGS', marginX + 2, y + 3.8);
    doc.text('AMOUNT (KES)', rightX - 2, y + 3.8, { align: 'right' });
    y += 9;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(30, 41, 59);
    doc.text('Basic Monthly Salary', marginX + 2, y);
    doc.setFont('courier', 'bold');
    doc.text(formatKes(record.baseSalary), rightX - 2, y, { align: 'right' });
    y += 4.5;

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(10, 0, 110);
    doc.text('Gross Taxable Pay', marginX + 2, y);
    doc.setFont('courier', 'bold');
    doc.text(formatKes(record.baseSalary), rightX - 2, y, { align: 'right' });
    y += 4;

    // Deductions Section Header (#0A006E + #FFDE00)
    doc.setFillColor(10, 0, 110);
    doc.rect(marginX, y, contentW, 5.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6.6);
    doc.setTextColor(255, 222, 0);
    doc.text(`DEDUCTIONS (${parsedDeductionRows.length})`, marginX + 2, y + 3.8);
    doc.text('AMOUNT (KES)', rightX - 2, y + 3.8, { align: 'right' });
    y += 8.8;

    parsedDeductionRows.forEach((row) => {
      const labelMaxChars = rollWidth === '58mm' ? 18 : 26;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(30, 41, 59);
      doc.text(row.label.slice(0, labelMaxChars), marginX + 2, y);
      doc.setFont('courier', 'bold');
      doc.text(row.amountFormatted ? `-${row.amountFormatted}` : '-', rightX - 2, y, {
        align: 'right',
      });
      y += 4.3;
    });

    doc.setDrawColor(226, 232, 240);
    doc.line(marginX + 2, y - 2, rightX - 2, y - 2);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(190, 18, 60);
    doc.text('Total Deductions', marginX + 2, y + 1.5);
    doc.setFont('courier', 'bold');
    doc.text(`-${formatKes(record.deductions)}`, rightX - 2, y + 1.5, { align: 'right' });
    y += 6;

    if (record.penalties > 0) {
      doc.setFillColor(190, 18, 60);
      doc.rect(marginX, y, contentW, 5, 'F');
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(6.4);
      doc.setTextColor(255, 255, 255);
      doc.text('PENALTIES / VARIANCES', marginX + 2, y + 3.5);
      y += 8;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(6.8);
      doc.setTextColor(136, 19, 55);
      doc.text((record.penaltiesReason || 'Shift Variance').slice(0, 22), marginX + 2, y);
      doc.setFont('courier', 'bold');
      doc.text(`-${formatKes(record.penalties)}`, rightX - 2, y, { align: 'right' });
      y += 5;
    }

    // 5. Net Pay Summary Box (#F0FDF4 + #34D186 border matching DocumentPrintModal)
    const boxH = 22;
    doc.setFillColor(240, 253, 244);
    doc.setDrawColor(52, 209, 134);
    doc.setLineWidth(0.6);
    doc.roundedRect(marginX, y, contentW, boxH, 2.2, 2.2, 'FD');

    doc.setFont('courier', 'normal');
    doc.setFontSize(6.8);
    doc.setTextColor(51, 65, 85);
    doc.text('Gross Earnings:', marginX + 2.5, y + 4.8);
    doc.text(formatKes(record.baseSalary), rightX - 2.5, y + 4.8, { align: 'right' });

    doc.text('Total Deductions:', marginX + 2.5, y + 8.8);
    doc.setTextColor(190, 18, 60);
    doc.text(`-${formatKes(record.deductions + record.penalties)}`, rightX - 2.5, y + 8.8, {
      align: 'right',
    });

    doc.setDrawColor(110, 231, 183);
    doc.line(marginX + 2.5, y + 11.2, rightX - 2.5, y + 11.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(10, 0, 110);
    doc.text('NET PAY', marginX + 2.5, y + 16.5);
    doc.setFontSize(rollWidth === '58mm' ? 9.5 : 10.5);
    doc.text(formatKes(record.netSalary), rightX - 2.5, y + 16.5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(6);
    doc.setTextColor(4, 120, 87);
    doc.text('DISBURSED & CLEARED', marginX + 2.5, y + 20.2);

    y += boxH + 5;

    // 6. Footer & Barcode
    doc.setFont('courier', 'normal');
    doc.setFontSize(6.2);
    doc.setTextColor(100, 116, 139);
    doc.text(
      `*${record.staffId}-${record.period.replace(/\s+/g, '').toUpperCase()}*`,
      widthMm / 2,
      y,
      { align: 'center' }
    );
    y += 3.5;
    doc.text('Official Electronic Payslip · Vaairo ERP', widthMm / 2, y, {
      align: 'center',
    });

    doc.save(
      `Payslip_${record.staffName.replace(/\s+/g, '_')}_${record.period.replace(/\s+/g, '_')}_${rollWidth}.pdf`
    );
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4 bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:hidden">
        <motion.div
          initial={{ opacity: 0, scale: 0.97, y: 8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.97, y: 8 }}
          transition={{ duration: 0.18 }}
          className="relative w-full max-w-none sm:max-w-[460px] h-full sm:h-auto sm:max-h-[94dvh] bg-white rounded-none sm:rounded-2xl border-0 sm:border-2 border-[#0A006E] shadow-2xl overflow-hidden flex flex-col"
        >
          {/* Top Action Bar (Matching DocumentPrintModal Chrome) */}
          <div className="bg-[#0A006E] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b-4 border-[#FFDE00] shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center font-black shadow shrink-0">
                <Receipt className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-montserrat font-black uppercase tracking-wider text-[#FFDE00] truncate">
                    Official Payslip · Thermal
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-montserrat font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 whitespace-nowrap">
                    {rollWidth} Roll
                  </span>
                </div>
                <p className="text-xs sm:text-sm font-mono-tabular font-bold text-white truncate">
                  {record.staffName} · {record.period}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close payslip"
              className="w-10 h-10 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 flex items-center justify-center transition cursor-pointer shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Action Toolbar */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0">
            {/* Roll Width Switcher */}
            <div
              role="group"
              aria-label="Thermal paper width"
              className="inline-flex items-center p-1 bg-slate-200/80 rounded-xl"
            >
              {(['80mm', '58mm'] as const).map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => setRollWidth(size)}
                  className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-montserrat font-black cursor-pointer transition whitespace-nowrap ${
                    rollWidth === size
                      ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 flex-1 justify-end">
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="min-h-[42px] px-3.5 py-2 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition whitespace-nowrap shrink-0"
              >
                <Download className="w-4 h-4" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="min-h-[42px] px-3.5 py-2 bg-[#34D186] hover:bg-emerald-400 text-[#0A006E] rounded-xl text-xs font-montserrat font-black flex items-center justify-center gap-1.5 shadow-xs cursor-pointer transition whitespace-nowrap shrink-0"
              >
                <Printer className="w-4 h-4" />
                <span>Print</span>
              </button>
            </div>
          </div>

          {/* Scrollable Thermal Paper Roll Preview */}
          <div className="flex-1 overflow-y-auto bg-slate-200/80 p-4 sm:p-6">
            <ThermalPayslipSheet
              record={record}
              parsedDeductionRows={parsedDeductionRows}
              rollWidth={rollWidth}
            />
          </div>
        </motion.div>
      </div>

      {/* Dedicated Print Portal so window.print() matches preview cleanly without modal clipping */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div
            id="printable-erp-document-portal"
            className="hidden print:block bg-white text-slate-900"
          >
            <ThermalPayslipSheet
              record={record}
              parsedDeductionRows={parsedDeductionRows}
              rollWidth={rollWidth}
              forPrint
            />
          </div>,
          document.body
        )}
    </>
  );
};
