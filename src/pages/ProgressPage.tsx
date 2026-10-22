import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChartColumn, Flame } from 'lucide-react';
import { useAppData } from '../state/AppData';
import {
  activityByDay,
  cardsStudiedCount,
  dueCards,
  masteryCounts,
  mostMissed,
  overallAccuracy,
  setMasteryCounts,
  studyStreak,
} from '../lib/stats';
import { usePrefs } from '../lib/storage';
import { formatDateTime, formatDuration, pluralize } from '../lib/utils';
import { buttonClass } from '../components/ui/Button';
import { EmptyState, PageHeader, Panel, Segmented, StatTile } from '../components/ui/primitives';
import { MasteryBadge, MasteryBar, MasteryLegend } from '../components/study-ui';
import { ActivityChart, ActivityTable } from '../features/progress/ActivityChart';
import type { StudyMode } from '../types';

const MODE_LABELS: Record<StudyMode, string> = {
  flashcards: 'Flashcards',
  quiz: 'Multiple choice',
  written: 'Written',
  matching: 'Match',
};

export default function ProgressPage() {
  const { sets, progress, sessions } = useAppData();
  const { dailyGoal } = usePrefs();
  const [range, setRange] = useState<'7' | '30'>('7');
  const [view, setView] = useState<'chart' | 'table'>('chart');

  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);
  const counts = useMemo(() => masteryCounts(sets, progress), [sets, progress]);
  const studied = useMemo(() => cardsStudiedCount(sets, progress), [sets, progress]);
  const due = useMemo(() => dueCards(sets, progress).length, [sets, progress]);
  const accuracy = useMemo(() => overallAccuracy(progress), [progress]);
  const streak = useMemo(() => studyStreak(sessions), [sessions]);
  const activity = useMemo(() => activityByDay(sessions, Number(range)), [sessions, range]);
  const missed = useMemo(() => mostMissed(sets, progress, 10), [sets, progress]);
  const setTitles = useMemo(() => new Map(sets.map((s) => [s.id, s.title])), [sets]);
  const recent = useMemo(
    () => [...sessions].filter((s) => s.total > 0).sort((a, b) => b.endedAt - a.endedAt).slice(0, 10),
    [sessions],
  );
  const rangeTotal = activity.reduce((n, d) => n + d.answers, 0);

  return (
    <div>
      <PageHeader title="Progress" description="Every number here comes from your own study activity saved in this browser." />

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="progress-stats">
        <StatTile label="Study sets" value={sets.length.toLocaleString()} />
        <StatTile label="Vocabulary cards" value={totalCards.toLocaleString()} />
        <StatTile label="Cards studied" value={studied.toLocaleString()} hint={totalCards ? `${Math.round((studied / totalCards) * 100)}% of all cards` : undefined} />
        <StatTile label="Mastered" value={counts.mastered.toLocaleString()} hint="Recalled across several days" />
        <StatTile label="Need review" value={due.toLocaleString()} hint={due ? <Link to="/review" className="font-medium text-brand-700 hover:underline dark:text-brand-300">Review now</Link> : 'Nothing due'} />
        <StatTile label="Overall accuracy" value={accuracy === null ? '–' : `${Math.round(accuracy * 100)}%`} hint="Correct answers out of all answers" />
        <StatTile
          label="Study streak"
          value={pluralize(streak.current, 'day')}
          icon={<Flame className={streak.studiedToday ? 'size-5 text-orange-500' : 'size-5'} aria-hidden />}
          hint={streak.studiedToday ? 'Studied today' : streak.current ? 'Study today to keep it going' : 'Study today to start one'}
        />
        <StatTile label="Longest streak" value={pluralize(streak.longest, 'day')} />
      </div>

      {sessions.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<ChartColumn className="size-6" />}
          title="No study activity yet"
          description="Study any set with flashcards, a quiz, written recall, or matching. Your activity chart, accuracy, and most-missed terms will appear here."
          actions={
            <Link to="/sets" className={buttonClass('primary')}>
              Choose a set to study
            </Link>
          }
        />
      ) : (
        <>
          <section className="mt-8" aria-labelledby="activity-heading">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 id="activity-heading" className="text-base font-semibold text-slate-900 dark:text-white">
                  Cards reviewed per day
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {pluralize(rangeTotal, 'card')} in the last {range} days
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Segmented
                  label="Date range"
                  size="sm"
                  value={range}
                  onChange={setRange}
                  options={[
                    { value: '7', label: 'Last 7 days' },
                    { value: '30', label: 'Last 30 days' },
                  ]}
                />
                <Segmented
                  label="View as"
                  size="sm"
                  value={view}
                  onChange={setView}
                  options={[
                    { value: 'chart', label: 'Chart' },
                    { value: 'table', label: 'Table' },
                  ]}
                />
              </div>
            </div>
            <Panel className="p-4 sm:p-5" data-testid="activity-chart">
              {view === 'chart' ? <ActivityChart data={activity} goal={dailyGoal} /> : <ActivityTable data={activity} />}
            </Panel>
          </section>

          <div className="mt-8 grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="mastery-heading">
              <h2 id="mastery-heading" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
                Mastery
              </h2>
              <Panel className="p-5">
                <MasteryBar counts={counts} total={totalCards} className="h-3" />
                <div className="mt-3">
                  <MasteryLegend counts={counts} />
                </div>
                <ul className="mt-5 space-y-3 border-t border-slate-100 pt-4 dark:border-slate-800">
                  {sets.map((s) => {
                    const c = setMasteryCounts(s, progress);
                    return (
                      <li key={s.id}>
                        <div className="mb-1 flex items-baseline justify-between gap-3 text-sm">
                          <Link to={`/sets/${s.id}`} className="truncate font-medium text-slate-800 hover:underline dark:text-slate-200">
                            {s.title}
                          </Link>
                          <span className="shrink-0 text-xs text-slate-500 tabular-nums dark:text-slate-400">
                            {c.mastered}/{s.cards.length} mastered
                          </span>
                        </div>
                        <MasteryBar counts={c} total={s.cards.length} />
                      </li>
                    );
                  })}
                </ul>
              </Panel>
            </section>

            <section aria-labelledby="missed-heading">
              <h2 id="missed-heading" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
                Most frequently missed terms
              </h2>
              <Panel className="overflow-hidden">
                {missed.length === 0 ? (
                  <p className="p-5 text-sm text-slate-500 dark:text-slate-400">No missed answers yet.</p>
                ) : (
                  <table className="w-full text-left text-sm" data-testid="missed-table">
                    <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                      <tr>
                        <th scope="col" className="px-4 py-2 font-medium">Term</th>
                        <th scope="col" className="px-4 py-2 text-right font-medium">Missed</th>
                        <th scope="col" className="hidden px-4 py-2 text-right font-medium sm:table-cell">Accuracy</th>
                        <th scope="col" className="px-4 py-2 font-medium">Level</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {missed.map(({ card, progress: p }) => (
                        <tr key={card.id}>
                          <td className="px-4 py-2.5">
                            <Link to={`/sets/${card.setId}`} className="font-medium text-slate-900 hover:underline dark:text-white">
                              {card.term}
                            </Link>
                            <div className="truncate text-xs text-slate-500 dark:text-slate-400">{card.setTitle}</div>
                          </td>
                          <td className="px-4 py-2.5 text-right tabular-nums">{p.incorrect}×</td>
                          <td className="hidden px-4 py-2.5 text-right tabular-nums sm:table-cell">
                            {Math.round((p.correct / p.reviews) * 100)}%
                          </td>
                          <td className="px-4 py-2.5">
                            <MasteryBadge progress={p} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </Panel>
            </section>
          </div>

          <section className="mt-8" aria-labelledby="sessions-heading">
            <h2 id="sessions-heading" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
              Recent sessions
            </h2>
            <Panel className="overflow-x-auto">
              <table className="w-full min-w-[34rem] text-left text-sm" data-testid="sessions-table">
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
                  <tr>
                    <th scope="col" className="px-4 py-2 font-medium">When</th>
                    <th scope="col" className="px-4 py-2 font-medium">Set</th>
                    <th scope="col" className="px-4 py-2 font-medium">Mode</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Score</th>
                    <th scope="col" className="px-4 py-2 text-right font-medium">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {recent.map((s) => {
                    const names = s.setIds.map((id) => setTitles.get(id)).filter(Boolean);
                    return (
                      <tr key={s.id} className="text-slate-700 dark:text-slate-300">
                        <td className="px-4 py-2.5 whitespace-nowrap">{formatDateTime(s.startedAt)}</td>
                        <td className="max-w-52 truncate px-4 py-2.5">
                          {s.isReview ? 'Review: ' : ''}
                          {names.length > 1 ? `${names.length} sets` : (names[0] ?? 'Deleted set')}
                        </td>
                        <td className="px-4 py-2.5">{MODE_LABELS[s.mode]}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums">
                          {s.correct}/{s.total} ({Math.round((s.correct / s.total) * 100)}%)
                        </td>
                        <td className="px-4 py-2.5 text-right tabular-nums">{formatDuration(s.endedAt - s.startedAt)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
