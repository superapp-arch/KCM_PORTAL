// Orchestrates the Petty Cash Document Scanner pipeline. Split into two
// stages (2026-09-09 direct request - ~100 invoices/day, the scanner must
// never block a normal "just upload the photo" flow behind CV detection):
//
//   1. loadPhotoCanvases - decode the photo + build the original/working
//      canvases. No OpenCV involved at all, near-instant. The employee sees
//      the real photo and can hit Save immediately, exactly like the plain
//      file-upload flow they're used to elsewhere in the app.
//   2. detectAndProcess - the OpenCV-dependent boundary detection +
//      perspective correction + enhancement. Called separately, in the
//      background, while the preview from step 1 is already visible and
//      already saveable - see DocumentScanner.tsx. If it finds a confident
//      crop, the employee can opt into it; if it's slow, fails, or times
//      out (see cvLoader.ts's LOAD_TIMEOUT_MS), the employee was never
//      blocked on it in the first place.
import { loadOpenCV, getLoadedOpenCV } from './cvLoader';
import { loadImageFile, drawToCanvas, canvasToMat, matToCanvas } from './imageIo';
import { detectDocument, DetectionConfidence } from './documentDetector';
import { warpToQuad, warpCanvasToQuadJs } from './perspective';
import { enhanceMat } from './enhance';
import { assessQuality, QualityCheckResult } from './qualityCheck';
import { Quad, quadTouchesImageBorder } from './geometry';

// Detection runs on a copy whose longest side is at most this - never on the
// raw full-resolution phone photo; corners are scaled back up afterwards and
// the final crop is warped from the full-resolution original.
export const WORKING_MAX_DIM = 1000;

export interface PhotoCanvases {
  originalCanvas: HTMLCanvasElement; // full resolution, untouched - always available as the "Use Original"/fast-upload fallback
  workingCanvas: HTMLCanvasElement; // downscaled copy detection runs on
}

// 2026-09-23: the three outcomes of automatic detection -
//   'applied'       - a medium/high-confidence crop was produced (processedCanvas set)
//   'manual-needed' - the detector ran but found nothing confident enough; the
//                     employee should place the corners (quad, if any, seeds the editor)
//   'unavailable'   - the engine failed to load/initialize, or a CV step threw
export type AutoCropStatus = 'applied' | 'manual-needed' | 'unavailable';

export interface DetectionOutcome {
  status: AutoCropStatus;
  quad: Quad | null; // in workingCanvas coordinates
  quadFullRes: Quad | null; // the same quad, scaled to originalCanvas coordinates
  confidence: DetectionConfidence;
  processedCanvas: HTMLCanvasElement | null; // full-res, perspective-corrected + enhanced; null unless status === 'applied'
  quality: QualityCheckResult | null;
  partiallyOutOfFrame: boolean;
  // 2026-09-24 paper-group detection: how many separate papers the crop
  // keeps, and whether one merged region looked like overlapping papers /
  // an irregular shape - drives a non-blocking badge in DocumentScanner.
  documentCount: number;
  irregularGroup: boolean;
}

// Stage 1 - fast, no OpenCV. Just decodes the file into the two canvases
// the rest of the scanner (and a plain "upload as-is" save) needs.
export async function loadPhotoCanvases(file: File): Promise<PhotoCanvases> {
  console.debug('[SCANNER] process started', file.name, file.type, `${(file.size / 1024).toFixed(0)}KB`);
  const img = await loadImageFile(file);
  console.debug('[SCANNER] image loaded; image dimensions:', img.naturalWidth, 'x', img.naturalHeight);
  const originalCanvas = drawToCanvas(img);
  const workingCanvas = drawToCanvas(img, WORKING_MAX_DIM);
  console.debug('[SCANNER] canvas created; working copy:', workingCanvas.width, 'x', workingCanvas.height);
  return { originalCanvas, workingCanvas };
}

// Every corner must be a finite point inside the image - anything else is
// treated as "no detection" rather than handed to the warp.
function isUsableQuad(q: Quad | null, w: number, h: number): q is Quad {
  return !!q && q.length === 4 && q.every(p =>
    Number.isFinite(p.x) && Number.isFinite(p.y) && p.x >= -1 && p.y >= -1 && p.x <= w + 1 && p.y <= h + 1
  );
}

// Stage 2 - the OpenCV-dependent part, called separately (and, in
// DocumentScanner.tsx, in the background) so it never blocks the fast
// preview-and-save path above. Never throws - a failed/slow/unavailable
// OpenCV engine degrades to "no automatic detection" (quad: null,
// confidence: 'low') rather than rejecting, since Manual Crop / Use
// Original must always remain usable regardless of what happens here.
export async function detectAndProcess(
  originalCanvas: HTMLCanvasElement,
  workingCanvas: HTMLCanvasElement,
  onProgress?: (message: string) => void
): Promise<DetectionOutcome> {
  const unavailable: DetectionOutcome = {
    status: 'unavailable', quad: null, quadFullRes: null, confidence: 'low',
    processedCanvas: null, quality: null, partiallyOutOfFrame: false, documentCount: 0, irregularGroup: false
  };

  let cv: any;
  try {
    // Only shown while the engine is genuinely still loading - once it's
    // ready (cached for the rest of the page session), this is skipped.
    if (!getLoadedOpenCV()) onProgress?.('Loading scanner engine (first time only)...');
    cv = await loadOpenCV();
  } catch (err) {
    // Outcome C: engine failed to load/initialize. The original photo
    // (already visible/saveable via stage 1) is unaffected, and Manual Crop
    // works without OpenCV (see applyCrop below).
    console.error('[SCANNER] engine unavailable - automatic crop disabled for this photo', err);
    return unavailable;
  }

  try {
    const scaleUp = originalCanvas.width / workingCanvas.width;
    onProgress?.('Detecting document edges...');
    const workingMat = canvasToMat(cv, workingCanvas);
    console.debug('[SCANNER] imageData created:', workingMat.cols, 'x', workingMat.rows, 'channels', workingMat.channels());
    let detection;
    const t0 = performance.now();
    console.debug('[SCANNER] corner detection started');
    try {
      detection = detectDocument(cv, workingMat);
    } finally {
      workingMat.delete();
    }
    console.debug(
      `[SCANNER] corner detection completed in ${Math.round(performance.now() - t0)}ms; confidence=${detection.confidence} score=${detection.score.toFixed(3)} corners:`,
      detection.quad ? JSON.stringify(detection.quad.map(p => ({ x: Math.round(p.x), y: Math.round(p.y) }))) : 'none'
    );

    if (!isUsableQuad(detection.quad, workingCanvas.width, workingCanvas.height)) {
      return { ...unavailable, status: 'manual-needed' };
    }

    const quad = detection.quad;
    const quadFullRes = quad.map(p => ({ x: p.x * scaleUp, y: p.y * scaleUp })) as Quad;
    // Paper-group detection knows whether paper pixels genuinely reach the
    // photo edge; otherwise fall back to the quad-corner check.
    const partiallyOutOfFrame = detection.touchesPhotoEdge ?? quadTouchesImageBorder(quad, workingCanvas.width, workingCanvas.height);
    const documentCount = detection.documentCount ?? 1;
    const irregularGroup = detection.irregularGroup ?? false;

    // Outcome B: the detector found something, but not confidently - don't
    // auto-apply it; the employee places the corners (seeded with this quad).
    if (detection.confidence === 'low') {
      return { status: 'manual-needed', quad, quadFullRes, confidence: 'low', processedCanvas: null, quality: null, partiallyOutOfFrame, documentCount, irregularGroup };
    }

    // Outcome A: medium/high confidence - perspective-correct automatically.
    onProgress?.('Correcting perspective...');
    const t1 = performance.now();
    console.debug('[SCANNER] perspective correction started');
    const result = processWithQuad(cv, originalCanvas, quadFullRes);
    console.debug(`[SCANNER] perspective correction completed in ${Math.round(performance.now() - t1)}ms; output ${result.processedCanvas.width}x${result.processedCanvas.height}`);
    return {
      status: 'applied', quad, quadFullRes, confidence: detection.confidence,
      processedCanvas: result.processedCanvas, quality: result.quality, partiallyOutOfFrame, documentCount, irregularGroup
    };
  } catch (err) {
    // A CV step threw after the engine loaded - same user-facing outcome
    // as an unavailable engine (Manual Crop still works without OpenCV).
    console.error('[SCANNER] automatic detection failed', err);
    return unavailable;
  }
}

// Crops the full-resolution original to `quadFullRes` - used by Manual
// Crop's Apply Crop. Uses OpenCV (warp + enhancement + quality checks) when
// the engine is ALREADY loaded; never waits for it to load. Without it (still
// downloading, failed, or a CV step throws) falls back to the pure-JS warp,
// so a manual crop always produces a correctly cropped image to save.
export function applyCrop(
  originalCanvas: HTMLCanvasElement,
  quadFullRes: Quad
): { processedCanvas: HTMLCanvasElement; quality: QualityCheckResult | null } {
  const cv = getLoadedOpenCV();
  if (cv) {
    try {
      return processWithQuad(cv, originalCanvas, quadFullRes);
    } catch (err) {
      console.error('[SCANNER] OpenCV crop failed - using the built-in perspective warp instead', err);
    }
  }
  const t0 = performance.now();
  const processedCanvas = warpCanvasToQuadJs(originalCanvas, quadFullRes);
  console.debug(`[SCANNER] built-in perspective warp completed in ${Math.round(performance.now() - t0)}ms; output ${processedCanvas.width}x${processedCanvas.height}`);
  return { processedCanvas, quality: null };
}

// Re-runs perspective correction + enhancement against a specific quad on
// the full-resolution original - shared by detectAndProcess above and by
// "Apply Crop" after a manual four-corner adjustment (spec section 20), so
// both paths produce an identical-quality result.
export function processWithQuad(
  cv: any,
  originalCanvas: HTMLCanvasElement,
  quadFullRes: Quad
): { processedCanvas: HTMLCanvasElement; quality: QualityCheckResult } {
  const fullMat = canvasToMat(cv, originalCanvas);
  let warped: any;
  let enhanced: any;
  try {
    warped = warpToQuad(cv, fullMat, quadFullRes);
    enhanced = enhanceMat(cv, warped);
    const quality = assessQuality(cv, enhanced);
    const processedCanvas = matToCanvas(cv, enhanced);
    return { processedCanvas, quality };
  } finally {
    fullMat.delete();
    warped?.delete();
    enhanced?.delete();
  }
}
