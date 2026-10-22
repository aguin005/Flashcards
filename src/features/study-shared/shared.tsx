import { useMemo, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { CircleCheck, CircleX, RotateCcw, Trophy } from 'lucide-react';
import type { DirectionPref, StudyCard } from '../../types';
import { useAppData } from '../../state/AppData';
import { isDifficult } from '../../lib/spaced-repetition';
import { cn, pluralize } from '../../lib/utils';
import { Button, buttonClass } from '../../components/ui/Button';
import { Panel, ProgressBar, Segmented } from '../../components/ui/primitives';

export type CardPool = 'all' | 'difficult';

/** Cards matching the chosen pool. Difficult = starred or currently in the Learning box. */
export function useCardPool(cards: StudyCard[], pool: CardPool): StudyCard[] {
  const { progress, sets } = useAppData();
  return useMemo(() => {
    if (pool === 'all') return cards;
    const starred = new Set(sets.flatMap((s) => s.cards.filter((c) => c.starred).map((c) => c.id)));
    return cards.filter((c) => isDifficult(progress[c.id], starred.has(c.id)));
  }, [cards, pool, progress, sets]);
}

export function SetupRow({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <div className="text-sm font-medium text-slate-800 dark:text-slate-200">{label}</div>
        {hint && <div className="text-xs text-slate-500 dark:text-slate-400">{hint}</div>}
      </div>
      {children}
    </div>
  );
}

export function PoolPicker({
  value,
  onChange,
  allCount,
  difficultCount,
}: {
  value: CardPool;
  onChange: (v: CardPool) => void;
  allCount: number;
  difficultCount: number;
}) {
  return (
    <SetupRow label="Cards" hint="Difficult cards are starred or recently missed.">
      <Segmented<CardPool>
        label="Cards to study"
        value={value}
        onChange={(v) => (v === 'difficult' && difficultCount === 0 ? undefined : onChange(v))}
        options={[
          { value: 'all', label: `All (${allCount})` },
          { value: 'difficult', label: `Difficult (${difficultCount})` },
        ]}
      />
    </SetupRow>
  );
}

export function DirectionPicker({
  value,
  onChange,
  labels,
}: {
  value: DirectionPref;
  onChange: (v: DirectionPref) => void;
  labels: { termToDef: string; defToTerm: string };
}) {
  return (
    <SetupRow label="Question type">
      <Segmented<DirectionPref>
        label="Question type"
        value={value}
        onChange={onChange}
        options={[
          { value: 'definition-to-term', label: labels.defToTerm },
          { value: 'term-to-definition', label: labels.termToDef },
          { value: 'mixed', label: 'Mixed' },
        ]}
      />
    </SetupRow>
  );
}

export function CountPicker({ value, onChange, max }: { value: number; onChange: (n: number) => void; max: number }) {
  const presets = [5, 10, 20].filter((n) => n < max);
  return (
    <SetupRow label="Number of questions">
      <div className="flex items-center gap-2">
        <Segmented<string>
          label="Number of questions"
          value={String(Math.min(value, max))}
          onChange={(v) => onChange(Number(v))}
          options={[...presets.map((n) => ({ value: String(n), label: String(n) })), { value: String(max), label: `All ${max}` }]}
        />
        <input
          type="number"
          min={1}
          max={max}
          value={Math.min(value, max)}
          aria-label="Custom number of questions"
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            if (Number.isFinite(n)) onChange(Math.max(1, Math.min(max, n)));
          }}
          className="h-9 w-16 rounded-lg border border-slate-200 bg-white px-2 text-sm dark:border-slate-700 dark:bg-slate-900"
        />
      </div>
    </SetupRow>
  );
}

export interface MissedItem {
  id: string;
  prompt: string;
  promptLabel: string;
  given: string;
  correct: string;
}

export function ResultsPanel({
  correct,
  total,
  missed,
  onRetryMissed,
  onNew,
  backTo,
  extra,
}: {
  correct: number;
  total: number;
  missed: MissedItem[];
  onRetryMissed: () => void;
  onNew: () => void;
  backTo: string;
  extra?: ReactNode;
}) {
  const pct = total ? Math.round((correct / total) * 100) : 0;
  const message =
    pct === 100 ? 'Perfect score!' : pct >= 80 ? 'Great work!' : pct >= 60 ? 'Good progress.' : 'Keep practicing. Retry the ones you missed.';
  return (
    <div className="space-y-6" data-testid="results">
      <Panel className="animate-pop p-6 text-center sm:p-10">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Trophy className="size-7" aria-hidden />
        </div>
        <p className="text-5xl font-semibold tracking-tight text-slate-900 tabular-nums dark:text-white" data-testid="score-percent">
          {pct}%
        </p>
        <p className="mt-2 text-slate-600 dark:text-slate-400" data-testid="score">
          {correct} of {total} correct · {message}
        </p>
        {extra}
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {missed.length > 0 && (
            <Button onClick={onRetryMissed} icon={<RotateCcw className="size-4" />}>
              Retry {pluralize(missed.length, 'missed question')}
            </Button>
          )}
          <Button variant={missed.length ? 'secondary' : 'primary'} onClick={onNew}>
            New round
          </Button>
          <Link to={backTo} className={buttonClass('ghost')}>
            Done
          </Link>
        </div>
      </Panel>

      {missed.length > 0 && (
        <section aria-labelledby="missed-heading">
          <h2 id="missed-heading" className="mb-3 text-base font-semibold text-slate-900 dark:text-white">
            Missed questions
          </h2>
          <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
            {missed.map((m) => (
              <div key={m.id} className="p-4" data-testid="missed-item">
                <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{m.promptLabel}</p>
                <p className="mt-1 font-medium text-slate-900 dark:text-white">{m.prompt}</p>
                <p className="mt-2 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
                  <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">Your answer: </span>
                    {m.given || <em>No answer</em>}
                  </span>
                </p>
                <p className="mt-1 flex items-start gap-2 text-sm text-emerald-700 dark:text-emerald-300">
                  <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
                  <span>
                    <span className="sr-only">Correct answer: </span>
                    {m.correct}
                  </span>
                </p>
              </div>
            ))}
          </Panel>
        </section>
      )}
    </div>
  );
}

export function QuestionHeader({
  index,
  total,
  correct,
  answered,
  label,
}: {
  index: number;
  total: number;
  correct: number;
  answered: number;
  label?: string;
}) {
  return (
    <div className="mb-5">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 tabular-nums dark:text-slate-300" data-testid="question-progress">
          {label ? `${label} · ` : ''}Question {index + 1} of {total}
        </span>
        <span className="text-slate-500 tabular-nums dark:text-slate-400">
          {correct} / {answered} correct
        </span>
      </div>
      {total > 30 ? (
        <ProgressBar value={answered / total} size="sm" label="Quiz progress" />
      ) : (
        <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
          {Array.from({ length: total }, (_, i) => (
            <div key={i} className={cn('h-full flex-1', i < answered ? 'bg-brand-500' : 'bg-slate-200 dark:bg-slate-800')} />
          ))}
        </div>
      )}
    </div>
  );
}
