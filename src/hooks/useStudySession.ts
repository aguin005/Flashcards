import { useCallback, useRef } from 'react';
import type { StudyMode, StudySession } from '../types';
import { useAppData } from '../state/AppData';
import { uid } from '../lib/utils';

/**
 * Records answers into card progress immediately and keeps an up-to-date
 * session record, so stats stay correct even if the tab is closed mid-session.
 */
export function useStudySession(mode: StudyMode, setIds: string[], isReview: boolean) {
  const { recordAnswer, saveSession } = useAppData();
  const sessionRef = useRef<StudySession | null>(null);
  const seenRef = useRef(new Set<string>());
  const setIdsKey = setIds.join('|');

  const record = useCallback(
    (card: { id: string; setId: string }, correct: boolean) => {
      recordAnswer({ cardId: card.id, setId: card.setId, correct });
      const now = Date.now();
      let s = sessionRef.current;
      if (!s) {
        seenRef.current = new Set();
        s = {
          id: uid('ss'),
          setIds: setIdsKey ? setIdsKey.split('|') : [],
          mode,
          isReview,
          startedAt: now,
          endedAt: now,
          total: 0,
          correct: 0,
          incorrect: 0,
          cardsStudied: 0,
        };
      }
      seenRef.current.add(card.id);
      s = {
        ...s,
        endedAt: now,
        total: s.total + 1,
        correct: s.correct + (correct ? 1 : 0),
        incorrect: s.incorrect + (correct ? 0 : 1),
        cardsStudied: seenRef.current.size,
      };
      sessionRef.current = s;
      saveSession(s);
    },
    [recordAnswer, saveSession, mode, isReview, setIdsKey],
  );

  /** Start a fresh session record on the next answer (e.g. after "Play again"). */
  const endSession = useCallback(() => {
    sessionRef.current = null;
  }, []);

  return { record, endSession };
}
