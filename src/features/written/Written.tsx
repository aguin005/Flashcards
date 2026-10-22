import { useEffect, useRef, useState } from 'react';
import { ArrowRight, CircleCheck, CircleHelp, CircleX, Play } from 'lucide-react';
import type { StudyModeProps } from '../../pages/StudyPage';
import type { DirectionPref, QuestionDirection, StudyCard } from '../../types';
import { gradeAnswer, type Verdict } from '../../lib/grading';
import { pickDirection } from '../../lib/quiz';
import { useStudySession } from '../../hooks/useStudySession';
import { setPrefs, usePrefs } from '../../lib/storage';
import { cn, shuffle } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { Kbd, Panel } from '../../components/ui/primitives';
import {
  CountPicker,
  DirectionPicker,
  PoolPicker,
  QuestionHeader,
  ResultsPanel,
  useCardPool,
  type CardPool,
  type MissedItem,
} from '../study-shared/shared';

interface WrittenQuestion {
  id: string;
  card: StudyCard;
  direction: QuestionDirection;
}

interface Attempt {
  question: WrittenQuestion;
  given: string;
  verdict: Verdict;
  /** Final decision after any override. */
  correct: boolean | null;
  overridden: boolean;
}

type Phase = 'setup' | 'question' | 'results';

const prompt = (q: WrittenQuestion) => (q.direction === 'term-to-definition' ? q.card.term : q.card.definition);
const expected = (q: WrittenQuestion) => (q.direction === 'term-to-definition' ? q.card.definition : q.card.term);

export default function Written({ cards, setIds, isReview, backTo }: StudyModeProps) {
  const prefs = usePrefs();
  const { record, endSession } = useStudySession('written', setIds, isReview);
  const [poolChoice, setPoolChoice] = useState<CardPool>('all');
  const [direction, setDirection] = useState<DirectionPref>(prefs.writtenDirection);
  const [count, setCount] = useState(Math.min(prefs.quizCount, cards.length));
  const [phase, setPhase] = useState<Phase>('setup');
  const [questions, setQuestions] = useState<WrittenQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [attempts, setAttempts] = useState<Attempt[]>([]);
  const [input, setInput] = useState('');
  const [roundLabel, setRoundLabel] = useState<string | undefined>();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const continueRef = useRef<HTMLButtonElement>(null);

  const difficult = useCardPool(cards, 'difficult');
  const chosenCards = useCardPool(cards, poolChoice);

  const begin = (qs: WrittenQuestion[], label?: string) => {
    endSession();
    setQuestions(qs);
    setAttempts([]);
    setIndex(0);
    setInput('');
    setRoundLabel(label);
    setPhase('question');
  };

  const start = () => {
    setPrefs({ writtenDirection: direction });
    const qs = shuffle(chosenCards)
      .slice(0, count)
      .map((card) => {
        const dir = pickDirection(direction);
        return { id: `${card.id}:${dir}`, card, direction: dir };
      });
    begin(qs);
  };

  const current = questions[index];
  const attempt = attempts[index];
  const decided = attempt && attempt.correct !== null;

  useEffect(() => {
    if (phase !== 'question') return;
    if (!attempt) inputRef.current?.focus();
    else if (attempt.correct !== null) continueRef.current?.focus();
  }, [phase, index, attempt]);

  const submit = (dontKnow = false) => {
    if (!current || attempt) return;
    const given = dontKnow ? '' : input.trim();
    if (!dontKnow && !given) return;
    const kind = current.direction === 'term-to-definition' ? 'definition' : 'term';
    const result = dontKnow
      ? { verdict: 'incorrect' as Verdict }
      : gradeAnswer(given, expected(current), { alternates: kind === 'term' ? current.card.alternates : undefined, kind });
    const auto = result.verdict === 'close' ? null : result.verdict === 'correct';
    setAttempts((list) => [...list, { question: current, given, verdict: result.verdict, correct: auto, overridden: false }]);
  };

  const decide = (correct: boolean) => {
    setAttempts((list) =>
      list.map((a, i) => (i === index ? { ...a, correct, overridden: a.verdict !== 'close' || a.overridden } : a)),
    );
  };

  const next = () => {
    if (!attempt || attempt.correct === null) return;
    record(attempt.question.card, attempt.correct);
    setInput('');
    if (index + 1 >= questions.length) setPhase('results');
    else setIndex((i) => i + 1);
  };

  if (phase === 'setup') {
    return (
      <Panel className="p-6 sm:p-8" data-testid="written-setup">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Written recall</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Type the answer from memory. Capitalization, extra spaces, and punctuation are ignored. When the grading is unsure,
          you decide.
        </p>
        <div className="mt-6 space-y-5">
          {!isReview && (
            <PoolPicker value={poolChoice} onChange={setPoolChoice} allCount={cards.length} difficultCount={difficult.length} />
          )}
          <DirectionPicker
            value={direction}
            onChange={setDirection}
            labels={{ defToTerm: 'Type the term', termToDef: 'Type the definition' }}
          />
          <CountPicker value={count} onChange={setCount} max={Math.max(1, chosenCards.length)} />
        </div>
        <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={start} icon={<Play className="size-4" />} disabled={chosenCards.length === 0} data-testid="start-written">
            Start
          </Button>
        </div>
      </Panel>
    );
  }

  if (phase === 'results') {
    const missed: MissedItem[] = attempts
      .filter((a) => !a.correct)
      .map((a) => ({
        id: a.question.id,
        prompt: prompt(a.question),
        promptLabel: a.question.direction === 'term-to-definition' ? 'Term' : 'Definition',
        given: a.given,
        correct: expected(a.question),
      }));
    return (
      <ResultsPanel
        correct={attempts.filter((a) => a.correct).length}
        total={attempts.length}
        missed={missed}
        onRetryMissed={() => begin(shuffle(attempts.filter((a) => !a.correct).map((a) => a.question)), 'Retry')}
        onNew={() => setPhase('setup')}
        backTo={backTo}
        extra={
          attempts.some((a) => a.overridden) ? (
            <p className="mt-2 text-xs text-slate-500">Includes answers you graded yourself.</p>
          ) : null
        }
      />
    );
  }

  if (!current) return null;
  const askingTerm = current.direction === 'definition-to-term';
  const answerText = expected(current);
  const correctSoFar = attempts.filter((a, i) => i < index && a.correct).length;

  return (
    <div>
      <QuestionHeader index={index} total={questions.length} correct={correctSoFar} answered={index} label={roundLabel} />
      <Panel className="p-6 sm:p-8" data-testid="written-question">
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{askingTerm ? 'Definition' : 'Term'}</p>
        <p className={cn('mt-2 font-medium break-words text-slate-900 dark:text-white', prompt(current).length > 160 ? 'text-lg' : 'text-xl sm:text-2xl')}>
          {prompt(current)}
        </p>

        <form
          className="mt-6"
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <label htmlFor="written-answer" className="mb-1.5 block text-sm text-slate-500 dark:text-slate-400">
            {askingTerm ? 'Type the term' : 'Type the definition'}
          </label>
          <textarea
            id="written-answer"
            ref={inputRef}
            rows={askingTerm ? 1 : 3}
            value={attempt ? attempt.given : input}
            readOnly={Boolean(attempt)}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                if (!attempt) submit();
                else next();
              }
            }}
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            data-testid="written-input"
            className={cn(
              'w-full resize-none rounded-xl border-2 bg-white px-4 py-3 text-base text-slate-900 focus:outline-none dark:bg-slate-950 dark:text-white',
              !attempt && 'border-slate-200 focus:border-brand-500 dark:border-slate-700',
              attempt?.correct === true && 'border-emerald-500',
              attempt?.correct === false && 'border-rose-500',
              attempt && attempt.correct === null && 'border-amber-400',
            )}
          />
          {!attempt && (
            <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
              <Button variant="ghost" onClick={() => submit(true)} icon={<CircleHelp className="size-4" />}>
                I don’t know
              </Button>
              <Button type="submit" disabled={!input.trim()} data-testid="written-submit">
                Check answer
              </Button>
            </div>
          )}
        </form>

        {attempt && (
          <div
            role="status"
            data-testid="written-feedback"
            data-verdict={attempt.verdict}
            className={cn(
              'mt-5 animate-fade-in rounded-xl p-4 text-sm',
              attempt.correct === true && 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100',
              attempt.correct === false && 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
              attempt.correct === null && 'bg-amber-50 text-amber-900 dark:bg-amber-500/10 dark:text-amber-100',
            )}
          >
            <p className="flex items-center gap-2 font-semibold">
              {attempt.correct === true && <CircleCheck className="size-4" aria-hidden />}
              {attempt.correct === false && <CircleX className="size-4" aria-hidden />}
              {attempt.correct === null && <CircleHelp className="size-4" aria-hidden />}
              {attempt.correct === null
                ? 'Close. Is your answer right?'
                : attempt.correct
                  ? attempt.overridden
                    ? 'Marked correct'
                    : 'Correct!'
                  : attempt.overridden
                    ? 'Marked incorrect'
                    : attempt.given
                      ? 'Not quite.'
                      : 'Here is the answer.'}
            </p>
            <p className="mt-1.5">
              <span className="opacity-80">Answer: </span>
              <strong className="font-semibold">{answerText}</strong>
            </p>
            {current.card.example && <p className="mt-1 italic opacity-90">Example: {current.card.example}</p>}
            {attempt.correct === null && (
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" variant="success" onClick={() => decide(true)}>
                  Yes, I was right
                </Button>
                <Button size="sm" variant="danger" onClick={() => decide(false)}>
                  No, I was wrong
                </Button>
              </div>
            )}
            {attempt.correct === false && attempt.given && !attempt.overridden && (
              <button type="button" onClick={() => decide(true)} className="mt-2 text-xs font-medium underline underline-offset-2">
                I was right, count it as correct
              </button>
            )}
            {attempt.correct === true && attempt.verdict === 'correct' && !attempt.overridden && (
              <button type="button" onClick={() => decide(false)} className="mt-2 text-xs font-medium underline underline-offset-2">
                Count it as wrong
              </button>
            )}
          </div>
        )}
      </Panel>

      {attempt && (
        <div className="mt-4 flex items-center justify-between gap-3">
          <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
            <Kbd>Enter</Kbd> to continue
          </p>
          <Button ref={continueRef} onClick={next} disabled={!decided} className="ml-auto" data-testid="written-next">
            {index + 1 >= questions.length ? 'See results' : 'Continue'} <ArrowRight className="size-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
