import { lazy, Suspense, useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { CalendarCheck, Layers } from 'lucide-react';
import { useAppData } from '../state/AppData';
import { FocusLayout } from '../components/layout/FocusLayout';
import { EmptyState, Spinner } from '../components/ui/primitives';
import { buttonClass } from '../components/ui/Button';
import { dueCards, toStudyCards } from '../lib/stats';
import type { StudyCard } from '../types';
import { flashcardStateKey } from '../state/AppData';

const Flashcards = lazy(() => import('../features/flashcards/Flashcards'));
const Quiz = lazy(() => import('../features/quiz/Quiz'));
const Written = lazy(() => import('../features/written/Written'));
const Matching = lazy(() => import('../features/matching/Matching'));

export interface StudyModeProps {
  cards: StudyCard[];
  /** Cards available as quiz distractors (all cards of the sets involved). */
  pool: StudyCard[];
  setIds: string[];
  isReview: boolean;
  /** localStorage key for resumable progress (single-set sessions only). */
  persistKey?: string;
  backTo: string;
}

interface Snapshot extends StudyModeProps {
  id: number;
  /** The route this snapshot was taken for; a stale snapshot is never rendered. */
  route: string;
  title: string;
}

let snapshotCounter = 0;

const VALID_MODES = ['flashcards', 'quiz', 'written', 'match'];

export default function StudyPage() {
  const { mode = 'flashcards' } = useParams();
  const [params] = useSearchParams();
  const setId = params.get('set');
  const isReview = params.get('review') === '1';
  const { ready, sets, progress } = useAppData();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const route = `${mode}|${setId}|${isReview}`;

  // Take the card list once, so answering due cards does not shrink a session in progress.
  // Switching modes or sets builds a new snapshot.
  useEffect(() => {
    if (!ready) return;
    if (isReview) {
      const scope = setId ? sets.filter((s) => s.id === setId) : sets;
      const cards = dueCards(scope, progress);
      const setIds = [...new Set(cards.map((c) => c.setId))];
      const pool = scope.filter((s) => setIds.includes(s.id)).flatMap(toStudyCards);
      setSnapshot({
        id: ++snapshotCounter,
        route,
        title: setId && scope[0] ? `Review: ${scope[0].title}` : 'Review due cards',
        cards,
        pool,
        setIds,
        isReview: true,
        backTo: setId ? `/sets/${setId}` : '/review',
      });
    } else {
      const set = sets.find((s) => s.id === setId);
      if (!set) {
        setSnapshot({ id: ++snapshotCounter, route, title: 'Study', cards: [], pool: [], setIds: [], isReview: false, backTo: '/sets' });
        return;
      }
      const cards = toStudyCards(set);
      setSnapshot({
        id: ++snapshotCounter,
        route,
        title: set.title,
        cards,
        pool: cards,
        setIds: [set.id],
        isReview: false,
        persistKey: flashcardStateKey(set.id),
        backTo: `/sets/${set.id}`,
      });
    }
    // Deliberately not depending on `progress` or `sets`: see the comment above.
  }, [ready, route]);

  if (!ready || !snapshot || snapshot.route !== route) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const { title, id, route: _route, ...props } = snapshot;
  const key = `${mode}:${id}`;

  let body;
  if (!VALID_MODES.includes(mode)) {
    body = <EmptyState title="Unknown study mode" />;
  } else if (props.cards.length === 0) {
    body = isReview ? (
      <EmptyState
        icon={<CalendarCheck className="size-6" />}
        title="Nothing is due right now"
        description="Cards come back for review as their intervals pass. Study a set to add more cards to your schedule."
        actions={
          <Link to={props.backTo} className={buttonClass('primary')}>
            Go back
          </Link>
        }
      />
    ) : (
      <EmptyState
        icon={<Layers className="size-6" />}
        title={setId && sets.some((s) => s.id === setId) ? 'This set has no cards yet' : 'Study set not found'}
        actions={
          <Link to={props.backTo} className={buttonClass('primary')}>
            Go back
          </Link>
        }
      />
    );
  } else {
    body = (
      <Suspense
        fallback={
          <div className="flex justify-center py-24">
            <Spinner />
          </div>
        }
      >
        {mode === 'flashcards' && <Flashcards key={key} {...props} />}
        {mode === 'quiz' && <Quiz key={key} {...props} />}
        {mode === 'written' && <Written key={key} {...props} />}
        {mode === 'match' && <Matching key={key} {...props} />}
      </Suspense>
    );
  }

  return (
    <FocusLayout title={title} backTo={props.backTo}>
      {body}
    </FocusLayout>
  );
}
