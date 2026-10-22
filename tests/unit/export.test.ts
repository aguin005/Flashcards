import { describe, expect, it } from 'vitest';
import type { CardProgress, StudySet } from '../../src/types';
import { buildBackup, buildSetsExport, ImportError, parseImportText, remapSetIds, setToCsv } from '../../src/lib/export';

const set: StudySet = {
  id: 's1',
  title: 'Spanish',
  subject: 'SPAN 101',
  description: 'Animals',
  createdAt: 1,
  updatedAt: 2,
  cards: [
    { id: 'c1', term: 'perro', definition: 'dog', createdAt: 1, starred: true, sourcePage: 3, alternates: ['el perro'] },
    { id: 'c2', term: 'gato', definition: 'cat, "feline"', example: 'El gato duerme.', createdAt: 2 },
  ],
};
const progress: CardProgress[] = [{ cardId: 'c1', setId: 's1', box: 2, reviews: 1, correct: 1, incorrect: 0, streak: 1 }];

describe('export and import', () => {
  it('round-trips a full backup', () => {
    const text = JSON.stringify(buildBackup([set], progress, []));
    const parsed = parseImportText(text);
    expect(parsed.kind).toBe('backup');
    expect(parsed.sets).toEqual([set]);
    expect(parsed.progress).toEqual([{ ...progress[0], lastReviewedAt: undefined, nextReviewAt: undefined, lastResult: undefined }]);
  });

  it('accepts a sets export, a bare array, or a single set, and skips empty cards', () => {
    expect(parseImportText(JSON.stringify(buildSetsExport([set]))).sets).toHaveLength(1);
    expect(parseImportText(JSON.stringify([set, set])).sets).toHaveLength(2);
    const withEmpty = { ...set, cards: [...set.cards, { term: '', definition: '' }] };
    const parsed = parseImportText(JSON.stringify(withEmpty));
    expect(parsed.sets[0].cards).toHaveLength(2);
    expect(parsed.skippedCards).toBe(1);
  });

  it('rejects invalid files with a clear message', () => {
    expect(() => parseImportText('not json')).toThrow(ImportError);
    expect(() => parseImportText('{"hello": 1}')).toThrow(/No study sets/);
    expect(() => parseImportText(JSON.stringify({ format: 'recall-study-backup', version: 99, sets: [set] }))).toThrow(/newer version/);
  });

  it('remaps ids so an imported copy never overwrites the original', () => {
    const { set: copy, progress: p } = remapSetIds(set, progress);
    expect(copy.id).not.toBe(set.id);
    expect(copy.cards.map((c) => c.id)).not.toContain('c1');
    expect(p[0].cardId).toBe(copy.cards[0].id);
    expect(p[0].setId).toBe(copy.id);
  });

  it('escapes CSV fields', () => {
    const csv = setToCsv(set);
    expect(csv.startsWith('﻿term,definition,example,source_page,starred,also_accept')).toBe(true);
    expect(csv).toContain('perro,dog,,3,yes,el perro');
    expect(csv).toContain('gato,"cat, ""feline""",El gato duerme.,,,');
  });
});
