import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Play, RotateCcw, Timer, Trophy } from 'lucide-react';
import type { StudyModeProps } from '../../pages/StudyPage';
import type { StudyCard } from '../../types';
import { useStudySession } from '../../hooks/useStudySession';
import { matchBestKey } from '../../state/AppData';
import { readJSON, setPrefs, usePrefs, writeJSON } from '../../lib/storage';
import { cn, formatTimer, pluralize, shuffle } from '../../lib/utils';
import { buildRounds } from '../../lib/matching';
import { Badge, Panel, Segmented } from '../../components/ui/primitives';
import { Button, buttonClass } from '../../components/ui/Button';
import { PoolPicker, SetupRow, useCardPool, type CardPool } from '../study-shared/shared';

interface Tile {
  key: string;
  cardId: string;
  side: 'term' | 'definition';
  text: string;
}

type Phase = 'setup' | 'playing' | 'done';

export default function Matching({ cards, setIds, isReview, backTo }: StudyModeProps) {
  const prefs = usePrefs();
  const { record, endSession } = useStudySession('matching', setIds, isReview);
  const [poolChoice, setPoolChoice] = useState<CardPool>('all');
  const [pairs, setPairs] = useState(prefs.matchPairs);
  const [phase, setPhase] = useState<Phase>('setup');
  const [rounds, setRounds] = useState<StudyCard[][]>([]);
  const [roundIndex, setRoundIndex] = useState(0);
  const [terms, setTerms] = useState<Tile[]>([]);
  const [defs, setDefs] = useState<Tile[]>([]);
  const [selected, setSelected] = useState<{ term?: string; definition?: string }>({});
  const [matched, setMatched] = useState<Set<string>>(new Set());
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  const [wrong, setWrong] = useState<string[]>([]);
  const [mistakes, setMistakes] = useState(0);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [newBest, setNewBest] = useState(false);
  const missedRef = useRef(new Set<string>());
  const timers = useRef<number[]>([]);

  const difficult = useCardPool(cards, 'difficult');
  const chosenCards = useCardPool(cards, poolChoice);
  const bestKey = !isReview && setIds.length === 1 ? matchBestKey(setIds[0]) : null;
  // Re-read when a round finishes, since finishing may have stored a new best.
  const bestTimes = useMemo(() => (bestKey ? readJSON<Record<string, number>>(bestKey, {}) : {}), [bestKey, phase]);

  const cardById = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);
  const round = rounds[roundIndex] ?? [];

  useEffect(() => () => timers.current.forEach((t) => clearTimeout(t)), []);

  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms));
  };

  const startRound = useCallback((roundCards: StudyCard[]) => {
    setTerms(shuffle(roundCards.map((c) => ({ key: `t-${c.id}`, cardId: c.id, side: 'term' as const, text: c.term }))));
    setDefs(shuffle(roundCards.map((c) => ({ key: `d-${c.id}`, cardId: c.id, side: 'definition' as const, text: c.definition }))));
    setSelected({});
    setMatched(new Set());
    setRemoved(new Set());
    setWrong([]);
    setMistakes(0);
    setStartedAt(null);
    setElapsed(0);
    setNewBest(false);
    missedRef.current = new Set();
    setPhase('playing');
  }, []);

  const start = () => {
    setPrefs({ matchPairs: pairs });
    endSession();
    const r = buildRounds(chosenCards, pairs);
    setRounds(r);
    setRoundIndex(0);
    if (r.length) startRound(r[0]);
  };

  // Timer runs from the first selection until the last pair is matched.
  useEffect(() => {
    if (phase !== 'playing' || startedAt === null) return;
    const id = window.setInterval(() => setElapsed(Date.now() - startedAt), 100);
    return () => clearInterval(id);
  }, [phase, startedAt]);

  const finishRound = (finalMs: number) => {
    setElapsed(finalMs);
    if (bestKey) {
      const best = readJSON<Record<string, number>>(bestKey, {});
      const prev = best[String(round.length)];
      if (!prev || finalMs < prev) {
        writeJSON(bestKey, { ...best, [String(round.length)]: finalMs });
        setNewBest(Boolean(prev));
      }
    }
    setPhase('done');
  };

  const select = (tile: Tile) => {
    if (phase !== 'playing' || matched.has(tile.cardId) || wrong.length) return;
    const now = Date.now();
    if (startedAt === null) setStartedAt(now);
    const next = { ...selected, [tile.side]: selected[tile.side] === tile.cardId ? undefined : tile.cardId };
    if (!next.term || !next.definition) {
      setSelected(next);
      return;
    }
    if (next.term === next.definition) {
      const card = cardById.get(next.term)!;
      record(card, !missedRef.current.has(card.id));
      const nextMatched = new Set(matched).add(card.id);
      setMatched(nextMatched);
      setSelected({});
      later(() => setRemoved((r) => new Set(r).add(card.id)), 350);
      if (nextMatched.size === round.length) {
        const total = now - (startedAt ?? now);
        later(() => finishRound(total), 450);
      }
    } else {
      setMistakes((m) => m + 1);
      missedRef.current.add(next.term);
      missedRef.current.add(next.definition);
      setSelected(next);
      setWrong([next.term, next.definition]);
      later(() => {
        setWrong([]);
        setSelected({});
      }, 550);
    }
  };

  if (cards.length < 2) {
    return (
      <Panel className="p-8 text-center text-slate-600 dark:text-slate-400">Matching needs at least two cards.</Panel>
    );
  }

  if (phase === 'setup') {
    return (
      <Panel className="p-6 sm:p-8" data-testid="match-setup">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Match</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Select a term, then its definition. Correct pairs disappear. Go for accuracy and speed.
        </p>
        <div className="mt-6 space-y-5">
          {!isReview && (
            <PoolPicker value={poolChoice} onChange={setPoolChoice} allCount={cards.length} difficultCount={difficult.length} />
          )}
          <SetupRow label="Pairs per round" hint={`${pluralize(chosenCards.length, 'card')} in ${Math.max(1, Math.ceil(chosenCards.length / pairs))} rounds`}>
            <Segmented<string>
              label="Pairs per round"
              value={String(pairs)}
              onChange={(v) => setPairs(Number(v))}
              options={[4, 6, 8].map((n) => ({ value: String(n), label: String(n) }))}
            />
          </SetupRow>
        </div>
        <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={start} icon={<Play className="size-4" />} disabled={chosenCards.length < 2} data-testid="start-match">
            Start
          </Button>
        </div>
      </Panel>
    );
  }

  if (phase === 'done') {
    const accuracy = round.length ? Math.round((round.length / (round.length + mistakes)) * 100) : 0;
    const best = bestTimes[String(round.length)];
    const hasNext = roundIndex + 1 < rounds.length;
    return (
      <Panel className="animate-pop p-6 text-center sm:p-10" data-testid="match-done">
        <div className="mx-auto mb-3 flex size-14 items-center justify-center rounded-2xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
          <Trophy className="size-7" aria-hidden />
        </div>
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {hasNext ? `Round ${roundIndex + 1} of ${rounds.length} complete` : 'All matched!'}
        </h2>
        {newBest && (
          <Badge tone="green" className="mt-3">
            New best time
          </Badge>
        )}
        <dl className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Time</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums dark:text-white" data-testid="match-time">
              {formatTimer(elapsed)}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Mistakes</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums dark:text-white" data-testid="match-mistakes">
              {mistakes}
            </dd>
          </div>
          <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
            <dt className="text-xs text-slate-500 dark:text-slate-400">Accuracy</dt>
            <dd className="text-xl font-semibold text-slate-900 tabular-nums dark:text-white">{accuracy}%</dd>
          </div>
        </dl>
        {best !== undefined && !newBest && (
          <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">
            Best time for {round.length} pairs: {formatTimer(best)}
          </p>
        )}
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {hasNext && (
            <Button
              onClick={() => {
                setRoundIndex((i) => i + 1);
                startRound(rounds[roundIndex + 1]);
              }}
            >
              Next round
            </Button>
          )}
          <Button variant={hasNext ? 'secondary' : 'primary'} onClick={start} icon={<RotateCcw className="size-4" />}>
            Play again
          </Button>
          <Link to={backTo} className={buttonClass('ghost')}>
            Done
          </Link>
        </div>
      </Panel>
    );
  }

  const renderTile = (tile: Tile) => {
    if (removed.has(tile.cardId)) return null;
    const isSelected = selected[tile.side] === tile.cardId;
    const isMatched = matched.has(tile.cardId);
    const isWrong = isSelected && wrong.includes(tile.cardId);
    return (
      <button
        key={tile.key}
        type="button"
        onClick={() => select(tile)}
        aria-pressed={isSelected}
        disabled={isMatched}
        data-testid={`match-${tile.side}`}
        data-card={tile.cardId}
        className={cn(
          'w-full rounded-xl border-2 p-3 text-left text-sm break-words transition-all duration-300 sm:p-4 sm:text-base',
          tile.side === 'term' ? 'font-medium' : 'text-slate-700 dark:text-slate-200',
          !isSelected && !isMatched && 'border-slate-200 bg-white hover:border-brand-300 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-600',
          isSelected && !isWrong && 'border-brand-500 bg-brand-50 dark:bg-brand-500/15',
          isWrong && 'animate-shake border-rose-500 bg-rose-50 dark:bg-rose-500/10',
          isMatched && 'scale-95 border-emerald-500 bg-emerald-50 opacity-0 dark:bg-emerald-500/10',
        )}
      >
        {tile.text}
      </button>
    );
  };

  return (
    <div>
      <div className="mb-4 flex items-center justify-between text-sm">
        <span className="font-medium text-slate-700 dark:text-slate-300">
          {rounds.length > 1 && `Round ${roundIndex + 1} of ${rounds.length} · `}
          {matched.size} of {round.length} matched
        </span>
        <span className="flex items-center gap-4 tabular-nums">
          <span className="text-rose-600 dark:text-rose-400">{pluralize(mistakes, 'mistake')}</span>
          <span className="inline-flex items-center gap-1 font-medium text-slate-900 dark:text-white" aria-label="Elapsed time">
            <Timer className="size-4" aria-hidden /> {formatTimer(elapsed)}
          </span>
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:gap-4" data-testid="match-board">
        <div className="space-y-2.5 sm:space-y-3" role="group" aria-label="Terms">
          {terms.map(renderTile)}
        </div>
        <div className="space-y-2.5 sm:space-y-3" role="group" aria-label="Definitions">
          {defs.map(renderTile)}
        </div>
      </div>
      {startedAt === null && (
        <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">The timer starts with your first selection.</p>
      )}
    </div>
  );
}
