import type { CardProgress, MasteryLevel } from '../types';

/**
 * Simple Leitner-style spaced repetition.
 *
 * Box 0  New         never studied
 * Box 1  Learning    missed recently; comes back within minutes
 * Box 2  Developing  due again in 1 day
 * Box 3  Familiar    due again in 3 days
 * Box 4  Familiar    due again in 7 days
 * Box 5  Mastered    due again in 16 days, then 35 days
 *
 * A correct answer moves a card up one box, but only when the card was due
 * (or still in the New/Learning boxes). Answering the same card correctly
 * several times in one sitting therefore cannot jump it to Mastered: reaching
 * box 5 needs correct answers spread over at least four separate days.
 * A wrong answer always drops the card back to box 1.
 */

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

export const MAX_BOX = 5;
export const LEARNING_RETRY_MS = 10 * MINUTE;
export const BOX_INTERVALS: readonly number[] = [0, LEARNING_RETRY_MS, 1 * DAY, 3 * DAY, 7 * DAY, 16 * DAY];
export const MASTERED_REPEAT_INTERVAL = 35 * DAY;

export const MASTERY_LEVELS: readonly MasteryLevel[] = ['new', 'learning', 'developing', 'familiar', 'mastered'];

export const MASTERY_LABELS: Record<MasteryLevel, string> = {
  new: 'New',
  learning: 'Learning',
  developing: 'Developing',
  familiar: 'Familiar',
  mastered: 'Mastered',
};

export const MASTERY_DESCRIPTIONS: Record<MasteryLevel, string> = {
  new: 'Never studied',
  learning: 'Missed recently',
  developing: 'Sometimes remembered',
  familiar: 'Consistently recalled',
  mastered: 'Recalled across multiple sessions',
};

export function emptyProgress(cardId: string, setId: string): CardProgress {
  return { cardId, setId, box: 0, reviews: 0, correct: 0, incorrect: 0, streak: 0 };
}

export function isDue(p: CardProgress | undefined, now = Date.now()): boolean {
  if (!p || p.reviews === 0) return false;
  return (p.nextReviewAt ?? 0) <= now;
}

export function masteryOf(p: CardProgress | undefined): MasteryLevel {
  if (!p || p.reviews === 0) return 'new';
  if (p.box <= 1) return 'learning';
  if (p.box === 2) return 'developing';
  if (p.box < MAX_BOX) return 'familiar';
  return 'mastered';
}

/** Difficult = starred by the user or currently in the Learning box. */
export function isDifficult(p: CardProgress | undefined, starred?: boolean): boolean {
  return Boolean(starred) || masteryOf(p) === 'learning';
}

export function applyReview(
  prev: CardProgress | undefined,
  ids: { cardId: string; setId: string },
  correct: boolean,
  now = Date.now(),
): CardProgress {
  const p = prev ? { ...prev } : emptyProgress(ids.cardId, ids.setId);
  p.setId = ids.setId;
  const wasDue = p.reviews === 0 || p.box <= 1 || (p.nextReviewAt ?? 0) <= now;

  p.reviews += 1;
  p.lastReviewedAt = now;

  if (correct) {
    p.correct += 1;
    p.streak += 1;
    p.lastResult = 'correct';
    if (wasDue) {
      if (p.box === 0 || p.box === 1) {
        p.box = 2;
        p.nextReviewAt = now + BOX_INTERVALS[2];
      } else if (p.box >= MAX_BOX) {
        p.box = MAX_BOX;
        p.nextReviewAt = now + MASTERED_REPEAT_INTERVAL;
      } else {
        p.box += 1;
        p.nextReviewAt = now + BOX_INTERVALS[p.box];
      }
    }
    // Not due yet: keep the box and schedule; extra practice is still counted.
  } else {
    p.incorrect += 1;
    p.streak = 0;
    p.lastResult = 'incorrect';
    p.box = 1;
    p.nextReviewAt = now + LEARNING_RETRY_MS;
  }
  return p;
}

export function accuracyOf(p: CardProgress | undefined): number | null {
  if (!p || p.reviews === 0) return null;
  return p.correct / p.reviews;
}
