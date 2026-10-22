import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Keyboard,
  RotateCcw,
  Settings2,
  Shuffle,
  Star,
  X,
} from 'lucide-react';
import type { StudyModeProps } from '../../pages/StudyPage';
import type { StudyCard } from '../../types';
import { useAppData } from '../../state/AppData';
import { useStudySession } from '../../hooks/useStudySession';
import { readJSON, removeKey, setPrefs, usePrefs, writeJSON } from '../../lib/storage';
import { cn, pluralize, shuffle as shuffleArray } from '../../lib/utils';
import { Button, buttonClass } from '../../components/ui/Button';
import { Kbd, Panel, ProgressBar, Segmented, Switch } from '../../components/ui/primitives';
import { StarButton } from '../../components/study-ui';
import { toggleFullscreen } from '../../components/layout/FocusLayout';

interface FlashState {
  /** Card ids in this round, in study order. */
  order: string[];
  index: number;
  known: string[];
  learning: string[];
  round: number;
  finished: boolean;
  starredOnly: boolean;
  updatedAt: number;
}

function textSize(text: string): string {
  if (text.length > 400) return 'text-base sm:text-lg';
  if (text.length > 220) return 'text-lg sm:text-xl';
  if (text.length > 90) return 'text-xl sm:text-2xl';
  return 'text-2xl sm:text-4xl';
}

function isTyping(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  return Boolean(el?.closest('input, textarea, select, [contenteditable="true"]'));
}

export default function Flashcards({ cards, setIds, isReview, persistKey, backTo }: StudyModeProps) {
  const { sets, toggleStar } = useAppData();
  const prefs = usePrefs();
  const { record } = useStudySession('flashcards', setIds, isReview);
  const front = prefs.flashcardFront;
  const shuffleOn = prefs.flashcardShuffle;

  const byId = useMemo(() => new Map(cards.map((c) => [c.id, c])), [cards]);

  // Starred status is read live so starring from this screen shows immediately.
  const starredIds = useMemo(() => {
    const ids = new Set<string>();
    for (const s of sets) for (const c of s.cards) if (c.starred) ids.add(c.id);
    return ids;
  }, [sets]);

  const buildOrder = useCallback(
    (ids: string[]) => (shuffleOn ? shuffleArray(ids) : ids),
    [shuffleOn],
  );

  const freshState = useCallback(
    (starredOnly: boolean): FlashState => {
      const ids = cards.filter((c) => !starredOnly || starredIds.has(c.id)).map((c) => c.id);
      return {
        order: buildOrder(ids),
        index: 0,
        known: [],
        learning: [],
        round: 1,
        finished: false,
        starredOnly,
        updatedAt: Date.now(),
      };
    },
    [cards, starredIds, buildOrder],
  );

  const [resumed, setResumed] = useState(false);
  const [state, setState] = useState<FlashState>(() => {
    if (persistKey) {
      const saved = readJSON<FlashState | null>(persistKey, null);
      if (saved && Array.isArray(saved.order)) {
        const order = saved.order.filter((id) => byId.has(id));
        if (order.length > 0 && !saved.finished) {
          return {
            ...saved,
            order,
            index: Math.min(saved.index, order.length - 1),
            known: saved.known.filter((id) => byId.has(id)),
            learning: saved.learning.filter((id) => byId.has(id)),
          };
        }
      }
    }
    return freshState(false);
  });
  const [flipped, setFlipped] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showKeys, setShowKeys] = useState(false);

  useEffect(() => {
    if (persistKey && state.index > 0 && !state.finished) setResumed(true);
    // Only on mount: tells the user they picked up where they left off.
  }, []);

  // Remember position between sessions.
  useEffect(() => {
    if (!persistKey) return;
    if (state.finished && state.round === 1 && state.learning.length === 0) removeKey(persistKey);
    else writeJSON(persistKey, { ...state, updatedAt: Date.now() });
  }, [state, persistKey]);

  const current: StudyCard | undefined = byId.get(state.order[state.index]);
  const total = state.order.length;

  const go = useCallback((delta: number) => {
    setFlipped(false);
    setState((s) => {
      const next = s.index + delta;
      if (next < 0) return s;
      if (next >= s.order.length) return { ...s, finished: true };
      return { ...s, index: next };
    });
  }, []);

  const mark = useCallback(
    (know: boolean) => {
      if (!current) return;
      record(current, know);
      setFlipped(false);
      setState((s) => {
        const id = s.order[s.index];
        const known = know ? [...new Set([...s.known, id])] : s.known.filter((x) => x !== id);
        const learning = know ? s.learning.filter((x) => x !== id) : [...new Set([...s.learning, id])];
        const next = s.index + 1;
        return { ...s, known, learning, index: Math.min(next, s.order.length - 1), finished: next >= s.order.length };
      });
    },
    [current, record],
  );

  const studyLearningAgain = () => {
    setFlipped(false);
    setState((s) => ({
      ...s,
      order: buildOrder(s.learning),
      index: 0,
      known: [],
      learning: [],
      round: s.round + 1,
      finished: false,
    }));
  };

  const restart = (starredOnly = state.starredOnly) => {
    setFlipped(false);
    setResumed(false);
    setState(freshState(starredOnly));
  };

  const reorder = (shuffleNext: boolean) => {
    setPrefs({ flashcardShuffle: shuffleNext });
    setFlipped(false);
    setState((s) => {
      const currentId = s.order[s.index];
      const rest = s.order.filter((id) => id !== currentId);
      const original = cards.map((c) => c.id).filter((id) => rest.includes(id));
      const ordered = shuffleNext ? shuffleArray(rest) : original;
      const done = new Set([...s.known, ...s.learning]);
      // Keep the current card in place; cards already marked stay before it.
      const before = ordered.filter((id) => done.has(id));
      const after = ordered.filter((id) => !done.has(id));
      const order = currentId ? [...before, currentId, ...after] : [...before, ...after];
      return { ...s, order, index: currentId ? before.length : 0 };
    });
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey || isTyping(e.target)) return;
      if (state.finished) return;
      const key = e.key.toLowerCase();
      if (key === ' ' || key === 'arrowup' || key === 'arrowdown') {
        e.preventDefault();
        setFlipped((f) => !f);
      } else if (key === 'arrowright') {
        e.preventDefault();
        go(1);
      } else if (key === 'arrowleft') {
        e.preventDefault();
        go(-1);
      } else if (key === '1') {
        mark(false);
      } else if (key === '2') {
        mark(true);
      } else if (key === 's' && current) {
        void toggleStar(current.setId, current.id);
      } else if (key === 'f') {
        toggleFullscreen();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, mark, current, toggleStar, state.finished]);

  if (state.finished || !current) {
    const learningCount = state.learning.length;
    const knownCount = state.known.length;
    const skipped = Math.max(0, total - knownCount - learningCount);
    return (
      <Panel className="animate-pop p-6 text-center sm:p-10" data-testid="flashcards-summary">
        <h2 className="text-2xl font-semibold text-slate-900 dark:text-white">
          {total === 0 ? 'No cards to study' : learningCount === 0 && knownCount > 0 ? 'Nice work!' : 'Round complete'}
        </h2>
        {total === 0 ? (
          <p className="mt-2 text-slate-600 dark:text-slate-400">No starred cards in this set. Star difficult terms to study them here.</p>
        ) : (
          <div className="mx-auto mt-6 grid max-w-md grid-cols-3 gap-3">
            <div className="rounded-xl bg-emerald-50 p-3 dark:bg-emerald-500/10">
              <div className="text-2xl font-semibold text-emerald-700 tabular-nums dark:text-emerald-300">{knownCount}</div>
              <div className="text-xs text-emerald-800 dark:text-emerald-300">Know it</div>
            </div>
            <div className="rounded-xl bg-amber-50 p-3 dark:bg-amber-500/10">
              <div className="text-2xl font-semibold text-amber-700 tabular-nums dark:text-amber-300">{learningCount}</div>
              <div className="text-xs text-amber-800 dark:text-amber-300">Still learning</div>
            </div>
            <div className="rounded-xl bg-slate-100 p-3 dark:bg-slate-800">
              <div className="text-2xl font-semibold text-slate-700 tabular-nums dark:text-slate-200">{skipped}</div>
              <div className="text-xs text-slate-600 dark:text-slate-400">Not marked</div>
            </div>
          </div>
        )}
        <div className="mt-8 flex flex-col justify-center gap-2 sm:flex-row">
          {learningCount > 0 && (
            <Button onClick={studyLearningAgain} icon={<RotateCcw className="size-4" />}>
              Study {pluralize(learningCount, 'still-learning card')} again
            </Button>
          )}
          {state.starredOnly && total === 0 ? (
            <Button variant="secondary" onClick={() => restart(false)}>
              Study all cards
            </Button>
          ) : (
            <Button variant={learningCount > 0 ? 'secondary' : 'primary'} onClick={() => restart()}>
              Restart {state.starredOnly ? 'starred cards' : 'all cards'}
            </Button>
          )}
          <Link to={backTo} className={buttonClass('ghost')}>
            Done
          </Link>
        </div>
      </Panel>
    );
  }

  const frontText = front === 'term' ? current.term : current.definition;
  const backText = front === 'term' ? current.definition : current.term;
  const starred = starredIds.has(current.id);
  const marked = state.known.includes(current.id) ? 'known' : state.learning.includes(current.id) ? 'learning' : null;

  return (
    <div>
      {resumed && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-xl bg-brand-50 px-4 py-2.5 text-sm text-brand-800 dark:bg-brand-500/10 dark:text-brand-200">
          <span>Picked up where you left off.</span>
          <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => restart()}>
            Start over
          </button>
        </div>
      )}

      <div className="mb-3 flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-slate-700 tabular-nums dark:text-slate-300" data-testid="flashcard-progress">
          {state.index + 1} of {total}
          {state.round > 1 && <span className="ml-2 text-slate-500">Round {state.round}</span>}
        </span>
        <span className="flex items-center gap-3 text-xs tabular-nums">
          <span className="text-amber-700 dark:text-amber-300">{state.learning.length} learning</span>
          <span className="text-emerald-700 dark:text-emerald-300">{state.known.length} known</span>
        </span>
      </div>
      <ProgressBar value={(state.index + 1) / total} size="sm" label="Card progress" />

      <div className="flip-scene mt-5">
        <div
          key={current.id}
          role="button"
          tabIndex={0}
          aria-label={flipped ? `Showing ${front === 'term' ? 'definition' : 'term'}. Press to flip back.` : 'Press to reveal the answer'}
          onClick={() => setFlipped((f) => !f)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              setFlipped((f) => !f);
            }
          }}
          data-testid="flashcard"
          data-flipped={flipped}
          className={cn('flip-inner relative grid min-h-[18rem] w-full cursor-pointer sm:min-h-[22rem]', flipped && 'is-flipped')}
        >
          {[
            { side: 'front', text: frontText, label: front === 'term' ? 'Term' : 'Definition' },
            { side: 'back', text: backText, label: front === 'term' ? 'Definition' : 'Term' },
          ].map((face) => (
            <div
              key={face.side}
              aria-hidden={(face.side === 'back') !== flipped}
              className={cn(
                'flip-face col-start-1 row-start-1 flex flex-col rounded-3xl border border-slate-200 bg-white p-6 shadow-sm sm:p-10 dark:border-slate-800 dark:bg-slate-900',
                face.side === 'back' && 'flip-back',
              )}
            >
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{face.label}</span>
                <StarButton
                  starred={starred}
                  label={current.term}
                  onToggle={() => void toggleStar(current.setId, current.id)}
                  className="-mt-2 -mr-2"
                />
              </div>
              <div className="flex flex-1 flex-col items-center justify-center py-4 text-center">
                <p
                  className={cn(
                    'max-w-full font-medium break-words whitespace-pre-line text-slate-900 dark:text-white',
                    textSize(face.text),
                  )}
                  data-testid={`flashcard-${face.side}`}
                >
                  {face.text}
                </p>
                {face.side === 'back' && front === 'term' && current.example && (
                  <p className="mt-4 max-w-xl text-sm text-slate-500 italic dark:text-slate-400">{current.example}</p>
                )}
              </div>
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span className="truncate">{isReview ? current.setTitle : ''}</span>
                <span>{face.side === 'back' && current.sourcePage ? `Page ${current.sourcePage}` : face.side === 'front' ? 'Click or press Space to flip' : ''}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3">
        <Button
          variant="learning"
          size="lg"
          onClick={() => mark(false)}
          className={cn(marked === 'learning' && 'ring-2 ring-amber-400')}
          icon={<X className="size-5" />}
        >
          Still learning
        </Button>
        <Button
          variant="known"
          size="lg"
          onClick={() => mark(true)}
          className={cn(marked === 'known' && 'ring-2 ring-emerald-400')}
          icon={<Check className="size-5" />}
        >
          Know it
        </Button>
      </div>

      <div className="mt-4 flex items-center justify-between gap-2">
        <Button variant="ghost" onClick={() => go(-1)} disabled={state.index === 0} icon={<ArrowLeft className="size-4" />} aria-label="Previous card">
          <span className="hidden sm:inline">Previous</span>
        </Button>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label={shuffleOn ? 'Turn shuffle off' : 'Shuffle cards'}
            aria-pressed={shuffleOn}
            title="Shuffle"
            onClick={() => reorder(!shuffleOn)}
            className={cn(shuffleOn && 'text-brand-600 dark:text-brand-400')}
          >
            <Shuffle className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Flashcard options" aria-expanded={showSettings} onClick={() => setShowSettings((s) => !s)}>
            <Settings2 className="size-5" />
          </Button>
          <Button variant="ghost" size="icon" aria-label="Keyboard shortcuts" aria-expanded={showKeys} onClick={() => setShowKeys((s) => !s)} className="hidden sm:inline-flex">
            <Keyboard className="size-5" />
          </Button>
        </div>
        <Button variant="ghost" onClick={() => go(1)} aria-label="Next card">
          <span className="hidden sm:inline">Next</span> <ArrowRight className="size-4" />
        </Button>
      </div>

      {showSettings && (
        <Panel className="mt-4 animate-fade-in space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-800 dark:text-slate-200">Show first</span>
            <Segmented
              label="Show first"
              size="sm"
              value={front}
              onChange={(v) => {
                setFlipped(false);
                setPrefs({ flashcardFront: v });
              }}
              options={[
                { value: 'term', label: 'Term' },
                { value: 'definition', label: 'Definition' },
              ]}
            />
          </div>
          <Switch
            id="starred-only"
            checked={state.starredOnly}
            onChange={(v) => restart(v)}
            label={
              <span className="inline-flex items-center gap-1.5">
                <Star className="size-4 text-amber-500" aria-hidden /> Starred cards only
              </span>
            }
            description="Restarts the round with just the cards you starred."
          />
        </Panel>
      )}

      {showKeys && (
        <Panel className="mt-4 animate-fade-in p-5 text-sm text-slate-600 dark:text-slate-300">
          <ul className="grid gap-2 sm:grid-cols-2">
            <li><Kbd>Space</Kbd> Flip card</li>
            <li><Kbd>←</Kbd> <Kbd>→</Kbd> Previous / next</li>
            <li><Kbd>1</Kbd> Still learning</li>
            <li><Kbd>2</Kbd> Know it</li>
            <li><Kbd>S</Kbd> Star card</li>
            <li><Kbd>F</Kbd> Full screen</li>
          </ul>
        </Panel>
      )}
    </div>
  );
}
