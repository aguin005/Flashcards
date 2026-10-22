import { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowRight, CircleCheck, CircleX, Play } from 'lucide-react';
import type { StudyModeProps } from '../../pages/StudyPage';
import type { DirectionPref } from '../../types';
import { buildQuiz, optionCapacity, rebuildQuestions, type QuizQuestion } from '../../lib/quiz';
import { useStudySession } from '../../hooks/useStudySession';
import { setPrefs, usePrefs } from '../../lib/storage';
import { cn, pluralize } from '../../lib/utils';
import { Button } from '../../components/ui/Button';
import { EmptyState, Kbd, Panel } from '../../components/ui/primitives';
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

interface Answer {
  question: QuizQuestion;
  chosen: number;
  correct: boolean;
}

type Phase = 'setup' | 'question' | 'results';

export default function Quiz({ cards, pool: distractorPool, setIds, isReview, backTo }: StudyModeProps) {
  const prefs = usePrefs();
  const { record, endSession } = useStudySession('quiz', setIds, isReview);
  const [poolChoice, setPoolChoice] = useState<CardPool>('all');
  const [direction, setDirection] = useState<DirectionPref>(prefs.quizDirection);
  const [count, setCount] = useState(prefs.quizCount);
  const [phase, setPhase] = useState<Phase>('setup');
  const [questions, setQuestions] = useState<QuizQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [answers, setAnswers] = useState<Answer[]>([]);
  const [roundLabel, setRoundLabel] = useState<string | undefined>();

  const difficult = useCardPool(cards, 'difficult');
  const chosenCards = useCardPool(cards, poolChoice);
  const capacity = useMemo(() => optionCapacity(distractorPool), [distractorPool]);

  const start = () => {
    const qs = buildQuiz(chosenCards, distractorPool, { count, direction });
    setPrefs({ quizCount: count, quizDirection: direction });
    endSession();
    setQuestions(qs);
    setAnswers([]);
    setIndex(0);
    setRoundLabel(undefined);
    setPhase(qs.length ? 'question' : 'setup');
  };

  const current = questions[index];
  const answer = answers.find((a) => a.question === current);

  const choose = useCallback(
    (i: number) => {
      if (!current || answer || i < 0 || i >= current.options.length) return;
      const correct = i === current.correctIndex;
      record(current.card, correct);
      setAnswers((list) => [...list, { question: current, chosen: i, correct }]);
    },
    [current, answer, record],
  );

  const next = useCallback(() => {
    if (!answer) return;
    if (index + 1 >= questions.length) setPhase('results');
    else setIndex((i) => i + 1);
  }, [answer, index, questions.length]);

  useEffect(() => {
    if (phase !== 'question') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[1-4]$/.test(e.key)) choose(Number(e.key) - 1);
      else if (e.key === 'Enter' || e.key === 'ArrowRight') {
        if (answer) {
          e.preventDefault();
          next();
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, choose, next, answer]);

  const retryMissed = () => {
    const missed = answers.filter((a) => !a.correct).map((a) => a.question);
    const qs = rebuildQuestions(missed, distractorPool);
    endSession();
    setQuestions(qs);
    setAnswers([]);
    setIndex(0);
    setRoundLabel('Retry');
    setPhase('question');
  };

  if (capacity === 0) {
    return (
      <EmptyState
        title="Not enough cards for a quiz"
        description="Multiple choice needs at least two cards with different terms and definitions."
      />
    );
  }

  if (phase === 'setup') {
    return (
      <Panel className="p-6 sm:p-8" data-testid="quiz-setup">
        <h2 className="text-xl font-semibold text-slate-900 dark:text-white">Multiple-choice quiz</h2>
        <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
          Wrong answers come from other cards in this {isReview ? 'review' : 'set'}, never made up.
        </p>
        <div className="mt-6 space-y-5">
          {!isReview && (
            <PoolPicker value={poolChoice} onChange={setPoolChoice} allCount={cards.length} difficultCount={difficult.length} />
          )}
          <DirectionPicker
            value={direction}
            onChange={setDirection}
            labels={{ defToTerm: 'Choose the term', termToDef: 'Choose the definition' }}
          />
          <CountPicker value={count} onChange={setCount} max={Math.max(1, chosenCards.length)} />
        </div>
        {capacity < 4 && (
          <p className="mt-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-900 dark:bg-amber-500/10 dark:text-amber-200">
            This {isReview ? 'review' : 'set'} has only {capacity} distinct answers, so each question will show {capacity} options.
          </p>
        )}
        <div className="mt-8 flex justify-end">
          <Button size="lg" onClick={start} icon={<Play className="size-4" />} disabled={chosenCards.length === 0} data-testid="start-quiz">
            Start quiz
          </Button>
        </div>
      </Panel>
    );
  }

  if (phase === 'results') {
    const missed: MissedItem[] = answers
      .filter((a) => !a.correct)
      .map((a) => ({
        id: a.question.id,
        prompt: a.question.prompt,
        promptLabel: a.question.direction === 'term-to-definition' ? 'Term' : 'Definition',
        given: a.question.options[a.chosen].text,
        correct: a.question.answer,
      }));
    return (
      <ResultsPanel
        correct={answers.filter((a) => a.correct).length}
        total={answers.length}
        missed={missed}
        onRetryMissed={retryMissed}
        onNew={() => setPhase('setup')}
        backTo={backTo}
      />
    );
  }

  if (!current) return null;
  const correctCount = answers.filter((a) => a.correct).length;
  const askingTerm = current.direction === 'definition-to-term';
  const chosenCardId = answer ? current.options[answer.chosen].cardId : null;
  const chosenCard = chosenCardId ? distractorPool.find((c) => c.id === chosenCardId) : undefined;

  return (
    <div>
      <QuestionHeader index={index} total={questions.length} correct={correctCount} answered={answers.length} label={roundLabel} />
      <Panel className="p-6 sm:p-8" data-testid="quiz-question">
        <p className="text-xs font-semibold tracking-wide text-slate-400 uppercase">{askingTerm ? 'Definition' : 'Term'}</p>
        <p
          className={cn(
            'mt-2 font-medium break-words text-slate-900 dark:text-white',
            current.prompt.length > 160 ? 'text-lg' : 'text-xl sm:text-2xl',
          )}
          data-testid="quiz-prompt"
        >
          {current.prompt}
        </p>
        <p className="mt-6 mb-3 text-sm text-slate-500 dark:text-slate-400">
          {askingTerm ? 'Choose the matching term' : 'Choose the matching definition'}
        </p>
        <div className={cn('grid gap-3', askingTerm && 'sm:grid-cols-2')} role="group" aria-label="Answer options">
          {current.options.map((opt, i) => {
            const isCorrect = i === current.correctIndex;
            const isChosen = answer?.chosen === i;
            return (
              <button
                key={`${opt.cardId}-${i}`}
                type="button"
                disabled={Boolean(answer)}
                onClick={() => choose(i)}
                data-testid="quiz-option"
                data-correct={answer ? isCorrect : undefined}
                className={cn(
                  'flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-colors',
                  !answer &&
                    'border-slate-200 bg-white hover:border-brand-400 hover:bg-brand-50/50 dark:border-slate-700 dark:bg-slate-900 dark:hover:border-brand-500 dark:hover:bg-brand-500/10',
                  answer && isCorrect && 'border-emerald-500 bg-emerald-50 dark:bg-emerald-500/10',
                  answer && isChosen && !isCorrect && 'animate-shake border-rose-500 bg-rose-50 dark:bg-rose-500/10',
                  answer && !isCorrect && !isChosen && 'border-slate-200 opacity-60 dark:border-slate-800',
                )}
              >
                <span
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-md text-xs font-semibold',
                    answer && isCorrect
                      ? 'bg-emerald-600 text-white'
                      : answer && isChosen
                        ? 'bg-rose-600 text-white'
                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
                  )}
                  aria-hidden
                >
                  {answer && isCorrect ? <CircleCheck className="size-4" /> : answer && isChosen ? <CircleX className="size-4" /> : i + 1}
                </span>
                <span className="min-w-0 break-words text-slate-800 dark:text-slate-100">{opt.text}</span>
              </button>
            );
          })}
        </div>

        {answer && (
          <div
            role="status"
            className={cn(
              'mt-6 animate-fade-in rounded-xl p-4 text-sm',
              answer.correct
                ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-100'
                : 'bg-rose-50 text-rose-900 dark:bg-rose-500/10 dark:text-rose-100',
            )}
            data-testid="quiz-feedback"
          >
            <p className="font-semibold">{answer.correct ? 'Correct!' : 'Not quite.'}</p>
            <p className="mt-1">
              <strong>{current.card.term}</strong> means: {current.card.definition}
              {current.card.sourcePage ? ` (page ${current.card.sourcePage})` : ''}
            </p>
            {!answer.correct && chosenCard && (
              <p className="mt-1 opacity-90">
                You chose {askingTerm ? <>“{chosenCard.term}”, which means: {chosenCard.definition}</> : <>the definition of “{chosenCard.term}”.</>}
              </p>
            )}
            {current.card.example && <p className="mt-1 italic opacity-90">Example: {current.card.example}</p>}
          </div>
        )}
      </Panel>

      <div className="mt-4 flex items-center justify-between gap-3">
        <p className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">
          <Kbd>1</Kbd>–<Kbd>{current.options.length}</Kbd> to answer, <Kbd>Enter</Kbd> to continue
        </p>
        <Button onClick={next} disabled={!answer} className="ml-auto" data-testid="quiz-next">
          {index + 1 >= questions.length ? 'See results' : 'Next question'} <ArrowRight className="size-4" />
        </Button>
      </div>
      <p className="sr-only" aria-live="polite">
        {answer ? (answer.correct ? 'Correct' : `Incorrect. The answer is ${current.answer}`) : ''}
      </p>
      <p className="mt-4 text-center text-xs text-slate-400">{pluralize(questions.length - index - 1, 'question')} left</p>
    </div>
  );
}
