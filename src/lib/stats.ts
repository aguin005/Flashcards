import type { CardProgress, MasteryLevel, StudyCard, StudySession, StudySet } from '../types';
import { isDue, masteryOf, MASTERY_LEVELS } from './spaced-repetition';
import { addDays, dayKey, startOfDay } from './utils';

/** Every number shown in the app is derived from saved sets, progress, and sessions. */

export type ProgressMap = Record<string, CardProgress>;

export function toStudyCards(set: StudySet): StudyCard[] {
  return set.cards.map((c) => ({ ...c, setId: set.id, setTitle: set.title }));
}

export interface DayActivity {
  key: string;
  date: number;
  answers: number;
  correct: number;
  sessions: number;
}

export function activityByDay(sessions: readonly StudySession[], days: number, now = Date.now()): DayActivity[] {
  const today = startOfDay(now);
  const out: DayActivity[] = [];
  const index = new Map<string, DayActivity>();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    const d: DayActivity = { key: dayKey(date), date, answers: 0, correct: 0, sessions: 0 };
    out.push(d);
    index.set(d.key, d);
  }
  for (const s of sessions) {
    const d = index.get(dayKey(s.startedAt));
    if (!d) continue;
    d.answers += s.total;
    d.correct += s.correct;
    d.sessions += 1;
  }
  return out;
}

export function answersOnDay(sessions: readonly StudySession[], ts = Date.now()): number {
  const key = dayKey(ts);
  return sessions.reduce((sum, s) => (dayKey(s.startedAt) === key ? sum + s.total : sum), 0);
}

export interface Streak {
  current: number;
  longest: number;
  studiedToday: boolean;
}

/** Consecutive calendar days with at least one answered card. Today counts once studied; yesterday keeps a streak alive. */
export function studyStreak(sessions: readonly StudySession[], now = Date.now()): Streak {
  const days = new Set(sessions.filter((s) => s.total > 0).map((s) => dayKey(s.startedAt)));
  const todayKey = dayKey(now);
  const studiedToday = days.has(todayKey);

  let current = 0;
  let cursor = studiedToday ? startOfDay(now) : addDays(startOfDay(now), -1);
  while (days.has(dayKey(cursor))) {
    current++;
    cursor = addDays(cursor, -1);
  }

  const sorted = [...days].sort();
  let longest = 0;
  let run = 0;
  let prev: string | null = null;
  for (const key of sorted) {
    if (prev) {
      const [y, m, d] = prev.split('-').map(Number);
      const next = dayKey(addDays(new Date(y, m - 1, d).getTime(), 1));
      run = next === key ? run + 1 : 1;
    } else {
      run = 1;
    }
    longest = Math.max(longest, run);
    prev = key;
  }
  return { current, longest: Math.max(longest, current), studiedToday };
}

export function overallAccuracy(progress: ProgressMap): number | null {
  let correct = 0;
  let total = 0;
  for (const p of Object.values(progress)) {
    correct += p.correct;
    total += p.correct + p.incorrect;
  }
  return total === 0 ? null : correct / total;
}

export type MasteryCounts = Record<MasteryLevel, number>;

export function emptyMasteryCounts(): MasteryCounts {
  return Object.fromEntries(MASTERY_LEVELS.map((l) => [l, 0])) as MasteryCounts;
}

export function masteryCounts(sets: readonly StudySet[], progress: ProgressMap): MasteryCounts {
  const counts = emptyMasteryCounts();
  for (const set of sets) for (const c of set.cards) counts[masteryOf(progress[c.id])]++;
  return counts;
}

export function setMasteryCounts(set: StudySet, progress: ProgressMap): MasteryCounts {
  return masteryCounts([set], progress);
}

export function dueCards(sets: readonly StudySet[], progress: ProgressMap, now = Date.now()): StudyCard[] {
  const out: StudyCard[] = [];
  for (const set of sets) {
    for (const c of set.cards) {
      if (isDue(progress[c.id], now)) out.push({ ...c, setId: set.id, setTitle: set.title });
    }
  }
  // Most overdue first.
  return out.sort((a, b) => (progress[a.id]?.nextReviewAt ?? 0) - (progress[b.id]?.nextReviewAt ?? 0));
}

export function upcomingReviews(sets: readonly StudySet[], progress: ProgressMap, now = Date.now()) {
  const endToday = addDays(startOfDay(now), 1);
  const endTomorrow = addDays(endToday, 1);
  const endWeek = addDays(endToday, 7);
  let laterToday = 0;
  let tomorrow = 0;
  let week = 0;
  let nextAt: number | null = null;
  for (const set of sets) {
    for (const c of set.cards) {
      const p = progress[c.id];
      if (!p || p.reviews === 0 || p.nextReviewAt == null || p.nextReviewAt <= now) continue;
      if (nextAt == null || p.nextReviewAt < nextAt) nextAt = p.nextReviewAt;
      if (p.nextReviewAt < endToday) laterToday++;
      else if (p.nextReviewAt < endTomorrow) tomorrow++;
      if (p.nextReviewAt < endWeek) week++;
    }
  }
  return { laterToday, tomorrow, week, nextAt };
}

export interface MissedTerm {
  card: StudyCard;
  progress: CardProgress;
}

export function mostMissed(sets: readonly StudySet[], progress: ProgressMap, limit = 10): MissedTerm[] {
  const out: MissedTerm[] = [];
  for (const set of sets) {
    for (const c of set.cards) {
      const p = progress[c.id];
      if (p && p.incorrect > 0) out.push({ card: { ...c, setId: set.id, setTitle: set.title }, progress: p });
    }
  }
  return out
    .sort(
      (a, b) =>
        b.progress.incorrect - a.progress.incorrect ||
        b.progress.incorrect / b.progress.reviews - a.progress.incorrect / a.progress.reviews,
    )
    .slice(0, limit);
}

/** Most recent review time per set, from card progress. */
export function lastStudiedBySet(progress: ProgressMap): Map<string, number> {
  const map = new Map<string, number>();
  for (const p of Object.values(progress)) {
    if (!p.lastReviewedAt) continue;
    if ((map.get(p.setId) ?? 0) < p.lastReviewedAt) map.set(p.setId, p.lastReviewedAt);
  }
  return map;
}

export function recentlyStudiedSets(sets: readonly StudySet[], progress: ProgressMap, limit = 4) {
  const last = lastStudiedBySet(progress);
  return sets
    .filter((s) => last.has(s.id))
    .map((s) => ({ set: s, lastStudiedAt: last.get(s.id)! }))
    .sort((a, b) => b.lastStudiedAt - a.lastStudiedAt)
    .slice(0, limit);
}

export function cardsStudiedCount(sets: readonly StudySet[], progress: ProgressMap): number {
  let n = 0;
  for (const set of sets) for (const c of set.cards) if ((progress[c.id]?.reviews ?? 0) > 0) n++;
  return n;
}
