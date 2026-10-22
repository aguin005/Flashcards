// Copies runtime assets from node_modules into public/ so the site serves them itself:
//  - public/pdfjs: PDF.js character maps and standard font data (used for some PDFs)
//  - public/ocr:   the optional OCR engine (tesseract.js worker, WASM core, English model)
// Nothing is fetched from a third-party CDN, and these files only download when needed.
import { copyFileSync, cpSync, existsSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const root = dirname(dirname(fileURLToPath(import.meta.url)));
const out = join(root, 'public', 'ocr');

const pdfjsDir = dirname(require.resolve('pdfjs-dist/package.json'));
for (const sub of ['cmaps', 'standard_fonts']) {
  const target = join(root, 'public', 'pdfjs', sub);
  if (!existsSync(target)) cpSync(join(pdfjsDir, sub), target, { recursive: true });
}
console.log('[assets] PDF.js cmaps and standard fonts ready in public/pdfjs');

const tesseractDir = dirname(require.resolve('tesseract.js/package.json'));
const coreDir = dirname(require.resolve('tesseract.js-core/package.json'));
const langDir = dirname(require.resolve('@tesseract.js-data/eng/package.json'));

const files = [
  [join(tesseractDir, 'dist', 'worker.min.js'), join(out, 'worker.min.js')],
  // LSTM-only builds: plain, SIMD, and relaxed-SIMD. tesseract.js picks one at runtime.
  ...['tesseract-core-lstm.wasm.js', 'tesseract-core-simd-lstm.wasm.js', 'tesseract-core-relaxedsimd-lstm.wasm.js'].map(
    (f) => [join(coreDir, f), join(out, 'core', f)],
  ),
  [join(langDir, '4.0.0_best_int', 'eng.traineddata.gz'), join(out, 'lang', 'eng.traineddata.gz')],
];

let copied = 0;
for (const [from, to] of files) {
  if (!existsSync(from)) {
    console.warn(`[ocr] missing ${from}; OCR will be unavailable`);
    continue;
  }
  mkdirSync(dirname(to), { recursive: true });
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  copyFileSync(from, to);
  copied++;
}
console.log(`[assets] OCR engine ready in public/ocr (${copied} copied)`);
