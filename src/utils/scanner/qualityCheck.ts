// Pre-save quality checks for the Petty Cash Document Scanner (2026-09-08
// direct request, spec section 27) - warns rather than silently saving a
// scan nobody could actually read back. Never blocks saving outright (the
// employee can always still choose Use Original / Save As-Is) - these are
// advisory warnings shown in the preview, per section 41/42's "never leave
// the employee stuck, always recoverable" rule.
export type QualitySeverity = 'ok' | 'warn';
export interface QualityCheckResult {
  severity: QualitySeverity;
  warnings: string[];
}

const MIN_DIMENSION_PX = 500; // below this, a receipt's small print is unlikely to be legible later

export function assessQuality(cv: any, mat: any): QualityCheckResult {
  const warnings: string[] = [];
  const owned: any[] = [];
  const track = <T,>(m: T): T => { owned.push(m); return m; };

  try {
    if (mat.cols < MIN_DIMENSION_PX || mat.rows < MIN_DIMENSION_PX) {
      warnings.push('This image is very low resolution - fine print may not be readable later.');
    }

    const gray = track(new cv.Mat());
    cv.cvtColor(mat, gray, cv.COLOR_RGBA2GRAY);

    // Blur estimate: variance of the Laplacian - a sharp document has lots
    // of high-frequency edge detail (numbers, printed lines), a blurry photo
    // doesn't. Threshold is intentionally lenient (real phone photos of
    // slightly textured paper are naturally noisier than a scanner) - this
    // is meant to catch genuinely out-of-focus shots, not flag every photo.
    const laplacian = track(new cv.Mat());
    cv.Laplacian(gray, laplacian, cv.CV_64F);
    const stddev = track(new cv.Mat());
    const mean = track(new cv.Mat());
    cv.meanStdDev(laplacian, mean, stddev);
    const variance = Math.pow(stddev.data64F[0], 2);
    if (variance < 15) {
      warnings.push('This photo looks blurry - the text may be hard to read.');
    }

    // Brightness: mean pixel value on a 0-255 grayscale.
    const brightMean = track(new cv.Mat());
    const brightStd = track(new cv.Mat());
    cv.meanStdDev(gray, brightMean, brightStd);
    const brightness = brightMean.data64F[0];
    if (brightness < 40) {
      warnings.push('This photo looks very dark - some details may be hard to see.');
    } else if (brightness > 230) {
      warnings.push('This photo looks overexposed/washed out - some details may be hard to see.');
    }

    return { severity: warnings.length > 0 ? 'warn' : 'ok', warnings };
  } finally {
    for (const m of owned) {
      try { m.delete(); } catch { /* already freed */ }
    }
  }
}
