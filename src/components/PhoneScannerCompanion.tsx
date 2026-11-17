/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  X,
  Flashlight,
  FlashlightOff,
  CheckCircle2,
  AlertCircle,
  Volume2,
  VolumeX,
  RotateCcw,
  ArrowLeft,
  Plus,
} from 'lucide-react';
import { Product, Branch, GeoRegion } from '../types';
import { playPosBeep, triggerScanHaptic, isAudioMuted, toggleAudioMuted } from '../utils/audioBeep';
import { calculateGeoPrice, formatKes } from '../erpUtils';
import {
  syncPosCartToFirestore,
  subscribeToActivePosCart,
  PosCartItem,
} from '../utils/posCartSync';

interface PhoneScannerCompanionProps {
  products: Product[];
  staffId: string;
  staffName: string;
  staffEmail: string;
  staffRole: string;
  branchId?: string;
  branches: Branch[];
  regions: GeoRegion[];
  onClose?: () => void;
  isStandaloneMobile?: boolean;
}

export const PhoneScannerCompanion: React.FC<PhoneScannerCompanionProps> = ({
  products,
  staffId,
  staffName,
  staffEmail,
  staffRole,
  branchId,
  branches,
  regions,
  onClose,
  isStandaloneMobile = false,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [soundMuted, setSoundMuted] = useState(isAudioMuted());
  const [manualInput, setManualInput] = useState('');
  const [isFileScanning, setIsFileScanning] = useState(false);

  // Synced Cart State from Firestore
  const [remoteCart, setRemoteCart] = useState<PosCartItem[]>([]);
  const [remoteActivatedProductIds, setRemoteActivatedProductIds] = useState<string[]>([]);
  const [remoteGrandTotal, setRemoteGrandTotal] = useState<number>(0);
  const cartRef = useRef<PosCartItem[]>([]);
  const grandTotalRef = useRef<number>(0);
  const [lastScannedFeedback, setLastScannedFeedback] = useState<{
    code: string;
    productName: string;
    price: number;
    success: boolean;
    timestamp: number;
  } | null>(null);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  const activeRegion = regions[0];

  // Subscribe to real-time cart state for this cashier account
  useEffect(() => {
    const unsub = subscribeToActivePosCart(staffId || staffEmail, (data) => {
      setRemoteCart(data.cart);
      cartRef.current = data.cart;
      setRemoteActivatedProductIds(data.activatedProductIds);
      setRemoteGrandTotal(data.grandTotal);
      grandTotalRef.current = data.grandTotal;
    });
    return () => unsub();
  }, [staffId, staffEmail]);

  // Handle a detected barcode from camera, photo, or manual entry
  const handleBarcodeDecoded = useCallback(
    async (rawCode: string) => {
      const code = rawCode.trim();
      if (!code) return;

      const now = Date.now();
      if (code === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1200) {
        return;
      }
      lastScanTimeRef.current = now;
      lastScannedCodeRef.current = code;

      const digitsOnly = code.replace(/\D/g, '');

      // 1. Find product in catalog
      let matched = products.find(
        (p) =>
          (p.barcode && p.barcode.trim() === code) ||
          (p.caseBarcode && p.caseBarcode.trim() === code) ||
          (p.sku && p.sku.toLowerCase() === code.toLowerCase())
      );

      let isCaseScan = false;
      if (matched && matched.caseBarcode && matched.caseBarcode.trim() === code) {
        isCaseScan = true;
      }

      if (!matched && digitsOnly) {
        matched = products.find((p) => {
          const pCase = p.caseBarcode ? p.caseBarcode.replace(/\D/g, '') : '';
          const pBottle = p.barcode ? p.barcode.replace(/\D/g, '') : '';
          if (pCase && (pCase === digitsOnly || pCase.endsWith(digitsOnly) || digitsOnly.endsWith(pCase))) {
            isCaseScan = true;
            return true;
          }
          if (pBottle) {
            if (pBottle === digitsOnly) return true;
            if (pBottle.padStart(13, '0') === digitsOnly.padStart(13, '0')) return true;
          }
          return false;
        });
      }

      if (!matched) {
        playPosBeep('error');
        setLastScannedFeedback({
          code,
          productName: `Barcode "${code}" not found in catalog`,
          price: 0,
          success: false,
          timestamp: now,
        });
        return;
      }

      // Calculate unit price and line totals
      const targetUnit: 'Bottle' | 'Case' = isCaseScan ? 'Case' : 'Bottle';
      const geoPrice = calculateGeoPrice(matched, activeRegion, 'retail');
      const unitPrice = targetUnit === 'Case' ? geoPrice.casePrice : geoPrice.unitBottlePrice;

      playPosBeep(isCaseScan ? 'case' : 'success');
      triggerScanHaptic();

      // Build updated cart using latest accumulated ref
      const currentCart = [...cartRef.current];
      const existingIdx = currentCart.findIndex(
        (it) => it.product?.id === matched!.id && it.unitMode === targetUnit && it.kind === 'bonded_product'
      );

      let updatedCart: PosCartItem[];
      if (existingIdx >= 0) {
        const existing = currentCart[existingIdx];
        currentCart[existingIdx] = {
          ...existing,
          quantityUnits: existing.quantityUnits + 1,
        };
        updatedCart = currentCart;
      } else {
        updatedCart = [
          ...currentCart,
          {
            id: `scan-${matched.id}-${Date.now()}`,
            kind: 'bonded_product',
            product: matched,
            unitMode: targetUnit,
            quantityUnits: 1,
            unitPrice,
            name: matched.name,
            category: matched.category,
          },
        ];
      }

      const updatedActivatedIds = remoteActivatedProductIds.includes(matched.id)
        ? remoteActivatedProductIds
        : [matched.id, ...remoteActivatedProductIds];

      // Calculate totals
      let subtotal = 0;
      let totalUnits = 0;
      for (const item of updatedCart) {
        totalUnits += item.quantityUnits;
        subtotal += Math.round(item.unitPrice * item.quantityUnits);
      }
      const taxRate = activeRegion?.regionalTaxRate ?? 0.16;
      const exciseAndTax = Math.round(subtotal * taxRate);
      const grandTotal = subtotal + exciseAndTax;

      // Update local refs and state immediately for zero-delay UX
      cartRef.current = updatedCart;
      grandTotalRef.current = grandTotal;
      setRemoteCart(updatedCart);
      setRemoteGrandTotal(grandTotal);

      // Update feedback
      setLastScannedFeedback({
        code,
        productName: matched.name,
        price: unitPrice,
        success: true,
        timestamp: now,
      });

      // Synchronize immediately to Firestore for desktop cashier!
      await syncPosCartToFirestore({
        staffId: staffId || 'staff_cashier',
        staffName: staffName || 'Cashier',
        staffEmail: staffEmail || '',
        staffRole: staffRole || 'Counter Cashier',
        branchId: branchId || '',
        cart: updatedCart,
        activatedProductIds: updatedActivatedIds,
        totalUnits,
        subtotal,
        exciseAndTax,
        grandTotal,
        lastScannedBarcode: code,
        lastScannedProductName: matched.name,
        lastScannedUnitMode: targetUnit,
        sourceDevice: 'phone',
      });
    },
    [products, remoteCart, remoteActivatedProductIds, activeRegion, staffId, staffName, staffEmail, staffRole, branchId]
  );

  // Stop camera helper
  const stopCamera = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const sc = scannerRef.current;
        scannerRef.current = null;
        if (sc.isScanning) {
          await sc.stop().catch(() => {});
        }
        sc.clear();
      } catch {}
    }
    if (isMountedRef.current) {
      setIsScanning(false);
      setHasTorch(false);
      setTorchOn(false);
    }
  }, []);

  // Start camera helper
  const startCamera = useCallback(async () => {
    if (isStartingRef.current) return;
    isStartingRef.current = true;
    setErrorMessage(null);

    try {
      await stopCamera();

      const elementId = 'phone-companion-camera-canvas';
      const container = document.getElementById(elementId);
      if (!container) {
        isStartingRef.current = false;
        return;
      }

      const scanner = new Html5Qrcode(elementId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      scannerRef.current = scanner;

      const config = {
        fps: 15,
        qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
          const minDim = Math.min(viewfinderWidth, viewfinderHeight);
          return {
            width: Math.min(Math.floor(minDim * 0.85), 320),
            height: Math.min(Math.floor(minDim * 0.55), 200),
          };
        },
        aspectRatio: 1.333333,
      };

      try {
        await scanner.start(
          { facingMode: 'environment' },
          config,
          (decoded) => handleBarcodeDecoded(decoded),
          () => {}
        );
      } catch {
        // Fallback for laptops or single-camera devices
        await scanner.start(
          { facingMode: 'user' },
          config,
          (decoded) => handleBarcodeDecoded(decoded),
          () => {}
        );
      }

      if (isMountedRef.current) {
        setIsScanning(true);
        try {
          const caps = scanner.getRunningTrackCapabilities();
          if (caps && 'torch' in caps) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }
      }
    } catch {
      if (isMountedRef.current) {
        setErrorMessage('Camera unavailable');
        setIsScanning(false);
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [handleBarcodeDecoded, stopCamera]);

  useEffect(() => {
    isMountedRef.current = true;
    const timer = setTimeout(() => {
      startCamera();
    }, 150);
    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      stopCamera();
    };
  }, [startCamera, stopCamera]);

  const toggleTorch = async () => {
    if (!scannerRef.current || !isScanning) return;
    try {
      const next = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: next }] as unknown as MediaTrackConstraintSet[],
      });
      setTorchOn(next);
    } catch {
      setHasTorch(false);
    }
  };

  const handlePhotoCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsFileScanning(true);
    setErrorMessage(null);
    try {
      const tempId = 'phone-companion-file-scan-temp';
      let temp = document.getElementById(tempId);
      if (!temp) {
        temp = document.createElement('div');
        temp.id = tempId;
        temp.style.display = 'none';
        document.body.appendChild(temp);
      }
      const fileScanner = new Html5Qrcode(tempId, {
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
          Html5QrcodeSupportedFormats.ITF,
          Html5QrcodeSupportedFormats.QR_CODE,
        ],
        verbose: false,
      });
      const decoded = await fileScanner.scanFile(file, false);
      fileScanner.clear();
      if (decoded) {
        handleBarcodeDecoded(decoded);
      }
    } catch {
      playPosBeep('error');
      setErrorMessage('Could not decode barcode from photo. Position closer with good lighting.');
    } finally {
      setIsFileScanning(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const totalCartUnits = remoteCart.reduce((sum, it) => sum + it.quantityUnits, 0);

  return (
    <div className="fixed inset-0 z-[9999] bg-slate-950 text-white flex flex-col h-full overflow-hidden">
      {/* Minimal Top Header */}
      <div className="bg-[#0A006E] px-4 py-3 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-center gap-2.5 min-w-0">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center cursor-pointer"
              title="Back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <div className="min-w-0">
            <h2 className="font-montserrat font-bold text-sm text-white truncate">
              Phone Scanner
            </h2>
            <p className="text-xs text-slate-300 truncate">{staffName}</p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={() => {
              const next = toggleAudioMuted();
              setSoundMuted(next);
            }}
            className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-200 hover:bg-white/10 cursor-pointer transition"
            title="Toggle sound"
          >
            {soundMuted ? <VolumeX className="w-4 h-4 text-rose-300" /> : <Volume2 className="w-4 h-4" />}
          </button>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center hover:bg-white/10 text-slate-200 hover:text-white cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Unobstructed Camera Viewport */}
      <div className="relative flex-1 bg-black flex items-center justify-center overflow-hidden min-h-[260px]">
        <div id="phone-companion-camera-canvas" className="w-full h-full min-h-[260px] overflow-hidden" />

        {/* Minimal Corner Brackets Only */}
        {isScanning && !errorMessage && (
          <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
            <div className="relative w-64 sm:w-72 h-40 sm:h-44">
              <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-[#FFDE00] rounded-tl-xl" />
              <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-[#FFDE00] rounded-tr-xl" />
              <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-[#FFDE00] rounded-bl-xl" />
              <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-[#FFDE00] rounded-br-xl" />
              <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-[#FFDE00]/85 shadow-[0_0_10px_#FFDE00] animate-pulse" />
            </div>
          </div>
        )}

        {/* Torch Toggle Top Right */}
        {hasTorch && (
          <div className="absolute top-3 right-3 z-20">
            <button
              type="button"
              onClick={toggleTorch}
              className={`min-w-[42px] min-h-[42px] rounded-xl flex items-center justify-center cursor-pointer transition shadow-md ${
                torchOn ? 'bg-[#FFDE00] text-[#0A006E]' : 'bg-black/55 text-white'
              }`}
              title="Flashlight"
            >
              {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
            </button>
          </div>
        )}

        {/* Minimal Camera Fallback */}
        {errorMessage && (
          <div className="absolute inset-x-6 p-5 rounded-2xl bg-slate-900/95 border border-slate-700 text-white text-center space-y-3.5 shadow-2xl z-20">
            <p className="text-sm font-montserrat font-bold text-white">
              {errorMessage}
            </p>
            <div className="flex items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={startCamera}
                className="px-4 py-2.5 bg-[#FFDE00] text-[#0A006E] rounded-xl text-xs font-montserrat font-extrabold flex items-center gap-1.5 cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Retry
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2.5 bg-slate-800 text-white border border-slate-600 rounded-xl text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Camera className="w-4 h-4 text-[#FFDE00]" />
                Photo
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Hidden File Input for Native Camera Snap */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handlePhotoCapture}
        className="hidden"
      />

      {/* Compact 1-Line Scan Result Toast */}
      {lastScannedFeedback && (
        <div
          className={`px-4 py-2.5 border-t text-xs flex items-center gap-2.5 shrink-0 ${
            lastScannedFeedback.success
              ? 'bg-emerald-950 border-emerald-700 text-emerald-100'
              : 'bg-rose-950 border-rose-700 text-rose-100'
          }`}
        >
          {lastScannedFeedback.success ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span className="font-montserrat font-bold truncate flex-1">
            {lastScannedFeedback.productName}
          </span>
          {lastScannedFeedback.price > 0 && (
            <span className="font-mono-tabular font-bold text-emerald-300 shrink-0">
              {formatKes(lastScannedFeedback.price)}
            </span>
          )}
        </div>
      )}

      {/* Manual Entry + Photo */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (manualInput.trim()) {
            handleBarcodeDecoded(manualInput.trim());
            setManualInput('');
          }
        }}
        className="bg-slate-950 px-3.5 py-2.5 border-t border-slate-800 flex items-center gap-2 shrink-0"
      >
        <input
          type="text"
          value={manualInput}
          onChange={(e) => setManualInput(e.target.value)}
          placeholder="Enter barcode..."
          className="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-[#FFDE00] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!manualInput.trim()}
          className="px-3.5 py-2.5 bg-[#0A006E] hover:bg-[#130694] disabled:opacity-40 text-[#FFDE00] border border-[#FFDE00]/40 font-montserrat font-bold text-xs rounded-xl flex items-center gap-1 cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          Add
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isFileScanning}
          className="min-w-[42px] min-h-[40px] px-2.5 bg-slate-800 text-white border border-slate-700 rounded-xl text-xs font-montserrat font-bold flex items-center justify-center cursor-pointer shrink-0"
          title="Scan from photo"
        >
          <Camera className="w-4 h-4 text-[#FFDE00]" />
        </button>
      </form>

      {/* Bottom Total & Done Bar */}
      <div className="bg-[#0A006E] px-4 py-3 border-t border-white/15 flex items-center justify-between gap-3 shrink-0">
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-lg font-montserrat font-extrabold text-white font-mono-tabular">
            {formatKes(remoteGrandTotal)}
          </span>
          <span className="text-xs text-slate-300 font-mono-tabular">
            {totalCartUnits} {totalCartUnits === 1 ? 'item' : 'items'}
          </span>
        </div>

        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] font-montserrat font-extrabold text-xs cursor-pointer shrink-0"
          >
            Done
          </button>
        )}
      </div>
    </div>
  );
};
