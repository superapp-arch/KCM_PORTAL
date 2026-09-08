// Document boundary detection for the Petty Cash Invoice Document Scanner
// (2026-09-08 direct request) - real OpenCV.js contour-based detection, not
// a fixed/CSS/center crop (see this feature's own spec, section 7-10).
//
// Pipeline: grayscale -> blur -> auto-thresholded Canny edges -> dilate to
// close small gaps -> findContours (RETR_LIST, so both the outer paper AND
// any strong inner printed border are candidates) -> approxPolyDP each down
// to a quadrilateral -> score every quad -> pick the best OUTER document
// boundary, never just "the strongest rectangle" (section 9's internal-
// border trap - scoring below explicitly favours larger, more centred
// quads over smaller/inset ones so a strong inner box never outranks the
// actual outer paper edge).
//
// OpenCV.js is manual-memory WASM: every cv.Mat / MatVector created here is
// tracked in `owned` and deleted in the `finally` block, regardless of
// which return path is taken.
import { Point, Quad, orderCorners, isConvexQuad, isValidDocumentQuad, polygonArea, maxAngleDeviation } from './geometry';

export type DetectionConfidence = 'high' | 'medium' | 'low';

export interface DetectionResult {
  quad: Quad | null; // pixel coordinates in the working (possibly downscaled) image passed in
  confidence: DetectionConfidence;
  score: number; // raw candidate score, mainly for debugging/telemetry - not shown to the employee
}

interface Candidate { quad: Quad; score: number; coverage: number; angleDev: number; }

export function detectDocument(cv: any, srcMat: any): DetectionResult {
  const owned: any[] = [];
  const track = <T,>(m: T): T => { owned.push(m); return m; };

  try {
    const w = srcMat.cols;
    const h = srcMat.rows;
    const imgArea = w * h;

    const gray = track(new cv.Mat());
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);

    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(5, 5), 0);

    // Auto-thresholded Canny (classic "median +/- 33%" trick) instead of
    // fixed thresholds - real receipts range from high-contrast white paper
    // on a dark background to low-contrast pale paper on a light desk, and a
    // single fixed threshold pair fails badly at one end or the other.
    const median = estimateMedianIntensity(blurred);
    const lower = Math.max(0, Math.round(median * 0.66));
    const upper = Math.min(255, Math.round(median * 1.33));
    const edges = track(new cv.Mat());
    cv.Canny(blurred, edges, lower, upper);

    // Close small gaps in the outer boundary (a shadow or reflection can
    // locally break an otherwise-continuous paper edge) before contour
    // tracing, so the real outer edge still closes into one contour.
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    const dilated = track(new cv.Mat());
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 2);

    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    // RETR_LIST (not RETR_EXTERNAL) deliberately - a real receipt's outer
    // paper edge sometimes has weaker contrast than a strong inner printed
    // border, so both are considered as candidates and scored below rather
    // than only ever looking at the outermost contour.
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const candidates: Candidate[] = [];
    const centerX = w / 2;
    const centerY = h / 2;
    const minArea = imgArea * 0.05; // ignore obvious noise/specks up front

    for (let i = 0; i < contours.size(); i++) {
      const contour = contours.get(i);
      track(contour);
      const area = cv.contourArea(contour);
      if (area < minArea) continue;

      const perimeter = cv.arcLength(contour, true);
      let quadPoints: Point[] | null = null;

      // Try a few epsilons - a slightly wavy real-world paper edge doesn't
      // always collapse to exactly 4 points on the first attempt.
      for (const epsilonFactor of [0.02, 0.035, 0.05, 0.08]) {
        const approx = new cv.Mat();
        cv.approxPolyDP(contour, approx, epsilonFactor * perimeter, true);
        if (approx.rows === 4 && cv.isContourConvex(approx)) {
          quadPoints = matToPoints(approx);
          approx.delete();
          break;
        }
        approx.delete();
      }
      if (!quadPoints) continue;

      const quad = orderCorners(quadPoints);
      if (!isValidDocumentQuad(quad, w, h)) continue;

      const coverage = polygonArea(quad) / imgArea;
      const angleDev = maxAngleDeviation(quad);
      const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
      const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
      const centerDist = Math.hypot(cx - centerX, cy - centerY) / Math.hypot(centerX, centerY);

      // Weighted score: favour larger (outer, not inner-border) quads that
      // are close to rectangular and roughly centred in the frame. Coverage
      // is intentionally the heaviest term - section 9/52's "prefer the
      // outer paper, prefer more document area over a tighter but wrong
      // crop" bias, implemented directly as a scoring weight rather than
      // just picking the single largest contour outright (which would also
      // happily pick up an unrelated large dark background region with no
      // rectangularity check at all).
      const rectangularityScore = Math.max(0, 1 - angleDev / 40);
      const coverageScore = Math.min(1, coverage / 0.85);
      const centralityScore = Math.max(0, 1 - centerDist);
      const score = coverageScore * 0.5 + rectangularityScore * 0.35 + centralityScore * 0.15;

      candidates.push({ quad, score, coverage, angleDev });
    }

    if (candidates.length === 0) {
      return { quad: null, confidence: 'low', score: 0 };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    let confidence: DetectionConfidence;
    if (best.score >= 0.72 && best.angleDev <= 15 && best.coverage >= 0.15) {
      confidence = 'high';
    } else if (best.score >= 0.45 && best.coverage >= 0.08) {
      confidence = 'medium';
    } else {
      confidence = 'low';
    }

    return { quad: best.quad, confidence, score: best.score };
  } finally {
    for (const m of owned) {
      try { m.delete(); } catch { /* already freed */ }
    }
  }
}

function matToPoints(approxMat: any): Point[] {
  const points: Point[] = [];
  for (let i = 0; i < approxMat.rows; i++) {
    points.push({ x: approxMat.data32S[i * 2], y: approxMat.data32S[i * 2 + 1] });
  }
  return points;
}

// Cheap median-intensity estimate via a 32-bucket histogram (not a full sort
// of every pixel) - only needs to be roughly right, it just seeds the Canny
// threshold pair.
function estimateMedianIntensity(grayMat: any): number {
  const data = grayMat.data as Uint8Array;
  const buckets = new Array(32).fill(0);
  const step = Math.max(1, Math.floor(data.length / 20000)); // sample, don't scan every pixel on a large working copy
  let sampled = 0;
  for (let i = 0; i < data.length; i += step) {
    buckets[data[i] >> 3]++;
    sampled++;
  }
  const half = sampled / 2;
  let running = 0;
  for (let b = 0; b < buckets.length; b++) {
    running += buckets[b];
    if (running >= half) return b * 8 + 4;
  }
  return 128;
}
