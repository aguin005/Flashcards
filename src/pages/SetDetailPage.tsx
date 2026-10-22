import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  CalendarClock,
  Copy,
  Download,
  Ellipsis,
  ExternalLink,
  FileText,
  Layers,
  ListChecks,
  Pencil,
  PenLine,
  Puzzle,
  RotateCcw,
  Search,
  Trash,
} from 'lucide-react';
import { useAppData } from '../state/AppData';
import { isDifficult, isDue, masteryOf, MASTERY_LEVELS } from '../lib/spaced-repetition';
import { lastStudiedBySet, setMasteryCounts } from '../lib/stats';
import { getFile, openStoredPdf } from '../lib/imports';
import { cn, errorMessage, formatDate, formatRelative, normalizeText, pluralize, shuffle } from '../lib/utils';
import { Button, buttonClass } from '../components/ui/Button';
import { EmptyState, Input, Panel, Segmented, Select } from '../components/ui/primitives';
import { Menu } from '../components/ui/Menu';
import { useConfirm, useToast } from '../components/ui/feedback';
import { MasteryBadge, MasteryBar, MasteryLegend, StarButton } from '../components/study-ui';
import { exportSetCsv, exportSetJson } from '../features/sets/transfer';
import type { Card } from '../types';

type CardFilter = 'all' | 'starred' | 'difficult';
type CardSort = 'original' | 'alpha' | 'weakest' | 'shuffled';

const MODES = [
  { mode: 'flashcards', label: 'Flashcards', description: 'Flip through terms', icon: Layers },
  { mode: 'quiz', label: 'Multiple choice', description: 'Pick the right answer', icon: ListChecks },
  { mode: 'written', label: 'Written', description: 'Type the answer', icon: PenLine },
  { mode: 'match', label: 'Match', description: 'Pair terms and definitions', icon: Puzzle },
] as const;

export default function SetDetailPage() {
  const { setId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sets, progress, toggleStar, duplicateSet, deleteSet, resetSetProgress } = useAppData();
  const set = sets.find((s) => s.id === setId);

  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<CardFilter>('all');
  const [sort, setSort] = useState<CardSort>('original');
  const [shuffleSeed, setShuffleSeed] = useState(0);
  const [hasPdf, setHasPdf] = useState(false);

  const importId = set?.source?.importId;
  useEffect(() => {
    if (!importId) return;
    getFile(importId)
      .then((f) => setHasPdf(Boolean(f)))
      .catch(() => setHasPdf(false));
  }, [importId]);

  const cards = useMemo(() => {
    if (!set) return [];
    const q = normalizeText(query);
    let list = set.cards.filter((c) => {
      if (filter === 'starred' && !c.starred) return false;
      if (filter === 'difficult' && !isDifficult(progress[c.id], c.starred)) return false;
      if (q && !normalizeText(`${c.term} ${c.definition} ${c.example ?? ''}`).includes(q)) return false;
      return true;
    });
    if (sort === 'alpha') list = [...list].sort((a, b) => a.term.localeCompare(b.term));
    if (sort === 'weakest') {
      list = [...list].sort(
        (a, b) =>
          MASTERY_LEVELS.indexOf(masteryOf(progress[a.id])) - MASTERY_LEVELS.indexOf(masteryOf(progress[b.id])) ||
          (progress[b.id]?.incorrect ?? 0) - (progress[a.id]?.incorrect ?? 0),
      );
    }
    if (sort === 'shuffled') list = shuffle(list);
    return list;
    // shuffleSeed forces a new shuffle when the user asks for one.
  }, [set, query, filter, sort, progress, shuffleSeed]);

  if (!set) {
    return (
      <EmptyState
        icon={<BookOpen className="size-6" />}
        title="Study set not found"
        description="It may have been deleted."
        actions={
          <Link to="/sets" className={buttonClass('primary')}>
            Back to My Study Sets
          </Link>
        }
      />
    );
  }

  const counts = setMasteryCounts(set, progress);
  const due = set.cards.filter((c) => isDue(progress[c.id])).length;
  const starredCount = set.cards.filter((c) => c.starred).length;
  const lastStudied = lastStudiedBySet(progress).get(set.id);
  const setProgress = Object.values(progress).filter((p) => p.setId === set.id);
  const empty = set.cards.length === 0;

  const onDelete = async () => {
    const ok = await confirm({
      title: `Delete “${set.title}”?`,
      message: (
        <>
          This permanently removes {pluralize(set.cards.length, 'card')}, their study progress
          {set.source?.importId ? ', and the stored source PDF' : ''}. Export the set first if you might want it back.
        </>
      ),
      confirmLabel: 'Delete set',
      danger: true,
    });
    if (!ok) return;
    try {
      await deleteSet(set.id);
      toast({ kind: 'success', title: 'Study set deleted' });
      navigate('/sets');
    } catch (err) {
      toast({ kind: 'error', title: 'Could not delete the set', description: errorMessage(err) });
    }
  };

  const onReset = async () => {
    const ok = await confirm({
      title: 'Reset progress for this set?',
      message: 'Every card goes back to New. Your cards and past session history are kept.',
      confirmLabel: 'Reset progress',
      danger: true,
    });
    if (!ok) return;
    await resetSetProgress(set.id);
    toast({ kind: 'success', title: 'Progress reset' });
  };

  const openPage = async (card: Card) => {
    if (!importId) return;
    if (!(await openStoredPdf(importId, card.sourcePage))) {
      setHasPdf(false);
      toast({ kind: 'error', title: 'The stored PDF is no longer available' });
    }
  };

  return (
    <div>
      <Link
        to="/sets"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" /> My Study Sets
      </Link>

      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          {set.subject && <p className="mb-1 text-sm font-medium text-brand-600 dark:text-brand-400">{set.subject}</p>}
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900 sm:text-3xl dark:text-white">{set.title}</h1>
          {set.description && <p className="mt-1.5 max-w-2xl text-slate-600 dark:text-slate-400">{set.description}</p>}
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            {pluralize(set.cards.length, 'card')} · Created {formatDate(set.createdAt)}
            {lastStudied ? ` · Studied ${formatRelative(lastStudied)}` : ''}
          </p>
          {set.source && (
            <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400">
              <FileText className="size-4" aria-hidden /> From {set.source.fileName}
              {hasPdf && (
                <button
                  type="button"
                  onClick={() => importId && openStoredPdf(importId)}
                  className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline dark:text-brand-300"
                >
                  Open PDF <ExternalLink className="size-3.5" aria-hidden />
                </button>
              )}
            </p>
          )}
        </div>
        <div className="flex shrink-0 gap-2">
          <Link to={`/sets/${set.id}/edit`} className={buttonClass('secondary')}>
            <Pencil className="size-4" /> Edit
          </Link>
          <Menu
            label="More actions"
            trigger={<Ellipsis className="size-5" />}
            items={[
              {
                label: 'Duplicate',
                icon: <Copy />,
                onSelect: async () => {
                  const copy = await duplicateSet(set.id);
                  if (copy) {
                    toast({ kind: 'success', title: 'Set duplicated' });
                    navigate(`/sets/${copy.id}`);
                  }
                },
              },
              { label: 'Export JSON', icon: <Download />, onSelect: () => exportSetJson(set, setProgress) },
              { label: 'Export CSV', icon: <Download />, onSelect: () => exportSetCsv(set) },
              { label: 'Reset progress', icon: <RotateCcw />, onSelect: onReset, disabled: setProgress.length === 0 },
              { label: 'Delete set', icon: <Trash />, onSelect: onDelete, danger: true },
            ]}
          />
        </div>
      </div>

      {empty ? (
        <EmptyState
          title="This set has no cards"
          description="Add cards to start studying."
          actions={
            <Link to={`/sets/${set.id}/edit`} className={buttonClass('primary')}>
              Add cards
            </Link>
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Study modes">
            {MODES.map(({ mode, label, description, icon: Icon }) => (
              <Link
                key={mode}
                to={`/study/${mode}?set=${set.id}`}
                className="group rounded-2xl"
                data-testid={`mode-${mode}`}
              >
                <Panel className="flex h-full items-center gap-3 p-4 transition-shadow group-hover:shadow-md group-hover:ring-1 group-hover:ring-brand-200 dark:group-hover:ring-brand-800">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 dark:bg-brand-500/15 dark:text-brand-300">
                    <Icon className="size-5" aria-hidden />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900 dark:text-white">{label}</span>
                    <span className="hidden text-xs text-slate-500 sm:block dark:text-slate-400">{description}</span>
                  </span>
                </Panel>
              </Link>
            ))}
          </div>

          <Panel className="mt-4 p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold text-slate-900 dark:text-white">Mastery</h2>
                  <span className="text-sm text-slate-500 tabular-nums dark:text-slate-400">
                    {Math.round((counts.mastered / set.cards.length) * 100)}% mastered
                  </span>
                </div>
                <MasteryBar counts={counts} total={set.cards.length} className="h-2.5" />
                <div className="mt-3">
                  <MasteryLegend counts={counts} />
                </div>
              </div>
              {due > 0 && (
                <Link to={`/study/flashcards?review=1&set=${set.id}`} className={buttonClass('primary', 'md', 'sm:ml-6')}>
                  <CalendarClock className="size-4" /> Review {due} due
                </Link>
              )}
            </div>
          </Panel>

          <section className="mt-8" aria-labelledby="cards-heading">
            <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
              <h2 id="cards-heading" className="text-lg font-semibold text-slate-900 dark:text-white">
                Cards <span className="font-normal text-slate-500">({cards.length})</span>
              </h2>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <div className="relative">
                  <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                  <Input
                    type="search"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search this set"
                    aria-label="Search cards in this set"
                    className="pl-9 sm:w-56"
                  />
                </div>
                <Segmented<CardFilter>
                  label="Filter cards"
                  size="sm"
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'All' },
                    { value: 'starred', label: `Starred ${starredCount}` },
                    { value: 'difficult', label: 'Difficult' },
                  ]}
                />
                <div className="flex gap-2">
                  <Select value={sort} onChange={(e) => setSort(e.target.value as CardSort)} aria-label="Sort cards" className="h-9 sm:w-40">
                    <option value="original">Original order</option>
                    <option value="alpha">A to Z</option>
                    <option value="weakest">Weakest first</option>
                    <option value="shuffled">Shuffled</option>
                  </Select>
                  {sort === 'shuffled' && (
                    <Button variant="secondary" size="sm" className="h-9" onClick={() => setShuffleSeed((n) => n + 1)}>
                      Reshuffle
                    </Button>
                  )}
                </div>
              </div>
            </div>
            <Panel className="divide-y divide-slate-100 dark:divide-slate-800">
              {cards.length === 0 && <p className="p-6 text-center text-sm text-slate-500">No cards match.</p>}
              {cards.map((c) => {
                const p = progress[c.id];
                return (
                  <div key={c.id} className="flex gap-3 p-4 sm:gap-5" data-testid="card-row">
                    <div className="grid min-w-0 flex-1 gap-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:gap-5">
                      <p className="font-medium break-words text-slate-900 dark:text-white">{c.term}</p>
                      <div className="min-w-0">
                        <p className="break-words text-slate-700 dark:text-slate-300">{c.definition}</p>
                        {c.example && (
                          <p className="mt-1 text-sm break-words text-slate-500 italic dark:text-slate-400">{c.example}</p>
                        )}
                        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <MasteryBadge progress={p} />
                          {p && p.reviews > 0 && (
                            <span className="tabular-nums">
                              {p.correct}/{p.reviews} correct
                            </span>
                          )}
                          {c.sourcePage &&
                            (hasPdf ? (
                              <button
                                type="button"
                                onClick={() => openPage(c)}
                                className="font-medium text-brand-700 hover:underline dark:text-brand-300"
                                title="Open the source PDF at this page"
                              >
                                Page {c.sourcePage}
                              </button>
                            ) : (
                              <span>Page {c.sourcePage}</span>
                            ))}
                        </div>
                      </div>
                    </div>
                    <StarButton
                      starred={c.starred}
                      label={c.term}
                      onToggle={() => void toggleStar(set.id, c.id)}
                      className={cn('-mt-1 shrink-0')}
                    />
                  </div>
                );
              })}
            </Panel>
          </section>
        </>
      )}
    </div>
  );
}
