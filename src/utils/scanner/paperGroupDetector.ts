// Paper-group detection for the Petty Cash Document Scanner (2026-09-24,
// built and verified against real KCM receipt photos - toll/thermal
// receipts and municipal receipts on car seats, fabric and tables, often
// with a SECOND receipt overlapping or lying next to the first).
//
// Why this exists: the contour detector in documentDetector.ts looks for a
// closed paper OUTLINE made of edges. On a textured seat/fabric the paper's
// outline merges with the texture's own edges, and a paper that runs off the
// photo never closes at all - on 4 of 9 real photos it found nothing, and it
// can only ever return ONE quad, so a second receipt was cropped away or cut
// through. Paper is far easier to find by COLOUR than by edges: receipts are
// bright and low-colour, seats/fabric/hands are not. So:
//   1. score every pixel's "whiteness" (Lab lightness minus 2x colourfulness),
//      split paper/background with an automatic (Otsu) threshold;
//   2. clean the mask so printed text/stamps don't punch holes in the paper;
//   3. each connected paper region is a document (physically overlapping
//      receipts merge into one region, so every visible part is kept);
//   4. keep regions that are big enough and match the main paper's colour
//      (drops cloth, highlights, specks);
//   5. crop = one clean paper -> its own perspective quad; several papers or
//      an irregular merged region -> one rotated rectangle enclosing ALL of them.
// If paper and background don't separate clearly (weak contrast, or the
// "paper" region surrounds the whole frame - e.g. a white floor), this returns
// null and the existing contour detector runs exactly as before.
import { Point, Quad, orderCorners, isConvexQuad, isValidDocumentQuad, polygonArea } from './geometry';
import type { DetectionResult } from './documentDetector';

const MIN_SEPARATION = 90;        // mean whiteness gap between paper and background (0-255)
const MIN_REGION_AREA = 0.015;    // a paper region smaller than this share of the photo is noise
const MIN_GROUP_AREA = 0.03;      // total paper smaller than this => nothing reliable to crop
const MAX_CROP_COVERAGE = 0.97;   // never "crop" to (essentially) the whole photo
const CLEAN_RECT_FILL = 0.9;      // paper area / crop area, at/above = one clean sheet (below = overlapping papers / irregular)
const COLOUR_MATCH = 12;          // max Lab a/b difference for an extra region to count as the same kind of paper
const EDGE_MARGIN_PX = 2;         // a region within this of the photo edge genuinely reaches it

function otsuThreshold(hist: number[], total: number): number {
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0, wB = 0, best = -1, t = 127;
  for (let i = 0; i < 256; i++) {
    wB += hist[i];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += i * hist[i];
    const mB = sumB / wB, mF = (sum - sumB) / wF;
    const v = wB * wF * (mB - mF) * (mB - mF);
    if (v > best) { best = v; t = i; }
  }
  return t;
}

interface Region { contour: any; area: number; sides: number; L: number; a: number; b: number; }

// True when every hull point lies inside the quad (or within `tolerance` px
// outside it) - i.e. cropping to the quad cuts no paper away.
export function quadContainsHull(cv: any, quad: Quad, hull: any, tolerance: number): boolean {
  const quadMat = cv.matFromArray(4, 1, cv.CV_32FC2, quad.flatMap(p => [p.x, p.y]));
  try {
    const d = hull.data32S as Int32Array;
    for (let i = 0; i < d.length; i += 2) {
      if (cv.pointPolygonTest(quadMat, new cv.Point(d[i], d[i + 1]), true) < -tolerance) return false;
    }
    return true;
  } finally {
    quadMat.delete();
  }
}

// The min-area rotated rectangle around a hull, clamped to the photo - the
// safe "keep everything" crop; null if it isn't a usable quad.
export function enclosingRectQuad(cv: any, hull: any, w: number, h: number): Quad | null {
  const rect = cv.minAreaRect(hull);
  const theta = (rect.angle * Math.PI) / 180, cos = Math.cos(theta), sin = Math.sin(theta);
  const quad = orderCorners([[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([sx, sy]) => {
    const dx = (sx * rect.size.width) / 2, dy = (sy * rect.size.height) / 2;
    return {
      x: Math.min(w - 1, Math.max(0, rect.center.x + dx * cos - dy * sin)),
      y: Math.min(h - 1, Math.max(0, rect.center.y + dx * sin + dy * cos))
    };
  }));
  return isConvexQuad(quad) && isValidDocumentQuad(quad, w, h) ? quad : null;
}

// Returns a paper-group detection, or null to let the contour detector decide.
export function detectPaperGroup(cv: any, srcMat: any): DetectionResult | null {
  const owned: any[] = [];
  const track = <T,>(m: T): T => { owned.push(m); return m; };
  try {
    const w = srcMat.cols, h = srcMat.rows, total = w * h;

    const rgb = track(new cv.Mat());
    cv.cvtColor(srcMat, rgb, cv.COLOR_RGBA2RGB);
    const blurred = track(new cv.Mat());
    cv.GaussianBlur(rgb, blurred, new cv.Size(5, 5), 0);
    const lab = track(new cv.Mat());
    cv.cvtColor(blurred, lab, cv.COLOR_RGB2Lab);
    const labData = lab.data as Uint8Array;

    // 1. whiteness + automatic threshold
    const whiteness = track(new cv.Mat(h, w, cv.CV_8UC1));
    const wd = whiteness.data as Uint8Array;
    const hist = new Array(256).fill(0);
    for (let i = 0, j = 0; i < total; i++, j += 3) {
      const chroma = Math.hypot(labData[j + 1] - 128, labData[j + 2] - 128);
      const v = Math.max(0, Math.min(255, Math.round(labData[j] - 2 * chroma)));
      wd[i] = v;
      hist[v]++;
    }
    const threshold = otsuThreshold(hist, total);
    let fgCount = 0, fgSum = 0, bgSum = 0;
    for (let i = 0; i < total; i++) {
      if (wd[i] > threshold) { fgCount++; fgSum += wd[i]; } else bgSum += wd[i];
    }
    const separation = fgSum / Math.max(1, fgCount) - bgSum / Math.max(1, total - fgCount);
    if (separation < MIN_SEPARATION) {
      console.debug(`[SCANNER] paper group: weak paper/background contrast (${Math.round(separation)}) - using edge detection`);
      return null;
    }

    // 2. clean mask
    const mask = track(new cv.Mat());
    cv.threshold(whiteness, mask, threshold, 255, cv.THRESH_BINARY);
    const small = track(cv.Mat.ones(3, 3, cv.CV_8U));
    const closeKernel = track(cv.getStructuringElement(cv.MORPH_RECT, new cv.Size(9, 9)));
    cv.morphologyEx(mask, mask, cv.MORPH_OPEN, small);
    cv.morphologyEx(mask, mask, cv.MORPH_CLOSE, closeKernel);

    // 3. regions
    const contours = track(new cv.MatVector());
    const hierarchy = track(new cv.Mat());
    cv.findContours(mask, contours, hierarchy, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);
    const regions: Region[] = [];
    for (let i = 0; i < contours.size(); i++) {
      const contour = track(contours.get(i));
      const area = cv.contourArea(contour);
      if (area < total * MIN_REGION_AREA) continue;
      const r = cv.boundingRect(contour);
      const sides = (r.x <= EDGE_MARGIN_PX ? 1 : 0) + (r.y <= EDGE_MARGIN_PX ? 1 : 0) +
        (r.x + r.width >= w - EDGE_MARGIN_PX ? 1 : 0) + (r.y + r.height >= h - EDGE_MARGIN_PX ? 1 : 0);
      const regionMask = track(cv.Mat.zeros(h, w, cv.CV_8UC1));
      const single = track(new cv.MatVector());
      single.push_back(contour);
      cv.drawContours(regionMask, single, 0, new cv.Scalar(255), -1);
      const mean = cv.mean(lab, regionMask);
      regions.push({ contour, area, sides, L: mean[0], a: mean[1] - 128, b: mean[2] - 128 });
    }
    regions.sort((x, y) => y.area - x.area);

    // The biggest "paper" surrounds the whole frame (a white floor/table, or
    // paper indistinguishable from the background) - not something to crop to.
    if (regions.length === 0 || regions[0].sides === 4) {
      console.debug('[SCANNER] paper group: paper region not separable from the background - using edge detection');
      return null;
    }

    // 4. group = main paper + other regions of the same kind of paper
    const primary = regions[0];
    const group = regions.filter(r => r === primary || (
      r.sides < 4 &&
      Math.abs(r.a - primary.a) <= COLOUR_MATCH && Math.abs(r.b - primary.b) <= COLOUR_MATCH &&
      r.L >= primary.L - 45
    ));
    const groupArea = group.reduce((s, r) => s + r.area, 0);
    if (groupArea < total * MIN_GROUP_AREA) return null;

    const points: number[] = [];
    for (const r of group) {
      const d = r.contour.data32S as Int32Array;
      for (let i = 0; i < d.length; i++) points.push(d[i]);
    }
    const allPoints = track(cv.matFromArray(points.length / 2, 1, cv.CV_32SC2, points));
    const hull = track(new cv.Mat());
    cv.convexHull(allPoints, hull, false, true);

    const touchesPhotoEdge = group.some(r => r.sides > 0);
    const clamp = (p: Point): Point => ({ x: Math.min(w - 1, Math.max(0, p.x)), y: Math.min(h - 1, Math.max(0, p.y)) });

    // 5. crop quad
    let quad: Quad | null = null;
    let ownCorners = false;
    if (group.length === 1) {
      // One sheet: try its own 4 corners first, so perspective is corrected
      // (a sheet photographed at an angle is a trapezoid - judging it against
      // its bounding rectangle would wrongly call it irregular).
      const perimeter = cv.arcLength(hull, true);
      for (const eps of [0.02, 0.03, 0.04, 0.05]) {
        const approx = track(new cv.Mat());
        cv.approxPolyDP(hull, approx, eps * perimeter, true);
        if (approx.rows !== 4) continue;
        const pts: Point[] = [];
        for (let k = 0; k < 4; k++) pts.push(clamp({ x: approx.data32S[k * 2], y: approx.data32S[k * 2 + 1] }));
        const q = orderCorners(pts);
        // Must be a sane quad that keeps EVERY part of the paper - a 4-corner
        // fit can drop a hull vertex and slice off content (seen on a real A4
        // photo: the left column was cut); if so, use the enclosing rectangle.
        if (isConvexQuad(q) && isValidDocumentQuad(q, w, h) && quadContainsHull(cv, q, hull, Math.max(w, h) * 0.01)) {
          quad = q;
          ownCorners = true;
        }
        break;
      }
    }
    if (!quad) {
      // Several papers / an irregular merged region: one rotated rectangle
      // enclosing everything (straightens rotation; overlapping papers keep
      // all their visible parts).
      quad = enclosingRectQuad(cv, hull, w, h);
      if (!quad) return null;
    }
    const coverage = polygonArea(quad) / total;
    if (coverage > MAX_CROP_COVERAGE) return null;

    // How much of the crop is actually paper: a single sheet cropped by its
    // own corners fills it almost completely; overlapping papers, or a sheet
    // with a hand/thumb over it, leave noticeably empty corners.
    const paperFill = groupArea / Math.max(1, polygonArea(quad));
    const irregular = group.length === 1 && paperFill < CLEAN_RECT_FILL;
    // 'high' only for one clean, fully-in-frame sheet cropped by its own
    // corners; any grouping/irregularity/edge contact is 'medium'
    // (auto-cropped, but flagged "please double-check").
    const confidence = group.length === 1 && ownCorners && !irregular && !touchesPhotoEdge ? 'high' : 'medium';
    console.debug(
      `[SCANNER] paper group: ${group.length} region(s)${irregular ? ' (irregular / overlapping papers)' : ''}, ` +
      `paper ${Math.round((groupArea / total) * 100)}% of photo, crop ${Math.round(coverage * 100)}%, touches photo edge: ${touchesPhotoEdge}, confidence ${confidence}`
    );
    return {
      quad,
      confidence,
      score: 1,
      documentCount: group.length,
      irregularGroup: irregular,
      touchesPhotoEdge
    };
  } finally {
    for (const m of owned) {
      try { m.delete(); } catch { /* already freed */ }
    }
  }
}
