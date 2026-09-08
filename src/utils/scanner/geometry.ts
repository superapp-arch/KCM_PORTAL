// Pure-JS geometry helpers for the Petty Cash Document Scanner - no OpenCV
// dependency, so these are safe to call before the CV runtime has loaded
// (e.g. to validate a manually-dragged four-corner selection) and are unit-
// testable in isolation.

export interface Point { x: number; y: number; }
// Always in Top-Left, Top-Right, Bottom-Right, Bottom-Left order.
export type Quad = [Point, Point, Point, Point];

export const dist = (a: Point, b: Point) => Math.hypot(b.x - a.x, b.y - a.y);

// Shoelace formula - always returns a positive area regardless of winding
// order, used both for scoring candidate document contours and for
// validating a manually-dragged quad isn't degenerate.
export function polygonArea(points: Point[]): number {
  let sum = 0;
  for (let i = 0; i < points.length; i++) {
    const p1 = points[i];
    const p2 = points[(i + 1) % points.length];
    sum += p1.x * p2.y - p2.x * p1.y;
  }
  return Math.abs(sum) / 2;
}

// Re-orders four arbitrary corner points into TL/TR/BR/BL - needed both
// after automatic contour detection (OpenCV returns points in an arbitrary
// order) and after a manual drag (the employee could plausibly cross
// handles). Standard sum/diff heuristic: TL has the smallest x+y, BR the
// largest x+y, TR the smallest y-x, BL the largest y-x.
export function orderCorners(points: Point[]): Quad {
  const sorted = [...points];
  const bySum = [...sorted].sort((a, b) => (a.x + a.y) - (b.x + b.y));
  const byDiff = [...sorted].sort((a, b) => (a.y - a.x) - (b.y - b.x));
  const tl = bySum[0];
  const br = bySum[bySum.length - 1];
  const tr = byDiff[0];
  const bl = byDiff[byDiff.length - 1];
  return [tl, tr, br, bl];
}

// Cross product z-component of (b-a) x (c-b) - sign tells turn direction at
// vertex b, used to confirm a quad is convex (all four turns the same sign)
// and not self-intersecting/degenerate (a "bowtie" a careless manual drag
// could produce).
function cross(a: Point, b: Point, c: Point): number {
  return (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
}

export function isConvexQuad(q: Quad): boolean {
  const signs = q.map((_, i) => cross(q[i], q[(i + 1) % 4], q[(i + 2) % 4]));
  const allPositive = signs.every(s => s > 0);
  const allNegative = signs.every(s => s < 0);
  return allPositive || allNegative;
}

function angleAt(prev: Point, at: Point, next: Point): number {
  const v1 = { x: prev.x - at.x, y: prev.y - at.y };
  const v2 = { x: next.x - at.x, y: next.y - at.y };
  const dot = v1.x * v2.x + v1.y * v2.y;
  const mag = Math.hypot(v1.x, v1.y) * Math.hypot(v2.x, v2.y);
  if (mag === 0) return 0;
  const cosA = Math.max(-1, Math.min(1, dot / mag));
  return (Math.acos(cosA) * 180) / Math.PI;
}

// How far the quad's four interior angles deviate from a perfect 90 -
// scoring input (rule 9/10: rectangularity, reasonable angles) and manual-
// crop validation (reject a wildly non-rectangular drag before Apply Crop).
export function maxAngleDeviation(q: Quad): number {
  let maxDev = 0;
  for (let i = 0; i < 4; i++) {
    const a = angleAt(q[(i + 3) % 4], q[i], q[(i + 1) % 4]);
    maxDev = Math.max(maxDev, Math.abs(a - 90));
  }
  return maxDev;
}

// Whether any corner sits within `marginRatio` of the image's own edge -
// the signal used to warn "document appears to be partially outside the
// photo" (rule 18) rather than silently crop off financial information
// that was never actually captured in the source photo.
export function quadTouchesImageBorder(q: Quad, imgW: number, imgH: number, marginRatio = 0.015): boolean {
  const mx = imgW * marginRatio;
  const my = imgH * marginRatio;
  return q.some(p => p.x <= mx || p.y <= my || p.x >= imgW - mx || p.y >= imgH - my);
}

// A valid, usable quad: convex, reasonably rectangular, and covering a
// sane minimum share of the frame (guards against a sliver/degenerate
// selection slipping through, whether from detection or a bad manual drag).
export function isValidDocumentQuad(q: Quad, imgW: number, imgH: number): boolean {
  if (!isConvexQuad(q)) return false;
  const area = polygonArea(q);
  const imgArea = imgW * imgH;
  if (imgArea <= 0) return false;
  const coverage = area / imgArea;
  if (coverage < 0.05 || coverage > 1.0) return false;
  if (maxAngleDeviation(q) > 40) return false;
  // Every side must have a sensible minimum length (not a collapsed edge).
  const minSide = Math.min(imgW, imgH) * 0.05;
  for (let i = 0; i < 4; i++) {
    if (dist(q[i], q[(i + 1) % 4]) < minSide) return false;
  }
  return true;
}

// Destination canvas size for the perspective warp - derived from the
// quad's own measured side lengths (never a fixed size) so the output keeps
// the document's real proportions, per rule 11.
export function destSizeForQuad(q: Quad): { width: number; height: number } {
  const [tl, tr, br, bl] = q;
  const widthTop = dist(tl, tr);
  const widthBottom = dist(bl, br);
  const heightLeft = dist(tl, bl);
  const heightRight = dist(tr, br);
  const width = Math.round(Math.max(widthTop, widthBottom));
  const height = Math.round(Math.max(heightLeft, heightRight));
  return { width: Math.max(width, 1), height: Math.max(height, 1) };
}
