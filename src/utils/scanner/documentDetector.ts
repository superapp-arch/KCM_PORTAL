// Document boundary detection for the Petty Cash Invoice Document Scanner
// (2026-09-08 direct request) - real OpenCV.js contour-based detection, not
// a fixed/CSS/center crop (see this feature's own spec, section 7-10).
//
// Pipeline: grayscale -> blur -> auto-thresholded Canny edges -> dilate to
// close small gaps -> findContours (RETR_LIST, so both the outer paper AND
// any strong inner printed border are candidates) -> approxPolyDP each down
// to a quadrilateral -> score every quad -> pick the best OUTER document
// boundary.
//
// 2026-09-10 recalibration against real KCM invoice photos (small
// municipal-toll receipts, roughly 15-55% of the frame, photographed at an
// angle on a car seat/door panel - heavily textured perforated leather in
// almost every real sample, sometimes rotated 30-45 degrees, sometimes
// off-centre, lighting ranging from bright to quite dark): the original
// scoring was tuned for the OPPOSITE failure mode (an inner printed border
// on a full-frame sheet of paper outscoring the real outer paper edge), so
// it weighted "bigger = better" heavily. Against these real photos that
// bias instead favours the wrong thing - the textured leather background
// itself (or a seat-panel stitching seam, which is a genuine straight
// near-rectangular edge) is much LARGER than the small receipt actually in
// frame, so a naive "prefer bigger" score would pick the seat over the
// receipt. Coverage is now a bounded preference for the realistic
// receipt-size range instead of a monotonic "bigger wins" term - see
// coverageScoreFor below - and carries less overall weight than
// rectangularity, which is a more reliable signal across these photos.
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

    // 7x7 (was 5x5) - real photos of a small receipt on textured leather
    // need more smoothing to suppress the leather's own fine-grain edges
    // (which otherwise survive Canny as noise) while still preserving the
    // receipt's own larger-scale boundary.
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(gray, blurred, new cv.Size(7, 7), 0);

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
    // tracing, so the real outer edge still closes into one contour. Only
    // 1 iteration (was 2) - on a textured background, over-dilating merges
    // nearby leather-grain edges into large blob contours that can rival
    // or exceed the receipt's own contour area.
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));
    const dilated = track(new cv.Mat());
    cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), 1);

    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    // RETR_LIST (not RETR_EXTERNAL) deliberately - a real receipt's outer
    // paper edge sometimes has weaker contrast than a strong inner printed
    // border, so both are considered as candidates and scored below rather
    // than only ever looking at the outermost contour.
    cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

    const centerX = w / 2;
    const centerY = h / 2;
    // 3% (was 5%) - real receipts photographed on a car seat can be a
    // fairly small fraction of the frame; the floor only needs to reject
    // obvious noise/specks, not plausible small documents.
    const minArea = imgArea * 0.03;

    // 2026-09-10 performance fix: a heavily-textured background (leather,
    // fabric, wood grain, ...) can make Canny+findContours return thousands
    // of small contours - approxPolyDP-ing every single one (with multiple
    // epsilon attempts each) was unbounded work that could make detection
    // take tens of seconds to minutes on a real device, which looked
    // indistinguishable from a hang (100+ invoices/day makes that
    // unacceptable). contourArea() alone is cheap, so every contour still
    // gets scored on area first (capped at MAX_CONTOURS_SCANNED as a hard
    // ceiling against pathological cases) - only the largest
    // MAX_CANDIDATES_EVALUATED then go through the actual expensive
    // approxPolyDP step. The real document is essentially always among the
    // largest contours in the frame, so this doesn't trade away accuracy.
    const MAX_CONTOURS_SCANNED = 2000;
    const MAX_CANDIDATES_EVALUATED = 25;
    const areaEntries: { contour: any; area: number }[] = [];
    const scanLimit = Math.min(contours.size(), MAX_CONTOURS_SCANNED);
    for (let i = 0; i < scanLimit; i++) {
      const contour = contours.get(i);
      track(contour);
      const area = cv.contourArea(contour);
      if (area >= minArea) areaEntries.push({ contour, area });
    }
    areaEntries.sort((a, b) => b.area - a.area);
    const topEntries = areaEntries.slice(0, MAX_CANDIDATES_EVALUATED);

    const candidates: Candidate[] = [];

    for (const { contour } of topEntries) {
      const perimeter = cv.arcLength(contour, true);
      let quadPoints: Point[] | null = null;

      // Two epsilons (was four) - a slightly wavy real-world paper edge
      // doesn't always collapse to exactly 4 points on the first attempt,
      // but a third/fourth attempt was rarely the one that actually
      // succeeded - halving this was most of the win above.
      for (const epsilonFactor of [0.02, 0.05]) {
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

      // Weighted score - rectangularity carries the most weight (the most
      // reliable signal across real photos), coverage rewards the
      // plausible receipt-size range rather than "bigger is always better"
      // (see coverageScoreFor - a giant textured-leather blob or a seat
      // stitching seam must not outscore the actual small receipt just for
      // being larger), centrality is a mild tie-breaker only (real photos
      // are very often off-centre - a driver photographing a receipt
      // handed to them doesn't carefully frame it).
      const rectangularityScore = Math.max(0, 1 - angleDev / 40);
      const coverageScore = coverageScoreFor(coverage);
      const centralityScore = Math.max(0, 1 - centerDist);
      const score = rectangularityScore * 0.45 + coverageScore * 0.35 + centralityScore * 0.2;

      candidates.push({ quad, score, coverage, angleDev });
    }

    if (candidates.length === 0) {
      return { quad: null, confidence: 'low', score: 0 };
    }

    candidates.sort((a, b) => b.score - a.score);
    const best = candidates[0];

    // 2026-09-10: loosened from the original 0.72/15/0.15 and 0.45/0.08
    // floors - at 100+ invoices/day, silently doing nothing (confidence
    // 'low' never auto-applies a crop) on a real but slightly-imperfect
    // detection was worse than committing to a crop and showing a "medium
    // confidence, please double-check" badge the employee can glance at and
    // override with Adjust Crop if it's actually wrong.
    let confidence: DetectionConfidence;
    if (best.score >= 0.65 && best.angleDev <= 20 && best.coverage >= 0.12) {
      confidence = 'high';
    } else if (best.score >= 0.32 && best.coverage >= 0.05) {
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

// 2026-09-10: real KCM receipts, sampled from actual photos, occupy
// roughly 10%-60% of the frame - that whole range scores at (or near) the
// maximum. Below it, taper down toward 0 (too small to plausibly be the
// intended document - more likely noise). Above it, taper down too, but
// keep a real floor (0.35) rather than dropping toward 0 - a receipt that
// genuinely fills most of the frame is still plausible, it's just no
// longer preferred over a more typically-sized candidate the way a
// monotonic "bigger is better" score would treat it.
function coverageScoreFor(coverage: number): number {
  if (coverage < 0.1) return Math.max(0, coverage / 0.1) * 0.7;
  if (coverage <= 0.6) return 1;
  return Math.max(0.35, 1 - (coverage - 0.6) * 1.2);
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
