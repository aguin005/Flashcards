import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CopyX,
  ExternalLink,
  FileText,
  Plus,
  Save,
  Search,
  Trash,
  TriangleAlert,
} from 'lucide-react';
import type { ExtractedEntry, PdfImport } from '../types';
import { getImport, openStoredPdf, saveImport } from '../lib/imports';
import { normalizeText, errorMessage, pluralize, uid } from '../lib/utils';
import { useAppData } from '../state/AppData';
import { Button, buttonClass } from '../components/ui/Button';
import { Badge, EmptyState, Input, Label, PageHeader, Panel, Segmented, Select, Spinner, Textarea } from '../components/ui/primitives';
import { useConfirm, useToast } from '../components/ui/feedback';
import { EntryRow } from '../features/pdf-import/EntryRow';

type Filter = 'all' | 'selected' | 'review' | 'duplicates' | 'incomplete';
const PAGE_SIZE = 100;

function needsReview(e: ExtractedEntry): boolean {
  return e.confidence !== 'high' || e.flags.length > 0 || !e.definition.trim();
}

function titleFromFileName(name: string): string {
  return name
    .replace(/\.pdf$/i, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export default function ImportReviewPage() {
  const { importId = '' } = useParams();
  const navigate = useNavigate();
  const { toast } = useToast();
  const confirm = useConfirm();
  const { sets, createSet, saveSet } = useAppData();

  const [record, setRecord] = useState<PdfImport | null | undefined>(undefined);
  const [entries, setEntries] = useState<ExtractedEntry[]>([]);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [destination, setDestination] = useState<string>('new');
  const [saving, setSaving] = useState(false);
  const [showText, setShowText] = useState(false);
  const [textPage, setTextPage] = useState(1);
  const [validation, setValidation] = useState<string | null>(null);
  const dirty = useRef(false);

  useEffect(() => {
    let alive = true;
    getImport(importId)
      .then((r) => {
        if (!alive) return;
        setRecord(r ?? null);
        if (r) {
          setEntries(r.entries);
          setTitle(titleFromFileName(r.fileName));
          setDescription(`Imported from ${r.fileName}`);
        }
      })
      .catch(() => alive && setRecord(null));
    return () => {
      alive = false;
    };
  }, [importId]);

  // Autosave edits to the draft so a refresh never loses review work.
  useEffect(() => {
    if (!record || !dirty.current) return;
    const t = setTimeout(() => {
      saveImport({ ...record, entries }).catch((err) =>
        toast({ kind: 'error', title: 'Draft not saved', description: errorMessage(err) }),
      );
    }, 500);
    return () => clearTimeout(t);
  }, [entries, record, toast]);

  const update = useCallback((id: string, patch: Partial<ExtractedEntry>) => {
    dirty.current = true;
    setValidation(null);
    setEntries((list) => list.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  }, []);

  const remove = useCallback((id: string) => {
    dirty.current = true;
    setEntries((list) => list.filter((e) => e.id !== id));
  }, []);

  const duplicateIds = useMemo(() => {
    const groups = new Map<string, string[]>();
    for (const e of entries) {
      const k = normalizeText(e.term);
      if (!k) continue;
      groups.set(k, [...(groups.get(k) ?? []), e.id]);
    }
    return new Set([...groups.values()].filter((g) => g.length > 1).flat());
  }, [entries]);

  const visible = useMemo(() => {
    const q = normalizeText(query);
    return entries.filter((e) => {
      if (filter === 'selected' && !e.selected) return false;
      if (filter === 'review' && !needsReview(e)) return false;
      if (filter === 'duplicates' && !duplicateIds.has(e.id)) return false;
      if (filter === 'incomplete' && e.term.trim() && e.definition.trim()) return false;
      if (q && !normalizeText(`${e.term} ${e.definition} ${e.example}`).includes(q)) return false;
      return true;
    });
  }, [entries, filter, query, duplicateIds]);

  const selected = entries.filter((e) => e.selected);
  const reviewCount = entries.filter(needsReview).length;

  const setVisibleSelection = (value: boolean) => {
    dirty.current = true;
    const ids = new Set(visible.map((e) => e.id));
    setEntries((list) => list.map((e) => (ids.has(e.id) ? { ...e, selected: value } : e)));
  };

  const addEntry = () => {
    dirty.current = true;
    const entry: ExtractedEntry = {
      id: uid('e'),
      term: '',
      definition: '',
      example: '',
      page: null,
      selected: true,
      confidence: 'high',
      flags: [],
      method: 'manual',
    };
    setFilter('all');
    setQuery('');
    setEntries((list) => [entry, ...list]);
    requestAnimationFrame(() => document.getElementById(`term-${entry.id}`)?.focus());
  };

  const removeDuplicates = async () => {
    const groups = new Map<string, ExtractedEntry[]>();
    for (const e of entries) {
      const k = normalizeText(e.term);
      if (k) groups.set(k, [...(groups.get(k) ?? []), e]);
    }
    const drop = new Set<string>();
    const rank = { high: 3, medium: 2, low: 1 };
    for (const group of groups.values()) {
      if (group.length < 2) continue;
      const keep = [...group].sort(
        (a, b) =>
          Number(b.selected) - Number(a.selected) ||
          rank[b.confidence] - rank[a.confidence] ||
          b.definition.length - a.definition.length,
      )[0];
      group.forEach((e) => e !== keep && drop.add(e.id));
    }
    if (drop.size === 0) {
      toast({ title: 'No duplicate terms found' });
      return;
    }
    const ok = await confirm({
      title: `Remove ${pluralize(drop.size, 'duplicate')}?`,
      message: 'For each repeated term, the selected entry with the most complete definition is kept.',
      confirmLabel: 'Remove duplicates',
    });
    if (!ok) return;
    dirty.current = true;
    setEntries((list) =>
      list
        .filter((e) => !drop.has(e.id))
        .map((e) => (e.flags.includes('duplicate') ? { ...e, flags: e.flags.filter((f) => f !== 'duplicate') } : e)),
    );
    toast({ kind: 'success', title: `Removed ${pluralize(drop.size, 'duplicate')}` });
  };

  const deleteSelected = async () => {
    if (selected.length === 0) return;
    const ok = await confirm({
      title: `Delete ${pluralize(selected.length, 'selected entry', 'selected entries')}?`,
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    dirty.current = true;
    setEntries((list) => list.filter((e) => !e.selected));
  };

  const save = async () => {
    if (!record) return;
    const incomplete = selected.filter((e) => !e.term.trim() || !e.definition.trim());
    if (selected.length === 0) {
      setValidation('Select at least one entry to import.');
      return;
    }
    if (incomplete.length > 0) {
      setValidation(
        `${pluralize(incomplete.length, 'selected entry is', 'selected entries are')} missing a term or definition. Fill them in or deselect them.`,
      );
      setFilter('incomplete');
      return;
    }
    if (destination === 'new' && !title.trim()) {
      setValidation('Give the new study set a title.');
      return;
    }
    setSaving(true);
    try {
      const cards = selected.map((e) => ({
        term: e.term.trim(),
        definition: e.definition.trim(),
        example: e.example.trim() || undefined,
        sourcePage: e.page ?? undefined,
        starred: false,
      }));
      let setId: string;
      if (destination === 'new') {
        const set = await createSet({
          title,
          subject,
          description,
          cards,
          source: { fileName: record.fileName, importId: record.id, pageCount: record.pageCount },
        });
        setId = set.id;
      } else {
        const target = sets.find((s) => s.id === destination);
        if (!target) throw new Error('That study set no longer exists.');
        const now = Date.now();
        await saveSet({
          ...target,
          cards: [...target.cards, ...cards.map((c, i) => ({ ...c, id: uid('c'), createdAt: now + i }))],
        });
        setId = target.id;
      }
      await saveImport({ ...record, entries, savedSetId: setId });
      toast({ kind: 'success', title: `Saved ${pluralize(cards.length, 'card')}` });
      navigate(`/sets/${setId}`);
    } catch (err) {
      toast({ kind: 'error', title: 'Could not save the study set', description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  if (record === undefined) {
    return (
      <div className="flex justify-center py-24">
        <Spinner label="Loading extracted vocabulary" />
      </div>
    );
  }
  if (record === null) {
    return (
      <EmptyState
        icon={<FileText className="size-6" />}
        title="Import not found"
        description="This extraction draft was deleted or belongs to data that was cleared."
        actions={
          <Link to="/upload" className={buttonClass('primary')}>
            Upload a PDF
          </Link>
        }
      />
    );
  }

  const { stats } = record;
  const pagesWithoutText = stats.pageCount - stats.pagesWithText;
  const pageText = record.pages.find((p) => p.page === textPage);

  return (
    <div>
      <Link
        to="/upload"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" /> Upload
      </Link>
      <PageHeader
        title="Review extracted vocabulary"
        description={
          <>
            <span className="font-medium text-slate-800 dark:text-slate-200">{record.fileName}</span> ·{' '}
            {pluralize(record.pageCount, 'page')}
            {record.usedOcr && ' · read with OCR'}
          </>
        }
        actions={
          record.hasFile && (
            <Button
              variant="secondary"
              icon={<ExternalLink className="size-4" />}
              onClick={async () => {
                if (!(await openStoredPdf(record.id))) toast({ kind: 'error', title: 'The stored PDF was removed' });
              }}
            >
              Open PDF
            </Button>
          )
        }
      />

      <div className="mb-4 flex flex-wrap gap-2 text-sm" data-testid="extraction-stats">
        <Badge tone="brand">{pluralize(entries.length, 'entry', 'entries')} found</Badge>
        <Badge tone="green">{selected.length} selected</Badge>
        {reviewCount > 0 && <Badge tone="amber">{reviewCount} to review</Badge>}
        {stats.removedHeaderFooterLines > 0 && (
          <Badge tone="slate">{pluralize(stats.removedHeaderFooterLines, 'header/footer line')} removed</Badge>
        )}
        {stats.duplicatesRemoved > 0 && (
          <Badge tone="slate">{pluralize(stats.duplicatesRemoved, 'duplicate')} merged</Badge>
        )}
      </div>

      {pagesWithoutText > 0 && !record.usedOcr && (
        <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          {pluralize(pagesWithoutText, 'page')} had no selectable text, likely scanned images. Terms on those pages were not
          detected.
        </div>
      )}

      {entries.length === 0 ? (
        <EmptyState
          icon={<Search className="size-6" />}
          title="No vocabulary was detected"
          description="The PDF has text, but no term and definition patterns were recognized. Check the extracted text below, then add entries manually."
          actions={
            <Button icon={<Plus className="size-4" />} onClick={addEntry}>
              Add an entry
            </Button>
          }
        />
      ) : (
        <Panel className="overflow-hidden">
          <div className="flex flex-col gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
              <div className="relative flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                <Input
                  type="search"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search terms and definitions"
                  aria-label="Search extracted entries"
                  className="pl-9"
                />
              </div>
              <Segmented<Filter>
                label="Filter entries"
                size="sm"
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: `All ${entries.length}` },
                  { value: 'selected', label: `Selected ${selected.length}` },
                  { value: 'review', label: `Needs review ${reviewCount}` },
                  { value: 'duplicates', label: `Duplicates ${duplicateIds.size}` },
                  { value: 'incomplete', label: 'Incomplete' },
                ]}
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setVisibleSelection(true)}>
                Select {filter === 'all' && !query ? 'all' : 'shown'}
              </Button>
              <Button variant="secondary" size="sm" onClick={() => setVisibleSelection(false)}>
                Deselect {filter === 'all' && !query ? 'all' : 'shown'}
              </Button>
              <Button variant="secondary" size="sm" icon={<CopyX className="size-4" />} onClick={removeDuplicates}>
                Remove duplicates
              </Button>
              <Button variant="secondary" size="sm" icon={<Plus className="size-4" />} onClick={addEntry}>
                Add entry
              </Button>
              <Button
                variant="ghost"
                size="sm"
                icon={<Trash className="size-4" />}
                onClick={deleteSelected}
                disabled={selected.length === 0}
                className="text-rose-600 dark:text-rose-400"
              >
                Delete selected
              </Button>
            </div>
          </div>
          <div className="hidden grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_4.5rem_auto] gap-x-3 border-b border-slate-100 bg-slate-50 px-4 py-2 text-xs font-medium tracking-wide text-slate-500 uppercase md:grid dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-400">
            <span className="w-4" />
            <span>Term</span>
            <span>Definition</span>
            <span>Example</span>
            <span>Page</span>
            <span className="w-9" />
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800" data-testid="entry-list">
            {visible.slice(0, limit).map((e, i) => (
              <EntryRow key={e.id} entry={e} index={i} onChange={update} onDelete={remove} />
            ))}
            {visible.length === 0 && (
              <p className="p-6 text-center text-sm text-slate-500">No entries match this filter.</p>
            )}
          </div>
          {visible.length > limit && (
            <div className="border-t border-slate-100 p-3 text-center dark:border-slate-800">
              <Button variant="ghost" size="sm" onClick={() => setLimit((l) => l + PAGE_SIZE)}>
                Show {Math.min(PAGE_SIZE, visible.length - limit)} more of {visible.length - limit}
              </Button>
            </div>
          )}
        </Panel>
      )}

      <Panel className="mt-6 p-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-white">Save as a study set</h2>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div>
            <Label htmlFor="dest">Destination</Label>
            <Select id="dest" value={destination} onChange={(e) => setDestination(e.target.value)}>
              <option value="new">New study set</option>
              {sets.map((s) => (
                <option key={s.id} value={s.id}>
                  Add to “{s.title}”
                </option>
              ))}
            </Select>
          </div>
          {destination === 'new' && (
            <>
              <div>
                <Label htmlFor="set-title">Title</Label>
                <Input id="set-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
              </div>
              <div>
                <Label htmlFor="set-subject" hint="(optional)">
                  Class or subject
                </Label>
                <Input
                  id="set-subject"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  placeholder="e.g. BIO 101"
                  maxLength={100}
                />
              </div>
              <div>
                <Label htmlFor="set-desc" hint="(optional)">
                  Description
                </Label>
                <Textarea id="set-desc" rows={1} value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
            </>
          )}
        </div>
        {validation && (
          <p role="alert" className="mt-4 flex items-start gap-2 text-sm text-rose-700 dark:text-rose-300">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {validation}
          </p>
        )}
        <div className="mt-5 flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {pluralize(selected.length, 'card')} will be {destination === 'new' ? 'saved' : 'added'}
          </span>
          <Button onClick={save} loading={saving} icon={<Save className="size-4" />} data-testid="save-set">
            Save {pluralize(selected.length, 'card')}
          </Button>
        </div>
      </Panel>

      <Panel className="mt-6">
        <button
          type="button"
          onClick={() => setShowText((s) => !s)}
          aria-expanded={showText}
          className="flex w-full items-center justify-between p-5 text-left"
        >
          <span>
            <span className="block text-base font-semibold text-slate-900 dark:text-white">Extracted text</span>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              The cleaned page-by-page text. Copy from here to add anything that was missed.
            </span>
          </span>
          <span className="text-sm font-medium text-brand-700 dark:text-brand-300">{showText ? 'Hide' : 'Show'}</span>
        </button>
        {showText && (
          <div className="border-t border-slate-100 p-5 dark:border-slate-800">
            <div className="mb-3 flex items-center gap-2">
              <Label htmlFor="text-page">Page</Label>
              <Select
                id="text-page"
                value={textPage}
                onChange={(e) => setTextPage(Number(e.target.value))}
                className="w-28"
              >
                {record.pages.map((p) => (
                  <option key={p.page} value={p.page}>
                    {p.page}
                  </option>
                ))}
              </Select>
            </div>
            <pre className="scroll-thin max-h-96 overflow-auto rounded-xl bg-slate-50 p-4 font-sans text-sm leading-relaxed whitespace-pre-wrap text-slate-700 dark:bg-slate-950 dark:text-slate-300">
              {pageText?.text.trim() || 'No text on this page.'}
            </pre>
          </div>
        )}
      </Panel>
    </div>
  );
}
