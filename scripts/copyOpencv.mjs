// Copies @techstark/opencv-js's prebuilt opencv.js (~13MB emscripten/WASM
// glue file) from node_modules into public/vendor/ before `vite build` runs
// (2026-09-09 direct request - production build performance fix).
//
// WHY: opencv.js used to be reached via a dynamic `import('@techstark/
// opencv-js')` inside cvLoader.ts. That already kept it OUT of the main
// app bundle (Vite/Rollup code-split it into its own chunk, confirmed via
// a prior local build - the initial page load never touched it). But
// Rollup still had to parse, transform, and minify that ~13MB chunk as
// part of the production build itself (the "rendering chunks (3)..." step)
// - fine on a normal dev machine, but on the ~908 MiB EC2 production box
// that step exhausted available memory and the build hung/never finished.
//
// FIX: opencv.js is already a complete, pre-minified, self-contained
// standalone script (that's literally what OpenCV's own build produces -
// see the package's own README: "The file opencv.js was downloaded from
// https://docs.opencv.org/5.0.0/opencv.js"). Re-running it through Vite's
// bundler/minifier a second time is pure wasted work. Serving it as a
// static asset under public/ instead means Vite copies the file byte-for-
// byte into dist/ with zero parsing/transforming/minifying - the expensive
// step that was hanging the build simply no longer happens. cvLoader.ts
// loads it at runtime via a plain <script> tag (the same technique
// OpenCV.js's own official tutorials use), only when the scanner is
// actually opened - see that file's own header comment.
import { existsSync, mkdirSync, copyFileSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const src = join(projectRoot, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const destDir = join(projectRoot, 'public', 'vendor');
const dest = join(destDir, 'opencv.js');

if (!existsSync(src)) {
  console.error(
    `[copyOpencv] Could not find ${src}.\n` +
    `[copyOpencv] Run "npm install" first (@techstark/opencv-js must be installed) before building.`
  );
  process.exit(1);
}

mkdirSync(destDir, { recursive: true });

// Skip the copy if the destination already matches the source's size - a
// no-op re-run (e.g. a second local build) shouldn't touch disk again for
// no reason, though the copy itself is a single fs call either way.
const srcSize = statSync(src).size;
const destSize = existsSync(dest) ? statSync(dest).size : -1;
if (srcSize !== destSize) {
  copyFileSync(src, dest);
  console.log(`[copyOpencv] Copied opencv.js (${(srcSize / (1024 * 1024)).toFixed(1)} MB) to public/vendor/opencv.js`);
} else {
  console.log('[copyOpencv] public/vendor/opencv.js is already up to date.');
}
