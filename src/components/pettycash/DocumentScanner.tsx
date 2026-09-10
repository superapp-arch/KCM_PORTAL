import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Image as ImageIcon, Loader2, CheckCircle2, AlertTriangle, XCircle,
  X, RotateCw, Crop, FileImage, ArrowLeft
} from 'lucide-react';
import { VehicleDocument } from '../../types';
import { loadPhotoCanvases, detectAndProcess, processWithQuad } from '../../utils/scanner/scanPipeline';
import { loadOpenCV } from '../../utils/scanner/cvLoader';
import { canvasToMat, matToCanvas, canvasToBlob, rotateCanvas90 } from '../../utils/scanner/imageIo';
import { toGrayscaleRgba } from '../../utils/scanner/enhance';
import { Quad } from '../../utils/scanner/geometry';
import { DetectionConfidence } from '../../utils/scanner/documentDetector';
import { QualityCheckResult } from '../../utils/scanner/qualityCheck';
import ManualCropEditor from './ManualCropEditor';

// Petty Cash > Actions > Docs > "Scan Invoice" (2026-09-08 direct request,
// 2026-09-09 speed follow-up: ~100 invoices/day, the scanner must never
// block a normal "just upload the photo" flow behind CV detection). Nothing
// is ever uploaded/persisted before the employee clicks the real SAVE
// button below - closing/cancelling at any earlier point (browser back,
// [X], choosing another photo) simply discards in-memory canvases, so there
// is never an orphaned server-side file or document record to clean up
// (spec section 4/24). On SAVE, the final canvas is uploaded through the
// EXACT SAME generic upload endpoint (/api/upload/:module)
// DocumentAttachment.tsx already uses for every other module's document
// uploads, and the resulting VehicleDocument is handed back via onSaved for
// the caller to attach to the voucher through the existing onUpdateVoucher
// path - no new document API, no new storage system, no new DB schema
// (spec section 1/36).
//
// Two-stage flow (2026-09-09): selecting a photo decodes it and shows the
// original immediately - Save is available right away, exactly like the
// plain "browse and upload" flow used everywhere else in the app, so an
// employee who doesn't need cropping is never made to wait on OpenCV at
// all. Document-boundary detection then runs in the BACKGROUND
// (`detecting` below); if it finds a confident crop before they've already
// chosen a version themselves, it's applied automatically and flagged with
// a dismissible banner - if they've already picked Original (or already
// hit Save), their choice is respected and the background result is
// discarded. A `scanToken` guards against a slow background detection from
// a previous photo ever landing on a newer one (spec test 20).
type ScannerPhase = 'idle' | 'processing' | 'preview' | 'adjusting' | 'saving' | 'success' | 'error';

interface ScanData {
  file: File;
  originalCanvas: HTMLCanvasElement;
  workingCanvas: HTMLCanvasElement;
  quad: Quad | null; // working-copy coordinates - only used to seed the manual editor's starting position
  quadFullRes: Quad | null;
  confidence: DetectionConfidence;
  processedCanvas: HTMLCanvasElement | null;
  quality: QualityCheckResult | null;
  partiallyOutOfFrame: boolean;
  selectedVersion: 'processed' | 'original';
  grayscale: boolean;
  detecting: boolean; // background auto-detect still running - never blocks Save
  detectingMessage: string; // what's actually happening right now - distinguishes a one-time engine download from the (usually much faster) detection step itself
  userChoseVersion: boolean; // employee explicitly picked Original/Processed - stop auto-switching once true
}

interface Props {
  onClose: () => void;
  // Awaited before the scanner shows its own "Invoice saved successfully"
  // state (spec section 45/42) - if attaching the document to the voucher
  // fails, that failure surfaces in THIS modal's own recoverable error
  // state instead of a false success screen.
  onSaved: (doc: VehicleDocument) => Promise<void>;
}

export default function DocumentScanner({ onClose, onSaved }: Props) {
  const [phase, setPhase] = useState<ScannerPhase>('idle');
  const [progressMessage, setProgressMessage] = useState('Loading photo...');
  const [errorMessage, setErrorMessage] = useState('');
  const [scanData, setScanData] = useState<ScanData | null>(null);
  const [activeCanvas, setActiveCanvas] = useState<HTMLCanvasElement | null>(null);
  const savingRef = useRef(false); // hard guard against double-click/duplicate save independent of React state timing
  const scanTokenRef = useRef(0); // bumped on every new file select / Choose Another - stale background detections are discarded

  const galleryInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // Recompute the canvas actually shown/saved whenever the employee changes
  // which version (Processed/Original) or display mode (colour/grayscale)
  // they've selected - grayscale is an explicit opt-in per scan, colour
  // stays the default (spec section 14).
  useEffect(() => {
    let cancelled = false;
    if (!scanData) { setActiveCanvas(null); return; }
    const base = scanData.selectedVersion === 'original'
      ? scanData.originalCanvas
      : (scanData.processedCanvas || scanData.originalCanvas);

    if (scanData.selectedVersion === 'original' || !scanData.grayscale) {
      setActiveCanvas(base);
      return;
    }

    (async () => {
      try {
        const cv = await loadOpenCV();
        const mat = canvasToMat(cv, base);
        const gray = toGrayscaleRgba(cv, mat);
        const canvas = matToCanvas(cv, gray);
        mat.delete();
        gray.delete();
        if (!cancelled) setActiveCanvas(canvas);
      } catch {
        if (!cancelled) setActiveCanvas(base);
      }
    })();

    return () => { cancelled = true; };
  }, [scanData]);

  const resetToIdle = () => {
    scanTokenRef.current++; // invalidate any in-flight background detection for the discarded photo
    setScanData(null);
    setActiveCanvas(null);
    setErrorMessage('');
    setPhase('idle');
  };

  // Kicks off document-boundary detection in the BACKGROUND - never
  // awaited by the caller, never blocks the preview/Save the employee
  // already has in front of them. Only applies its result if `token` is
  // still the current scan (bumped on a new photo, Choose Another, AND
  // Rotate - see resetToIdle/handleRotate - so this is the ONE signal that
  // guards against a stale detection, for a discarded/superseded/since-
  // rotated photo, ever landing on the wrong state) and only auto-selects
  // the processed version if the employee hasn't already made their own
  // choice in the meantime.
  //
  // 2026-09-10, corrected same day: an earlier version of this wrapped the
  // WHOLE call (engine load + detection) in an 8s safety-net race - that
  // was a real regression, not a safety net: cvLoader.ts's own engine-load
  // timeout is deliberately 45s (see that file's own comment - real office
  // connections can genuinely take longer than 10s to download the ~13MB
  // engine the FIRST time in a browser, after which it's cached for a
  // year), and racing the whole thing against 8s meant the very first scan
  // in any browser almost always hit the 8s cutoff before the download
  // even finished, silently discarding it every time - exactly "loads for
  // 8s then returns the same uncropped photo". The safety net now sits
  // comfortably above cvLoader's own 45s ceiling (50s) so it only ever
  // fires for a genuinely unexpected hang beyond what that timeout would
  // already catch - detectDocument's own bounded work (see
  // documentDetector.ts's MAX_CANDIDATES_EVALUATED) means the detection
  // step itself, once the engine is loaded, is fast.
  const runBackgroundDetection = (token: number, originalCanvas: HTMLCanvasElement, workingCanvas: HTMLCanvasElement) => {
    const DETECTION_TIMEOUT_MS = 50000;
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled || scanTokenRef.current !== token) return;
      settled = true;
      console.warn('Document detection exceeded 50s - falling back to manual/original.');
      setScanData((prev) => (prev ? { ...prev, detecting: false } : prev));
    }, DETECTION_TIMEOUT_MS);

    // onProgress lets the spinner say what's actually happening - loading
    // the scanner engine (only slow the first time per browser) is a very
    // different wait from the detection step itself, and an employee
    // watching a static "Detecting..." message for 20+ seconds on their
    // very first scan of the day has no way to tell those apart otherwise.
    const onProgress = (message: string) => {
      if (scanTokenRef.current !== token) return;
      setScanData((prev) => (prev && prev.detecting ? { ...prev, detectingMessage: message } : prev));
    };

    detectAndProcess(originalCanvas, workingCanvas, onProgress).then((result) => {
      if (settled) return; // the 8s safety net already resolved this scan
      settled = true;
      window.clearTimeout(timeoutId);
      if (scanTokenRef.current !== token) return; // a newer/different/rotated photo has since taken over
      setScanData((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          quad: result.quad,
          quadFullRes: result.quadFullRes,
          confidence: result.confidence,
          processedCanvas: result.processedCanvas,
          quality: result.quality,
          partiallyOutOfFrame: result.partiallyOutOfFrame,
          detecting: false,
          // Auto-apply the crop only if a confident one was found AND the
          // employee hasn't already explicitly picked Original/Processed
          // themselves while detection was still running.
          selectedVersion: !prev.userChoseVersion && result.processedCanvas ? 'processed' : prev.selectedVersion
        };
      });
    }).catch((err) => {
      // detectAndProcess itself already never rejects (it swallows CV
      // errors into confidence:'low'), but guard anyway - a background
      // failure must never surface as a blocking error screen.
      console.error('Background document detection failed unexpectedly:', err);
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (scanTokenRef.current !== token) return;
      setScanData((prev) => (prev ? { ...prev, detecting: false } : prev));
    });
  };

  const handleFileSelected = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      // Non-image files (PDF, Word, Excel) never go through the scanner -
      // the existing plain Docs upload already handles those correctly
      // (spec section 30) and this component only exists for photos.
      setErrorMessage('The scanner only works with photos (JPG/PNG). For PDF or other file types, use the regular "Add Files" option in Docs instead.');
      setPhase('error');
      return;
    }

    const token = ++scanTokenRef.current;
    setPhase('processing');
    setProgressMessage('Loading photo...');
    try {
      // Fast, no OpenCV involved - the employee sees their actual photo and
      // can hit Save immediately, exactly like the plain upload flow used
      // everywhere else in the app. Document-edge detection is kicked off
      // separately below, in the background, and never blocks this.
      const { originalCanvas, workingCanvas } = await loadPhotoCanvases(file);
      setScanData({
        file,
        originalCanvas,
        workingCanvas,
        quad: null,
        quadFullRes: null,
        confidence: 'low',
        processedCanvas: null,
        quality: null,
        partiallyOutOfFrame: false,
        selectedVersion: 'original',
        grayscale: false,
        detecting: true,
        detectingMessage: 'Detecting document edges...',
        userChoseVersion: false
      });
      setPhase('preview');
      runBackgroundDetection(token, originalCanvas, workingCanvas);
    } catch (err) {
      console.error('Loading the selected photo failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load this image.');
      setPhase('error');
    }
  };

  const handleRotate = () => {
    if (!scanData) return;
    // Invalidates any still-in-flight background detection for the
    // pre-rotation image (same token mechanism as a new photo/Choose
    // Another - see runBackgroundDetection's own comment) - its result, if
    // it lands late, describes the wrong orientation and must never be
    // applied. detecting is cleared here too since nothing will resolve it
    // otherwise: rotating doesn't re-kick a fresh detection on the rotated
    // image, so the spinner would otherwise spin forever with no way to
    // clear itself.
    scanTokenRef.current++;
    const rotatedOriginal = rotateCanvas90(scanData.originalCanvas, true);
    const rotatedProcessed = scanData.processedCanvas ? rotateCanvas90(scanData.processedCanvas, true) : null;
    setScanData({ ...scanData, originalCanvas: rotatedOriginal, processedCanvas: rotatedProcessed, detecting: false });
  };

  const handleUseOriginal = () => {
    if (!scanData) return;
    setScanData({ ...scanData, selectedVersion: 'original', grayscale: false, userChoseVersion: true });
  };

  const handleUseProcessed = () => {
    if (!scanData || !scanData.processedCanvas) return;
    setScanData({ ...scanData, selectedVersion: 'processed', userChoseVersion: true });
  };

  const handleApplyManualCrop = async (quad: Quad) => {
    if (!scanData) return;
    setPhase('processing');
    setProgressMessage('Correcting perspective...');
    try {
      const cv = await loadOpenCV();
      const { processedCanvas, quality } = processWithQuad(cv, scanData.originalCanvas, quad);
      setScanData({
        ...scanData,
        quadFullRes: quad,
        processedCanvas,
        quality,
        selectedVersion: 'processed',
        userChoseVersion: true,
        partiallyOutOfFrame: false
      });
      setPhase('preview');
    } catch (err) {
      console.error('Manual crop failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to apply this crop.');
      setPhase('error');
    }
  };

  const handleSave = async () => {
    if (savingRef.current) return; // double-click / duplicate-submit guard
    if (!scanData || !activeCanvas) return;
    savingRef.current = true;
    setPhase('saving');
    try {
      const blob = await canvasToBlob(activeCanvas, 'image/jpeg', 0.92);
      const baseName = (scanData.file.name.substring(0, scanData.file.name.lastIndexOf('.')) || scanData.file.name).trim() || 'invoice';
      const uploadName = `${baseName}_scan.jpg`;
      const formData = new FormData();
      formData.append('file', new File([blob], uploadName, { type: 'image/jpeg' }));

      const response = await fetch('/api/upload/pettycash', { method: 'POST', body: formData });
      const result = await response.json().catch(() => ({ success: false }));
      if (!response.ok || !result.success) {
        throw new Error(result.message || 'Failed to upload the invoice. Please check your connection and try again.');
      }

      const doc: VehicleDocument = {
        id: Math.random().toString(36).substring(2, 11),
        name: baseName,
        type: 'image',
        fileName: uploadName,
        fileSize: (blob.size / 1024).toFixed(1) + ' KB',
        uploadDate: new Date().toISOString().substring(0, 10),
        filePath: result.path
      };

      await onSaved(doc);
      setPhase('success');
      // Auto-close shortly after a successful save so the employee doesn't
      // have to manually dismiss the confirmation (spec section 3/53's
      // "Invoice saved successfully" -> back to the existing Docs list) -
      // the header [X] and this still both work immediately if they'd
      // rather close it right away.
      window.setTimeout(() => onClose(), 1400);
    } catch (err) {
      console.error('Invoice save failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Failed to save the invoice. Please try again.');
      setPhase('error');
    } finally {
      savingRef.current = false;
    }
  };

  const confidenceLabel: Record<DetectionConfidence, { label: string; className: string }> = {
    high: { label: 'High confidence', className: 'bg-emerald-100 text-emerald-800 border-emerald-300' },
    medium: { label: 'Medium confidence - please double-check the crop', className: 'bg-amber-100 text-amber-800 border-amber-300' },
    low: { label: 'Boundary could not be detected confidently', className: 'bg-red-100 text-red-800 border-red-300' }
  };

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-xs p-4 font-sans">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl max-w-xl w-full max-h-[92vh] flex flex-col overflow-hidden text-xs">
        <div className="bg-[#0f172a] text-white p-4 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <FileImage className="w-4 h-4 text-teal-400" />
              Invoice Document Scanner
            </h3>
            <p className="text-[10px] text-slate-400 font-mono mt-0.5 uppercase tracking-wider">
              Petty Cash · Docs · Auto-Crop &amp; Perspective Correction
            </p>
          </div>
          <button
            onClick={onClose}
            title="Close"
            className="text-slate-400 hover:text-white bg-slate-800 hover:bg-slate-700 p-1.5 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1 space-y-4">
          {phase === 'idle' && (
            <div className="space-y-4">
              <p className="text-slate-500 text-center">
                Select a receipt/invoice photo - you can save it right away, or let auto-crop straighten it up for you in the background if it needs cropping.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => cameraInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50/50 rounded-xl py-6 cursor-pointer transition-colors"
                >
                  <Camera className="w-7 h-7 text-teal-600" />
                  <span className="font-bold text-slate-700 uppercase text-[11px]">Take Photo</span>
                </button>
                <button
                  type="button"
                  onClick={() => galleryInputRef.current?.click()}
                  className="flex flex-col items-center gap-2 border-2 border-dashed border-slate-300 hover:border-teal-500 hover:bg-teal-50/50 rounded-xl py-6 cursor-pointer transition-colors"
                >
                  <ImageIcon className="w-7 h-7 text-teal-600" />
                  <span className="font-bold text-slate-700 uppercase text-[11px]">Choose From Gallery</span>
                </button>
              </div>
              <input
                ref={cameraInputRef}
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(e) => { handleFileSelected(e.target.files?.[0]); e.target.value = ''; }}
              />
              <input
                ref={galleryInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => { handleFileSelected(e.target.files?.[0]); e.target.value = ''; }}
              />
            </div>
          )}

          {phase === 'processing' && (
            <div className="flex flex-col items-center justify-center gap-3 py-16">
              <Loader2 className="w-8 h-8 text-teal-600 animate-spin" />
              <p className="text-slate-600 font-semibold">{progressMessage}</p>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-3 py-10">
              <XCircle className="w-10 h-10 text-red-500" />
              <p className="text-slate-700 font-semibold text-center">{errorMessage || 'Unable to process this image.'}</p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={resetToIdle}
                  className="px-4 py-2 rounded-lg text-xs font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Try Again
                </button>
                {scanData && (
                  <button
                    type="button"
                    onClick={() => { handleUseOriginal(); setPhase('preview'); }}
                    className="px-4 py-2 rounded-lg text-xs font-bold uppercase bg-teal-600 hover:bg-teal-700 text-white cursor-pointer"
                  >
                    Use Original
                  </button>
                )}
              </div>
            </div>
          )}

          {phase === 'adjusting' && scanData && (
            <ManualCropEditor
              imageWidth={scanData.originalCanvas.width}
              imageHeight={scanData.originalCanvas.height}
              imageSrc={scanData.originalCanvas.toDataURL('image/jpeg', 0.85)}
              initialQuad={
                scanData.quadFullRes ?? [
                  { x: scanData.originalCanvas.width * 0.05, y: scanData.originalCanvas.height * 0.05 },
                  { x: scanData.originalCanvas.width * 0.95, y: scanData.originalCanvas.height * 0.05 },
                  { x: scanData.originalCanvas.width * 0.95, y: scanData.originalCanvas.height * 0.95 },
                  { x: scanData.originalCanvas.width * 0.05, y: scanData.originalCanvas.height * 0.95 }
                ]
              }
              onApply={handleApplyManualCrop}
              onCancel={() => setPhase('preview')}
            />
          )}

          {(phase === 'preview' || phase === 'saving' || phase === 'success') && scanData && (
            <div className="space-y-4">
              <div className="flex items-center justify-center bg-slate-50 border border-slate-200 rounded-xl p-3">
                {activeCanvas && (
                  <img
                    src={activeCanvas.toDataURL('image/jpeg', 0.85)}
                    alt="Invoice preview"
                    className="max-h-80 rounded-lg shadow-sm border border-slate-200 object-contain"
                  />
                )}
              </div>

              {/* Background auto-detect status (2026-09-09 speed follow-up) -
                  never blocks anything above: the photo is already visible
                  and Save is already usable while this runs. */}
              {scanData.detecting ? (
                <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                  <Loader2 className="w-3 h-3 animate-spin" /> {scanData.detectingMessage}
                </div>
              ) : scanData.processedCanvas && scanData.selectedVersion === 'original' ? (
                // Detection finished with a confident crop, but the employee
                // already chose Original (or was already looking at it) -
                // offer it without forcing anything.
                <div className="flex items-center justify-center gap-2 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${confidenceLabel[scanData.confidence].className}`}>
                    <CheckCircle2 className="w-3 h-3" /> Auto-crop available - {confidenceLabel[scanData.confidence].label}
                  </span>
                  <button
                    type="button"
                    onClick={handleUseProcessed}
                    className="text-[11px] font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer"
                  >
                    Use It
                  </button>
                </div>
              ) : scanData.selectedVersion === 'processed' ? (
                <div className="flex items-center justify-center gap-2">
                  <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border ${confidenceLabel[scanData.confidence].className}`}>
                    {scanData.confidence === 'low' ? <AlertTriangle className="w-3 h-3" /> : <CheckCircle2 className="w-3 h-3" />}
                    {confidenceLabel[scanData.confidence].label}
                  </span>
                </div>
              ) : null}

              {scanData.partiallyOutOfFrame && scanData.selectedVersion === 'processed' && (
                <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 text-center">
                  Document appears to be partially outside the photo. Please check that no financial information (amount, date, invoice number) is cut off before saving.
                </p>
              )}

              {scanData.quality && scanData.quality.warnings.length > 0 && (
                <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 space-y-0.5">
                  {scanData.quality.warnings.map((w, i) => <p key={i}>⚠ {w}</p>)}
                </div>
              )}

              {!scanData.detecting && !scanData.processedCanvas && scanData.selectedVersion === 'processed' && (
                <p className="text-[11px] text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-center">
                  Document boundary could not be detected confidently. Adjust the crop manually or use the original photo as-is.
                </p>
              )}

              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => setPhase('adjusting')}
                  disabled={phase !== 'preview'}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                >
                  <Crop className="w-3.5 h-3.5" /> Adjust Crop
                </button>
                <button
                  type="button"
                  onClick={handleRotate}
                  disabled={phase !== 'preview'}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                >
                  <RotateCw className="w-3.5 h-3.5" /> Rotate
                </button>
                {scanData.selectedVersion === 'processed' ? (
                  <button
                    type="button"
                    onClick={handleUseOriginal}
                    disabled={phase !== 'preview'}
                    className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                  >
                    Use Original
                  </button>
                ) : (
                  scanData.processedCanvas && (
                    <button
                      type="button"
                      onClick={handleUseProcessed}
                      disabled={phase !== 'preview'}
                      className="px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-slate-200 text-slate-600 hover:bg-slate-50 cursor-pointer disabled:opacity-40"
                    >
                      Use Processed
                    </button>
                  )
                )}
                {scanData.selectedVersion === 'processed' && scanData.processedCanvas && (
                  <label className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase border border-slate-200 text-slate-600 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={scanData.grayscale}
                      disabled={phase !== 'preview'}
                      onChange={(e) => setScanData({ ...scanData, grayscale: e.target.checked })}
                    />
                    Grayscale
                  </label>
                )}
                <button
                  type="button"
                  onClick={resetToIdle}
                  disabled={phase !== 'preview'}
                  className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[11px] font-bold uppercase text-slate-500 hover:text-slate-700 cursor-pointer disabled:opacity-40"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Choose Another
                </button>
              </div>

              {phase === 'success' ? (
                <div className="flex flex-col items-center gap-2 py-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-500" />
                  <p className="text-emerald-700 font-bold">Invoice saved successfully.</p>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={phase === 'saving'}
                  className="w-full py-3 rounded-lg text-sm font-extrabold uppercase bg-teal-600 hover:bg-teal-700 disabled:opacity-60 text-white cursor-pointer transition-colors flex items-center justify-center gap-2"
                >
                  {phase === 'saving' ? (<><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>) : 'Save'}
                </button>
              )}
            </div>
          )}
        </div>

        {phase !== 'success' && (
          <div className="bg-slate-50 border-t border-slate-100 p-3 flex justify-end shrink-0">
            <button
              onClick={onClose}
              disabled={phase === 'saving'}
              className="px-4 py-2 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-800 text-xs font-bold rounded-lg transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
