import type { ParsedPage, TextLine } from '../../types';
import { openPdf, PdfError, PDF_ERROR_TEXT } from '../../lib/pdf-parser';

/**
 * Optional OCR for scanned PDFs, using tesseract.js in a Web Worker.
 * The engine and English model are served by this site (see
 * scripts/copy-ocr-assets.mjs), so the PDF and its page images never leave
 * the browser and no third-party server is contacted.
 */

export interface OcrProgress {
  page: number;
  total: number;
  /** 0-1 progress within the current step. */
  progress: number;
  status: string;
}

function assetUrl(path: string): string {
  return new URL(`${import.meta.env.BASE_URL}${path}`, window.location.href).href;
}

interface Bbox {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}
interface OcrWord {
  text: string;
  bbox: Bbox;
}

/** Convert one OCR line (pixel coordinates, top-left origin) into a PDF-space TextLine. */
function toTextLine(words: OcrWord[], scale: number, pageHeight: number, page: number): TextLine | null {
  const clean = words.filter((w) => w.text.trim());
  if (clean.length === 0) return null;
  const height = Math.max(...clean.map((w) => w.bbox.y1 - w.bbox.y0)) / scale;
  const fontSize = Math.max(6, height * 0.85);
  const cells: { text: string; x: number }[] = [];
  let lastEnd = -Infinity;
  for (const w of clean) {
    const x = w.bbox.x0 / scale;
    if (cells.length === 0 || x - lastEnd > fontSize * 1.8) cells.push({ text: w.text, x });
    else cells[cells.length - 1].text += ` ${w.text}`;
    lastEnd = w.bbox.x1 / scale;
  }
  const bottom = Math.max(...clean.map((w) => w.bbox.y1)) / scale;
  return {
    text: cells.map((c) => c.text).join(' '),
    cells,
    x: cells[0].x,
    endX: lastEnd,
    y: pageHeight - bottom,
    fontSize,
    page,
  };
}

export async function ocrPdf(
  data: ArrayBuffer,
  opts: { password?: string; signal?: AbortSignal; onProgress?: (p: OcrProgress) => void } = {},
): Promise<ParsedPage[]> {
  const doc = await openPdf(data, opts.password);
  const total = doc.numPages;
  let currentPage = 0;

  const { createWorker } = await import('tesseract.js');
  opts.onProgress?.({ page: 0, total, progress: 0, status: 'Loading OCR engine' });
  const worker = await createWorker('eng', 1, {
    workerPath: assetUrl('ocr/worker.min.js'),
    corePath: assetUrl('ocr/core'),
    langPath: assetUrl('ocr/lang'),
    logger: (m: { status: string; progress: number }) => {
      if (currentPage === 0) {
        opts.onProgress?.({ page: 0, total, progress: m.progress, status: 'Loading OCR engine' });
      } else if (m.status === 'recognizing text') {
        opts.onProgress?.({ page: currentPage, total, progress: m.progress, status: 'Recognizing text' });
      }
    },
  });

  const pages: ParsedPage[] = [];
  try {
    for (let i = 1; i <= total; i++) {
      if (opts.signal?.aborted) throw new PdfError('cancelled', PDF_ERROR_TEXT.cancelled.detail);
      currentPage = i;
      opts.onProgress?.({ page: i, total, progress: 0, status: 'Rendering page' });
      const page = await doc.getPage(i);
      const base = page.getViewport({ scale: 1 });
      // Around 2000px wide gives Tesseract enough detail without huge memory use.
      const scale = Math.min(3, Math.max(1.5, 2000 / base.width));
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new PdfError('unknown', 'Your browser could not create a canvas for OCR.');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const { data: result } = await worker.recognize(canvas, {}, { blocks: true, text: true });
      const lines: TextLine[] = [];
      for (const block of result.blocks ?? []) {
        for (const para of block.paragraphs) {
          for (const line of para.lines) {
            const tl = toTextLine(line.words as OcrWord[], scale, base.height, i);
            if (tl) lines.push(tl);
          }
        }
      }
      const charCount = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
      pages.push({ page: i, width: base.width, height: base.height, lines, charCount });
      page.cleanup();
      canvas.width = 0;
      canvas.height = 0;
    }
    return pages;
  } finally {
    await worker.terminate();
    void doc.destroy();
  }
}
