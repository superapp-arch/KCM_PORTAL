import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Camera, Image as ImageIcon, Loader2, CheckCircle2, AlertTriangle, XCircle,
  X, RotateCw, Crop, FileImage, ArrowLeft
} from 'lucide-react';
import { VehicleDocument } from '../../types';
import { loadPhotoCanvases, detectAndProcess, applyCrop, AutoCropStatus, WORKING_MAX_DIM } from '../../utils/scanner/scanPipeline';
import { getLoadedOpenCV } from '../../utils/scanner/cvLoader';
import { canvasToMat, matToCanvas, canvasToBlob, rotateCanvas90, drawToCanvas } from '../../utils/scanner/imageIo';
import { toGrayscaleRgba } from '../../utils/scanner/enhance';
import { Quad, rotateQuadClockwise } from '../../utils/scanner/geometry';
import { DetectionConfidence } from '../../utils/scanner/documentDetector';
import { QualityCheckResult } from '../../utils/scanner/qualityCheck';
import ManualCropEditor from './ManualCropEditor';
import LiveCameraCapture from './LiveCameraCapture';
import { authFetch } from '../../authFetch';

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
type ScannerPhase = 'idle' | 'camera' | 'processing' | 'preview' | 'adjusting' | 'saving' | 'success' | 'error';

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
  // Outcome of automatic detection for THIS photo ('pending' while it runs) -
  // drives the always-visible status line, so a failed/unconfident detection
  // is never silent. See scanPipeline.ts's AutoCropStatus.
  autoCropStatus: 'pending' | AutoCropStatus;
  // Paper-group detection (2026-09-24): separate papers kept in the crop, and
  // whether one merged region looked like overlapping papers / an irregular
  // shape - only drives a non-blocking informational badge.
  documentCount: number;
  irregularGroup: boolean;
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
  // Latest phase/scanData for the background detection callback, which
  // outlives the render it was started from.
  const phaseRef = useRef<ScannerPhase>('idle');
  phaseRef.current = phase;
  const scanDataRef = useRef<ScanData | null>(null);
  scanDataRef.current = scanData;

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

    // Never waits on the engine download - OpenCV if it's already loaded,
    // otherwise a plain canvas luminance pass (same visual result).
    try {
      const cv = getLoadedOpenCV();
      let canvas: HTMLCanvasElement;
      if (cv) {
        const mat = canvasToMat(cv, base);
        let gray: any;
        try {
          gray = toGrayscaleRgba(cv, mat);
          canvas = matToCanvas(cv, gray);
        } finally {
          mat.delete();
          gray?.delete();
        }
      } else {
        canvas = drawToCanvas(base);
        const ctx = canvas.getContext('2d')!;
        const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = img.data;
        for (let i = 0; i < d.length; i += 4) {
          const l = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          d[i] = d[i + 1] = d[i + 2] = l;
        }
        ctx.putImageData(img, 0, 0);
      }
      if (!cancelled) setActiveCanvas(canvas);
    } catch (err) {
      console.error('[SCANNER] grayscale preview failed', err);
      if (!cancelled) setActiveCanvas(base);
    }

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
  // timeout is deliberately generous (see that file's own comment - real
  // office connections can genuinely take a while to download the engine
  // the FIRST time in a browser, after which it's cached for a year), and
  // racing the whole thing against 8s meant the very first scan in any
  // browser almost always hit the 8s cutoff before the download even
  // finished, silently discarding it every time - exactly "loads for 8s
  // then returns the same uncropped photo". The safety net stays
  // comfortably above cvLoader's own ceiling (currently 90s, see that
  // file) so it only ever fires for a genuinely unexpected hang beyond
  // what that timeout would already catch - detectDocument's own bounded
  // work (see documentDetector.ts's MAX_CANDIDATES_EVALUATED) means the
  // detection step itself, once the engine is loaded, is fast.
  const runBackgroundDetection = (token: number, originalCanvas: HTMLCanvasElement, workingCanvas: HTMLCanvasElement) => {
    const DETECTION_TIMEOUT_MS = 100000;
    let settled = false;
    const timeoutId = window.setTimeout(() => {
      if (settled || scanTokenRef.current !== token) return;
      settled = true;
      console.warn('[SCANNER] document detection exceeded 100s - falling back to manual crop.');
      setScanData((prev) => (prev ? { ...prev, detecting: false, autoCropStatus: 'unavailable' } : prev));
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
      console.debug(`[SCANNER] ${result.status === 'applied' ? 'final preview ready' : `automatic crop outcome: ${result.status}`}`);
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
          autoCropStatus: result.status,
          documentCount: result.documentCount,
          irregularGroup: result.irregularGroup,
          // Auto-apply the crop only if a confident one was found AND the
          // employee hasn't already explicitly picked Original/Processed
          // themselves while detection was still running.
          selectedVersion: !prev.userChoseVersion && result.processedCanvas ? 'processed' : prev.selectedVersion
        };
      });
      // Outcome B: detector ran but wasn't confident - take the employee
      // straight to Manual Crop (seeded with whatever it found), unless
      // they've already moved on (picked a version, opened the editor,
      // started saving).
      if (result.status === 'manual-needed' && phaseRef.current === 'preview' && !scanDataRef.current?.userChoseVersion) {
        setPhase('adjusting');
      }
    }).catch((err) => {
      // detectAndProcess itself already never rejects (it swallows CV
      // errors into confidence:'low'), but guard anyway - a background
      // failure must never surface as a blocking error screen.
      console.error('Background document detection failed unexpectedly:', err);
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      if (scanTokenRef.current !== token) return;
      setScanData((prev) => (prev ? { ...prev, detecting: false, autoCropStatus: 'unavailable' } : prev));
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
        userChoseVersion: false,
        autoCropStatus: 'pending',
        documentCount: 0,
        irregularGroup: false
      });
      setPhase('preview');
      runBackgroundDetection(token, originalCanvas, workingCanvas);
    } catch (err) {
      console.error('Loading the selected photo failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to load this image.');
      setPhase('error');
    }
  };

  // 2026-09-10 direct request: "take photo should redirect to camera...
  // under the camera if we place invoice then it auto detects the invoice
  // and shows" - LiveCameraCapture hands back a full-resolution captured
  // <canvas> from its live preview; wrapped into a File here so it can go
  // straight through the EXACT SAME handleFileSelected -> loadPhotoCanvases
  // -> runBackgroundDetection path a gallery upload already takes (and
  // which this session's fixes above were verified against) - no separate,
  // less-trusted code path for a camera-captured photo.
  const handleCameraCapture = async (canvas: HTMLCanvasElement) => {
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      const file = new File([blob], `scan_${Date.now()}.jpg`, { type: 'image/jpeg' });
      await handleFileSelected(file);
    } catch (err) {
      console.error('Encoding the captured photo failed:', err);
      setErrorMessage(err instanceof Error ? err.message : 'Unable to use the captured photo.');
      setPhase('error');
    }
  };

  // getUserMedia (live camera + real-time detection overlay) can fail for
  // reasons with no good in-app remedy - permission denied, no camera
  // hardware, an insecure (non-HTTPS) origin. Never a dead end: falls back
  // to the plain native camera-app picker that already worked before this
  // feature existed, so the employee can always still take a photo.
  const handleCameraUnavailable = () => {
    setPhase('idle');
    cameraInputRef.current?.click();
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
    // quad/quadFullRes are computed against the PRE-rotation originalCanvas/
    // workingCanvas dimensions - captured here before those canvases are
    // replaced below, then remapped into the rotated image's coordinate
    // space. Left untransformed, Adjust Crop's crop-box overlay (seeded
    // from quadFullRes - see the ManualCropEditor render below) would open
    // badly misaligned against the now-rotated photo.
    const rotatedOriginal = rotateCanvas90(scanData.originalCanvas, true);
    // 2026-09-23: the working (detection) copy is rotated too - it used to
    // stay in the pre-rotation orientation, so any later detection/scale-up
    // would have mixed the two orientations' dimensions.
    const rotatedWorking = drawToCanvas(rotatedOriginal, WORKING_MAX_DIM);
    const rotatedProcessed = scanData.processedCanvas ? rotateCanvas90(scanData.processedCanvas, true) : null;
    const rotatedQuad = scanData.quad
      ? rotateQuadClockwise(scanData.quad, scanData.workingCanvas.width, scanData.workingCanvas.height)
      : null;
    const rotatedQuadFullRes = scanData.quadFullRes
      ? rotateQuadClockwise(scanData.quadFullRes, scanData.originalCanvas.width, scanData.originalCanvas.height)
      : null;
    // No crop yet (detection still running, unconfident, or unavailable) -
    // re-run detection on the rotated photo so rotating never silently
    // discards auto-crop. An existing crop is simply rotated with the photo.
    const redetect = !rotatedProcessed;
    const token = scanTokenRef.current;
    setScanData({
      ...scanData,
      originalCanvas: rotatedOriginal,
      workingCanvas: rotatedWorking,
      processedCanvas: rotatedProcessed,
      quad: rotatedQuad,
      quadFullRes: rotatedQuadFullRes,
      detecting: redetect,
      detectingMessage: 'Detecting document edges...',
      autoCropStatus: redetect ? 'pending' : scanData.autoCropStatus
    });
    if (redetect) runBackgroundDetection(token, rotatedOriginal, rotatedWorking);
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
    // A manual crop wins - discard any still-running auto-detection so its
    // late result can't overwrite this crop.
    scanTokenRef.current++;
    setPhase('processing');
    setProgressMessage('Correcting perspective...');
    try {
      // Let the spinner paint before the (synchronous) warp runs.
      await new Promise(resolve => window.setTimeout(resolve, 0));
      // Never waits on the engine download - OpenCV if already loaded,
      // otherwise the built-in JS perspective warp (see applyCrop).
      const { processedCanvas, quality } = applyCrop(scanData.originalCanvas, quad);
      if (!processedCanvas.width || !processedCanvas.height) throw new Error('The crop produced an empty image.');
      console.debug('[SCANNER] final preview ready (manual crop)', processedCanvas.width, 'x', processedCanvas.height);
      setScanData({
        ...scanData,
        quadFullRes: quad,
        processedCanvas,
        quality,
        selectedVersion: 'processed',
        userChoseVersion: true,
        partiallyOutOfFrame: false,
        detecting: false,
        // The employee's own crop - the auto-detection's "everything is kept"
        // grouping badge no longer describes it.
        documentCount: 0,
        irregularGroup: false
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

      const response = await authFetch('/api/upload/pettycash', { method: 'POST', body: formData });
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

        {/* min-h-0 lets this flex child actually shrink and scroll inside the
            capped modal height instead of pushing the action area/footer out. */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0 space-y-4">
          {phase === 'idle' && (
            <div className="space-y-4">
              <p className="text-slate-500 text-center">
                Select a receipt/invoice photo - you can save it right away, or let auto-crop straighten it up for you in the background if it needs cropping.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setPhase('camera')}
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

          {phase === 'camera' && (
            <LiveCameraCapture
              onCapture={handleCameraCapture}
              onCancel={() => setPhase('idle')}
              onUnavailable={handleCameraUnavailable}
            />
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
                    className="max-h-[min(20rem,38vh)] rounded-lg shadow-sm border border-slate-200 object-contain"
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
              ) : scanData.autoCropStatus === 'unavailable' || scanData.autoCropStatus === 'manual-needed' ? (
                // Outcome B/C - never silent: say so, and offer Manual Crop
                // right here (it works without the scanner engine).
                <div className="flex items-center justify-center gap-2 flex-wrap text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="font-semibold">
                    {scanData.autoCropStatus === 'unavailable'
                      ? 'Automatic crop unavailable - adjust crop manually.'
                      : 'Document edges could not be detected confidently - adjust crop manually.'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setPhase('adjusting')}
                    disabled={phase !== 'preview'}
                    className="font-bold text-teal-700 hover:text-teal-800 hover:underline cursor-pointer disabled:opacity-40"
                  >
                    Adjust Crop
                  </button>
                </div>
              ) : null}

              {/* Several papers kept in one crop (2026-09-24) - informational
                  only, never blocks Adjust Crop or Save. */}
              {!scanData.detecting && scanData.processedCanvas && scanData.selectedVersion === 'processed' && (scanData.documentCount >= 2 || scanData.irregularGroup) && (
                <div className="flex justify-center">
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-[10px] font-extrabold uppercase border bg-sky-50 text-sky-800 border-sky-200">
                    <FileImage className="w-3 h-3" />
                    {scanData.documentCount >= 2
                      ? `${scanData.documentCount} documents detected - all kept in the crop`
                      : 'Multiple papers / irregular shape detected - everything is kept in the crop'}
                  </span>
                </div>
              )}

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

            </div>
          )}
        </div>

        {/* Primary action area (2026-09-24 layout fix) - pinned OUTSIDE the
            scrolling content above, so SAVE (and the saved confirmation) is
            always fully visible and clickable however tall the preview,
            badges and warnings get; only the content area scrolls. */}
        {(phase === 'preview' || phase === 'saving' || phase === 'success') && scanData && (
          <div className="px-6 py-3 border-t border-slate-100 bg-white shrink-0">
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
