import type { DirectionPref, QuestionDirection, StudyCard } from '../types';
import { normalizeText, shuffle, type Rng } from './utils';

export interface QuizOption {
  text: string;
  cardId: string;
}

export interface QuizQuestion {
  id: string;
  card: StudyCard;
  direction: QuestionDirection;
  prompt: string;
  answer: string;
  options: QuizOption[];
  correctIndex: number;
}

export const MAX_OPTIONS = 4;

export function promptFor(card: StudyCard, direction: QuestionDirection): string {
  return direction === 'term-to-definition' ? card.term : card.definition;
}

export function answerFor(card: StudyCard, direction: QuestionDirection): string {
  return direction === 'term-to-definition' ? card.definition : card.term;
}

/**
 * Distractors come only from other cards (same set first). A card is never used
 * as a distractor if its answer text matches the correct answer, or if its
 * prompt text matches this question's prompt, because either would make a
 * second option correct.
 */
export function buildQuestion(
  card: StudyCard,
  pool: readonly StudyCard[],
  direction: QuestionDirection,
  rng: Rng = Math.random,
  maxOptions = MAX_OPTIONS,
): QuizQuestion | null {
  const answer = answerFor(card, direction);
  const prompt = promptFor(card, direction);
  const answerKey = normalizeText(answer);
  const promptKey = normalizeText(prompt);
  if (!answerKey || !promptKey) return null;

  const seen = new Set<string>([answerKey]);
  const sameSet: QuizOption[] = [];
  const otherSets: QuizOption[] = [];

  for (const other of shuffle(pool, rng)) {
    if (other.id === card.id) continue;
    const text = answerFor(other, direction);
    const key = normalizeText(text);
    if (!key || seen.has(key)) continue;
    if (normalizeText(promptFor(other, direction)) === promptKey) continue;
    seen.add(key);
    (other.setId === card.setId ? sameSet : otherSets).push({ text, cardId: other.id });
  }

  const distractors = [...sameSet, ...otherSets].slice(0, maxOptions - 1);
  if (distractors.length === 0) return null;

  const options = shuffle([{ text: answer, cardId: card.id }, ...distractors], rng);
  const correctIndex = options.findIndex((o) => o.cardId === card.id);
  return {
    id: `${card.id}:${direction}`,
    card,
    direction,
    prompt,
    answer,
    options,
    correctIndex,
  };
}

export function pickDirection(pref: DirectionPref, rng: Rng = Math.random): QuestionDirection {
  if (pref === 'mixed') return rng() < 0.5 ? 'term-to-definition' : 'definition-to-term';
  return pref;
}

export function buildQuiz(
  cards: readonly StudyCard[],
  pool: readonly StudyCard[],
  opts: { count: number; direction: DirectionPref; rng?: Rng },
): QuizQuestion[] {
  const rng = opts.rng ?? Math.random;
  const questions: QuizQuestion[] = [];
  for (const card of shuffle(cards, rng)) {
    if (questions.length >= opts.count) break;
    const preferred = pickDirection(opts.direction, rng);
    let q = buildQuestion(card, pool, preferred, rng);
    // In mixed mode, fall back to the other direction if this one has no valid distractors.
    if (!q && opts.direction === 'mixed') {
      q = buildQuestion(
        card,
        pool,
        preferred === 'term-to-definition' ? 'definition-to-term' : 'term-to-definition',
        rng,
      );
    }
    if (q) questions.push(q);
  }
  return questions;
}

/** Rebuild questions for retrying, with freshly shuffled options. */
export function rebuildQuestions(
  previous: readonly QuizQuestion[],
  pool: readonly StudyCard[],
  rng: Rng = Math.random,
): QuizQuestion[] {
  return shuffle(previous, rng)
    .map((q) => buildQuestion(q.card, pool, q.direction, rng))
    .filter((q): q is QuizQuestion => q !== null);
}

/** How many answer options a pool can support (2 to 4), or 0 if a quiz is impossible. */
export function optionCapacity(pool: readonly StudyCard[]): number {
  const defs = new Set(pool.map((c) => normalizeText(c.definition)).filter(Boolean));
  const terms = new Set(pool.map((c) => normalizeText(c.term)).filter(Boolean));
  const n = Math.min(MAX_OPTIONS, Math.max(defs.size, terms.size));
  return n >= 2 ? n : 0;
}
