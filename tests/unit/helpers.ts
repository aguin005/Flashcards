import type { StudyCard } from '../../src/types';

export function makeCards(pairs: [string, string][], setId = 's1'): StudyCard[] {
  return pairs.map(([term, definition], i) => ({
    id: `${setId}-c${i}`,
    term,
    definition,
    createdAt: i,
    setId,
    setTitle: 'Test set',
  }));
}
