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
  onProgress?.('Detecting document...');
  const cv = await loadOpenCV();
  const img = await loadImageFile(file);
  const originalCanvas = drawToCanvas(img);
  const workingCanvas = drawToCanvas(img, WORKING_MAX_DIM);
  const scaleUp = originalCanvas.width / workingCanvas.width;

  const workingMat = canvasToMat(cv, workingCanvas);
  let detection;
  try {
    detection = detectDocument(cv, workingMat);
  } finally {
    workingMat.delete();
  }

  let quadFullRes: Quad | null = null;
  let partiallyOutOfFrame = false;
  let processedCanvas: HTMLCanvasElement | null = null;
  let quality: QualityCheckResult | null = null;

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

  onProgress?.('Preparing preview...');

  return {
    originalCanvas,
    workingCanvas,
    quad: detection.quad,
    quadFullRes,
    confidence: detection.confidence,
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
