// Orchestrates the full Petty Cash Document Scanner pipeline (2026-09-08
// direct request, spec section 8/53): load -> working copy -> detect ->
// (if confident) warp + enhance the FULL-resolution original -> quality
// check. Detection runs on a small downscaled "working copy" for speed
// (spec section 8 step 2/34 performance), but the actual perspective warp
// and enhancement always run against the full-resolution original so the
// saved document isn't limited to the working copy's reduced resolution -
// the detected quad is scaled back up to full-resolution coordinates first.
import { loadOpenCV } from './cvLoader';
import { loadImageFile, drawToCanvas, canvasToMat, matToCanvas } from './imageIo';
import { detectDocument, DetectionConfidence } from './documentDetector';
import { warpToQuad } from './perspective';
import { enhanceMat } from './enhance';
import { assessQuality, QualityCheckResult } from './qualityCheck';
import { Quad, quadTouchesImageBorder } from './geometry';

const WORKING_MAX_DIM = 1000;

export interface ScanPipelineResult {
  originalCanvas: HTMLCanvasElement; // full resolution, untouched - always available as the "Use Original" fallback
  workingCanvas: HTMLCanvasElement; // downscaled copy detection ran on - only used to size the manual-adjust overlay
  quad: Quad | null; // in workingCanvas coordinates
  quadFullRes: Quad | null; // the same quad, scaled to originalCanvas coordinates
  confidence: DetectionConfidence;
  processedCanvas: HTMLCanvasElement | null; // full-res, perspective-corrected + enhanced; null if nothing confident enough to auto-process
  quality: QualityCheckResult | null;
  partiallyOutOfFrame: boolean;
}

export async function runScanPipeline(file: File, onProgress?: (message: string) => void): Promise<ScanPipelineResult> {
  onProgress?.('Loading image...');
  // Decoding the selected photo doesn't need OpenCV at all - do this first
  // so the employee's original photo is always available for "Use
  // Original" even if the OpenCV engine below fails to load/initialize
  // (2026-09-09: graceful degradation - a scanner-engine failure must never
  // take away the ability to just save the original photo, and must never
  // crash the scanner itself).
  const img = await loadImageFile(file);
  const originalCanvas = drawToCanvas(img);
  const workingCanvas = drawToCanvas(img, WORKING_MAX_DIM);

  let quad: Quad | null = null;
  let quadFullRes: Quad | null = null;
  let confidence: DetectionConfidence = 'low';
  let partiallyOutOfFrame = false;
  let processedCanvas: HTMLCanvasElement | null = null;
  let quality: QualityCheckResult | null = null;

  try {
    onProgress?.('Detecting document...');
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
      // the employee is routed to manual adjustment / Use Original instead;
      // the detected quad is still returned so the manual editor can start
      // from it rather than a blind full-frame guess.
      if (detection.confidence !== 'low') {
        onProgress?.('Correcting perspective...');
        const result = processWithQuad(cv, originalCanvas, quadFullRes);
        processedCanvas = result.processedCanvas;
        quality = result.quality;
      }
    }
  } catch (cvError) {
    // The OpenCV engine failed to load or a CV step threw (e.g. blocked
    // network request, unsupported browser) - degrade to "no automatic
    // detection" rather than rejecting the whole pipeline. The employee
    // still gets a preview and can use Manual Crop or Use Original; only a
    // genuinely undecodable image (loadImageFile above) should still fail
    // outright, since there's no usable original in that case either.
    console.error('Document detection unavailable, falling back to manual/original crop:', cvError);
    quad = null;
    quadFullRes = null;
    confidence = 'low';
    processedCanvas = null;
    quality = null;
  }

  onProgress?.('Preparing preview...');

  return {
    originalCanvas,
    workingCanvas,
    quad,
    quadFullRes,
    confidence,
    processedCanvas,
    quality,
    partiallyOutOfFrame
  };
}

// Re-runs perspective correction + enhancement against a specific quad on
// the full-resolution original - shared by the initial pipeline above and
// by "Apply Crop" after a manual four-corner adjustment (spec section 20),
// so both paths produce an identical-quality result.
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
