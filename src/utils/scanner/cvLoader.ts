// Lazy OpenCV.js loader for the Petty Cash Invoice Document Scanner
// (2026-09-08 direct request). Nothing in this file runs on app boot - the
// ~13MB @techstark/opencv-js bundle is only fetched the first time someone
// actually opens the scanner (dynamic import, so Vite code-splits it into
// its own chunk - see DocumentScanner.tsx), and only ever loaded once per
// page session after that (the in-flight/resolved promise is cached).
//
// Typed as `any` deliberately - the package's own TS declarations are large
// and not the point of integration here; every call site in this scanner
// already knows exactly which OpenCV APIs it uses (Canny, findContours,
// warpPerspective, CLAHE, etc.) and treats `cv` as an untyped WASM module,
// same as OpenCV.js's own official usage examples in plain JS.
let cvPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (!cvPromise) {
    cvPromise = (async () => {
      const mod: any = await import('@techstark/opencv-js');
      const cvModule = mod?.default ?? mod;
      // The package's default export is either already-resolved (has
      // .Mat on it), a Promise, or an emscripten module object that fires
      // onRuntimeInitialized once its WASM binary finishes instantiating -
      // see the package's own README "Basic Usage" for this exact pattern.
      if (cvModule && typeof cvModule.then === 'function') {
        return await cvModule;
      }
      if (cvModule && cvModule.Mat) {
        return cvModule;
      }
      await new Promise<void>((resolve) => {
        cvModule.onRuntimeInitialized = () => resolve();
      });
      return cvModule;
    })().catch((err) => {
      // Don't cache a failed load - a transient network hiccup on the first
      // attempt shouldn't permanently break the scanner for the rest of the
      // session; the next call to loadOpenCV() retries from scratch.
      cvPromise = null;
      throw err;
    });
  }
  return cvPromise;
}
