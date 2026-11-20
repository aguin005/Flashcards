import { describe, expect, it } from 'vitest';
import { cardsToTsv, formatForFileName, parseCsv, parsePastedText } from '../../src/lib/paste-parser';

const pairs = (text: string, format: Parameters<typeof parsePastedText>[1]['format'], separator?: string) =>
  parsePastedText(text, { format, separator }).entries.map((e) => [e.term, e.definition, e.example]);

describe('paste parser', () => {
  it('auto-detects mixed formats in pasted notes', () => {
    const text = 'Osmosis: diffusion of water across a membrane.\n• Enzyme - a protein that speeds up reactions\nATP\tenergy currency of the cell';
    const { entries, pages, stats } = parsePastedText(text, { format: 'auto' });
    expect(entries.map((e) => e.term)).toEqual(['Osmosis', 'Enzyme', 'ATP']);
    expect(entries.every((e) => e.page === null && e.selected)).toBe(true);
    expect(pages).toEqual([{ page: 1, text }]);
    expect(stats.entries).toBe(3);
  });

  it('does not merge a following line into a table row unless it lines up with the definition column', () => {
    const { entries } = parsePastedText('ATP\tenergy currency of the cell\nvacuole', { format: 'auto' });
    expect(entries.map((e) => [e.term, e.definition])).toEqual([['ATP', 'energy currency of the cell']]);
  });

  it('splits spreadsheet columns on tabs, skips a header row, and keeps a third column as the example', () => {
    const text = 'Term\tDefinition\nperro\tdog\tEl perro ladra.\ngato\tcat\n\n';
    expect(pairs(text, 'tab')).toEqual([
      ['perro', 'dog', 'El perro ladra.'],
      ['gato', 'cat', ''],
    ]);
  });

  it('parses CSV with quoted commas, quotes, and line breaks', () => {
    const text = 'term,definition\nmitosis,"cell division, producing two cells"\n"say ""hi""",greeting\nnote,"line one\nline two"';
    expect(pairs(text, 'comma')).toEqual([
      ['mitosis', 'cell division, producing two cells', ''],
      ['say "hi"', 'greeting', ''],
      ['note', 'line one line two', ''],
    ]);
    expect(parseCsv('a,b\r\n'.replace('\r', ''))).toEqual([['a', 'b']]);
  });

  it('splits at the first custom separator only', () => {
    expect(pairs('E = mc^2 = energy\nF = ma', 'custom', ' = ')).toEqual([
      ['E', 'mc^2 = energy', ''],
      ['F', 'ma', ''],
    ]);
    expect(pairs('anything', 'custom', '')).toEqual([]);
  });

  it('reads term-then-definition blocks separated by blank lines', () => {
    const text = 'Photosynthesis\nHow plants make food\nfrom sunlight.\n\n\nRespiration\nHow cells release energy.';
    expect(pairs(text, 'blocks')).toEqual([
      ['Photosynthesis', 'How plants make food from sunlight.', ''],
      ['Respiration', 'How cells release energy.', ''],
    ]);
  });

  it('flags rows without a definition and leaves them unselected, and merges duplicates', () => {
    const { entries, stats } = parsePastedText('cell\tbasic unit of life\nnucleus\ncell\tbasic unit of life', { format: 'tab' });
    expect(entries.map((e) => e.term)).toEqual(['cell', 'nucleus']);
    const nucleus = entries[1];
    expect(nucleus.flags).toContain('no-definition');
    expect(nucleus.selected).toBe(false);
    expect(stats.duplicatesRemoved).toBe(1);
  });

  it('normalizes Windows line endings, BOMs, and non-breaking spaces', () => {
    expect(pairs('﻿a b\tc\r\nd\te\r\n', 'tab')).toEqual([
      ['a b', 'c', ''],
      ['d', 'e', ''],
    ]);
    expect(parsePastedText('   \n ', { format: 'auto' }).entries).toEqual([]);
  });

  it('picks a format from a file name and exports cards as TSV', () => {
    expect(formatForFileName('Unit3.CSV')).toBe('comma');
    expect(formatForFileName('list.tsv')).toBe('tab');
    expect(formatForFileName('notes.txt')).toBeNull();
    expect(cardsToTsv([{ term: 'a\tb', definition: 'line\none' }])).toBe('a b\tline one');
  });
});
