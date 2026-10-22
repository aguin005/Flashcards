import { describe, expect, it } from 'vitest';
import { buildQuestion, buildQuiz, optionCapacity, rebuildQuestions } from '../../src/lib/quiz';
import { normalizeText, seededRng } from '../../src/lib/utils';
import { makeCards } from './helpers';

const cards = makeCards([
  ['Mitosis', 'Cell division producing two identical daughter cells'],
  ['Meiosis', 'Cell division producing four gametes'],
  ['Osmosis', 'Diffusion of water across a membrane'],
  ['Diffusion', 'Movement from high to low concentration'],
  ['Enzyme', 'A protein that speeds up a reaction'],
  ['Ribosome', 'Site of protein synthesis'],
]);

describe('quiz generation', () => {
  it('builds four unique options with exactly one correct answer', () => {
    for (let seed = 1; seed < 50; seed++) {
      const rng = seededRng(seed);
      const q = buildQuestion(cards[0], cards, 'term-to-definition', rng)!;
      expect(q.options).toHaveLength(4);
      const keys = q.options.map((o) => normalizeText(o.text));
      expect(new Set(keys).size).toBe(4);
      expect(q.options.filter((o) => o.text === cards[0].definition)).toHaveLength(1);
      expect(q.options[q.correctIndex].text).toBe(cards[0].definition);
    }
  });

  it('randomizes the position of the correct answer', () => {
    const positions = new Set<number>();
    for (let seed = 1; seed < 40; seed++) {
      positions.add(buildQuestion(cards[1], cards, 'definition-to-term', seededRng(seed))!.correctIndex);
    }
    expect(positions.size).toBeGreaterThan(2);
  });

  it('only uses other cards from the set as distractors', () => {
    const q = buildQuestion(cards[2], cards, 'definition-to-term', seededRng(3))!;
    const terms = new Set(cards.map((c) => c.term));
    q.options.forEach((o) => expect(terms.has(o.text)).toBe(true));
  });

  it('uses fewer options when the set is small', () => {
    const small = cards.slice(0, 2);
    const q = buildQuestion(small[0], small, 'term-to-definition', seededRng(1))!;
    expect(q.options).toHaveLength(2);
    expect(optionCapacity(small)).toBe(2);
    expect(buildQuestion(small[0], small.slice(0, 1), 'term-to-definition')).toBeNull();
    expect(optionCapacity(small.slice(0, 1))).toBe(0);
  });

  it('skips distractors that would create a second correct answer', () => {
    const tricky = makeCards([
      ['Cell', 'Basic unit of life'],
      ['cell', 'A small room in a prison'],
      ['Organism', 'Basic unit of life.'],
      ['Tissue', 'Group of similar cells'],
    ]);
    const q = buildQuestion(tricky[0], tricky, 'term-to-definition', seededRng(7))!;
    const texts = q.options.map((o) => o.text);
    // Same term with a different definition would also be "correct" for the prompt "Cell".
    expect(texts).not.toContain('A small room in a prison');
    // A duplicate of the correct definition (ignoring punctuation) must not appear.
    expect(texts).not.toContain('Basic unit of life.');
    expect(q.options.filter((o) => normalizeText(o.text) === normalizeText('Basic unit of life'))).toHaveLength(1);
  });

  it('respects the requested question count and retry rebuild', () => {
    const quiz = buildQuiz(cards, cards, { count: 4, direction: 'mixed', rng: seededRng(9) });
    expect(quiz).toHaveLength(4);
    expect(new Set(quiz.map((q) => q.card.id)).size).toBe(4);
    const retry = rebuildQuestions(quiz.slice(0, 2), cards, seededRng(10));
    expect(retry).toHaveLength(2);
    retry.forEach((q) => expect(q.options[q.correctIndex].cardId).toBe(q.card.id));
  });
});
