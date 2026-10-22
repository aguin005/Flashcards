import { Link } from 'react-router-dom';
import { CalendarClock, Star } from 'lucide-react';
import type { CardProgress, MasteryLevel, StudySet } from '../types';
import { masteryOf, MASTERY_LABELS, MASTERY_DESCRIPTIONS, isDue } from '../lib/spaced-repetition';
import { cn, formatRelative, pluralize } from '../lib/utils';
import { Badge, Panel } from './ui/primitives';
import type { ProgressMap } from '../lib/stats';
import { setMasteryCounts } from '../lib/stats';

/** Ordinal ramp fills (see --color-mastery-* in index.css), weakest to strongest. */
export const MASTERY_BAR: Record<MasteryLevel, string> = {
  new: 'bg-mastery-new',
  learning: 'bg-mastery-learning',
  developing: 'bg-mastery-developing',
  familiar: 'bg-mastery-familiar',
  mastered: 'bg-mastery-mastered',
};

/** Neutral pill with a ramp-colored dot; the text carries the meaning, the dot the position. */
export function MasteryBadge({ progress }: { progress: CardProgress | undefined }) {
  const level = masteryOf(progress);
  return (
    <span
      title={MASTERY_DESCRIPTIONS[level]}
      className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium whitespace-nowrap text-slate-700 dark:bg-slate-800 dark:text-slate-300"
    >
      <span className={cn('size-2 rounded-full', MASTERY_BAR[level])} aria-hidden />
      {MASTERY_LABELS[level]}
    </span>
  );
}

export function StarButton({
  starred,
  onToggle,
  label,
  className,
}: {
  starred: boolean | undefined;
  onToggle: () => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
      aria-pressed={Boolean(starred)}
      aria-label={starred ? `Unstar ${label}` : `Star ${label}`}
      title={starred ? 'Starred as difficult' : 'Star as difficult'}
      className={cn(
        'inline-flex size-9 items-center justify-center rounded-lg transition-colors',
        starred
          ? 'text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-500/10'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-200',
        className,
      )}
    >
      <Star className={cn('size-5', starred && 'fill-current')} />
    </button>
  );
}

/** Stacked bar of mastery levels; each segment has a text label for screen readers. */
export function MasteryBar({
  counts,
  total,
  className,
}: {
  counts: Record<MasteryLevel, number>;
  total: number;
  className?: string;
}) {
  const levels: MasteryLevel[] = ['mastered', 'familiar', 'developing', 'learning', 'new'];
  const summary = levels.map((l) => `${counts[l]} ${MASTERY_LABELS[l].toLowerCase()}`).join(', ');
  return (
    <div
      role="img"
      aria-label={`Mastery: ${summary}`}
      className={cn(
        // Segments are separated by a 2px gap in the surface color; the gray track shows only when empty.
        'flex h-2 w-full gap-0.5 overflow-hidden rounded-full',
        total === 0 && 'bg-slate-100 dark:bg-slate-800',
        className,
      )}
    >
      {total > 0 &&
        levels.map((l) =>
          counts[l] > 0 ? (
            <div key={l} className={cn('h-full first:rounded-l-full last:rounded-r-full', MASTERY_BAR[l])} style={{ width: `${(counts[l] / total) * 100}%` }} />
          ) : null,
        )}
    </div>
  );
}

export function MasteryLegend({ counts }: { counts: Record<MasteryLevel, number> }) {
  const levels: MasteryLevel[] = ['mastered', 'familiar', 'developing', 'learning', 'new'];
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-400">
      {levels.map((l) => (
        <li key={l} className="flex items-center gap-1.5" title={MASTERY_DESCRIPTIONS[l]}>
          <span className={cn('size-2.5 rounded-full', MASTERY_BAR[l])} aria-hidden />
          {MASTERY_LABELS[l]} <span className="font-medium text-slate-900 tabular-nums dark:text-slate-200">{counts[l]}</span>
        </li>
      ))}
    </ul>
  );
}

export function SetCard({
  set,
  progress,
  lastStudiedAt,
  note,
}: {
  set: StudySet;
  progress: ProgressMap;
  lastStudiedAt?: number;
  /** Extra line under the description, e.g. search match counts. */
  note?: string;
}) {
  const counts = setMasteryCounts(set, progress);
  const due = set.cards.filter((c) => isDue(progress[c.id])).length;
  return (
    <Link to={`/sets/${set.id}`} className="group block rounded-2xl" data-testid="set-card">
      <Panel className="flex h-full flex-col p-5 transition-shadow group-hover:shadow-md group-hover:ring-1 group-hover:ring-brand-200 dark:group-hover:ring-brand-800">
        <div className="flex items-start justify-between gap-3">
          <h3 className="line-clamp-2 font-semibold text-slate-900 group-hover:text-brand-700 dark:text-white dark:group-hover:text-brand-300">
            {set.title}
          </h3>
          {set.subject && <Badge tone="brand" className="shrink-0">{set.subject}</Badge>}
        </div>
        {set.description && (
          <p className="mt-1 line-clamp-2 text-sm text-slate-500 dark:text-slate-400">{set.description}</p>
        )}
        {note && <p className="mt-1 text-xs font-medium text-brand-700 dark:text-brand-300">{note}</p>}
        <div className="mt-auto pt-4">
          <MasteryBar counts={counts} total={set.cards.length} />
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            <span className="font-medium text-slate-700 dark:text-slate-300">{pluralize(set.cards.length, 'card')}</span>
            <span>{counts.mastered} mastered</span>
            {due > 0 && (
              <span className="inline-flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                <CalendarClock className="size-3.5" aria-hidden /> {due} due
              </span>
            )}
            <span className="ml-auto">
              {lastStudiedAt ? `Studied ${formatRelative(lastStudiedAt)}` : 'Not studied yet'}
            </span>
          </div>
        </div>
      </Panel>
    </Link>
  );
}
