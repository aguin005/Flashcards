import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CalendarCheck,
  FileUp,
  Flame,
  Layers,
  ListChecks,
  Plus,
  ShieldCheck,
  Target,
} from 'lucide-react';
import { useAppData } from '../state/AppData';
import {
  answersOnDay,
  dueCards,
  lastStudiedBySet,
  masteryCounts,
  overallAccuracy,
  recentlyStudiedSets,
  studyStreak,
  upcomingReviews,
} from '../lib/stats';
import { usePrefs } from '../lib/storage';
import { formatRelative, pluralize } from '../lib/utils';
import { buttonClass } from '../components/ui/Button';
import { Panel, ProgressBar } from '../components/ui/primitives';
import { SetCard } from '../components/study-ui';

function greeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

function Welcome() {
  return (
    <div>
      <div className="rounded-3xl bg-gradient-to-br from-brand-600 to-brand-800 p-6 text-white shadow-sm sm:p-10">
        <p className="text-sm font-medium text-brand-100">Welcome to Recall</p>
        <h1 className="mt-2 max-w-xl text-3xl font-semibold tracking-tight sm:text-4xl">Turn your PDFs into flashcards you will remember.</h1>
        <p className="mt-3 max-w-xl text-brand-100">
          Upload class notes or a study guide, review the terms and definitions found in it, then study with flashcards,
          quizzes, written recall, and matching. Spaced repetition brings back what you are about to forget.
        </p>
        <div className="mt-6 flex flex-wrap gap-2">
          <Link
            to="/upload"
            className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-5 font-medium text-brand-800 shadow-sm hover:bg-brand-50"
          >
            <FileUp className="size-5" /> Upload a PDF
          </Link>
          <Link
            to="/sets/new"
            className="inline-flex h-12 items-center gap-2 rounded-xl px-5 font-medium text-white ring-1 ring-white/30 hover:bg-white/10"
          >
            <Plus className="size-5" /> Create a set by hand
          </Link>
        </div>
      </div>
      <div className="mt-6 grid gap-4 md:grid-cols-3">
        {[
          { icon: FileUp, title: '1. Upload', text: 'Text is extracted in your browser. Common term and definition formats are detected.' },
          { icon: ListChecks, title: '2. Review', text: 'Edit, delete, or add entries. Uncertain pairs are flagged instead of guessed.' },
          { icon: Layers, title: '3. Study', text: 'Flashcards, quizzes, written answers, and matching, with progress tracked per card.' },
        ].map(({ icon: Icon, title, text }) => (
          <Panel key={title} className="p-5">
            <Icon className="size-5 text-brand-600 dark:text-brand-400" aria-hidden />
            <h2 className="mt-3 font-semibold text-slate-900 dark:text-white">{title}</h2>
            <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">{text}</p>
          </Panel>
        ))}
      </div>
      <p className="mt-6 flex items-start gap-2 text-sm text-slate-500 dark:text-slate-400">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-emerald-600" aria-hidden />
        Everything stays on this device. Browsers can clear site data, so export a backup from Settings now and then.
      </p>
    </div>
  );
}

export function DashboardPage() {
  const { sets, progress, sessions } = useAppData();
  const { dailyGoal } = usePrefs();

  const due = useMemo(() => dueCards(sets, progress), [sets, progress]);
  const upcoming = useMemo(() => upcomingReviews(sets, progress), [sets, progress]);
  const today = useMemo(() => answersOnDay(sessions), [sessions]);
  const streak = useMemo(() => studyStreak(sessions), [sessions]);
  const recent = useMemo(() => recentlyStudiedSets(sets, progress, 3), [sets, progress]);
  const lastStudied = useMemo(() => lastStudiedBySet(progress), [progress]);
  const counts = useMemo(() => masteryCounts(sets, progress), [sets, progress]);
  const accuracy = useMemo(() => overallAccuracy(progress), [progress]);
  const totalCards = sets.reduce((n, s) => n + s.cards.length, 0);

  if (sets.length === 0) return <Welcome />;

  const goalPct = Math.min(1, today / dailyGoal);
  const dueBySet = new Map<string, number>();
  for (const c of due) dueBySet.set(c.setId, (dueBySet.get(c.setId) ?? 0) + 1);
  const recentIds = new Set(recent.map((r) => r.set.id));
  const otherSets = sets.filter((s) => !recentIds.has(s.id)).slice(0, 6);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}
          </p>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{greeting()}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link to="/sets/new" className={buttonClass('secondary')}>
            <Plus className="size-4" /> New set
          </Link>
          <Link to="/upload" className={buttonClass('primary')} data-testid="dashboard-upload">
            <FileUp className="size-4" /> Upload PDF
          </Link>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Panel className="p-5 lg:col-span-2" data-testid="review-due-card">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
                <CalendarClock className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> Review due
              </h2>
              {due.length > 0 ? (
                <>
                  <p className="mt-3 text-4xl font-semibold tracking-tight text-slate-900 dark:text-white">{due.length}</p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {pluralize(due.length, 'card is', 'cards are')} ready for review across {pluralize(dueBySet.size, 'set')}
                  </p>
                </>
              ) : (
                <>
                  <p className="mt-3 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-white">
                    <CalendarCheck className="size-5 text-emerald-600" aria-hidden /> All caught up
                  </p>
                  <p className="text-sm text-slate-500 dark:text-slate-400">
                    {upcoming.nextAt ? `Next review ${formatRelative(upcoming.nextAt)}` : 'Study a set to schedule reviews.'}
                    {upcoming.tomorrow > 0 && ` · ${upcoming.tomorrow} due tomorrow`}
                  </p>
                </>
              )}
            </div>
            {due.length > 0 && (
              <Link to="/study/flashcards?review=1" className={buttonClass('primary')} data-testid="start-review">
                Start review <ArrowRight className="size-4" />
              </Link>
            )}
          </div>
          {due.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {[...dueBySet.entries()].slice(0, 5).map(([setId, n]) => (
                <li key={setId}>
                  <Link
                    to={`/study/flashcards?review=1&set=${setId}`}
                    className="inline-flex items-center gap-2 rounded-full border border-slate-200 px-3 py-1 text-xs font-medium text-slate-700 hover:border-brand-300 hover:bg-brand-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-brand-500/10"
                  >
                    {sets.find((s) => s.id === setId)?.title}
                    <span className="text-slate-500 tabular-nums">{n}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel className="p-5">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white">
            <Target className="size-4 text-brand-600 dark:text-brand-400" aria-hidden /> Today
          </h2>
          <p className="mt-3 text-sm text-slate-600 dark:text-slate-400">
            <span className="text-2xl font-semibold text-slate-900 dark:text-white">{today}</span> of {dailyGoal} cards
          </p>
          <ProgressBar value={goalPct} className="mt-2" label="Daily goal progress" tone={goalPct >= 1 ? 'green' : 'brand'} />
          <p className="mt-4 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
            <Flame className={streak.studiedToday ? 'size-4 text-orange-500' : 'size-4 text-slate-400'} aria-hidden />
            {streak.current > 0 ? `${pluralize(streak.current, 'day')} streak` : 'No streak yet'}
            {!streak.studiedToday && streak.current > 0 && <span className="text-slate-400">· study today to keep it</span>}
          </p>
          <Link to="/settings" className="mt-2 inline-block text-xs font-medium text-brand-700 hover:underline dark:text-brand-300">
            Change daily goal
          </Link>
        </Panel>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: 'Study sets', value: sets.length.toLocaleString() },
          { label: 'Cards', value: totalCards.toLocaleString() },
          { label: 'Mastered', value: counts.mastered.toLocaleString() },
          { label: 'Accuracy', value: accuracy === null ? '–' : `${Math.round(accuracy * 100)}%` },
        ].map((s) => (
          <Link key={s.label} to="/progress" className="rounded-2xl">
            <Panel className="p-4 hover:shadow-md">
              <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{s.label}</div>
              <div className="mt-1 text-xl font-semibold text-slate-900 dark:text-white">{s.value}</div>
            </Panel>
          </Link>
        ))}
      </div>

      {recent.length > 0 && (
        <section className="mt-8" aria-labelledby="recent-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="recent-heading" className="text-base font-semibold text-slate-900 dark:text-white">
              Recently studied
            </h2>
            {otherSets.length === 0 && (
              <Link to="/sets" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
                View all sets
              </Link>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {recent.map(({ set, lastStudiedAt }) => (
              <SetCard key={set.id} set={set} progress={progress} lastStudiedAt={lastStudiedAt} />
            ))}
          </div>
        </section>
      )}

      {otherSets.length > 0 && (
        <section className="mt-8" aria-labelledby="sets-heading">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="sets-heading" className="text-base font-semibold text-slate-900 dark:text-white">
              {recent.length > 0 ? 'Your other study sets' : 'Your study sets'}
            </h2>
            <Link to="/sets" className="text-sm font-medium text-brand-700 hover:underline dark:text-brand-300">
              View all {sets.length}
            </Link>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {otherSets.map((set) => (
              <SetCard key={set.id} set={set} progress={progress} lastStudiedAt={lastStudied.get(set.id)} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
