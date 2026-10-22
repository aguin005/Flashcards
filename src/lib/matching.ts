import type { StudyCard } from '../types';
import { normalizeText, shuffle, type Rng } from './utils';

/**
 * Split cards into rounds, never putting two cards with the same term or the
 * same definition in one round (that would make a pairing ambiguous).
 */
export function buildRounds(cards: StudyCard[], pairs: number, rng: Rng = Math.random): StudyCard[][] {
  const rounds: StudyCard[][] = [];
  let remaining = shuffle(cards, rng);
  while (remaining.length > 0) {
    const round: StudyCard[] = [];
    const terms = new Set<string>();
    const defs = new Set<string>();
    const leftover: StudyCard[] = [];
    for (const c of remaining) {
      const t = normalizeText(c.term);
      const d = normalizeText(c.definition);
      if (round.length < pairs && !terms.has(t) && !defs.has(d)) {
        round.push(c);
        terms.add(t);
        defs.add(d);
      } else {
        leftover.push(c);
      }
    }
    if (round.length === 0) break;
    rounds.push(round);
    remaining = leftover;
  }
  // Fold a lonely last pair into an earlier round so every round is a real game,
  // but only into a round where it causes no duplicate term or definition.
  if (rounds.length > 1 && rounds[rounds.length - 1].length === 1) {
    const [lonely] = rounds[rounds.length - 1];
    const conflicts = (round: StudyCard[]) =>
      round.some(
        (c) =>
          normalizeText(c.term) === normalizeText(lonely.term) ||
          normalizeText(c.definition) === normalizeText(lonely.definition),
      );
    const target = rounds.slice(0, -1).findLastIndex((r) => !conflicts(r));
    if (target !== -1) {
      rounds[target].push(lonely);
      rounds.pop();
    }
  }
  return rounds;
}
