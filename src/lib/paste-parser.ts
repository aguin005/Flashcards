import type { ExtractedEntry, ExtractionMethod, ExtractionStats, PageText } from '../types';
import { extractPlainText, finishEntries, type ExtractionResult } from './vocabulary-extractor';
import { normalizeText, uid } from './utils';

/**
 * Turns pasted text (notes, a spreadsheet column pair, a Quizlet export, a CSV)
 * into review entries. "auto" runs the same detection used for PDFs; the other
 * formats split exactly where the user says, like Quizlet's import box.
 */

export type PasteFormat = 'auto' | 'tab' | 'comma' | 'custom' | 'blocks';

export const PASTE_FORMATS: { value: PasteFormat; label: string; hint: string }[] = [
  { value: 'auto', label: 'Auto-detect', hint: 'Finds “term: definition”, dashes, tables, and glossary layouts.' },
  { value: 'tab', label: 'Tab between term and definition', hint: 'Copied from a spreadsheet or a Quizlet export. An optional third column becomes the example.' },
  { value: 'comma', label: 'Comma between term and definition (CSV)', hint: 'Quoted fields may contain commas.' },
  { value: 'custom', label: 'Custom separator', hint: 'Each line is split at the first separator you type.' },
  { value: 'blocks', label: 'Term on one line, definition below', hint: 'Leave a blank line between cards.' },
];

export interface PasteOptions {
  format: PasteFormat;
  /** Used by the "custom" format. */
  separator?: string;
}

const HEADER_TERMS = new Set(['term', 'terms', 'word', 'words', 'vocabulary', 'front', 'question', 'concept']);
const HEADER_DEFS = new Set(['definition', 'definitions', 'meaning', 'back', 'answer', 'description']);

export function normalizePastedText(text: string): string {
  return text
    .replace(/^﻿/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[  ]/g, ' ')
    .replace(/[​-‍]/g, '');
}

/** Minimal RFC 4180 CSV parser: quoted fields, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"' && field.trim() === '') {
      field = '';
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

function isHeaderRow(cells: string[]): boolean {
  return cells.length >= 2 && HEADER_TERMS.has(normalizeText(cells[0])) && HEADER_DEFS.has(normalizeText(cells[1]));
}

function entry(term: string, definition: string, example: string, method: ExtractionMethod): ExtractedEntry {
  return {
    id: uid('e'),
    term: term.replace(/\s+/g, ' ').trim(),
    definition: definition.replace(/\s+/g, ' ').trim(),
    example: example.replace(/\s+/g, ' ').trim(),
    page: null,
    selected: false,
    confidence: 'high',
    flags: [],
    method,
  };
}

function rowsToEntries(rows: string[][], method: ExtractionMethod): ExtractedEntry[] {
  const cleaned = rows.map((cells) => cells.map((c) => c.trim())).filter((cells) => cells.some(Boolean));
  if (cleaned.length && isHeaderRow(cleaned[0])) cleaned.shift();
  return cleaned.map(([term = '', definition = '', example = '']) => entry(term, definition, example, method));
}

function splitAtFirst(line: string, separator: string): [string, string] {
  const i = line.indexOf(separator);
  return i === -1 ? [line, ''] : [line.slice(0, i), line.slice(i + separator.length)];
}

function manualEntries(text: string, opts: PasteOptions): ExtractedEntry[] {
  const lines = text.split('\n');
  switch (opts.format) {
    case 'tab':
      return rowsToEntries(lines.map((l) => l.split('\t')), 'table');
    case 'comma':
      return rowsToEntries(parseCsv(text), 'table');
    case 'custom': {
      const sep = opts.separator ?? '';
      if (!sep) return [];
      return rowsToEntries(lines.map((l) => splitAtFirst(l, sep)), 'delimiter');
    }
    case 'blocks':
      return text
        .split(/\n\s*\n/)
        .map((block) => block.split('\n').filter((l) => l.trim()))
        .filter((block) => block.length > 0)
        .map(([term, ...rest]) => entry(term, rest.join(' '), '', 'glossary'));
    default:
      return [];
  }
}

function statsFor(text: string, entries: ExtractedEntry[], duplicatesRemoved: number): ExtractionStats {
  return {
    pageCount: 1,
    pagesWithText: text.trim() ? 1 : 0,
    charCount: text.length,
    removedHeaderFooterLines: 0,
    duplicatesRemoved,
    entries: entries.length,
    flagged: entries.filter((e) => e.flags.length > 0).length,
  };
}

export function parsePastedText(raw: string, opts: PasteOptions): ExtractionResult {
  const text = normalizePastedText(raw);
  if (!text.trim()) return { entries: [], pages: [{ page: 1, text: '' }], stats: statsFor('', [], 0) };
  if (opts.format === 'auto') return extractPlainText(text);
  const pages: PageText[] = [{ page: 1, text }];
  const { entries, duplicatesRemoved } = finishEntries(manualEntries(text, opts), pages);
  return { entries, pages, stats: statsFor(text, entries, duplicatesRemoved) };
}

/** Pick a sensible format for a loaded text file. */
export function formatForFileName(name: string): PasteFormat | null {
  const lower = name.toLowerCase();
  if (lower.endsWith('.csv')) return 'comma';
  if (lower.endsWith('.tsv')) return 'tab';
  return null;
}

export function isTextFile(file: File): boolean {
  return /\.(txt|csv|tsv|md)$/i.test(file.name) || /^text\/(plain|csv|tab-separated-values|markdown)/.test(file.type);
}

/** Tab-separated "term<TAB>definition" lines, the format spreadsheets, Quizlet, and Anki import. */
export function cardsToTsv(cards: { term: string; definition: string }[]): string {
  const clean = (s: string) => s.replace(/[\t\r\n]+/g, ' ').trim();
  return cards.map((c) => `${clean(c.term)}\t${clean(c.definition)}`).join('\n');
}
