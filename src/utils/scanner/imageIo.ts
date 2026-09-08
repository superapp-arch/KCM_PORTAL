// Canvas/File <-> OpenCV.js Mat plumbing for the Petty Cash Document Scanner
// (2026-09-08 direct request) - kept separate from the CV algorithms
// themselves so the detector/perspective/enhance modules never need to know
// about File/Blob/canvas at all.

export function loadImageFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Unable to decode this image. It may be corrupted or in an unsupported format.'));
    };
    img.src = url;
  });
}

// Draws the source into a plain <canvas>, optionally downscaled so its
// longest side never exceeds maxDim - used both for the CV "working copy"
// (spec section 8, step 2/3: don't run every CV operation on a raw 20MP
// photo) and, with no maxDim, for a full-resolution copy used for the final
// perspective warp/enhancement and for the untouched "Use Original" save.
export function drawToCanvas(img: HTMLImageElement | HTMLCanvasElement, maxDim?: number): HTMLCanvasElement {
  const srcW = img instanceof HTMLImageElement ? img.naturalWidth : img.width;
  const srcH = img instanceof HTMLImageElement ? img.naturalHeight : img.height;
  let w = srcW;
  let h = srcH;
  if (maxDim && Math.max(w, h) > maxDim) {
    const scale = maxDim / Math.max(w, h);
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

// Caller owns the returned Mat and must call .delete() on it.
export function canvasToMat(cv: any, canvas: HTMLCanvasElement): any {
  return cv.imread(canvas);
}

export function matToCanvas(cv: any, mat: any): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  cv.imshow(canvas, mat);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type = 'image/jpeg', quality = 0.92): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Failed to encode the final image.'))),
      type,
      quality
    );
  });
}

// Manual 90-degree rotation (spec section 12 - only obvious/manual
// rotation is applied; there is no auto-rotation guess here).
export function rotateCanvas90(canvas: HTMLCanvasElement, clockwise: boolean): HTMLCanvasElement {
  const out = document.createElement('canvas');
  out.width = canvas.height;
  out.height = canvas.width;
  const ctx = out.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context is unavailable.');
  if (clockwise) {
    ctx.translate(out.width, 0);
    ctx.rotate(Math.PI / 2);
  } else {
    ctx.translate(0, out.height);
    ctx.rotate(-Math.PI / 2);
  }
  ctx.drawImage(canvas, 0, 0);
  return out;
}
