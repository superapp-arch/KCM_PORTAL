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
// 2026-09-09: this hard-caps how long anything ever waits on OpenCV before
// giving up and falling back to manual/original - the scanner must never
// sit on "Detecting document..." indefinitely if the network genuinely
// stalls. Raised from an initial 10s (2026-09-09 direct request) after that
// turned out to fire on real office connections that simply take longer
// than 10s for a ~13MB FIRST download - the file is cached by the browser
// for a year after that (see server.ts's own /vendor static route), so
// this long a wait only ever happens once per browser, not once per scan.
//
// 2026-09-10: raised again, from 45s to 90s. The real fix for a slow first
// load was serving this file compressed at all - it turned out to be
// served completely uncompressed (confirmed: no compression anywhere on
// the server), so every "first load" was a full 13.3MB transfer instead of
// the ~2.7MB brotli/~3.75MB gzip this exact file compresses down to (see
// scripts/copyOpencv.mjs and server.ts's /vendor/opencv.js route) - that
// alone should make 45s enough again for the vast majority of real
// connections. This timeout is raised further purely as safety margin on
// top of that fix, for a genuinely poor connection, not a replacement for
// it - the two are complementary, not alternatives.
const LOAD_TIMEOUT_MS = 90000;

// 2026-09-23 root-cause fix for the permanent "Loading scanner engine (first
// time only)..." state: the bundled opencv.js is OpenCV 5.0, an Emscripten
// MODULARIZE build - its UMD wrapper does `root.cv = factory()`, and that
// factory returns a PROMISE of the ready module, not the module itself
// (verified in a real Chrome against public/vendor/opencv.js: `window.cv
// instanceof Promise === true`, no `.Mat`, and the awaited value has `.Mat`
// ~300ms later). The old code only knew the OpenCV 4.x contract - "cv
// exists, wait for cv.onRuntimeInitialized" - and assigned that callback
// onto the Promise object, where nothing ever calls it. So loadOpenCV()
// never resolved on its own; every scan sat on the loading message until
// the 90s timeout above, then silently fell back - and the next scan did it
// all over again. Both contracts are handled below.
//
// Once the script itself has loaded, the WASM runtime normally initializes
// in well under a second; this separate, shorter cap covers only that step
// (a corrupt/unsupported WASM, a runtime that never signals ready), so a
// genuinely broken engine surfaces as a clear failure quickly instead of
// waiting out the full download allowance.
const INIT_TIMEOUT_MS = 30000;

let cvPromise: Promise<any> | null = null;
let loadedCv: any = null;

// The ready OpenCV module if it has already finished loading in this page
// session, otherwise null - lets callers (Manual Crop, grayscale) use OpenCV
// when it's there without ever blocking on a still-running download.
export function getLoadedOpenCV(): any {
  return loadedCv;
}

export function loadOpenCV(): Promise<any> {
  if (loadedCv) return Promise.resolve(loadedCv);
  if (!cvPromise) {
    const startedAt = performance.now();
    console.debug('[SCANNER] initialization started');
    let initTimer: number | undefined;

    const loadPromise = new Promise<any>((resolve, reject) => {
      const w = window as any;
      console.debug('[SCANNER] initialization promise created');

      const done = (cv: any) => {
        window.clearTimeout(initTimer);
        loadedCv = cv;
        console.debug(`[SCANNER] initialization completed in ${Math.round(performance.now() - startedAt)}ms`);
        resolve(cv);
      };
      const fail = (err: unknown) => {
        window.clearTimeout(initTimer);
        reject(err instanceof Error ? err : new Error(String(err)));
      };

      // Already loaded and fully initialized (e.g. some other script on the
      // page loaded opencv.js globally).
      if (w.cv && w.cv.Mat) {
        done(w.cv);
        return;
      }

      const onScriptError = () => fail(new Error('Failed to load the document scanner engine. Check your connection and try again.'));

      // Called once the <script> has executed - resolves via whichever
      // readiness contract this opencv.js build actually uses.
      const waitForRuntime = () => {
        const cv = w.cv;
        console.debug('[SCANNER] engine script loaded; cv is', cv instanceof Promise ? 'a Promise (modularized build)' : typeof cv);
        if (!cv) { fail(new Error('The document scanner engine loaded but did not initialize.')); return; }
        if (cv.Mat) { done(cv); return; }

        initTimer = window.setTimeout(
          () => fail(new Error('The document scanner engine did not finish initializing.')),
          INIT_TIMEOUT_MS
        );

        if (typeof cv.then === 'function') {
          // OpenCV 4.10+/5.x modularized build: window.cv is a Promise of
          // the ready module. Replace the global with the resolved module so
          // any later lookup (incl. the `w.cv.Mat` check above) sees it.
          cv.then(
            (mod: any) => {
              if (mod && mod.Mat) { w.cv = mod; done(mod); }
              else fail(new Error('The document scanner engine initialized without its core API.'));
            },
            (err: unknown) => fail(err)
          );
          return;
        }

        // Legacy OpenCV 4.x build: `cv` is the not-yet-ready Module object.
        const previous = cv.onRuntimeInitialized;
        cv.onRuntimeInitialized = () => {
          try { previous?.(); } catch { /* ignore a foreign callback's error */ }
          done(cv);
        };
      };

      const existing = document.querySelector<HTMLScriptElement>(`script[src="${OPENCV_SCRIPT_SRC}"]`);
      if (existing) {
        // An earlier attempt already added the tag - piggyback on it instead
        // of injecting a duplicate <script>.
        if (w.cv) { waitForRuntime(); return; }
        // Finished loading yet never defined cv - its load event won't fire
        // again, so waiting on it would hang; fail now instead.
        if (existing.dataset.loaded === '1') { waitForRuntime(); return; }
        existing.addEventListener('load', waitForRuntime, { once: true });
        existing.addEventListener('error', onScriptError, { once: true });
        return;
      }

      const script = document.createElement('script');
      script.src = OPENCV_SCRIPT_SRC;
      script.async = true;
      script.onload = () => {
        script.dataset.loaded = '1';
        waitForRuntime();
      };
      script.onerror = () => {
        // Remove the failed tag so the next attempt injects a fresh one -
        // left in place, a retry would wait on an error event that has
        // already fired (verified: that retry hung until LOAD_TIMEOUT_MS).
        script.remove();
        onScriptError();
      };
      document.head.appendChild(script);
    });

    let loadTimer: number | undefined;
    const timeoutPromise = new Promise<any>((_, reject) => {
      loadTimer = window.setTimeout(() => reject(new Error('The document scanner engine took too long to load. You can still use Manual Crop or save the original photo.')), LOAD_TIMEOUT_MS);
    });

    cvPromise = Promise.race([loadPromise, timeoutPromise])
      .then((cv) => {
        window.clearTimeout(loadTimer);
        return cv;
      })
      .catch((err) => {
        window.clearTimeout(loadTimer);
        console.error('[SCANNER] initialization failed', err);
        // Don't cache a failed/timed-out load - a transient network hiccup
        // shouldn't permanently break the scanner for the rest of the
        // session; the next call retries (an already-loaded <script> is
        // picked up via the `existing` branch above rather than re-added).
        cvPromise = null;
        throw err;
      });
  }
  return cvPromise;
}
