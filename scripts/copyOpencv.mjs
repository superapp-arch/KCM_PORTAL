// Copies @techstark/opencv-js's prebuilt opencv.js (~13MB emscripten/WASM
// glue file) from node_modules into public/vendor/ before `vite build` runs
// (2026-09-09 direct request - production build performance fix), and
// pre-compresses it into .br/.gz variants alongside the plain file
// (2026-09-10 fix - see below).
//
// WHY (copy step): opencv.js used to be reached via a dynamic `import('@techstark/
// opencv-js')` inside cvLoader.ts. That already kept it OUT of the main
// app bundle (Vite/Rollup code-split it into its own chunk, confirmed via
// a prior local build - the initial page load never touched it). But
// Rollup still had to parse, transform, and minify that ~13MB chunk as
// part of the production build itself (the "rendering chunks (3)..." step)
// - fine on a normal dev machine, but on the ~908 MiB EC2 production box
// that step exhausted available memory and the build hung/never finished.
//
// FIX (copy step): opencv.js is already a complete, pre-minified, self-
// contained standalone script (that's literally what OpenCV's own build
// produces - see the package's own README: "The file opencv.js was
// downloaded from https://docs.opencv.org/5.0.0/opencv.js"). Re-running it
// through Vite's bundler/minifier a second time is pure wasted work.
// Serving it as a static asset under public/ instead means Vite copies the
// file byte-for-byte into dist/ with zero parsing/transforming/minifying -
// the expensive step that was hanging the build simply no longer happens.
// cvLoader.ts loads it at runtime via a plain <script> tag (the same
// technique OpenCV.js's own official tutorials use), only when the scanner
// is actually opened - see that file's own header comment.
//
// WHY (compression step, 2026-09-10): confirmed this file was being served
// completely uncompressed (no compression middleware anywhere in server.ts)
// - real employees on a real office/mobile connection were timing out
// waiting for the full 13.3MB (cvLoader.ts's own 45s allowance wasn't
// enough on a slow connection). Measured directly: gzip -9 brings this
// exact file down to ~3.75MB (72% smaller), brotli q11 down to ~2.7MB (80%
// smaller) - both well within what a real connection can finish in well
// under 45s. Pre-compressed here (once, at build time - brotli q11 alone
// takes ~30s on this file, wasted work to repeat on every request) rather
// than compressing on-the-fly per-request (server.ts serves whichever of
// these the browser's Accept-Encoding header supports, falling back to the
// plain file for the rare client that supports neither - see the
// /vendor/opencv.js route in server.ts).
import { existsSync, mkdirSync, copyFileSync, statSync, readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import zlib from 'zlib';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');

const src = join(projectRoot, 'node_modules', '@techstark', 'opencv-js', 'dist', 'opencv.js');
const destDir = join(projectRoot, 'public', 'vendor');
const dest = join(destDir, 'opencv.js');
const destBr = `${dest}.br`;
const destGz = `${dest}.gz`;

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
const sourceChanged = srcSize !== destSize;
if (sourceChanged) {
  copyFileSync(src, dest);
  console.log(`[copyOpencv] Copied opencv.js (${(srcSize / (1024 * 1024)).toFixed(1)} MB) to public/vendor/opencv.js`);
} else {
  console.log('[copyOpencv] public/vendor/opencv.js is already up to date.');
}

// Regenerate the compressed variants whenever the plain file changed, or
// whenever either is simply missing (e.g. the first build after this fix
// was added, or a stray manual delete) - same "only redo the work when it's
// actually stale" idea as the copy step above.
const needsBr = sourceChanged || !existsSync(destBr);
const needsGz = sourceChanged || !existsSync(destGz);

if (needsBr || needsGz) {
  const buf = readFileSync(dest);
  if (needsGz) {
    const gz = zlib.gzipSync(buf, { level: 9 });
    writeFileSync(destGz, gz);
    console.log(`[copyOpencv] Wrote opencv.js.gz (${(gz.length / (1024 * 1024)).toFixed(1)} MB, was ${(buf.length / (1024 * 1024)).toFixed(1)} MB).`);
  }
  if (needsBr) {
    // Max quality (11) - slow (~30s on this file) but this only ever runs
    // once per opencv.js version, not per request or per build once cached.
    const br = zlib.brotliCompressSync(buf, {
      params: {
        [zlib.constants.BROTLI_PARAM_QUALITY]: 11,
        [zlib.constants.BROTLI_PARAM_SIZE_HINT]: buf.length
      }
    });
    writeFileSync(destBr, br);
    console.log(`[copyOpencv] Wrote opencv.js.br (${(br.length / (1024 * 1024)).toFixed(1)} MB, was ${(buf.length / (1024 * 1024)).toFixed(1)} MB).`);
  }
} else {
  console.log('[copyOpencv] Compressed opencv.js.br/.gz already up to date.');
}
