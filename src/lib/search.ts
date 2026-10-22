import type { StudySet } from '../types';
import { normalizeText } from './utils';

export interface SetSearchResult {
  set: StudySet;
  /** Number of cards whose term or definition matches. */
  cardMatches: number;
  titleMatch: boolean;
}

export function searchSets(sets: readonly StudySet[], query: string): SetSearchResult[] {
  const q = normalizeText(query);
  if (!q) return sets.map((set) => ({ set, cardMatches: 0, titleMatch: true }));
  const results: SetSearchResult[] = [];
  for (const set of sets) {
    const titleMatch = normalizeText(`${set.title} ${set.subject ?? ''} ${set.description}`).includes(q);
    let cardMatches = 0;
    for (const c of set.cards) {
      if (normalizeText(`${c.term} ${c.definition}`).includes(q)) cardMatches++;
    }
    if (titleMatch || cardMatches > 0) results.push({ set, cardMatches, titleMatch });
  }
  return results.sort((a, b) => Number(b.titleMatch) - Number(a.titleMatch) || b.cardMatches - a.cardMatches);
}
