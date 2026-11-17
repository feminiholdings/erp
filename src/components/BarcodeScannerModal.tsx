import React, { useState, useEffect, useRef } from 'react';
import { Camera, X, CheckCircle2, AlertCircle, Barcode, RefreshCw, Zap } from 'lucide-react';
import { Product } from '../types';

interface Props {
  products: Product[];
  onBarcodeDetected: (barcode: string, matchedProduct?: Product) => void;
  onClose: () => void;
}

export const BarcodeScannerModal: React.FC<Props> = ({ products, onBarcodeDetected, onClose }) => {
  const [manualCode, setManualCode] = useState('');
  const [scanStatus, setScanStatus] = useState<string | null>(null);
  const [matchedItem, setMatchedItem] = useState<Product | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(true);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleTestScan = (code: string) => {
    const found = products.find(
      (p) =>
        p.barcode === code ||
        p.sku === code ||
        p.caseBarcode === code ||
        p.id === code
    );
    setMatchedItem(found || null);
    setScanStatus(`Scanned Barcode: ${code}`);
    onBarcodeDetected(code, found);
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    handleTestScan(manualCode.trim());
    setManualCode('');
  };

  const registeredBarcodes = products
    .filter((p) => Boolean(p.barcode))
    .slice(0, 5)
    .map((p) => ({ label: p.name, code: p.barcode! }));

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border-0 sm:border border-slate-700 text-white rounded-none sm:rounded-3xl max-w-none sm:max-w-lg w-full h-full sm:h-auto overflow-y-auto shadow-2xl space-y-4 flex flex-col justify-between sm:justify-start">
        {/* Header */}
        <div className="p-4 bg-slate-950 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#0A006E] border border-[#FFDE00] text-[#FFDE00] flex items-center justify-center">
              <Camera className="w-4 h-4" />
            </div>
            <h3 className="font-montserrat font-bold text-sm text-white">
              Barcode Scanner
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Viewfinder View */}
        <div className="px-6 py-2">
          <div className="relative aspect-video sm:aspect-4/3 rounded-2xl bg-black border border-slate-800 overflow-hidden flex items-center justify-center shadow-inner">
            {/* Minimal Corner Brackets Only */}
            <div className="relative w-3/4 h-3/5 flex items-center justify-center">
              <div className="absolute top-0 left-0 w-6 h-6 border-t-[3px] border-l-[3px] border-[#FFDE00] rounded-tl-lg" />
              <div className="absolute top-0 right-0 w-6 h-6 border-t-[3px] border-r-[3px] border-[#FFDE00] rounded-tr-lg" />
              <div className="absolute bottom-0 left-0 w-6 h-6 border-b-[3px] border-l-[3px] border-[#FFDE00] rounded-bl-lg" />
              <div className="absolute bottom-0 right-0 w-6 h-6 border-b-[3px] border-r-[3px] border-[#FFDE00] rounded-br-lg" />
              <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-[#FFDE00]/80 shadow-[0_0_10px_#FFDE00] animate-pulse" />
            </div>
          </div>
        </div>

        {/* Scan Status & Matched Result */}
        {scanStatus && (
          <div className="px-6">
            <div className="p-3 rounded-xl bg-slate-800 border border-slate-700 text-xs flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-[#FFDE00] font-bold">{scanStatus}</div>
                {matchedItem ? (
                  <div className="text-white font-montserrat font-bold truncate mt-0.5">
                    Found: {matchedItem.name} ({matchedItem.volumeMl}ml)
                  </div>
                ) : (
                  <div className="text-amber-400 text-[11px] mt-0.5">
                    Item detected and sent to POS terminal.
                  </div>
                )}
              </div>
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
            </div>
          </div>
        )}

        {/* Quick Registered Catalog Barcodes */}
        {registeredBarcodes.length > 0 && (
          <div className="px-6 space-y-1.5">
            <div className="text-[11px] font-montserrat font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Zap className="w-3.5 h-3.5 text-[#FFDE00]" />
              <span>Registered Catalog Quick Select:</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {registeredBarcodes.map((item) => (
                <button
                  key={item.code}
                  type="button"
                  onClick={() => handleTestScan(item.code)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-[#FFDE00] hover:text-[#0A006E] text-slate-300 font-mono text-[11px] border border-slate-700 transition cursor-pointer"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Manual Barcode Wedge Input */}
        <div className="p-6 pt-2 bg-slate-950 border-t border-slate-800">
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              ref={inputRef}
              type="text"
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              placeholder="Scan gun input / Enter EAN-13 code..."
              className="flex-1 px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-white font-mono text-xs focus:outline-none focus:border-[#FFDE00]"
            />
            <button
              type="submit"
              className="px-4 py-2.5 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-xl font-montserrat font-black text-xs transition cursor-pointer"
            >
              Scan
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};
