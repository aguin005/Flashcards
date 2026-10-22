import { describe, expect, it } from 'vitest';
import type { StudySession, StudySet } from '../../src/types';
import {
  activityByDay,
  answersOnDay,
  cardsStudiedCount,
  dueCards,
  masteryCounts,
  mostMissed,
  overallAccuracy,
  studyStreak,
} from '../../src/lib/stats';
import { applyReview, DAY } from '../../src/lib/spaced-repetition';
import { addDays, startOfDay } from '../../src/lib/utils';

const NOW = new Date(2026, 9, 22, 15, 0).getTime();

function session(dayOffset: number, total: number, correct = total): StudySession {
  const t = addDays(startOfDay(NOW), dayOffset) + 10 * 3600_000;
  return { id: `ss${dayOffset}${total}`, setIds: ['s1'], mode: 'quiz', isReview: false, startedAt: t, endedAt: t + 60_000, total, correct, incorrect: total - correct, cardsStudied: total };
}

const set: StudySet = {
  id: 's1',
  title: 'Bio',
  description: '',
  createdAt: 0,
  updatedAt: 0,
  cards: [
    { id: 'a', term: 'A', definition: 'a', createdAt: 0 },
    { id: 'b', term: 'B', definition: 'b', createdAt: 0 },
    { id: 'c', term: 'C', definition: 'c', createdAt: 0 },
  ],
};

describe('statistics', () => {
  it('computes streaks from days with activity', () => {
    expect(studyStreak([], NOW)).toEqual({ current: 0, longest: 0, studiedToday: false });
    const s = [session(0, 5), session(-1, 3), session(-2, 2), session(-5, 4), session(-6, 4)];
    expect(studyStreak(s, NOW)).toEqual({ current: 3, longest: 3, studiedToday: true });
    // Not studied yet today: a streak ending yesterday is still alive.
    expect(studyStreak([session(-1, 3), session(-2, 2)], NOW).current).toBe(2);
    // A gap breaks it.
    expect(studyStreak([session(-2, 3)], NOW).current).toBe(0);
    // Sessions with no answers do not count.
    expect(studyStreak([session(0, 0)], NOW).current).toBe(0);
  });

  it('builds per-day activity and today total', () => {
    const s = [session(0, 5, 4), session(0, 2, 1), session(-3, 7), session(-20, 9)];
    const week = activityByDay(s, 7, NOW);
    expect(week).toHaveLength(7);
    expect(week[6]).toMatchObject({ answers: 7, correct: 5, sessions: 2 });
    expect(week[3].answers).toBe(7);
    expect(week.reduce((n, d) => n + d.answers, 0)).toBe(14);
    expect(answersOnDay(s, NOW)).toBe(7);
  });

  it('derives accuracy, mastery, due cards, and most missed from progress', () => {
    const t0 = NOW - 3 * DAY;
    const progress = {
      a: applyReview(applyReview(undefined, { cardId: 'a', setId: 's1' }, false, t0), { cardId: 'a', setId: 's1' }, false, t0 + 1000),
      b: applyReview(undefined, { cardId: 'b', setId: 's1' }, true, t0),
    };
    expect(overallAccuracy({})).toBeNull();
    expect(overallAccuracy(progress)).toBeCloseTo(1 / 3);
    expect(masteryCounts([set], progress)).toMatchObject({ new: 1, learning: 1, developing: 1, mastered: 0 });
    expect(cardsStudiedCount([set], progress)).toBe(2);
    expect(dueCards([set], progress, NOW).map((c) => c.id)).toEqual(['a', 'b']);
    expect(dueCards([set], progress, t0 + 1000).map((c) => c.id)).toEqual([]);
    expect(mostMissed([set], progress).map((m) => [m.card.id, m.progress.incorrect])).toEqual([['a', 2]]);
  });
});
