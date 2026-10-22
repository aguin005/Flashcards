import { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { FileUp, Library, Plus, Search, Upload } from 'lucide-react';
import { useAppData } from '../state/AppData';
import { searchSets } from '../lib/search';
import { lastStudiedBySet } from '../lib/stats';
import { ImportError, parseImportText } from '../lib/export';
import { errorMessage, pluralize } from '../lib/utils';
import { Button, buttonClass } from '../components/ui/Button';
import { EmptyState, Input, PageHeader, Select } from '../components/ui/primitives';
import { useToast } from '../components/ui/feedback';
import { SetCard } from '../components/study-ui';
import { pickFile } from '../features/sets/transfer';

type Sort = 'updated' | 'studied' | 'title' | 'cards';

export default function SetsPage() {
  const { sets, progress, importData } = useAppData();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const query = params.get('q') ?? '';
  const [sort, setSort] = useState<Sort>('updated');
  const [importing, setImporting] = useState(false);

  const lastStudied = useMemo(() => lastStudiedBySet(progress), [progress]);

  const results = useMemo(() => {
    const list = searchSets(sets, query);
    const sorted = [...list];
    if (sort === 'title') sorted.sort((a, b) => a.set.title.localeCompare(b.set.title));
    if (sort === 'cards') sorted.sort((a, b) => b.set.cards.length - a.set.cards.length);
    if (sort === 'studied') sorted.sort((a, b) => (lastStudied.get(b.set.id) ?? 0) - (lastStudied.get(a.set.id) ?? 0));
    if (sort === 'updated' && !query) sorted.sort((a, b) => b.set.updatedAt - a.set.updatedAt);
    return sorted;
  }, [sets, query, sort, lastStudied]);

  const importJson = async () => {
    const file = await pickFile('application/json,.json');
    if (!file) return;
    setImporting(true);
    try {
      const parsed = parseImportText(await file.text());
      const { sets: n } = await importData(parsed, 'copy');
      toast({
        kind: 'success',
        title: `Imported ${pluralize(n, 'study set')}`,
        description: parsed.skippedCards ? `${pluralize(parsed.skippedCards, 'empty card')} skipped.` : undefined,
      });
    } catch (err) {
      toast({
        kind: 'error',
        title: 'Import failed',
        description: err instanceof ImportError ? err.message : errorMessage(err),
      });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="My Study Sets"
        description={sets.length ? `${pluralize(sets.length, 'set')} saved in this browser.` : undefined}
        actions={
          <>
            <Button variant="secondary" icon={<Upload className="size-4" />} onClick={importJson} loading={importing}>
              Import JSON
            </Button>
            <Link to="/upload" className={buttonClass('secondary')}>
              <FileUp className="size-4" /> From PDF
            </Link>
            <Link to="/sets/new" className={buttonClass('primary')}>
              <Plus className="size-4" /> New set
            </Link>
          </>
        }
      />

      {sets.length === 0 ? (
        <EmptyState
          icon={<Library className="size-6" />}
          title="No study sets yet"
          description="Upload a PDF to extract vocabulary, create a set by hand, or import a JSON file you exported earlier."
          actions={
            <>
              <Link to="/upload" className={buttonClass('primary')}>
                <FileUp className="size-4" /> Upload a PDF
              </Link>
              <Link to="/sets/new" className={buttonClass('secondary')}>
                Create a set
              </Link>
            </>
          }
        />
      ) : (
        <>
          <div className="mb-5 flex flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <Input
                type="search"
                value={query}
                onChange={(e) => {
                  const next = new URLSearchParams(params);
                  if (e.target.value) next.set('q', e.target.value);
                  else next.delete('q');
                  setParams(next, { replace: true });
                }}
                placeholder="Filter by title, subject, or term"
                aria-label="Filter study sets"
                className="pl-9"
              />
            </div>
            <Select value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort sets" className="sm:w-52">
              <option value="updated">Recently updated</option>
              <option value="studied">Recently studied</option>
              <option value="title">Title A to Z</option>
              <option value="cards">Most cards</option>
            </Select>
          </div>
          {results.length === 0 ? (
            <EmptyState
              icon={<Search className="size-6" />}
              title="No matching sets"
              description={`Nothing matches “${query}”.`}
            />
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {results.map((r) => (
                <SetCard
                  key={r.set.id}
                  set={r.set}
                  progress={progress}
                  lastStudiedAt={lastStudied.get(r.set.id)}
                  note={query && r.cardMatches > 0 ? pluralize(r.cardMatches, 'matching term') : undefined}
                />
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
