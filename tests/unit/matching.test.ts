import { describe, expect, it } from 'vitest';
import { buildRounds } from '../../src/lib/matching';
import { normalizeText, seededRng } from '../../src/lib/utils';
import { makeCards } from './helpers';

describe('matching rounds', () => {
  const cards = makeCards(Array.from({ length: 13 }, (_, i) => [`Term ${i}`, `Definition ${i}`] as [string, string]));

  it('splits cards into rounds of the requested size and uses every card once', () => {
    const rounds = buildRounds(cards, 6, seededRng(1));
    expect(rounds.map((r) => r.length)).toEqual([6, 7]);
    expect(new Set(rounds.flat().map((c) => c.id)).size).toBe(13);
  });

  it('never puts duplicate terms or definitions in one round', () => {
    const tricky = makeCards([
      ['Cell', 'Basic unit of life'],
      ['cell', 'A small room'],
      ['Organism', 'Basic unit of life.'],
      ['Tissue', 'Group of cells'],
      ['Organ', 'Group of tissues'],
    ]);
    for (let seed = 1; seed < 30; seed++) {
      for (const round of buildRounds(tricky, 4, seededRng(seed))) {
        const terms = round.map((c) => normalizeText(c.term));
        const defs = round.map((c) => normalizeText(c.definition));
        expect(new Set(terms).size).toBe(terms.length);
        expect(new Set(defs).size).toBe(defs.length);
      }
    }
  });
});
