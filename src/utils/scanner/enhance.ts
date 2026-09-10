// Conservative readability enhancement for the Petty Cash Document Scanner
// (2026-09-08 direct request) - illumination normalization + mild sharpening
// only, colour always preserved (spec sections 14-17). CLAHE runs on the
// Lab colour space's L (lightness) channel only, never on the colour
// channels, so stamps/signatures/coloured paper/highlighted text keep their
// actual colour - a plain grayscale/global-contrast pass would wash all of
// that out. Clip limit is deliberately modest (2.0) so handwriting and
// stamps are brightened along with the page, never erased or thresholded
// away like an aggressive "clean scan" filter would do.
export function enhanceMat(cv: any, srcMat: any): any {
  const owned: any[] = [];
  const track = <T,>(m: T): T => { owned.push(m); return m; };

  try {
    const rgb = track(new cv.Mat());
    cv.cvtColor(srcMat, rgb, cv.COLOR_RGBA2RGB);

    const lab = track(new cv.Mat());
    cv.cvtColor(rgb, lab, cv.COLOR_RGB2Lab);

    const channels = track(new cv.MatVector());
    cv.split(lab, channels);
    const L = track(channels.get(0));
    const a = track(channels.get(1));
    const b = track(channels.get(2));

    // 2026-09-10 root-cause fix: cv.createCLAHE (the usual factory helper)
    // does not exist in this OpenCV.js build (confirmed absent from the
    // actual public/vendor/opencv.js binary, not a version fluke) - it was
    // throwing here on every single call, which detectAndProcess's outer
    // try/catch silently swallowed, discarding an already-correctly-found
    // crop and reverting to "no crop" every time. This has likely been
    // true since the feature was first built - unrelated to any of the
    // detection-tuning work above. new cv.CLAHE(...) (the class
    // constructor) IS bound in this build and behaves identically - same
    // algorithm, just a different JS entry point.
    const clahe = new cv.CLAHE(2.0, new cv.Size(8, 8));
    const Leq = track(new cv.Mat());
    try {
      clahe.apply(L, Leq);
    } finally {
      clahe.delete();
    }

    const mergedVec = track(new cv.MatVector());
    mergedVec.push_back(Leq);
    mergedVec.push_back(a);
    mergedVec.push_back(b);
    const labEq = track(new cv.Mat());
    cv.merge(mergedVec, labEq);

    const rgbEq = track(new cv.Mat());
    cv.cvtColor(labEq, rgbEq, cv.COLOR_Lab2RGB);

    // Mild unsharp mask - sharpened = 1.3*original - 0.3*blurred. Deliberately
    // gentle (vs. a stronger 1.5/-0.5 mix) so fine handwritten strokes don't
    // get haloed/exaggerated into noise.
    const softBlur = track(new cv.Mat());
    cv.GaussianBlur(rgbEq, softBlur, new cv.Size(0, 0), 3);
    const sharpened = track(new cv.Mat());
    cv.addWeighted(rgbEq, 1.3, softBlur, -0.3, 0, sharpened);

    const rgba = new cv.Mat();
    cv.cvtColor(sharpened, rgba, cv.COLOR_RGB2RGBA);
    return rgba; // caller owns, must .delete()
  } finally {
    for (const m of owned) {
      try { m.delete(); } catch { /* already freed */ }
    }
  }
}

// Grayscale variant - only used when the employee explicitly picks the
// optional "Grayscale" preview mode (spec section 14: colour stays the
// default, grayscale is opt-in, never forced).
export function toGrayscaleRgba(cv: any, srcMat: any): any {
  const gray = new cv.Mat();
  const rgba = new cv.Mat();
  try {
    cv.cvtColor(srcMat, gray, cv.COLOR_RGBA2GRAY);
    cv.cvtColor(gray, rgba, cv.COLOR_GRAY2RGBA);
    return rgba;
  } finally {
    gray.delete();
  }
}
