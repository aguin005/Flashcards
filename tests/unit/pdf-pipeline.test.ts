import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';
import { buildLines, looksLikePdf, type TextItemLike } from '../../src/lib/pdf-parser';
import { extractVocabulary } from '../../src/lib/vocabulary-extractor';
import type { ParsedPage } from '../../src/types';

const fixture = (name: string) => new Uint8Array(readFileSync(join(__dirname, '..', 'fixtures', name)));

async function parseFixture(name: string, password?: string): Promise<ParsedPage[]> {
  const doc = await pdfjs.getDocument({ data: fixture(name), password, isEvalSupported: false, disableFontFace: true })
    .promise;
  const pages: ParsedPage[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const viewport = page.getViewport({ scale: 1 });
    const content = await page.getTextContent();
    const lines = buildLines(content.items as TextItemLike[], i);
    pages.push({
      page: i,
      width: viewport.width,
      height: viewport.height,
      lines,
      charCount: lines.reduce((n, l) => n + l.text.length, 0),
    });
  }
  await doc.destroy();
  return pages;
}

describe('PDF.js to vocabulary pipeline (real fixture PDFs)', () => {
  it('extracts the expected vocabulary from a multi-format study guide', async () => {
    const pages = await parseFixture('vocab-notes.pdf');
    expect(pages).toHaveLength(3);
    const { entries, stats } = extractVocabulary(pages);
    const selected = entries.filter((e) => e.selected).map((e) => e.term);
    expect(selected).toEqual([
      'Photosynthesis',
      'Osmosis',
      'Diffusion',
      'Mitochondria',
      'Ribosome',
      'Allele',
      'Genotype',
      'Phenotype',
      'Natural selection',
      'Homeostasis',
      'Enzyme',
    ]);
    const get = (t: string) => entries.find((e) => e.term === t)!;
    expect(get('Photosynthesis').definition).toBe(
      'The process by which plants use sunlight, water, and carbon dioxide to make glucose and oxygen.',
    );
    expect(get('Mitochondria').example).toBe('Muscle cells contain many mitochondria.');
    expect(get('Genotype').definition).toBe('The genetic makeup of an organism, including both dominant and recessive alleles.');
    expect(get('Genotype').page).toBe(2);
    expect(get('Homeostasis').page).toBe(3);
    expect(get('Natural selection').flags).toContain('sentence-pattern');
    // Listed without a definition: kept, flagged, not selected.
    expect(get('vacuole').definition).toBe('');
    expect(get('vacuole').selected).toBe(false);
    expect(get('cytoplasm').selected).toBe(false);
    // Headers ("BIO 101 ...") and footers ("Page N of 3") were removed; the duplicate Osmosis was merged.
    expect(stats.removedHeaderFooterLines).toBe(6);
    expect(stats.duplicatesRemoved).toBe(2);
    expect(entries.some((e) => /BIO 101|Page \d/.test(`${e.term} ${e.definition}`))).toBe(false);
  });

  it('opens the password-protected fixture only with the right password', async () => {
    await expect(parseFixture('password-protected.pdf')).rejects.toMatchObject({ name: 'PasswordException', code: 1 });
    await expect(parseFixture('password-protected.pdf', 'wrong')).rejects.toMatchObject({
      name: 'PasswordException',
      code: 2,
    });
    const pages = await parseFixture('password-protected.pdf', 'study123');
    expect(extractVocabulary(pages).entries.length).toBeGreaterThan(5);
  });

  it('finds no text in the image-only fixture', async () => {
    const pages = await parseFixture('scanned-image-only.pdf');
    expect(pages.reduce((n, p) => n + p.charCount, 0)).toBe(0);
  });

  it('rejects corrupted files and non-PDFs', async () => {
    expect(looksLikePdf(fixture('not-really-a.pdf'))).toBe(false);
    expect(looksLikePdf(fixture('corrupted.pdf'))).toBe(true);
    await expect(parseFixture('corrupted.pdf')).rejects.toMatchObject({ name: 'InvalidPDFException' });
  });
});
