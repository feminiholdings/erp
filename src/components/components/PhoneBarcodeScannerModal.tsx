import React, { useEffect, useState, useRef, useCallback } from 'react';
import { Html5Qrcode, Html5QrcodeSupportedFormats } from 'html5-qrcode';
import {
  Camera,
  X,
  Flashlight,
  FlashlightOff,
  CheckCircle2,
  AlertCircle,
  RotateCcw,
  Volume2,
  VolumeX,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { playPosBeep, toggleAudioMuted, isAudioMuted } from '../utils/audioBeep';

interface PhoneBarcodeScannerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onBarcodeScanned: (barcode: string) => { success: boolean; message?: string };
  continuousMode?: boolean;
}

export const PhoneBarcodeScannerModal: React.FC<PhoneBarcodeScannerModalProps> = ({
  isOpen,
  onClose,
  onBarcodeScanned,
  continuousMode = true,
}) => {
  const [isScanning, setIsScanning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasTorch, setHasTorch] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [availableCameras, setAvailableCameras] = useState<{ id: string; label: string }[]>([]);
  const [currentCameraId, setCurrentCameraId] = useState<string>('');
  const [soundMuted, setSoundMuted] = useState(isAudioMuted());
  const [manualInput, setManualInput] = useState('');
  const [lastScannedResult, setLastScannedResult] = useState<{
    code: string;
    productName?: string;
    price?: number;
    success: boolean;
    timestamp: number;
  } | null>(null);
  const [sessionScanCount, setSessionScanCount] = useState<number>(0);
  const [isFileScanning, setIsFileScanning] = useState(false);

  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isStartingRef = useRef(false);
  const isMountedRef = useRef(true);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Success debounce to prevent duplicate triggers
  const lastScanTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>('');

  const handleDecodedText = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      const trimmed = decodedText.trim();
      if (!trimmed) return;

      // Debounce identical barcode within 1200ms
      if (trimmed === lastScannedCodeRef.current && now - lastScanTimeRef.current < 1200) {
        return;
      }

      lastScanTimeRef.current = now;
      lastScannedCodeRef.current = trimmed;

      const result = onBarcodeScanned(trimmed);

      if (result.success) {
        playPosBeep('success');
        setSessionScanCount((prev) => prev + 1);
        setLastScannedResult({
          code: trimmed,
          productName: result.message || 'Added',
          success: true,
          timestamp: now,
        });

        if (!continuousMode) {
          setTimeout(() => {
            onClose();
          }, 400);
        }
      } else {
        playPosBeep('error');
        setLastScannedResult({
          code: trimmed,
          productName: result.message || 'Not found',
          success: false,
          timestamp: now,
        });
      }
    },
    [onBarcodeScanned, continuousMode, onClose]
  );

  // Stop camera helper
  const stopCurrentScanner = useCallback(async () => {
    if (scannerRef.current) {
      try {
        const scanner = scannerRef.current;
        scannerRef.current = null;
        if (scanner.isScanning) {
          await scanner.stop().catch(() => {});
        }
        scanner.clear();
      } catch {
        // Safe catch
      }
    }
    if (isMountedRef.current) {
      setIsScanning(false);
      setHasTorch(false);
      setTorchOn(false);
    }
  }, []);

  // Start camera helper
  const startScanner = useCallback(
    async (targetCameraId?: string) => {
      if (isStartingRef.current || !isOpen) return;
      isStartingRef.current = true;
      setErrorMessage(null);

      try {
        await stopCurrentScanner();

        if (!navigator?.mediaDevices?.getUserMedia) {
          throw new Error('Camera unavailable');
        }

        const elementId = 'phone-barcode-video-canvas';
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

        const cameraTarget = targetCameraId
          ? { deviceId: { exact: targetCameraId } }
          : { facingMode: 'environment' };

        try {
          await scanner.start(
            cameraTarget,
            config,
            (decodedText) => handleDecodedText(decodedText),
            () => {}
          );
        } catch (initialErr: unknown) {
          if (!targetCameraId) {
            await scanner.start(
              { facingMode: 'user' },
              config,
              (decodedText) => handleDecodedText(decodedText),
              () => {}
            );
          } else {
            throw initialErr;
          }
        }

        if (isMountedRef.current) {
          setIsScanning(true);
          if (targetCameraId) {
            setCurrentCameraId(targetCameraId);
          }

          try {
            const capabilities = scanner.getRunningTrackCapabilities();
            setHasTorch(Boolean(capabilities && 'torch' in capabilities));
          } catch {
            setHasTorch(false);
          }

          Html5Qrcode.getCameras()
            .then((devices) => {
              if (isMountedRef.current && devices && devices.length > 0) {
                setAvailableCameras(devices);
              }
            })
            .catch(() => {});
        }
      } catch (err: unknown) {
        if (isMountedRef.current) {
          const errObj = err as { name?: string; message?: string };
          let msg = 'Camera access needed';

          if (errObj?.name === 'NotFoundError' || errObj?.name === 'DevicesNotFoundError') {
            msg = 'No camera detected';
          } else if (errObj?.name === 'NotReadableError' || errObj?.name === 'TrackStartError') {
            msg = 'Camera is in use elsewhere';
          }

          setErrorMessage(msg);
          setIsScanning(false);
        }
      } finally {
        isStartingRef.current = false;
      }
    },
    [handleDecodedText, isOpen, stopCurrentScanner]
  );

  useEffect(() => {
    isMountedRef.current = true;

    if (!isOpen) {
      stopCurrentScanner();
      return () => {
        isMountedRef.current = false;
      };
    }

    const timer = setTimeout(() => {
      startScanner();
    }, 150);

    return () => {
      isMountedRef.current = false;
      clearTimeout(timer);
      stopCurrentScanner();
    };
  }, [isOpen, startScanner, stopCurrentScanner]);

  const handleExplicitRequestPermission = async () => {
    try {
      if (navigator?.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      }
      await startScanner();
    } catch {
      await startScanner();
    }
  };

  const handleToggleTorch = async () => {
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

  const handleSwitchCamera = async () => {
    if (availableCameras.length <= 1) return;
    const currentIndex = availableCameras.findIndex((c) => c.id === currentCameraId);
    const nextIndex = (currentIndex + 1) % availableCameras.length;
    const nextCam = availableCameras[nextIndex];
    if (nextCam) {
      await startScanner(nextCam.id);
    }
  };

  const handleToggleSound = () => {
    const next = toggleAudioMuted();
    setSoundMuted(next);
  };

  const handleFileScan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsFileScanning(true);
    setErrorMessage(null);
    try {
      const tempElementId = 'phone-barcode-file-scan-temp';
      let tempContainer = document.getElementById(tempElementId);
      if (!tempContainer) {
        tempContainer = document.createElement('div');
        tempContainer.id = tempElementId;
        tempContainer.style.display = 'none';
        document.body.appendChild(tempContainer);
      }

      const fileScanner = new Html5Qrcode(tempElementId, {
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

      const decodedText = await fileScanner.scanFile(file, false);
      fileScanner.clear();

      if (decodedText) {
        handleDecodedText(decodedText);
      }
    } catch {
      setErrorMessage('Could not read barcode from photo');
      playPosBeep('error');
    } finally {
      setIsFileScanning(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualInput.trim()) return;
    handleDecodedText(manualInput.trim());
    setManualInput('');
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/85 backdrop-blur-sm flex items-center justify-center p-0 sm:p-4">
      <div className="bg-slate-900 border-0 sm:border border-slate-700/80 rounded-none sm:rounded-3xl max-w-none sm:max-w-md w-full h-full sm:h-auto overflow-hidden shadow-2xl flex flex-col sm:max-h-[90vh]">
        {/* Minimal Header */}
        <div className="bg-[#0A006E] text-white px-4 py-3 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <Camera className="w-5 h-5 text-[#FFDE00] shrink-0" />
            <h3 className="font-montserrat font-bold text-sm text-white truncate">
              Scanner
            </h3>
            {sessionScanCount > 0 && (
              <span className="text-xs font-mono-tabular font-semibold text-[#FFDE00]">
                · {sessionScanCount}
              </span>
            )}
          </div>

          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={handleToggleSound}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-200 hover:bg-white/10 cursor-pointer transition"
              title={soundMuted ? 'Unmute beep' : 'Mute beep'}
            >
              {soundMuted ? <VolumeX className="w-4 h-4 text-rose-300" /> : <Volume2 className="w-4 h-4" />}
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center text-slate-200 hover:text-white hover:bg-white/10 transition cursor-pointer"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Clean Unobstructed Camera Viewport */}
        <div className="relative flex-1 bg-black min-h-[300px] sm:min-h-[340px] flex items-center justify-center overflow-hidden">
          <div
            id="phone-barcode-video-canvas"
            className="w-full h-full min-h-[300px] sm:min-h-[340px] overflow-hidden"
          />

          {/* Clean Corner Brackets Only */}
          {isScanning && !errorMessage && (
            <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
              <div className="relative w-60 sm:w-68 h-40 sm:h-44">
                <div className="absolute top-0 left-0 w-7 h-7 border-t-[3px] border-l-[3px] border-[#FFDE00] rounded-tl-xl" />
                <div className="absolute top-0 right-0 w-7 h-7 border-t-[3px] border-r-[3px] border-[#FFDE00] rounded-tr-xl" />
                <div className="absolute bottom-0 left-0 w-7 h-7 border-b-[3px] border-l-[3px] border-[#FFDE00] rounded-bl-xl" />
                <div className="absolute bottom-0 right-0 w-7 h-7 border-b-[3px] border-r-[3px] border-[#FFDE00] rounded-br-xl" />
                <div className="absolute left-3 right-3 top-1/2 -translate-y-1/2 h-[2px] bg-[#FFDE00]/85 shadow-[0_0_10px_#FFDE00] animate-pulse" />
              </div>
            </div>
          )}

          {/* Minimal Camera Fallback Overlay */}
          {errorMessage && (
            <div className="absolute inset-x-6 p-5 rounded-2xl bg-slate-900/95 border border-slate-700 text-white text-center space-y-3.5 shadow-2xl z-20">
              <p className="text-sm font-montserrat font-bold text-white">
                {errorMessage}
              </p>

              <div className="flex items-center justify-center gap-2.5">
                <button
                  type="button"
                  onClick={handleExplicitRequestPermission}
                  className="px-4 py-2.5 bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] rounded-xl text-xs font-montserrat font-extrabold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <RotateCcw className="w-4 h-4" />
                  Retry
                </button>

                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isFileScanning}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-600 rounded-xl text-xs font-montserrat font-bold flex items-center gap-1.5 cursor-pointer transition"
                >
                  <Camera className="w-4 h-4 text-[#FFDE00]" />
                  {isFileScanning ? 'Reading...' : 'Photo'}
                </button>
              </div>
            </div>
          )}

          {/* Minimal Hardware Controls Top Right (Icon-Only) */}
          {(hasTorch || availableCameras.length > 1) && (
            <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
              {hasTorch && (
                <button
                  type="button"
                  onClick={handleToggleTorch}
                  className={`min-w-[40px] min-h-[40px] rounded-xl flex items-center justify-center cursor-pointer transition shadow-md ${
                    torchOn ? 'bg-[#FFDE00] text-[#0A006E]' : 'bg-black/55 text-white hover:bg-black/75'
                  }`}
                  title="Flashlight"
                >
                  {torchOn ? <Flashlight className="w-4 h-4" /> : <FlashlightOff className="w-4 h-4" />}
                </button>
              )}

              {availableCameras.length > 1 && (
                <button
                  type="button"
                  onClick={handleSwitchCamera}
                  className="min-w-[40px] min-h-[40px] rounded-xl bg-black/55 hover:bg-black/75 text-white flex items-center justify-center cursor-pointer transition shadow-md"
                  title="Switch camera"
                >
                  <RefreshCw className="w-4 h-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Hidden native photo capture input */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileScan}
          className="hidden"
        />

        {/* Compact 1-Line Last Scan Feedback */}
        {lastScannedResult && (
          <div
            className={`px-4 py-2.5 border-t text-xs flex items-center gap-2.5 shrink-0 ${
              lastScannedResult.success
                ? 'bg-emerald-950/90 border-emerald-700 text-emerald-100'
                : 'bg-rose-950/90 border-rose-700 text-rose-100'
            }`}
          >
            {lastScannedResult.success ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            )}
            <span className="font-montserrat font-bold truncate flex-1">
              {lastScannedResult.productName || lastScannedResult.code}
            </span>
            <span className="text-[11px] text-slate-300 font-mono-tabular shrink-0">
              {lastScannedResult.code}
            </span>
          </div>
        )}

        {/* Single Compact Bottom Bar: Entry + Photo + Done */}
        <form
          onSubmit={handleManualSubmit}
          className="bg-slate-950 px-3.5 py-3 border-t border-slate-800 flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={manualInput}
            onChange={(e) => setManualInput(e.target.value)}
            placeholder="Enter barcode or SKU..."
            className="flex-1 min-w-0 bg-slate-900 border border-slate-700 focus:border-[#FFDE00] rounded-xl px-3 py-2.5 text-xs text-white placeholder-slate-400 focus:outline-none"
          />
          <button
            type="submit"
            disabled={!manualInput.trim()}
            className="px-3 py-2.5 bg-[#0A006E] hover:bg-[#130694] disabled:opacity-40 text-[#FFDE00] border border-[#FFDE00]/40 rounded-xl text-xs font-montserrat font-bold flex items-center gap-1 cursor-pointer transition shrink-0"
            title="Add barcode"
          >
            <Plus className="w-4 h-4" />
            Add
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={isFileScanning}
            className="min-w-[42px] min-h-[40px] px-2.5 bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 rounded-xl text-xs font-montserrat font-bold flex items-center justify-center cursor-pointer transition shrink-0"
            title="Scan from photo"
          >
            <Camera className="w-4 h-4 text-[#FFDE00]" />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-3.5 py-2.5 rounded-xl text-xs font-montserrat font-extrabold bg-[#FFDE00] hover:bg-amber-400 text-[#0A006E] cursor-pointer transition shrink-0"
          >
            Done
          </button>
        </form>
      </div>
    </div>
  );
};
