import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Printer, Download, X, FileCheck2, ShieldCheck, Award, Maximize2, Minimize2 } from 'lucide-react';
import { TransactionDoc } from '../types';
import {
  exportCommercialDocumentPDF,
  formatKes,
  normalizeDocumentLineItems,
  NormalizedDocumentLineItem,
} from '../erpUtils';

interface DocumentPrintModalProps {
  docData: TransactionDoc | null;
  onClose: () => void;
}

const DocumentSheetCanvas: React.FC<{
  docData: TransactionDoc;
  items: NormalizedDocumentLineItem[];
  forPrint?: boolean;
}> = ({ docData, items, forPrint = false }) => {
  const isLogisticsOnly = docData.docType === 'Packing List' || docData.docType === 'Delivery Note';

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
            Channel: <span className="font-semibold text-slate-800">{docData.channel}</span> · Issued By:{' '}
            <span className="font-semibold text-slate-800">{docData.createdBy} ({docData.createdByRole})</span>
          </p>
        </div>

        <div
          className={`font-mono-tabular bg-slate-50 p-3 rounded-xl border border-slate-200 shrink-0 ${
            forPrint ? 'text-right' : 'sm:text-right'
          }`}
        >
          <div className="text-sm font-black text-[#0A006E]">{docData.docNumber}</div>
          <div className="text-xs text-slate-600 mt-1">
            Issued: {new Date(docData.createdAt).toLocaleString()}
          </div>
          {docData.validUntil && (
            <div className="text-xs text-amber-800 mt-0.5 font-bold">
              Valid Until: {docData.validUntil}
            </div>
          )}
          <div
            className={`text-xs text-emerald-700 mt-1 font-bold flex items-center gap-1 ${
              forPrint ? 'justify-end' : 'sm:justify-end'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5 shrink-0" />
            <span>Status: {docData.status} · {docData.paymentMethod}</span>
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

export const DocumentPrintModal: React.FC<DocumentPrintModalProps> = ({ docData, onClose }) => {
  const [isFullScreen, setIsFullScreen] = useState(false);

  useEffect(() => {
    if (!docData || typeof document === 'undefined') return;
    document.body.classList.add('erp-printing-document');
    return () => {
      document.body.classList.remove('erp-printing-document');
    };
  }, [docData]);

  if (!docData) return null;

  const items = normalizeDocumentLineItems(docData.itemsSummary);

  return (
    <>
      <div
        className={`fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-xs overflow-y-auto print:hidden ${
          isFullScreen ? 'p-0' : 'p-2 sm:p-4'
        }`}
      >
        <div
          className={`bg-white border sm:border-2 border-[#0A006E] shadow-2xl flex flex-col overflow-hidden transition-all ${
            isFullScreen
              ? 'w-full h-full rounded-none max-w-none'
              : 'rounded-2xl max-w-5xl w-full h-auto max-h-[94vh]'
          }`}
        >
          {/* Top Action Bar (Hidden during print) */}
          <div className="bg-[#0A006E] text-white px-5 py-3.5 flex items-center justify-between border-b-4 border-[#FFDE00] relative overflow-hidden print:hidden shrink-0">
            <div className="absolute inset-0 bg-gradient-to-r from-[#0A006E] via-indigo-950 to-[#0A006E] opacity-90" />
            <div className="flex items-center gap-3 relative z-10 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[#FFDE00] text-[#0A006E] flex items-center justify-center font-black shadow shrink-0">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-xs font-montserrat font-black uppercase tracking-wider text-[#FFDE00]">
                    Official Document · {docData.docType}
                  </h3>
                  <span className="px-1.5 py-0.5 rounded text-[10px] font-montserrat font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    Full Preview Active
                  </span>
                </div>
                <p className="text-sm font-mono-tabular font-bold text-white truncate">{docData.docNumber}</p>
              </div>
            </div>
            <div className="flex items-center gap-2 relative z-10 flex-wrap">
              <button
                type="button"
                onClick={() => setIsFullScreen((prev) => !prev)}
                className="px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs font-montserrat font-bold flex items-center gap-1.5 transition cursor-pointer whitespace-nowrap border border-white/20"
                title={isFullScreen ? 'Exit Full Screen' : 'Toggle Full Screen Preview'}
              >
                {isFullScreen ? <Minimize2 className="w-3.5 h-3.5 text-[#FFDE00]" /> : <Maximize2 className="w-3.5 h-3.5 text-[#FFDE00]" />}
                <span className="hidden sm:inline">{isFullScreen ? 'Exit Full Screen' : 'Full Screen'}</span>
              </button>
              <button
                type="button"
                onClick={() => exportCommercialDocumentPDF(docData)}
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

          {/* Scrollable Document Preview Canvas */}
          <div className="flex-1 overflow-y-auto bg-white">
            <DocumentSheetCanvas docData={docData} items={items} />
          </div>
        </div>
      </div>

      {/* Dedicated A4 Print Portal so window.print() matches preview pixel-for-pixel with exact colors and zero modal clipping */}
      {typeof document !== 'undefined' &&
        createPortal(
          <div id="printable-erp-document-portal" className="hidden print:block bg-white text-slate-900">
            <DocumentSheetCanvas docData={docData} items={items} forPrint />
          </div>,
          document.body
        )}
    </>
  );
};

