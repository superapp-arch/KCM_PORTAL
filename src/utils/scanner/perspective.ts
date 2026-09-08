// Perspective/homography correction for the Petty Cash Document Scanner
// (2026-09-08 direct request) - a real getPerspectiveTransform +
// warpPerspective, not an axis-aligned bounding-box crop (spec section 11).
import { Quad, destSizeForQuad } from './geometry';

// Warps srcMat so the four given corners (in srcMat's own pixel coordinates,
// TL/TR/BR/BL order) become the four corners of the output - the output size
// is derived from the quad's own measured side lengths (destSizeForQuad),
// never a fixed size, so the document's real proportions are preserved.
// Caller owns the returned Mat and must call .delete() on it.
export function warpToQuad(cv: any, srcMat: any, quad: Quad): any {
  const { width, height } = destSizeForQuad(quad);

  const srcTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    quad[0].x, quad[0].y,
    quad[1].x, quad[1].y,
    quad[2].x, quad[2].y,
    quad[3].x, quad[3].y
  ]);
  const dstTri = cv.matFromArray(4, 1, cv.CV_32FC2, [
    0, 0,
    width - 1, 0,
    width - 1, height - 1,
    0, height - 1
  ]);

  const M = cv.getPerspectiveTransform(srcTri, dstTri);
  const dst = new cv.Mat();
  try {
    cv.warpPerspective(srcMat, dst, M, new cv.Size(width, height), cv.INTER_LINEAR, cv.BORDER_REPLICATE, new cv.Scalar());
  } finally {
    srcTri.delete();
    dstTri.delete();
    M.delete();
  }
  return dst;
}
