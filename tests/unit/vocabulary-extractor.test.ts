import { describe, expect, it } from 'vitest';
import type { ParsedPage, TextLine } from '../../src/types';
import {
  extractFromPlainText,
  extractVocabulary,
  isPlausibleTerm,
  joinLines,
  removeHeadersAndFooters,
} from '../../src/lib/vocabulary-extractor';
import { buildLines } from '../../src/lib/pdf-parser';

/** Build a page from simple line specs: [text, x?, gapBefore?] */
function page(n: number, specs: (string | [string, number] | [string, number, number])[], height = 792): ParsedPage {
  let y = 740;
  const lines: TextLine[] = [];
  for (const spec of specs) {
    const [text, x = 72, gap = 14] = typeof spec === 'string' ? [spec] : spec;
    y -= gap;
    const cells = text.split(' | ').map((t, i) => ({ text: t, x: x + i * 160 }));
    const endX = cells[cells.length - 1].x + cells[cells.length - 1].text.length * 5.5;
    lines.push({ text: cells.map((c) => c.text).join(' '), cells, x, endX, y, fontSize: 11, page: n });
  }
  return { page: n, width: 612, height, lines, charCount: specs.length * 20 };
}

const byTerm = <T extends { term: string }>(entries: T[], term: string) => entries.find((e) => e.term === term);

describe('vocabulary extraction', () => {
  it('detects colon, dash, en dash, em dash, and equals formats with bullets and numbers', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Photosynthesis: The process plants use to turn light into chemical energy.',
        '• Osmosis - The diffusion of water across a membrane.',
        '2. Diffusion – Movement of particles from high to low concentration.',
        'Mitochondria — The organelle that produces ATP.',
        'Catalyst—A substance that speeds up a reaction.',
        'a) Enzyme = A biological catalyst.',
      ]),
    ]);
    expect(entries.map((e) => e.term)).toEqual([
      'Photosynthesis',
      'Osmosis',
      'Diffusion',
      'Mitochondria',
      'Catalyst',
      'Enzyme',
    ]);
    expect(byTerm(entries, 'Osmosis')!.definition).toBe('The diffusion of water across a membrane.');
    expect(entries.every((e) => e.page === 1 && e.selected && e.confidence === 'high')).toBe(true);
  });

  it('joins wrapped definitions and fixes end-of-line hyphenation', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Homeostasis: the tendency of an organism to maintain stable internal',
        'conditions despite changes in its environ-',
        'ment.',
        'Metabolism: all chemical reactions in a cell.',
      ]),
    ]);
    expect(entries).toHaveLength(2);
    expect(entries[0].definition).toBe(
      'the tendency of an organism to maintain stable internal conditions despite changes in its environment.',
    );
  });

  it('removes repeated headers, footers, and page numbers', () => {
    const pages = [1, 2, 3].map((n) =>
      page(n, [
        ['BIO 101 Study Guide', 72, 0],
        [`Term${n}: Definition number ${n} for this page.`, 72, 40],
        ['Some body text here that is not a header.', 72, 14],
        [`Page ${n} of 3`, 280, 620],
      ]),
    );
    const { pages: cleaned, removed } = removeHeadersAndFooters(pages);
    expect(removed).toBe(6);
    expect(cleaned[0].lines.map((l) => l.text)).not.toContain('BIO 101 Study Guide');
    const { entries, stats } = extractVocabulary(pages);
    expect(entries.map((e) => e.term)).toEqual(['Term1', 'Term2', 'Term3']);
    expect(entries[1].page).toBe(2);
    expect(stats.removedHeaderFooterLines).toBe(6);
  });

  it('removes exact duplicates and flags conflicting ones', () => {
    const { entries, stats } = extractVocabulary([
      page(1, ['Atom: The smallest unit of matter.', 'Ion: A charged atom.', 'Atom: The smallest unit of matter.']),
      page(2, ['Ion: An atom that gained or lost electrons.']),
    ]);
    expect(stats.duplicatesRemoved).toBe(1);
    const ions = entries.filter((e) => e.term === 'Ion');
    expect(ions).toHaveLength(2);
    expect(ions.every((e) => e.flags.includes('duplicate'))).toBe(true);
    expect(ions.filter((e) => e.selected)).toHaveLength(1);
  });

  it('reads two-column tables, skipping the header row and joining wrapped cells', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Term | Definition',
        'Allele | A variant form of a gene.',
        'Genotype | The genetic makeup of an organism,',
        ['including all of its alleles.', 232],
        'Phenotype | Observable traits.',
      ]),
    ]);
    expect(entries.map((e) => e.term)).toEqual(['Allele', 'Genotype', 'Phenotype']);
    expect(byTerm(entries, 'Genotype')!.definition).toBe(
      'The genetic makeup of an organism, including all of its alleles.',
    );
    expect(entries.every((e) => e.method === 'table')).toBe(true);
  });

  it('reads glossary sections with terms on their own lines', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Glossary',
        'Biome',
        'A large community of plants and animals in a major habitat.',
        'Ecosystem',
        'A community of organisms interacting with their environment,',
        'including nonliving parts.',
      ]),
    ]);
    expect(entries.map((e) => e.term)).toEqual(['Biome', 'Ecosystem']);
    expect(entries[1].definition).toBe(
      'A community of organisms interacting with their environment, including nonliving parts.',
    );
    expect(entries[0].method).toBe('glossary');
  });

  it('pairs a term line with an indented definition and flags it', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Some introduction paragraph about the chapter topic.',
        'Tundra',
        ['A cold, treeless region with permafrost.', 100],
        'Taiga',
        ['A forest of coniferous trees in cold climates.', 100],
      ]),
    ]);
    const tundra = byTerm(entries, 'Tundra')!;
    expect(tundra.definition).toBe('A cold, treeless region with permafrost.');
    expect(tundra.flags).toContain('layout-inferred');
  });

  it('attaches example lines to the previous entry', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Simile: A comparison using like or as.',
        'Example: Her smile was like sunshine.',
        'Metaphor: A direct comparison. Example: Time is a thief.',
      ]),
    ]);
    expect(byTerm(entries, 'Simile')!.example).toBe('Her smile was like sunshine.');
    expect(byTerm(entries, 'Metaphor')!.definition).toBe('A direct comparison.');
    expect(byTerm(entries, 'Metaphor')!.example).toBe('Time is a thief.');
  });

  it('keeps listed terms without definitions flagged, and finds definitions in prose when present', () => {
    const { entries } = extractVocabulary([
      page(1, ['Key terms: entropy, enthalpy, free energy']),
      page(2, [
        'In this chapter we study energy. Entropy is a measure of disorder in a system. Enthalpy is measured in joules.',
      ]),
    ]);
    // Merged with the definitional sentence found in the text, but left unselected for review.
    const entropy = byTerm(entries, 'entropy')!;
    expect(entropy.definition).toBe('a measure of disorder in a system.');
    expect(entropy.flags).toContain('sentence-pattern');
    expect(entropy.selected).toBe(false);
    const enthalpy = byTerm(entries, 'enthalpy')!;
    expect(enthalpy.definition).toBe('measured in joules.');
    expect(enthalpy.flags).toContain('found-elsewhere');
    expect(enthalpy.selected).toBe(false);
    const free = byTerm(entries, 'free energy')!;
    expect(free.definition).toBe('');
    expect(free.flags).toContain('no-definition');
    expect(free.selected).toBe(false);
  });

  it('does not merge consecutive lowercase entries that lack end punctuation', () => {
    const { entries } = extractVocabulary([
      page(1, ['osmosis: diffusion of water', 'diffusion: movement of particles', 'enzyme - a protein catalyst']),
    ]);
    expect(entries.map((e) => e.term)).toEqual(['osmosis', 'diffusion', 'enzyme']);
  });

  it('detects definitional sentences with confidence levels', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Inflation refers to a general increase in prices over time. The study of how people choose under scarcity is called economics.',
        'A market is a place where buyers and sellers meet to trade goods.',
        'This is a sentence that should not become a term.',
      ]),
    ]);
    const inflation = byTerm(entries, 'Inflation')!;
    expect(inflation.definition).toBe('a general increase in prices over time.');
    expect(inflation.confidence).toBe('medium');
    expect(byTerm(entries, 'economics')!.definition).toBe('The study of how people choose under scarcity');
    const market = byTerm(entries, 'market')!;
    expect(market.confidence).toBe('low');
    expect(market.selected).toBe(false);
    expect(entries.find((e) => e.term.startsWith('This'))).toBeUndefined();
  });

  it('ignores labels, dates, times, and URLs that use colons', () => {
    const { entries } = extractVocabulary([
      page(1, [
        'Name: ____________',
        'Date: October 3',
        'Note: Study these for the exam.',
        'Meeting at 10:30 in room 4.',
        'See https://example.com for more.',
        'Figure 3: A diagram of the cell.',
      ]),
    ]);
    expect(entries).toHaveLength(0);
  });

  it('handles dictionary-style part-of-speech entries', () => {
    const { entries } = extractVocabulary([page(1, ['abate (v.) to become less intense', 'candid (adj.) truthful and straightforward'])]);
    expect(entries.map((e) => [e.term, e.definition])).toEqual([
      ['abate', 'to become less intense'],
      ['candid', 'truthful and straightforward'],
    ]);
  });

  it('extracts from pasted plain text with tabs', () => {
    const entries = extractFromPlainText('cell\tbasic unit of life\nnucleus\tcontrol center of the cell\n\nATP: energy currency');
    expect(entries.map((e) => e.term)).toEqual(['cell', 'nucleus', 'ATP']);
    expect(entries[0].page).toBeNull();
  });

  it('term plausibility rules', () => {
    expect(isPlausibleTerm('Cell membrane')).toBe(true);
    expect(isPlausibleTerm('It is important')).toBe(false);
    expect(isPlausibleTerm('Chapter 4')).toBe(false);
    expect(isPlausibleTerm('Theory of the')).toBe(false);
    expect(isPlausibleTerm('12:30')).toBe(false);
    expect(joinLines(['self-', 'esteem'])).toBe('selfesteem');
  });
});

describe('PDF line reconstruction', () => {
  const item = (str: string, x: number, y: number, width: number, size = 10) => ({
    str,
    transform: [size, 0, 0, size, x, y],
    width,
    height: size,
  });

  it('merges items on one baseline, adds spaces, and splits wide gaps into cells', () => {
    const lines = buildLines(
      [
        item('Photo', 72, 700, 25),
        item('synthesis', 97, 700, 40),
        item('is', 140, 700, 8),
        item('Allele', 72, 680, 30),
        item('A variant of a gene', 250, 680, 90),
      ],
      1,
    );
    expect(lines).toHaveLength(2);
    expect(lines[0].text).toBe('Photosynthesis is');
    expect(lines[1].cells.map((c) => c.text)).toEqual(['Allele', 'A variant of a gene']);
  });

  it('drops fake-bold duplicate draws and normalizes ligatures and bullets', () => {
    const lines = buildLines([item('Term', 72, 700, 20), item('Term', 72.3, 700, 20), item(' ﬁnal', 72, 680, 20)], 1);
    expect(lines.map((l) => l.text)).toEqual(['Term', '• final']);
  });

  it('sorts scrambled content streams top to bottom', () => {
    const ys = [600, 700, 500, 680, 520, 660, 540, 640, 560, 620];
    const lines = buildLines(ys.map((y) => item(`L${y}`, 72, y, 20)), 1);
    expect(lines.map((l) => l.text)).toEqual([...ys].sort((a, b) => b - a).map((y) => `L${y}`));
  });
});
