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

interface Candidate { quad: Quad; score: number; coverage: number; angleDev: number; isFallback: boolean; }

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

    const centerX = w / 2;
    const centerY = h / 2;
    // 3% (was 5%) - real receipts photographed on a car seat can be a
    // fairly small fraction of the frame; the floor only needs to reject
    // obvious noise/specks, not plausible small documents.
    const minArea = imgArea * 0.03;
    const kernel = track(cv.Mat.ones(3, 3, cv.CV_8U));

    // 2026-09-10 direct request: "whatever the situation of the invoice it
    // must crop" - real KCM receipts investigated this round included a
    // torn perforated edge and a low-contrast shadowed edge, both of which
    // left a genuine GAP in the Canny outline that 1 dilate iteration
    // (the tuning from earlier this session, chosen to avoid merging
    // textured-leather grain into large blob contours) never closed - no
    // contour reached a plausible document size at all, closed or not.
    // Verified directly against these two real photos: the correct
    // contour only closes into one shape at 2-3 dilate iterations. Rather
    // than pick one fixed iteration count that's wrong for one side of
    // that tradeoff, start at 1 (correct and fast for the common case) and
    // only escalate - trying progressively more closing - when nothing
    // plausible was found, so the common case pays no extra cost and the
    // torn/shadowed-edge case still gets a real answer instead of none.
    let candidates: Candidate[] = [];
    for (const dilateIters of [1, 2, 3, 4]) {
      const dilated = new cv.Mat();
      cv.dilate(edges, dilated, kernel, new cv.Point(-1, -1), dilateIters);

      const contours = new cv.MatVector();
      const hierarchy = new cv.Mat();
      // RETR_LIST (not RETR_EXTERNAL) deliberately - a real receipt's outer
      // paper edge sometimes has weaker contrast than a strong inner printed
      // border, so both are considered as candidates and scored below rather
      // than only ever looking at the outermost contour.
      cv.findContours(dilated, contours, hierarchy, cv.RETR_LIST, cv.CHAIN_APPROX_SIMPLE);

      candidates = findCandidatesInContours(cv, contours, w, h, imgArea, centerX, centerY, minArea);

      dilated.delete();
      contours.delete();
      hierarchy.delete();

      if (candidates.length > 0) break;
    }

    if (candidates.length === 0) {
      // Genuinely nothing plausible found even after escalating - a
      // blank/empty photo, or one with no sufficiently large foreground
      // shape at all. Correctly shows "nothing to crop" rather than
      // forcing a meaningless result.
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
    if (!best.isFallback && best.score >= 0.65 && best.angleDev <= 20 && best.coverage >= 0.12) {
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

// Ranks the contours found at one dilate-iteration attempt, quad-fits the
// largest ones via approxPolyDP, and falls back to minAreaRect for any that
// never collapse to a clean 4-point quad - returns every valid, scored
// Candidate found (empty if none, in which case detectDocument's loop
// escalates to more dilation and calls this again on a fresh contour set).
//
// Mat ownership: every contour Mat this function touches via contours.get()
// is a fresh WASM-side copy that must be deleted exactly once - tracked in
// `touched` and cleaned up in the finally block below regardless of which
// return path is taken, so the caller never needs to know which indices
// were actually looked at.
function findCandidatesInContours(
  cv: any,
  contours: any,
  w: number,
  h: number,
  imgArea: number,
  centerX: number,
  centerY: number,
  minArea: number
): Candidate[] {
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
  const scanLimit = Math.min(contours.size(), MAX_CONTOURS_SCANNED);

  const touched: any[] = [];
  const areaEntries: { contour: any; area: number }[] = [];

  try {
    for (let i = 0; i < scanLimit; i++) {
      const contour = contours.get(i);
      touched.push(contour);
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

      candidates.push({ quad, score, coverage, angleDev, isFallback: false });
    }

    // "whatever the situation of the invoice it must crop" (2026-09-10
    // direct request) - a real receipt is very often torn off a
    // perforated booklet, overlapped by another slip, or has one edge cut
    // off by the photo frame. None of those have a clean 4-sided outline,
    // so no epsilon of approxPolyDP above ever collapses their contour to
    // exactly 4 points. Rather than give up (which only a truly
    // blank/empty photo should do), fall back to cv.minAreaRect on the
    // same already-ranked large contours: it always returns SOME tight
    // rotated rectangle around a contour's own extent, however irregular
    // that contour's outline is, so a torn/overlapped/partially-framed
    // receipt still gets a sensible crop instead of none. Capped at
    // 'medium' confidence in detectDocument (never 'high') since it's a
    // bounding approximation of the visible ink, not a verified true
    // paper edge the way a clean 4-point contour is.
    if (candidates.length === 0) {
      for (const { contour } of topEntries.slice(0, 8)) {
        const rect = cv.minAreaRect(contour);
        const quad = rotatedRectToQuad(rect);
        if (!isValidDocumentQuad(quad, w, h)) continue;

        const coverage = polygonArea(quad) / imgArea;
        const cx = quad.reduce((s, p) => s + p.x, 0) / 4;
        const cy = quad.reduce((s, p) => s + p.y, 0) / 4;
        const centerDist = Math.hypot(cx - centerX, cy - centerY) / Math.hypot(centerX, centerY);
        const coverageScore = coverageScoreFor(coverage);
        const centralityScore = Math.max(0, 1 - centerDist);
        // No rectangularity term - a minAreaRect box is a perfect
        // rectangle by construction, so that signal carries no real
        // information here (unlike the primary approxPolyDP candidates
        // above, where it reflects the true detected edges).
        const score = coverageScore * 0.65 + centralityScore * 0.35;

        candidates.push({ quad, score, coverage, angleDev: 0, isFallback: true });
      }
    }

    return candidates;
  } finally {
    for (const m of touched) {
      try { m.delete(); } catch { /* already freed */ }
    }
  }
}

// Converts an OpenCV RotatedRect (as returned by cv.minAreaRect - a plain
// {center, size, angle} object in this build, not a class instance) into
// our own TL/TR/BR/BL Quad. Computed manually rather than via cv.boxPoints
// - confirmed in this same OpenCV.js build that boxPoints silently returns
// an empty Mat instead of throwing (the same kind of missing/broken
// binding as cv.createCLAHE elsewhere in this feature), which would fail
// silently here too. This is the same corner math boxPoints itself would
// do, verified against known test cases.
function rotatedRectToQuad(rect: { center: Point; size: { width: number; height: number }; angle: number }): Quad {
  const theta = (rect.angle * Math.PI) / 180;
  const cos = Math.cos(theta);
  const sin = Math.sin(theta);
  const halfW = rect.size.width / 2;
  const halfH = rect.size.height / 2;
  const corners: Point[] = [
    { x: -halfW, y: -halfH },
    { x: halfW, y: -halfH },
    { x: halfW, y: halfH },
    { x: -halfW, y: halfH }
  ].map((p) => ({
    x: rect.center.x + p.x * cos - p.y * sin,
    y: rect.center.y + p.x * sin + p.y * cos
  }));
  return orderCorners(corners);
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
