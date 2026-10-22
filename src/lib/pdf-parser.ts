import type { ParsedPage, TextLine } from '../types';

/**
 * PDF text extraction with PDF.js, running entirely in the browser.
 *
 * PDF.js returns positioned text fragments. We rebuild them into lines and
 * keep each line's position and font size, because the vocabulary extractor
 * uses layout (indentation, column gaps, spacing) to find term/definition pairs.
 */

type PdfjsModule = typeof import('pdfjs-dist/legacy/build/pdf.mjs');

let pdfjsPromise: Promise<PdfjsModule> | null = null;

/** Lazily load PDF.js and its worker (bundled by Vite as a same-origin module worker). */
export function loadPdfjs(): Promise<PdfjsModule> {
  if (!pdfjsPromise) {
    pdfjsPromise = Promise.all([
      import('pdfjs-dist/legacy/build/pdf.mjs'),
      import('pdfjs-dist/legacy/build/pdf.worker.min.mjs?worker'),
    ])
      .then(([pdfjs, workerModule]) => {
        pdfjs.GlobalWorkerOptions.workerPort = new workerModule.default();
        return pdfjs;
      })
      .catch((err) => {
        pdfjsPromise = null;
        throw err;
      });
  }
  return pdfjsPromise;
}

export type PdfErrorCode =
  | 'empty-file'
  | 'not-pdf'
  | 'corrupted'
  | 'password-required'
  | 'password-incorrect'
  | 'no-text'
  | 'cancelled'
  | 'load-failed'
  | 'unknown';

export class PdfError extends Error {
  constructor(
    readonly code: PdfErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'PdfError';
  }
}

export const PDF_ERROR_TEXT: Record<PdfErrorCode, { title: string; detail: string }> = {
  'empty-file': { title: 'This file is empty', detail: 'The file has 0 bytes. Try downloading or exporting the PDF again.' },
  'not-pdf': {
    title: 'This is not a PDF',
    detail: 'Choose a file that ends in .pdf. Word documents and images need to be saved as PDF first.',
  },
  corrupted: {
    title: 'This PDF looks damaged',
    detail: 'PDF.js could not read the file structure. Try re-downloading it, or open it in a PDF viewer and use "Print to PDF" to create a clean copy.',
  },
  'password-required': {
    title: 'This PDF is password-protected',
    detail: 'Enter the document password to open it. The password is used only in your browser.',
  },
  'password-incorrect': { title: 'Incorrect password', detail: 'That password did not unlock the PDF. Try again.' },
  'no-text': {
    title: 'No selectable text was found',
    detail: 'This looks like a scanned or image-only PDF. Ordinary text extraction cannot read pictures of text.',
  },
  cancelled: { title: 'Processing cancelled', detail: 'You stopped processing this PDF.' },
  'load-failed': {
    title: 'The PDF reader could not start',
    detail: 'The PDF.js engine failed to load. Check your connection and reload the page.',
  },
  unknown: { title: 'Something went wrong', detail: 'The PDF could not be processed.' },
};

export interface ParseOptions {
  password?: string;
  signal?: AbortSignal;
  onProgress?: (done: number, total: number) => void;
}

export interface ParseResult {
  pageCount: number;
  pages: ParsedPage[];
  charCount: number;
}

export function looksLikePdf(bytes: Uint8Array): boolean {
  // The %PDF- header must appear within the first 1024 bytes.
  const head = new TextDecoder('latin1').decode(bytes.subarray(0, 1024));
  return head.includes('%PDF-');
}

function toPdfError(err: unknown): PdfError {
  if (err instanceof PdfError) return err;
  const e = err as { name?: string; code?: number; message?: string };
  if (e?.name === 'PasswordException') {
    // PasswordResponses: NEED_PASSWORD = 1, INCORRECT_PASSWORD = 2
    return e.code === 2
      ? new PdfError('password-incorrect', PDF_ERROR_TEXT['password-incorrect'].detail)
      : new PdfError('password-required', PDF_ERROR_TEXT['password-required'].detail);
  }
  if (e?.name === 'InvalidPDFException' || e?.name === 'FormatError' || e?.name === 'MissingPDFException') {
    return new PdfError('corrupted', PDF_ERROR_TEXT.corrupted.detail);
  }
  return new PdfError('unknown', e?.message || PDF_ERROR_TEXT.unknown.detail);
}

export async function openPdf(data: ArrayBuffer, password?: string) {
  let pdfjs: PdfjsModule;
  try {
    pdfjs = await loadPdfjs();
  } catch {
    throw new PdfError('load-failed', PDF_ERROR_TEXT['load-failed'].detail);
  }
  // PDF.js transfers the buffer to its worker, so hand it a copy.
  const assets = `${import.meta.env.BASE_URL}pdfjs/`;
  const task = pdfjs.getDocument({
    data: new Uint8Array(data.slice(0)),
    password,
    isEvalSupported: false,
    disableFontFace: true,
    cMapUrl: `${assets}cmaps/`,
    cMapPacked: true,
    standardFontDataUrl: `${assets}standard_fonts/`,
  });
  try {
    return await task.promise;
  } catch (err) {
    void task.destroy();
    throw toPdfError(err);
  }
}

export async function parsePdf(data: ArrayBuffer, opts: ParseOptions = {}): Promise<ParseResult> {
  if (data.byteLength === 0) throw new PdfError('empty-file', PDF_ERROR_TEXT['empty-file'].detail);
  if (!looksLikePdf(new Uint8Array(data))) throw new PdfError('not-pdf', PDF_ERROR_TEXT['not-pdf'].detail);

  const doc = await openPdf(data, opts.password);
  const pages: ParsedPage[] = [];
  let charCount = 0;
  try {
    const total = doc.numPages;
    opts.onProgress?.(0, total);
    for (let i = 1; i <= total; i++) {
      if (opts.signal?.aborted) throw new PdfError('cancelled', PDF_ERROR_TEXT.cancelled.detail);
      const page = await doc.getPage(i);
      const viewport = page.getViewport({ scale: 1 });
      const content = await page.getTextContent();
      const lines = buildLines(content.items as TextItemLike[], i);
      const chars = lines.reduce((n, l) => n + l.text.replace(/\s/g, '').length, 0);
      charCount += chars;
      pages.push({ page: i, width: viewport.width, height: viewport.height, lines, charCount: chars });
      page.cleanup();
      opts.onProgress?.(i, total);
    }
    return { pageCount: total, pages, charCount };
  } catch (err) {
    throw toPdfError(err);
  } finally {
    void doc.destroy();
  }
}

// ---------- Line reconstruction ----------

export interface TextItemLike {
  str?: string;
  transform?: number[];
  width?: number;
  height?: number;
  hasEOL?: boolean;
}

/** Gap (in multiples of font size) that separates table columns on one line. */
const CELL_GAP_EM = 1.8;
const SPACE_GAP_EM = 0.12;

const PRIVATE_USE_BULLET = /^[-]/;

export function normalizePdfText(s: string): string {
  return s
    .normalize('NFKC')
    .replace(/­/g, '') // soft hyphen
    .replace(/[  -   　]/g, ' ')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[‐‑‒−]/g, '-')
    .replace(/[•●▪■‣⁃∙◦○□►▸]/g, '•')
    .replace(PRIVATE_USE_BULLET, '•')
    .replace(/[-]/g, '');
}

interface WorkingLine {
  cells: { text: string; x: number; end: number }[];
  x: number;
  y: number;
  end: number;
  fontSize: number;
}

function finishLine(l: WorkingLine, page: number): TextLine | null {
  const cells = l.cells
    .map((c) => ({ text: c.text.replace(/\s+/g, ' ').trim(), x: c.x }))
    .filter((c) => c.text.length > 0);
  if (cells.length === 0) return null;
  return {
    text: cells.map((c) => c.text).join(' '),
    cells,
    x: cells[0].x,
    endX: l.end,
    y: l.y,
    fontSize: l.fontSize,
    page,
  };
}

function appendItem(line: WorkingLine, text: string, x: number, width: number, fontSize: number) {
  const em = Math.max(fontSize, line.fontSize);
  const gap = x - line.end;
  const last = line.cells[line.cells.length - 1];
  if (gap > em * CELL_GAP_EM) {
    line.cells.push({ text, x, end: x + width });
  } else {
    const needsSpace = gap > em * SPACE_GAP_EM && !last.text.endsWith(' ') && !text.startsWith(' ');
    last.text += (needsSpace ? ' ' : '') + text;
    last.end = Math.max(last.end, x + width);
  }
  line.end = Math.max(line.end, x + width);
  line.fontSize = Math.max(line.fontSize, fontSize);
}

/**
 * Group PDF.js text items into lines, preserving the content-stream order
 * (which keeps multi-column documents in reading order for most producers).
 * Falls back to top-to-bottom sorting when the stream order is scrambled.
 */
export function buildLines(items: TextItemLike[], page: number): TextLine[] {
  const working: WorkingLine[] = [];
  let cur: WorkingLine | null = null;

  for (const item of items) {
    if (typeof item.str !== 'string' || !item.transform) continue;
    const text = normalizePdfText(item.str);
    if (!text.trim()) continue;
    const [, , c, d, x, y] = item.transform;
    const fontSize = Math.hypot(c, d) || item.height || 10;
    const width = item.width ?? text.length * fontSize * 0.5;

    if (cur) {
      const em = Math.max(fontSize, cur.fontSize);
      const sameBaseline = Math.abs(y - cur.y) <= em * 0.45;
      if (sameBaseline && x >= cur.end - em * 0.5) {
        appendItem(cur, text, x, width, fontSize);
        continue;
      }
      // Fake-bold text is often drawn twice at almost the same spot; drop the copy.
      if (sameBaseline && cur.cells.some((cell) => Math.abs(cell.x - x) < 2 && cell.text.trim().startsWith(text.trim()))) {
        continue;
      }
      working.push(cur);
    }
    cur = { cells: [{ text, x, end: x + width }], x, y, end: x + width, fontSize };
  }
  if (cur) working.push(cur);

  let ordered = working;
  if (isScrambled(working)) ordered = sortAndMerge(working);

  return ordered.map((l) => finishLine(l, page)).filter((l): l is TextLine => l !== null);
}

function isScrambled(lines: WorkingLine[]): boolean {
  if (lines.length < 8) return false;
  let upward = 0;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].y - lines[i - 1].y > lines[i].fontSize * 2) upward++;
  }
  // A few upward jumps are normal (new columns, sidebars); many mean random order.
  return upward / (lines.length - 1) > 0.25;
}

function sortAndMerge(lines: WorkingLine[]): WorkingLine[] {
  // Group lines into baseline bands from top to bottom, then order each band left to right.
  const sorted = [...lines].sort((a, b) => b.y - a.y);
  const bands: WorkingLine[][] = [];
  for (const l of sorted) {
    const band = bands[bands.length - 1];
    if (band && Math.abs(band[0].y - l.y) <= Math.max(band[0].fontSize, l.fontSize) * 0.45) band.push(l);
    else bands.push([l]);
  }
  return bands.map((band) => {
    band.sort((a, b) => a.x - b.x);
    const merged: WorkingLine = { ...band[0], cells: band[0].cells.map((c) => ({ ...c })) };
    for (const l of band.slice(1)) {
      for (const cell of l.cells) appendItem(merged, cell.text, cell.x, cell.end - cell.x, l.fontSize);
    }
    return merged;
  });
}
