// Lazy OpenCV.js loader for the Petty Cash Invoice Document Scanner.
// Nothing in this file runs on app boot - opencv.js is only fetched the
// first time someone actually opens the scanner, and only ever loaded once
// per page session after that (the in-flight/resolved promise is cached).
//
// 2026-09-09 production build performance fix: this used to be a dynamic
// `import('@techstark/opencv-js')`. That already kept the ~13MB file out of
// the main app bundle - Vite/Rollup code-split it into its own chunk, never
// touched on normal page load. But Rollup still had to parse/transform/
// minify that entire chunk as part of every `npm run build`, which is what
// was hanging the production build on the ~908 MiB EC2 box at "rendering
// chunks (3)...". opencv.js is already a complete, pre-built, self-
// contained standalone script (produced by OpenCV's own emscripten build -
// see the package's README), so re-minifying it via Vite/Rollup was pure
// wasted, memory-hungry work. It's now served as a plain static asset
// (public/vendor/opencv.js, copied from node_modules by
// scripts/copyOpencv.mjs as part of `npm run build` - see that script's own
// header comment) and loaded here via a runtime <script> tag, the same
// technique OpenCV.js's own official tutorials use - Vite/Rollup never
// parses or minifies it at all, at build time or otherwise.
//
// Public API is unchanged (`loadOpenCV(): Promise<any>`) - every existing
// caller (scanPipeline.ts, DocumentScanner.tsx) needed zero changes.
//
// Typed as `any` deliberately - every call site in this scanner already
// knows exactly which OpenCV APIs it uses (Canny, findContours,
// warpPerspective, CLAHE, etc.) and treats `cv` as an untyped WASM module,
// same as OpenCV.js's own official usage examples in plain JS.
const OPENCV_SCRIPT_SRC = '/vendor/opencv.js';
// 2026-09-09 direct request (100+ invoices/day, a stuck spinner is a real
// throughput problem) - loading+parsing+WASM-compiling a 13MB file can
// occasionally stall (slow/flaky network, a proxy that buffers large
// responses, etc). This hard-caps how long anything ever waits on OpenCV
// before giving up and falling back to manual/original - the scanner must
// never sit on "Detecting document..." indefinitely.
const LOAD_TIMEOUT_MS = 10000;

let cvPromise: Promise<any> | null = null;

export function loadOpenCV(): Promise<any> {
  if (!cvPromise) {
    const loadPromise = new Promise<any>((resolve, reject) => {
      const w = window as any;

      // Already loaded and fully initialized from an earlier call in this
      // session (shouldn't normally happen given the cvPromise cache above,
      // but guards against e.g. some other script on the page also having
      // loaded opencv.js globally).
      if (w.cv && w.cv.Mat) {
        resolve(w.cv);
        return;
      }

      const onScriptError = () => reject(new Error('Failed to load the document scanner engine. Check your connection and try again.'));

      // Wait for OpenCV's WASM runtime to finish initializing - immediately
      // after the <script> tag's own load event, `cv` exists as a
      // skeleton object but isn't ready to use yet (no .Mat etc.) until its
      // WASM binary finishes instantiating, signalled via
      // onRuntimeInitialized - the same official pattern OpenCV.js's own
      // tutorials document for a plain script-tag include.
      const waitForRuntime = () => {
        const cv = w.cv;
        if (!cv) { reject(new Error('OpenCV failed to initialize.')); return; }
        if (cv.Mat) { resolve(cv); return; }
        cv.onRuntimeInitialized = () => resolve(cv);
      };

      const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_SCRIPT_SRC}"]`);
      if (existing) {
        // Another loadOpenCV() call (or a fast-clicking employee reopening
        // the scanner) already added the tag - piggyback on it instead of
        // injecting a duplicate <script>.
        if (w.cv) { waitForRuntime(); return; }
        existing.addEventListener('load', waitForRuntime, { once: true });
        existing.addEventListener('error', onScriptError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = OPENCV_SCRIPT_SRC;
      script.async = true;
      script.onload = waitForRuntime;
      script.onerror = onScriptError;
      document.head.appendChild(script);
    });

    const timeoutPromise = new Promise<any>((_, reject) => {
      window.setTimeout(() => reject(new Error('The document scanner engine took too long to load. You can still use Manual Crop or save the original photo.')), LOAD_TIMEOUT_MS);
    });

    cvPromise = Promise.race([loadPromise, timeoutPromise]).catch((err) => {
      // Don't cache a failed/timed-out load - a transient network hiccup or
      // a one-off slow load shouldn't permanently break the scanner for the
      // rest of the session; the next call to loadOpenCV() retries from
      // scratch (the <script> tag itself, if it does eventually finish
      // loading after the timeout, is harmlessly picked up as "already
      // loaded" by the w.cv.Mat check above on that retry).
      cvPromise = null;
      throw err;
    });
  }
  return cvPromise;
}
