import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Printer,
  Download,
  X,
  FileCheck2,
  ShieldCheck,
  Award,
  Maximize2,
  Minimize2,
  Receipt,
  FileText,
} from 'lucide-react';
import { TransactionDoc } from '../types';
import {
  exportCommercialDocumentPDF,
  exportThermalDocumentPDF,
  formatKes,
  generateSimpleQrSvg,
  getDocumentCreationRecord,
  normalizeDocumentLineItems,
  NormalizedDocumentLineItem,
  ReceiptPrintFormat,
  ThermalRollWidth,
} from '../erpUtils';

const RECEIPT_FORMAT_STORAGE_KEY = 'vaairo_preferred_receipt_format';
const THERMAL_WIDTH_STORAGE_KEY = 'vaairo_preferred_thermal_width';

export function getPreferredReceiptFormat(): ReceiptPrintFormat {
  if (typeof window === 'undefined') return 'full';
  try {
    const val = localStorage.getItem(RECEIPT_FORMAT_STORAGE_KEY);
    return val === 'thermal' ? 'thermal' : 'full';
  } catch {
    return 'full';
  }
}

export function setPreferredReceiptFormat(format: ReceiptPrintFormat): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(RECEIPT_FORMAT_STORAGE_KEY, format);
  } catch {}
}

export function getPreferredThermalWidth(): ThermalRollWidth {
  if (typeof window === 'undefined') return '80mm';
  try {
    const val = localStorage.getItem(THERMAL_WIDTH_STORAGE_KEY);
    return val === '58mm' ? '58mm' : '80mm';
  } catch {
    return '80mm';
  }
}

export function setPreferredThermalWidth(width: ThermalRollWidth): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(THERMAL_WIDTH_STORAGE_KEY, width);
  } catch {}
}

interface DocumentPrintModalProps {
  docData: TransactionDoc | null;
  onClose: () => void;
  defaultFormat?: ReceiptPrintFormat;
}

const ThermalPaperTearEdge: React.FC<{ position: 'top' | 'bottom' }> = ({ position }) => (
  <div
    aria-hidden="true"
    className={`w-full h-2.5 bg-repeat-x opacity-90 ${position === 'top' ? 'rotate-180' : ''}`}
    style={{
      backgroundImage: 'radial-gradient(circle at 6px 0, transparent 5px, #ffffff 5.5px)',
      backgroundSize: '12px 10px',
    }}
  />
);

const DocumentSheetCanvas: React.FC<{
  docData: TransactionDoc;
  items: NormalizedDocumentLineItem[];
  forPrint?: boolean;
}> = ({ docData, items, forPrint = false }) => {
  const isLogisticsOnly = docData.docType === 'Packing List' || docData.docType === 'Delivery Note';
  const creationRec = getDocumentCreationRecord(docData);
  const cheque = docData.chequeDetails;
  const effectiveStatus = cheque?.status && docData.status !== 'Credited' ? docData.status : docData.status;
  const isPaid = effectiveStatus === 'Paid';
  const isProcessing = effectiveStatus === 'Processing';
  const isRejected = effectiveStatus === 'Rejected';

  const statusTextColor = isRejected
    ? 'text-rose-700'
    : isProcessing
    ? 'text-amber-700'
    : 'text-emerald-700';

  const statusDisplayLabel =
    cheque || docData.paymentMethod === 'Cheque'
      ? isPaid
        ? 'Paid (Cheque Cleared)'
        : isProcessing
        ? 'Processing (Not Matured)'
        : isRejected
        ? 'Rejected (Cheque Returned)'
        : docData.status
      : docData.status;

  return (
    <div
      id={forPrint ? undefined : 'printable-erp-document'}
      className={`bg-white text-slate-900 space-y-6 relative ${forPrint ? 'p-4' : 'p-6 sm:p-10'}`}
    >
      {/* Watermark Stamp */}
      <div className="absolute right-8 sm:right-12 top-20 sm:top-24 pointer-events-none opacity-10 border-4 border-[#0A006E] rounded-2xl p-4 transform rotate-12 flex items-center gap-2">
        <Award className="w-16 h-16 text-[#0A006E]" />
        <div className="text-right">
          <div className="font-montserrat font-black text-xs uppercase text-[#0A006E]">VAAIRO BONDED</div>
          <div className="font-montserrat font-bold text-[10px] text-slate-700">VERIFIED &amp; AUDITED</div>
        </div>
      </div>

      {/* Letterhead */}
      <div
        className={`flex justify-between gap-4 pb-6 border-b-2 border-slate-200 ${
          forPrint ? 'flex-row items-start' : 'flex-col sm:flex-row sm:items-start'
        }`}
      >
        <div className="min-w-0">
          <div className="text-xs font-montserrat font-black text-[#0A006E] tracking-widest uppercase flex items-center gap-1.5 flex-wrap">
            <span className="w-2.5 h-2.5 rounded-full bg-[#34D186] shrink-0" />
            VAAIRO BEVERAGES &amp; MERCHANTS LTD
            {docData.supplierFacilityType && (
              <span className="ml-1 px-2 py-0.5 rounded bg-blue-100 text-blue-900 text-[10px] font-black uppercase">
                {docData.supplierFacilityType.replace('_', ' ')}
              </span>
            )}
            {docData.orderCategory === 'WAREHOUSE_PURCHASE' && (
              <span className="px-2 py-0.5 rounded bg-[#FFDE00] text-[#0A006E] text-[10px] font-black uppercase">
                WAREHOUSE → BRANCH PURCHASE
              </span>
            )}
          </div>
          <h1 className="text-3xl font-montserrat font-black italic text-[#0A006E] mt-1 tracking-tight">
            {docData.docType.toUpperCase()}
          </h1>
          <p className="text-xs text-slate-600 mt-1 font-medium">
            Issuing Facility:{' '}
            <span className="font-bold text-slate-900">{docData.branchName}</span> ({docData.regionName})
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Channel: <span className="font-semibold text-slate-800">{docData.channel}</span> · Created By:{' '}
            <span className="font-semibold text-slate-800">{creationRec.createdBy} ({creationRec.createdByRole})</span>
          </p>
        </div>

        <div
          className={`font-mono-tabular bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0 ${
            forPrint ? 'text-right' : 'sm:text-right'
          }`}
        >
          <div className="text-sm font-black text-[#0A006E]">{docData.docNumber}</div>
          <div className="text-xs text-slate-600 mt-1">
            Day: <span className="font-semibold text-slate-800">{creationRec.createdDay}</span>
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Time: <span className="font-semibold text-slate-800">{creationRec.createdTime}</span>
          </div>
          <div className="text-xs text-slate-600 mt-0.5">
            Created By: <span className="font-semibold text-slate-900">{creationRec.createdBy}</span>
          </div>
          {docData.validUntil && (
            <div className="text-xs text-amber-800 mt-0.5 font-bold">
              Valid Until: {docData.validUntil}
            </div>
          )}
          <div
            className={`text-xs ${statusTextColor} mt-1 font-bold flex items-center gap-1 ${
              forPrint ? 'justify-end' : 'sm:justify-end'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Status: {statusDisplayLabel} · {docData.paymentMethod}</span>
          </div>
        </div>
      </div>

      {/* Consignee & Compliance Info */}
      <div
        className={`grid gap-4 bg-[#F8FAFC] p-4 rounded-xl border border-slate-200 text-xs ${
          forPrint ? 'grid-cols-2 break-inside-avoid' : 'grid-cols-1 sm:grid-cols-2'
        }`}
      >
        <div>
          <div className="text-[10px] text-[#0A006E] font-montserrat font-black uppercase tracking-wider">
            {docData.buyerBranchName ? 'Purchasing / Receiving Branch' : 'Consignee / Customer Details'}
          </div>
          <div className="text-sm font-montserrat font-bold text-slate-900 mt-1">
            {docData.customerName}
          </div>
          <div className="text-xs text-slate-600 font-mono-tabular mt-1">
            License / KRA PIN:{' '}
            <strong className="text-slate-900">
              {docData.customerKraPin || docData.customerLicenseNo || 'Commercial Verified 21+'}
            </strong>
          </div>
          {(docData.customerPhone || docData.customerEmail || docData.deliveryAddress) && (
            <div className="text-[11px] text-slate-600 mt-1 space-y-0.5">
              {docData.customerPhone && <div>Tel: {docData.customerPhone}</div>}
              {docData.customerEmail && <div>Email: {docData.customerEmail}</div>}
              {docData.deliveryAddress && <div>Delivery Address: {docData.deliveryAddress}</div>}
            </div>
          )}
        </div>
        <div>
          <div className="text-[10px] text-[#1E9E60] font-montserrat font-black uppercase tracking-wider">
            Regulatory, Excise &amp; Traceability Metadata
          </div>
          <div className="text-xs text-slate-700 mt-1 leading-relaxed">
            All IPS/LPS spirits &amp; alcoholic beverages carry verified KRA Digital Excise &amp; Import Duty Stamps. Bonded under Kenya Revenue Authority rules.
          </div>
          {docData.linkedTransferNo && (
            <div className="text-xs font-bold text-[#0A006E] mt-1 font-mono-tabular">
              Linked Purchase / Transfer Batch: {docData.linkedTransferNo}
            </div>
          )}
          {docData.relatedInvoiceNo && (
            <div className="text-xs font-bold text-amber-800 mt-1">
              Ref Document: {docData.relatedInvoiceNo}
              {docData.creditReason ? ` · Reason: ${docData.creditReason}` : ''}
            </div>
          )}
          {docData.notes && (
            <div className="text-xs text-slate-700 mt-1 italic">
              Notes: {docData.notes}
            </div>
          )}
        </div>
      </div>

      {/* Cheque Clearing & Maturity Details Strip (shown for Cheque POs, Invoices, and Receipts) */}
      {(cheque || docData.paymentMethod === 'Cheque') && (
        <div
          className={`p-4 rounded-xl border-2 text-xs space-y-2.5 break-inside-avoid ${
            isRejected
              ? 'bg-rose-50 border-rose-300'
              : isProcessing
              ? 'bg-amber-50 border-amber-300'
              : 'bg-emerald-50 border-emerald-300'
          }`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[10px] font-montserrat font-black uppercase tracking-wider text-[#0A006E]">
              Cheque Payment &amp; Clearing Verification
            </div>
            <span
              className={`px-2.5 py-0.5 rounded-full text-[10px] font-montserrat font-black uppercase border ${
                isRejected
                  ? 'bg-rose-600 text-white border-rose-700'
                  : isProcessing
                  ? 'bg-amber-500 text-slate-950 border-amber-600'
                  : 'bg-emerald-600 text-white border-emerald-700'
              }`}
            >
              {isRejected
                ? 'REJECTED · UNSUCCESSFUL'
                : isProcessing
                ? 'PROCESSING · NOT MATURED'
                : 'PAID · CHEQUE CLEARED'}
            </span>
          </div>

          {cheque && (
            <div className={`grid gap-3 font-mono-tabular ${forPrint ? 'grid-cols-3' : 'grid-cols-2 sm:grid-cols-3'}`}>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Cheque Number</div>
                <div className="font-black text-[#0A006E]">{cheque.chequeNumber}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Drawer Bank &amp; Branch</div>
                <div className="font-bold text-slate-900">
                  {cheque.drawerBank}
                  {cheque.branchName ? ` (${cheque.branchName})` : ''}
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Drawer / Account Name</div>
                <div className="font-bold text-slate-900">{cheque.drawerName}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Cheque Issue Date</div>
                <div className="font-semibold text-slate-800">{cheque.chequeDate}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Maturity / Value Date</div>
                <div className="font-bold text-slate-900">{cheque.maturityDate}</div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-montserrat font-bold">Cheque Face Amount</div>
                <div className="font-black text-[#0A006E]">{formatKes(cheque.amountKes || docData.totalAmount)}</div>
              </div>
            </div>
          )}

          {isRejected && (
            <div className="text-[11px] font-bold text-rose-800 bg-white/80 px-3 py-1.5 rounded-lg border border-rose-200">
              Clearance Outcome: Cheque rejected / unsuccessful.{cheque?.rejectionReason ? ` Reason: ${cheque.rejectionReason}` : ''}
            </div>
          )}
          {isProcessing && (
            <div className="text-[11px] font-bold text-amber-900 bg-white/80 px-3 py-1.5 rounded-lg border border-amber-200">
              Clearance Notice: Document currently marked Processing pending cheque maturity and bank settlement{cheque?.maturityDate ? ` (${cheque.maturityDate})` : ''}.
            </div>
          )}
        </div>
      )}

      {/* Line Items Table */}
      <div className={`${forPrint ? 'overflow-visible' : 'overflow-x-auto'} border border-slate-200 rounded-xl shadow-2xs`}>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-[#0A006E] text-[#FFDE00] text-xs font-montserrat">
              <th className="py-3 px-3 font-black">SKU</th>
              <th className="py-3 px-3 font-black">Product Description</th>
              <th className="py-3 px-3 font-black">Pack Mode</th>
              <th className="py-3 px-3 font-black text-right">Qty</th>
              <th className="py-3 px-3 font-black text-right">Total Btls</th>
              {isLogisticsOnly ? (
                <th className="py-3 px-3 font-black text-right">Excise Stamp Verification</th>
              ) : (
                <>
                  <th className="py-3 px-3 font-black text-right">Unit Price (KES)</th>
                  <th className="py-3 px-3 font-black text-right">Line Total (KES)</th>
                </>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 text-xs">
            {items.map((item, idx) => (
              <tr key={idx} className="hover:bg-slate-50 transition break-inside-avoid">
                <td className="py-3 px-3 font-mono-tabular font-bold text-[#0A006E]">
                  {item.sku}
                </td>
                <td className="py-3 px-3 font-semibold text-slate-900">{item.name}</td>
                <td className="py-3 px-3 text-slate-600 font-mono">
                  {item.bottlesPerCase > 0 ? `${item.unitMode} (${item.bottlesPerCase}/cs)` : item.unitMode}
                </td>
                <td className="py-3 px-3 text-right font-mono-tabular font-bold">{item.quantityUnits}</td>
                <td className="py-3 px-3 text-right font-mono-tabular font-bold text-[#1E9E60]">{item.totalBottles}</td>
                {isLogisticsOnly ? (
                  <td className="py-3 px-3 text-right font-mono-tabular text-[#1E9E60] font-bold">
                    ✓ VERIFIED SEALED
                  </td>
                ) : (
                  <>
                    <td className="py-3 px-3 text-right font-mono-tabular text-slate-700">
                      {formatKes(item.unitPrice)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono-tabular font-black text-[#0A006E]">
                      {formatKes(item.lineTotal)}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Totals or Dispatch Sign-off */}
      {!isLogisticsOnly ? (
        <div
          className={`flex justify-between gap-4 pt-2 break-inside-avoid ${
            forPrint ? 'flex-row items-end' : 'flex-col sm:flex-row items-start sm:items-end'
          }`}
        >
          <div className="text-xs text-slate-600 max-w-sm flex items-start gap-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
            <ShieldCheck className="w-4 h-4 text-[#0A006E] shrink-0 mt-0.5" />
            <span>
              Prices reflect regional geo-location tariff rules ({docData.regionName}). Sale of alcohol to persons under 21 is strictly prohibited by Kenyan law.
            </span>
          </div>
          <div
            className={`bg-[#F0FDF4] p-4 rounded-xl border-2 border-[#34D186] space-y-1.5 font-mono-tabular ${
              forPrint ? 'w-72 shrink-0' : 'w-full sm:w-72'
            }`}
          >
            <div className="flex justify-between text-xs text-slate-700">
              <span>Subtotal:</span>
              <span>{formatKes(docData.subtotal)}</span>
            </div>
            <div className="flex justify-between text-xs text-slate-700">
              <span>Excise &amp; Regional VAT:</span>
              <span>{formatKes(docData.exciseAndTax)}</span>
            </div>
            <div className="flex justify-between text-sm font-montserrat font-black text-[#0A006E] pt-2 border-t border-emerald-300">
              <span>{docData.docType === 'Credit Note' ? 'Total Credit:' : 'Grand Total:'}</span>
              <span>{formatKes(docData.totalAmount)}</span>
            </div>
          </div>
        </div>
      ) : (
        <div
          className={`grid gap-6 pt-6 border-t border-slate-200 text-xs text-slate-700 break-inside-avoid ${
            forPrint ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'
          }`}
        >
          <div className="space-y-4">
            <div className="font-montserrat font-bold text-slate-900">
              {docData.branchName} Dispatch Officer
            </div>
            <div className="border-b-2 border-slate-400 w-56 pb-1 font-mono text-slate-500 text-[10px]">
              Signature &amp; Excise Seal Check
            </div>
          </div>
          <div className="space-y-4">
            <div className="font-montserrat font-bold text-slate-900">
              Logistics Driver / Consignee Receiver
            </div>
            <div className="border-b-2 border-slate-400 w-56 pb-1 font-mono text-slate-500 text-[10px]">
              Received in Good Bonded Condition
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const ThermalDocumentSheet: React.FC<{
  docData: TransactionDoc;
  items: NormalizedDocumentLineItem[];
  rollWidth: ThermalRollWidth;
  forPrint?: boolean;
}> = ({ docData, items, rollWidth, forPrint = false }) => {
  const isCompactRoll = rollWidth === '58mm';
  const isLogisticsOnly = docData.docType === 'Packing List' || docData.docType === 'Delivery Note';
  const creationRec = getDocumentCreationRecord(docData);
  const cheque = docData.chequeDetails;
  const effectiveStatus = cheque?.status && docData.status !== 'Credited' ? docData.status : docData.status;
  const isPaid = effectiveStatus === 'Paid';
  const isProcessing = effectiveStatus === 'Processing';
  const isRejected = effectiveStatus === 'Rejected';

  const statusTextColor = isRejected
    ? 'text-rose-700'
    : isProcessing
    ? 'text-amber-700'
    : 'text-emerald-700';

  const qrSvg = useMemo(
    () =>
      generateSimpleQrSvg(
        `VAAIRO|${docData.docType}|${docData.docNumber}|${docData.branchName}|TOTAL:${docData.totalAmount}|${docData.status}`,
        isCompactRoll ? 84 : 96
      ),
    [docData.docType, docData.docNumber, docData.branchName, docData.totalAmount, docData.status, isCompactRoll]
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
        } ${forPrint ? 'p-2.5' : 'shadow-xl border-x border-slate-200/90'}`}
      >
        {/* Letterhead */}
        <div className="text-center border-b-2 border-dashed border-slate-300 pb-3 space-y-1">
          <div className="text-[10px] font-montserrat font-black text-[#0A006E] tracking-widest uppercase">
            VAAIRO BEVERAGES &amp; MERCHANTS LTD
          </div>
          <h1
            className={`font-montserrat font-black italic text-[#0A006E] tracking-tight leading-none ${
              isCompactRoll ? 'text-xl' : 'text-2xl'
            }`}
          >
            {docData.docType.toUpperCase()}
          </h1>
          <div className="text-[10px] text-slate-600 font-medium leading-snug">
            <span className="font-bold text-slate-900">{docData.branchName}</span> ({docData.regionName})
          </div>
          <div className="text-[9.5px] font-mono-tabular text-slate-500">
            {docData.channel} · Licensed Bonded Merchant
          </div>
        </div>

        {/* Metadata Card */}
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-2.5 font-mono-tabular text-[10px] space-y-1">
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Doc No:</span>
            <span className="font-black text-[#0A006E] truncate">{docData.docNumber}</span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Issued:</span>
            <span className="font-semibold text-slate-800">
              {creationRec.createdDay} · {creationRec.createdTime}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-slate-500">Served By:</span>
            <span className="font-bold text-slate-900 truncate">{creationRec.createdBy}</span>
          </div>
          <div className="flex items-center justify-between gap-2 pt-1 border-t border-dashed border-slate-200">
            <span className="text-slate-500">Payment:</span>
            <span className={`font-bold ${statusTextColor} truncate`}>
              {docData.status} · {docData.paymentMethod}
            </span>
          </div>
        </div>

        {/* Customer Info */}
        <div className="bg-[#F8FAFC] border border-slate-200 rounded-xl p-2.5 space-y-1 text-[10px]">
          <div className="text-[9px] text-[#0A006E] font-montserrat font-black uppercase tracking-wider">
            {docData.buyerBranchName ? 'Receiving Branch' : 'Customer / Consignee'}
          </div>
          <div className="text-xs font-montserrat font-black text-slate-900 leading-tight">
            {docData.customerName}
          </div>
          <div className="text-[10px] font-mono-tabular text-slate-600">
            PIN / Lic:{' '}
            <strong className="text-slate-900">
              {docData.customerKraPin || docData.customerLicenseNo || 'Commercial Verified 21+'}
            </strong>
          </div>
          {docData.customerPhone && (
            <div className="text-[9.5px] font-mono-tabular text-slate-600">Tel: {docData.customerPhone}</div>
          )}
          {docData.linkedTransferNo && (
            <div className="text-[9.5px] font-mono-tabular font-bold text-[#0A006E]">
              Batch: {docData.linkedTransferNo}
            </div>
          )}
        </div>

        {/* Cheque Strip if applicable */}
        {(cheque || docData.paymentMethod === 'Cheque') && (
          <div
            className={`p-2.5 rounded-xl border text-[9.5px] font-mono-tabular space-y-1 ${
              isRejected
                ? 'bg-rose-50 border-rose-300 text-rose-900'
                : isProcessing
                ? 'bg-amber-50 border-amber-300 text-amber-900'
                : 'bg-emerald-50 border-emerald-300 text-emerald-900'
            }`}
          >
            <div className="font-montserrat font-black uppercase text-[9px]">
              Cheque Status: {isPaid ? 'Cleared & Paid' : isRejected ? 'Rejected' : 'Processing'}
            </div>
            {cheque && (
              <div>
                #{cheque.chequeNumber} · {cheque.drawerBank} · Maturity {cheque.maturityDate}
              </div>
            )}
          </div>
        )}

        {/* Itemized List */}
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <div className="bg-[#0A006E] text-[#FFDE00] px-2.5 py-1.5 flex items-center justify-between text-[10px] font-montserrat font-black uppercase tracking-wide">
            <span>Item ({items.length})</span>
            <span>{isLogisticsOnly ? 'Bottles' : 'Total (KES)'}</span>
          </div>
          <div className="divide-y divide-dashed divide-slate-200 text-[10.5px] bg-white">
            {items.map((item, idx) => (
              <div key={idx} className="px-2.5 py-2 space-y-0.5">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-semibold text-slate-900 leading-snug break-words min-w-0">
                    {item.name}
                  </span>
                  <span className="font-mono-tabular tabular-nums font-black text-[#0A006E] shrink-0">
                    {isLogisticsOnly ? `${item.totalBottles} Btls` : formatKes(item.lineTotal)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-[9.5px] font-mono-tabular text-slate-500">
                  <span>
                    {item.sku} · {item.quantityUnits} {item.unitMode}
                    {!isLogisticsOnly ? ` × ${formatKes(item.unitPrice)}` : ''}
                  </span>
                  <span className="text-[#1E9E60] font-bold">{item.totalBottles} Btls</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Totals Box */}
        {!isLogisticsOnly && (
          <div className="bg-[#F0FDF4] border-2 border-[#34D186] rounded-xl p-3 space-y-1 font-mono-tabular">
            <div className="flex justify-between text-[10px] text-slate-700">
              <span>Subtotal:</span>
              <span className="tabular-nums font-semibold">{formatKes(docData.subtotal)}</span>
            </div>
            <div className="flex justify-between text-[10px] text-slate-700">
              <span>Excise &amp; Regional VAT:</span>
              <span className="tabular-nums font-semibold">{formatKes(docData.exciseAndTax)}</span>
            </div>
            <div className="flex justify-between items-baseline pt-2 mt-1 border-t border-emerald-300 text-[#0A006E]">
              <span className="font-montserrat font-black text-xs uppercase tracking-tight">
                {docData.docType === 'Credit Note' ? 'Total Credit' : 'Grand Total'}
              </span>
              <span
                className={`font-montserrat font-black tabular-nums ${
                  isCompactRoll ? 'text-base' : 'text-lg'
                }`}
              >
                {formatKes(docData.totalAmount)}
              </span>
            </div>
          </div>
        )}

        {/* Verification QR + Barcode */}
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
            *{docData.docNumber}*
          </div>
          <div className="text-[8.5px] text-slate-400 font-medium leading-snug">
            Sale of alcohol to persons under 21 strictly prohibited · Vaairo ERP
          </div>
        </div>
      </div>

      {!forPrint && <ThermalPaperTearEdge position="bottom" />}
    </div>
  );
};

export const DocumentPrintModal: React.FC<DocumentPrintModalProps> = ({
  docData,
  onClose,
  defaultFormat,
}) => {
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [receiptFormat, setReceiptFormat] = useState<ReceiptPrintFormat>(() =>
    defaultFormat || getPreferredReceiptFormat()
  );
  const [rollWidth, setRollWidth] = useState<ThermalRollWidth>(() => getPreferredThermalWidth());

  useEffect(() => {
    if (!docData) return;
    setReceiptFormat(defaultFormat || getPreferredReceiptFormat());
  }, [docData?.id, defaultFormat]);

  useEffect(() => {
    if (!docData || typeof document === 'undefined') return;
    document.body.classList.add('erp-printing-document');
    return () => {
      document.body.classList.remove('erp-printing-document');
    };
  }, [docData]);

  if (!docData) return null;

  const items = normalizeDocumentLineItems(docData.itemsSummary);

  const handleSelectFormat = (nextFormat: ReceiptPrintFormat) => {
    setReceiptFormat(nextFormat);
    setPreferredReceiptFormat(nextFormat);
  };

  const handleSelectRollWidth = (nextWidth: ThermalRollWidth) => {
    setRollWidth(nextWidth);
    setPreferredThermalWidth(nextWidth);
  };

  const handleDownloadPDF = () => {
    if (receiptFormat === 'thermal') {
      exportThermalDocumentPDF(docData, rollWidth);
    } else {
      exportCommercialDocumentPDF(docData);
    }
  };

  return (
    <>
      {receiptFormat === 'thermal' && (
        <style media="print">{`@page { size: ${rollWidth} auto; margin: 2mm; }`}</style>
      )}
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:hidden ${
          isFullScreen && receiptFormat === 'full' ? 'p-0' : 'p-2 sm:p-4'
        }`}
      >
        <div
          className={`bg-white border sm:border-2 border-[#0A006E] shadow-2xl flex flex-col overflow-hidden transition-all ${
            receiptFormat === 'thermal'
              ? 'rounded-2xl max-w-[480px] w-full h-auto max-h-[94vh]'
              : isFullScreen
              ? 'w-full h-full rounded-none max-w-none'
              : 'rounded-2xl max-w-5xl w-full h-auto max-h-[94vh]'
          }`}
        >
          {/* Top Action Bar (Hidden during print) */}
          <div className="bg-[#0A006E] text-white px-4 sm:px-5 py-3.5 flex items-center justify-between gap-2 border-b-4 border-[#FFDE00] relative overflow-hidden print:hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A006E] via-indigo-950 to-[#0A006E] opacity-90" />
            <div className="flex items-center gap-3 relative z-10 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center font-black shadow shrink-0">
                {receiptFormat === 'thermal' ? (
                  <Receipt className="w-5 h-5" />
                ) : (
                  <FileCheck2 className="w-5 h-5" />
                )}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-montserrat font-black uppercase tracking-wider text-[#FFDE00]">
                    Official Document · {docData.docType}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-montserrat font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {receiptFormat === 'thermal' ? `Thermal ${rollWidth}` : 'Full A4 Sheet'}
                  </span>
                </div>
                <p className="text-sm font-mono-tabular font-bold text-white truncate">{docData.docNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 relative z-10 flex-wrap justify-end">
              {receiptFormat === 'full' && (
                <button
                  type="button"
                  onClick={() => setIsFullScreen((prev) => !prev)}
                  className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-montserrat font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap border border-white/20"
                  title={isFullScreen ? 'Exit Full Screen' : 'Toggle Full Screen Preview'}
                >
                  {isFullScreen ? (
                    <Minimize2 className="w-3.5 h-3.5 text-[#FFDE00]" />
                  ) : (
                    <Maximize2 className="w-3.5 h-3.5 text-[#FFDE00]" />
                  )}
                  <span className="hidden sm:inline">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={handleDownloadPDF}
                className="px-3.5 py-1.5 bg-[#FFDE00] text-[#0A006E] hover:bg-amber-400 rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 transition shadow cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download PDF</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3.5 py-1.5 bg-[#34D186] text-[#0A006E] hover:bg-emerald-400 rounded-xl text-xs font-montserrat font-black flex items-center gap-1.5 transition shadow cursor-pointer whitespace-nowrap"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Print</span>
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
                aria-label="Close modal"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Receipt Format Switcher Bar: Full Receipt (A4) vs Thermal Receipt (80mm / 58mm) */}
          <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap print:hidden shrink-0">
            <div
              role="group"
              aria-label="Receipt format option"
              className="inline-flex items-center p-1 bg-slate-200/80 rounded-xl gap-1"
            >
              <button
                type="button"
                onClick={() => handleSelectFormat('full')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  receiptFormat === 'full'
                    ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Full Receipt (A4)</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectFormat('thermal')}
                className={`min-h-[34px] px-3 py-1 rounded-lg text-xs font-montserrat font-black flex items-center gap-1.5 cursor-pointer transition whitespace-nowrap ${
                  receiptFormat === 'thermal'
                    ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Receipt className="w-3.5 h-3.5" />
                <span>Thermal Receipt</span>
              </button>
            </div>

            {receiptFormat === 'thermal' && (
              <div
                role="group"
                aria-label="Thermal paper width"
                className="inline-flex items-center p-1 bg-slate-200/80 rounded-xl gap-1"
              >
                {(['80mm', '58mm'] as const).map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleSelectRollWidth(size)}
                    className={`min-h-[32px] px-2.5 py-1 rounded-lg text-xs font-montserrat font-black cursor-pointer transition whitespace-nowrap ${
                      rollWidth === size
                        ? 'bg-[#0A006E] text-[#FFDE00] shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {size} Roll
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Scrollable Preview Canvas */}
          <div
            className={`flex-1 overflow-y-auto ${
              receiptFormat === 'thermal' ? 'bg-slate-200/80 p-4 sm:p-6' : 'bg-white'
            }`}
          >
            {receiptFormat === 'thermal' ? (
              <ThermalDocumentSheet docData={docData} items={items} rollWidth={rollWidth} />
            ) : (
              <DocumentSheetCanvas docData={docData} items={items} />
            )}
          </div>
        </div>
      </div>

      {/* Dedicated Print Portal so window.print() matches preview pixel-for-pixel with exact colors and zero modal clipping */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="printable-erp-document-portal" className="hidden print:block bg-white text-slate-900">
            {receiptFormat === 'thermal' ? (
              <ThermalDocumentSheet docData={docData} items={items} rollWidth={rollWidth} forPrint />
            ) : (
              <DocumentSheetCanvas docData={docData} items={items} forPrint />
            )}
          </div>,
          document.body
        )}
    </>
  );
};

