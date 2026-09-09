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
import { loadOpenCV } from './cvLoader';
import { loadImageFile, drawToCanvas, canvasToMat, matToCanvas } from './imageIo';
import { detectDocument, DetectionConfidence } from './documentDetector';
import { warpToQuad } from './perspective';
import { enhanceMat } from './enhance';
import { assessQuality, QualityCheckResult } from './qualityCheck';
import { Quad, quadTouchesImageBorder } from './geometry';

const WORKING_MAX_DIM = 1000;

export interface PhotoCanvases {
  originalCanvas: HTMLCanvasElement; // full resolution, untouched - always available as the "Use Original"/fast-upload fallback
  workingCanvas: HTMLCanvasElement; // downscaled copy detection runs on
}

export interface DetectionOutcome {
  quad: Quad | null; // in workingCanvas coordinates
  quadFullRes: Quad | null; // the same quad, scaled to originalCanvas coordinates
  confidence: DetectionConfidence;
  processedCanvas: HTMLCanvasElement | null; // full-res, perspective-corrected + enhanced; null if nothing confident enough to auto-process
  quality: QualityCheckResult | null;
  partiallyOutOfFrame: boolean;
}

// Stage 1 - fast, no OpenCV. Just decodes the file into the two canvases
// the rest of the scanner (and a plain "upload as-is" save) needs.
export async function loadPhotoCanvases(file: File): Promise<PhotoCanvases> {
  const img = await loadImageFile(file);
  const originalCanvas = drawToCanvas(img);
  const workingCanvas = drawToCanvas(img, WORKING_MAX_DIM);
  return { originalCanvas, workingCanvas };
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
  let quad: Quad | null = null;
  let quadFullRes: Quad | null = null;
  let confidence: DetectionConfidence = 'low';
  let partiallyOutOfFrame = false;
  let processedCanvas: HTMLCanvasElement | null = null;
  let quality: QualityCheckResult | null = null;

  try {
    onProgress?.('Detecting document edges...');
    const cv = await loadOpenCV();
    const scaleUp = originalCanvas.width / workingCanvas.width;

    const workingMat = canvasToMat(cv, workingCanvas);
    let detection;
    try {
      detection = detectDocument(cv, workingMat);
    } finally {
      workingMat.delete();
    }
    quad = detection.quad;
    confidence = detection.confidence;

    if (detection.quad) {
      quadFullRes = detection.quad.map(p => ({ x: p.x * scaleUp, y: p.y * scaleUp })) as Quad;
      partiallyOutOfFrame = quadTouchesImageBorder(detection.quad, workingCanvas.width, workingCanvas.height);

      // Low confidence never auto-produces a final crop (spec section 19) -
      // the employee can still opt into Manual Crop; the detected quad is
      // returned so that editor can start from it rather than a blind
      // full-frame guess.
      if (detection.confidence !== 'low') {
        onProgress?.('Correcting perspective...');
        const result = processWithQuad(cv, originalCanvas, quadFullRes);
        processedCanvas = result.processedCanvas;
        quality = result.quality;
      }
    }
  } catch (cvError) {
    // The OpenCV engine failed to load, timed out, or a CV step threw -
    // degrade quietly. The original photo (already visible/saveable via
    // stage 1) is completely unaffected.
    console.error('Document detection unavailable, falling back to manual/original crop:', cvError);
    quad = null;
    quadFullRes = null;
    confidence = 'low';
    processedCanvas = null;
    quality = null;
  }

  return { quad, quadFullRes, confidence, processedCanvas, quality, partiallyOutOfFrame };
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
