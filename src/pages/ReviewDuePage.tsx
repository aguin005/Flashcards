import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarCheck, ChevronDown, Layers, ListChecks, PenLine, Puzzle, Sparkles } from 'lucide-react';
import { useAppData } from '../state/AppData';
import { dueCards, toStudyCards, upcomingReviews } from '../lib/stats';
import { MASTERY_DESCRIPTIONS, MASTERY_LABELS, MASTERY_LEVELS } from '../lib/spaced-repetition';
import { optionCapacity } from '../lib/quiz';
import { cn, formatRelative, pluralize } from '../lib/utils';
import { buttonClass } from '../components/ui/Button';
import { EmptyState, PageHeader, Panel, StatTile } from '../components/ui/primitives';
import { MasteryBadge, MASTERY_BAR } from '../components/study-ui';

/** Matches BOX_INTERVALS in spaced-repetition.ts, by mastery level. */
const SCHEDULE_LABELS = ['Not scheduled', 'Back in 10 minutes', 'Every day', 'Every 3 to 7 days', 'Every 16+ days'];

const REVIEW_MODES = [
  { mode: 'flashcards', label: 'Flashcards', icon: Layers },
  { mode: 'written', label: 'Written', icon: PenLine },
  { mode: 'quiz', label: 'Multiple choice', icon: ListChecks },
  { mode: 'match', label: 'Match', icon: Puzzle },
];

export default function ReviewDuePage() {
  const { sets, progress } = useAppData();
  const [showHow, setShowHow] = useState(false);
  const [now] = useState(() => Date.now());
  const due = useMemo(() => dueCards(sets, progress, now), [sets, progress, now]);
  const upcoming = useMemo(() => upcomingReviews(sets, progress, now), [sets, progress, now]);
  const newCount = useMemo(
    () => sets.reduce((n, s) => n + s.cards.filter((c) => !progress[c.id] || progress[c.id].reviews === 0).length, 0),
    [sets, progress],
  );

  const bySet = useMemo(() => {
    const map = new Map<string, { title: string; count: number }>();
    for (const c of due) {
      const entry = map.get(c.setId) ?? { title: c.setTitle, count: 0 };
      entry.count++;
      map.set(c.setId, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].count - a[1].count);
  }, [due]);

  const quizPossible = useMemo(() => {
    const ids = new Set(due.map((c) => c.setId));
    return optionCapacity(sets.filter((s) => ids.has(s.id)).flatMap(toStudyCards)) > 0;
  }, [due, sets]);

  return (
    <div>
      <PageHeader
        title="Review Due"
        description="Cards come back on a schedule: sooner when you miss them, later as you keep getting them right."
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Due now" value={due.length} />
        <StatTile label="Later today" value={upcoming.laterToday} />
        <StatTile label="Tomorrow" value={upcoming.tomorrow} />
        <StatTile label="Next 7 days" value={upcoming.week} />
      </div>

      {due.length === 0 ? (
        <EmptyState
          className="mt-6"
          icon={<CalendarCheck className="size-6" />}
          title="All caught up"
          description={
            upcoming.nextAt
              ? `Your next review is ${formatRelative(upcoming.nextAt, now)}.${newCount ? ` Meanwhile, ${pluralize(newCount, 'card has', 'cards have')} never been studied.` : ''}`
              : newCount
                ? `Study a set to schedule reviews. ${pluralize(newCount, 'card is', 'cards are')} waiting to be learned.`
                : 'Create or import a study set, then study it to schedule reviews.'
          }
          actions={
            <Link to="/sets" className={buttonClass('primary')}>
              Go to My Study Sets
            </Link>
          }
        />
      ) : (
        <>
          <Panel className="mt-6 p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">Review all {pluralize(due.length, 'due card')}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">Pick a mode. Every answer reschedules the card.</p>
            <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {REVIEW_MODES.map(({ mode, label, icon: Icon }) => {
                const disabled = (mode === 'quiz' && !quizPossible) || (mode === 'match' && due.length < 2);
                return disabled ? (
                  <span key={mode} className={buttonClass('secondary', 'md', 'pointer-events-none opacity-50')} aria-disabled>
                    <Icon className="size-4" /> {label}
                  </span>
                ) : (
                  <Link
                    key={mode}
                    to={`/study/${mode}?review=1`}
                    className={buttonClass(mode === 'flashcards' ? 'primary' : 'secondary')}
                    data-testid={`review-${mode}`}
                  >
                    <Icon className="size-4" /> {label}
                  </Link>
                );
              })}
            </div>
          </Panel>

          <div className="mt-6 grid gap-6 lg:grid-cols-[18rem_1fr]">
            <section aria-labelledby="by-set">
              <h2 id="by-set" className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                By set
              </h2>
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
                {bySet.map(([id, { title, count }]) => (
                  <Link
                    key={id}
                    to={`/study/flashcards?review=1&set=${id}`}
                    className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 dark:hover:bg-slate-800/50"
                  >
                    <span className="truncate text-sm font-medium text-slate-800 dark:text-slate-200">{title}</span>
                    <span className="shrink-0 rounded-full bg-rose-50 px-2 py-0.5 text-xs font-semibold text-rose-700 tabular-nums dark:bg-rose-500/15 dark:text-rose-300">
                      {count}
                    </span>
                  </Link>
                ))}
              </Panel>
            </section>
            <section aria-labelledby="due-cards">
              <h2 id="due-cards" className="mb-3 text-sm font-semibold text-slate-900 dark:text-white">
                Due cards
              </h2>
              <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
                {due.slice(0, 50).map((c) => (
                  <div key={c.id} className="flex items-start justify-between gap-3 p-4" data-testid="due-card">
                    <div className="min-w-0">
                      <p className="font-medium break-words text-slate-900 dark:text-white">{c.term}</p>
                      <p className="mt-0.5 line-clamp-1 text-sm text-slate-500 dark:text-slate-400">{c.definition}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {c.setTitle} · due {formatRelative(progress[c.id]?.nextReviewAt ?? now, now)}
                      </p>
                    </div>
                    <MasteryBadge progress={progress[c.id]} />
                  </div>
                ))}
                {due.length > 50 && (
                  <p className="p-4 text-center text-sm text-slate-500">and {due.length - 50} more</p>
                )}
              </Panel>
            </section>
          </div>
        </>
      )}

      <Panel className="mt-6">
        <button
          type="button"
          onClick={() => setShowHow((s) => !s)}
          aria-expanded={showHow}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <span className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Sparkles className="size-4 text-brand-600" aria-hidden /> How scheduling works
          </span>
          <ChevronDown className={cn('size-4 text-slate-500 transition-transform', showHow && 'rotate-180')} aria-hidden />
        </button>
        {showHow && (
          <div className="border-t border-slate-100 p-5 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-300">
            <p>
              Each card sits in a box. A correct answer moves it up one box and pushes the next review further out. A missed
              card drops back to Learning and returns within minutes. Extra correct answers before a card is due still count
              toward accuracy, but do not move it up, so a card is only Mastered after correct answers on several different
              days.
            </p>
            <ul className="mt-4 grid gap-2 sm:grid-cols-5">
              {MASTERY_LEVELS.map((level, i) => (
                <li key={level} className="rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
                  <span className="flex items-center gap-1.5 font-medium text-slate-900 dark:text-white">
                    <span className={cn('size-2.5 rounded-full', MASTERY_BAR[level])} aria-hidden />
                    {MASTERY_LABELS[level]}
                  </span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">{MASTERY_DESCRIPTIONS[level]}</span>
                  <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                    {SCHEDULE_LABELS[i]}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Panel>
    </div>
  );
}
