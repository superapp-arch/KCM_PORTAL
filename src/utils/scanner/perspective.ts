// Perspective/homography correction for the Petty Cash Document Scanner
// (2026-09-08 direct request) - a real getPerspectiveTransform +
// warpPerspective, not an axis-aligned bounding-box crop (spec section 11).
import { Point, Quad, destSizeForQuad } from './geometry';

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

// 2026-09-23: pure-JS equivalent of warpToQuad above, used ONLY when OpenCV
// isn't available (engine still downloading, failed, or a CV step threw) -
// so Manual Crop's Apply Crop always works and the employee can always save
// a correctly cropped image. Same TL/TR/BR/BL corner contract and the same
// destSizeForQuad output size as the OpenCV path, so both produce identical
// geometry. Inverse mapping: for every output pixel, the homography maps it
// back into the source quad and the colour is bilinearly sampled there.
export function warpCanvasToQuadJs(srcCanvas: HTMLCanvasElement, quad: Quad): HTMLCanvasElement {
  const { width, height } = destSizeForQuad(quad);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1) {
    throw new Error('Invalid crop size.');
  }
  // Output-rectangle corner -> source-quad corner (inverse mapping).
  const H = solveHomography(
    [{ x: 0, y: 0 }, { x: width - 1, y: 0 }, { x: width - 1, y: height - 1 }, { x: 0, y: height - 1 }],
    quad
  );
  if (!H.every(Number.isFinite)) throw new Error('Could not compute the perspective transform for this crop.');

  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) throw new Error('Canvas 2D context is unavailable.');
  const sw = srcCanvas.width;
  const sh = srcCanvas.height;
  const src = srcCtx.getImageData(0, 0, sw, sh).data;

  const out = document.createElement('canvas');
  out.width = width;
  out.height = height;
  const outCtx = out.getContext('2d');
  if (!outCtx) throw new Error('Canvas 2D context is unavailable.');
  const outImage = outCtx.createImageData(width, height);
  const dst = outImage.data;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = H;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const denom = h6 * x + h7 * y + 1;
      // Clamp like OpenCV's BORDER_REPLICATE - an edge pixel never samples
      // outside the photo.
      let sx = (h0 * x + h1 * y + h2) / denom;
      let sy = (h3 * x + h4 * y + h5) / denom;
      sx = sx < 0 ? 0 : sx > sw - 1 ? sw - 1 : sx;
      sy = sy < 0 ? 0 : sy > sh - 1 ? sh - 1 : sy;
      const x0 = sx | 0;
      const y0 = sy | 0;
      const x1 = x0 + 1 < sw ? x0 + 1 : x0;
      const y1 = y0 + 1 < sh ? y0 + 1 : y0;
      const fx = sx - x0;
      const fy = sy - y0;
      const i00 = (y0 * sw + x0) * 4;
      const i10 = (y0 * sw + x1) * 4;
      const i01 = (y1 * sw + x0) * 4;
      const i11 = (y1 * sw + x1) * 4;
      const o = (y * width + x) * 4;
      for (let c = 0; c < 4; c++) {
        const top = src[i00 + c] + (src[i10 + c] - src[i00 + c]) * fx;
        const bottom = src[i01 + c] + (src[i11 + c] - src[i01 + c]) * fx;
        dst[o + c] = top + (bottom - top) * fy;
      }
    }
  }
  outCtx.putImageData(outImage, 0, 0);
  return out;
}

// Solves the 8 homography coefficients mapping each `from[i]` to `to[i]`
// (4 point pairs) via Gaussian elimination with partial pivoting.
// Returns [h0..h7] with h8 fixed at 1; NaN entries if the system is singular.
function solveHomography(from: Point[], to: Point[]): number[] {
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const { x, y } = from[i];
    const { x: u, y: v } = to[i];
    A.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    A.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  const n = 8;
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(A[r][col]) > Math.abs(A[pivot][col])) pivot = r;
    }
    if (Math.abs(A[pivot][col]) < 1e-12) return new Array(8).fill(NaN);
    [A[col], A[pivot]] = [A[pivot], A[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = A[r][col] / A[col][col];
      for (let c = col; c <= n; c++) A[r][c] -= f * A[col][c];
    }
  }
  return A.map((row, i) => row[n] / row[i]);
}
