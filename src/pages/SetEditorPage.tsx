import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ClipboardPaste, Plus, Save, Trash, TriangleAlert } from 'lucide-react';
import { useAppData } from '../state/AppData';
import type { Card, StudySet } from '../types';
import { cn, errorMessage, pluralize, uid } from '../lib/utils';
import { extractFromPlainText } from '../lib/vocabulary-extractor';
import { Button, buttonClass } from '../components/ui/Button';
import { AutoTextarea } from '../components/ui/AutoTextarea';
import { EmptyState, Input, Label, PageHeader, Panel, Textarea } from '../components/ui/primitives';
import { Modal } from '../components/ui/Modal';
import { useToast } from '../components/ui/feedback';

interface Row {
  key: string;
  cardId?: string;
  term: string;
  definition: string;
  example: string;
  alternates: string;
  sourcePage: string;
  starred: boolean;
  createdAt?: number;
}

const emptyRow = (): Row => ({
  key: uid('r'),
  term: '',
  definition: '',
  example: '',
  alternates: '',
  sourcePage: '',
  starred: false,
});

function cardToRow(c: Card): Row {
  return {
    key: c.id,
    cardId: c.id,
    term: c.term,
    definition: c.definition,
    example: c.example ?? '',
    alternates: (c.alternates ?? []).join('; '),
    sourcePage: c.sourcePage ? String(c.sourcePage) : '',
    starred: Boolean(c.starred),
    createdAt: c.createdAt,
  };
}

export default function SetEditorPage() {
  const { setId } = useParams();
  const isNew = !setId;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { sets, saveSet, createSet } = useAppData();
  const existing = setId ? sets.find((s) => s.id === setId) : undefined;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [subject, setSubject] = useState(existing?.subject ?? '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    existing ? existing.cards.map(cardToRow) : [emptyRow(), emptyRow(), emptyRow()],
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [invalidKeys, setInvalidKeys] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  const updateRow = useCallback((key: string, patch: Partial<Row>) => {
    setDirty(true);
    setRows((list) => list.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }, []);
  const removeRow = useCallback((key: string) => {
    setDirty(true);
    setRows((list) => list.filter((r) => r.key !== key));
  }, []);
  const addRow = () => {
    const row = emptyRow();
    setRows((list) => [...list, row]);
    requestAnimationFrame(() => document.getElementById(`term-${row.key}`)?.focus());
  };

  if (!isNew && !existing) {
    return (
      <EmptyState
        title="Study set not found"
        actions={
          <Link to="/sets" className={buttonClass('primary')}>
            Back to My Study Sets
          </Link>
        }
      />
    );
  }

  const save = async () => {
    const problems: string[] = [];
    const bad = new Set<string>();
    if (!title.trim()) problems.push('Add a title.');
    const filled = rows.filter((r) => r.term.trim() || r.definition.trim());
    for (const r of filled) if (!r.term.trim() || !r.definition.trim()) bad.add(r.key);
    if (bad.size) problems.push(`${pluralize(bad.size, 'card is', 'cards are')} missing a term or a definition.`);
    if (filled.length === 0) problems.push('Add at least one card with a term and a definition.');
    setErrors(problems);
    setInvalidKeys(bad);
    if (problems.length) return;

    const now = Date.now();
    const cards: Card[] = filled.map((r, i) => {
      const page = parseInt(r.sourcePage, 10);
      const alternates = r.alternates
        .split(/[;\n]/)
        .map((a) => a.trim())
        .filter(Boolean);
      const card: Card = {
        id: r.cardId ?? uid('c'),
        term: r.term.trim(),
        definition: r.definition.trim(),
        createdAt: r.createdAt ?? now + i,
      };
      if (r.example.trim()) card.example = r.example.trim();
      if (alternates.length) card.alternates = alternates;
      if (Number.isFinite(page) && page > 0) card.sourcePage = page;
      if (r.starred) card.starred = true;
      return card;
    });

    setSaving(true);
    try {
      if (existing) {
        const updated: StudySet = {
          ...existing,
          title: title.trim(),
          subject: subject.trim() || undefined,
          description: description.trim(),
          cards,
        };
        await saveSet(updated);
        setDirty(false);
        toast({ kind: 'success', title: 'Changes saved' });
        navigate(`/sets/${existing.id}`);
      } else {
        const created = await createSet({
          title,
          subject,
          description,
          cards: cards.map(({ id: _id, createdAt: _c, ...rest }) => rest),
        });
        setDirty(false);
        toast({ kind: 'success', title: 'Study set created' });
        navigate(`/sets/${created.id}`);
      }
    } catch (err) {
      toast({ kind: 'error', title: 'Could not save', description: errorMessage(err) });
    } finally {
      setSaving(false);
    }
  };

  const backTo = existing ? `/sets/${existing.id}` : '/sets';

  return (
    <div>
      <Link
        to={backTo}
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
      >
        <ArrowLeft className="size-4" /> {existing ? existing.title : 'My Study Sets'}
      </Link>
      <PageHeader
        title={isNew ? 'Create a study set' : 'Edit study set'}
        actions={
          <>
            <Link to={backTo} className={buttonClass('secondary')}>
              Cancel
            </Link>
            <Button onClick={save} loading={saving} icon={<Save className="size-4" />} data-testid="save-editor">
              Save
            </Button>
          </>
        }
      />

      <Panel className="grid gap-4 p-5 md:grid-cols-2">
        <div className="md:col-span-2">
          <Label htmlFor="title">Title</Label>
          <Input
            id="title"
            value={title}
            maxLength={200}
            placeholder="e.g. Unit 3: Cell Biology"
            onChange={(e) => {
              setDirty(true);
              setTitle(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="subject" hint="(optional)">
            Class or subject
          </Label>
          <Input
            id="subject"
            value={subject}
            maxLength={100}
            placeholder="e.g. BIO 101"
            onChange={(e) => {
              setDirty(true);
              setSubject(e.target.value);
            }}
          />
        </div>
        <div>
          <Label htmlFor="description" hint="(optional)">
            Description
          </Label>
          <Textarea
            id="description"
            rows={1}
            value={description}
            onChange={(e) => {
              setDirty(true);
              setDescription(e.target.value);
            }}
          />
        </div>
      </Panel>

      <div className="mt-8 mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-lg font-semibold text-slate-900 dark:text-white">
          Cards <span className="font-normal text-slate-500">({rows.length})</span>
        </h2>
        <Button variant="secondary" size="sm" icon={<ClipboardPaste className="size-4" />} onClick={() => setPasteOpen(true)}>
          Paste terms
        </Button>
      </div>

      <div className="space-y-3">
        {rows.map((r, i) => (
          <EditorRow key={r.key} row={r} index={i} invalid={invalidKeys.has(r.key)} onChange={updateRow} onRemove={removeRow} />
        ))}
      </div>

      <button
        type="button"
        onClick={addRow}
        className="mt-3 flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 py-4 text-sm font-medium text-slate-600 hover:border-brand-400 hover:text-brand-700 dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-500 dark:hover:text-brand-300"
      >
        <Plus className="size-4" /> Add card
      </button>

      {errors.length > 0 && (
        <div role="alert" className="mt-4 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800 dark:border-rose-900 dark:bg-rose-950/30 dark:text-rose-200">
          {errors.map((e) => (
            <p key={e} className="flex items-start gap-2">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {e}
            </p>
          ))}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Link to={backTo} className={buttonClass('secondary')}>
          Cancel
        </Link>
        <Button onClick={save} loading={saving} icon={<Save className="size-4" />}>
          Save
        </Button>
      </div>

      <PasteModal
        open={pasteOpen}
        onClose={() => setPasteOpen(false)}
        onAdd={(newRows) => {
          setDirty(true);
          setRows((list) => [...list.filter((r) => r.term.trim() || r.definition.trim()), ...newRows]);
          setPasteOpen(false);
          toast({ kind: 'success', title: `Added ${pluralize(newRows.length, 'card')}` });
        }}
      />
    </div>
  );
}

const EditorRow = memo(function EditorRow({
  row,
  index,
  invalid,
  onChange,
  onRemove,
}: {
  row: Row;
  index: number;
  invalid: boolean;
  onChange: (key: string, patch: Partial<Row>) => void;
  onRemove: (key: string) => void;
}) {
  const [showMore, setShowMore] = useState(Boolean(row.example || row.alternates || row.sourcePage));
  return (
    <Panel className={cn('p-4', invalid && 'ring-2 ring-rose-300 dark:ring-rose-800')} data-testid="editor-row">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-slate-400 tabular-nums">{index + 1}</span>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            aria-expanded={showMore}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            Example and options <ChevronDown className={cn('size-3.5 transition-transform', showMore && 'rotate-180')} />
          </button>
          <button
            type="button"
            onClick={() => onRemove(row.key)}
            aria-label={`Delete card ${index + 1}`}
            className="inline-flex size-8 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
          >
            <Trash className="size-4" />
          </button>
        </div>
      </div>
      <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)]">
        <div>
          <label htmlFor={`term-${row.key}`} className="mb-1 block text-xs font-medium text-slate-500">
            Term
          </label>
          <AutoTextarea
            id={`term-${row.key}`}
            value={row.term}
            onChange={(e) => onChange(row.key, { term: e.target.value })}
          />
        </div>
        <div>
          <label htmlFor={`def-${row.key}`} className="mb-1 block text-xs font-medium text-slate-500">
            Definition
          </label>
          <AutoTextarea
            id={`def-${row.key}`}
            value={row.definition}
            onChange={(e) => onChange(row.key, { definition: e.target.value })}
          />
        </div>
      </div>
      {showMore && (
        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,2fr)_6rem]">
          <div>
            <label htmlFor={`ex-${row.key}`} className="mb-1 block text-xs font-medium text-slate-500">
              Example
            </label>
            <AutoTextarea
              id={`ex-${row.key}`}
              value={row.example}
              onChange={(e) => onChange(row.key, { example: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`alt-${row.key}`} className="mb-1 block text-xs font-medium text-slate-500">
              Also accept (written mode, separate with ;)
            </label>
            <Input
              id={`alt-${row.key}`}
              value={row.alternates}
              placeholder="e.g. DNA; deoxyribonucleic acid"
              onChange={(e) => onChange(row.key, { alternates: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor={`page-${row.key}`} className="mb-1 block text-xs font-medium text-slate-500">
              Page
            </label>
            <Input
              id={`page-${row.key}`}
              type="number"
              min={1}
              inputMode="numeric"
              value={row.sourcePage}
              onChange={(e) => onChange(row.key, { sourcePage: e.target.value })}
            />
          </div>
        </div>
      )}
    </Panel>
  );
});

function PasteModal({ open, onClose, onAdd }: { open: boolean; onClose: () => void; onAdd: (rows: Row[]) => void }) {
  const [text, setText] = useState('');
  const entries = useMemo(() => (text.trim() ? extractFromPlainText(text) : []), [text]);
  const missing = entries.filter((e) => !e.definition).length;
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title="Paste terms"
      description="One term per line. Separate the term and definition with a tab, a colon, or a dash. Copying two columns from a spreadsheet works too."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            disabled={entries.length === 0}
            onClick={() => {
              onAdd(
                entries.map((e) => ({
                  ...emptyRow(),
                  term: e.term,
                  definition: e.definition,
                  example: e.example,
                })),
              );
              setText('');
            }}
          >
            Add {pluralize(entries.length, 'card')}
          </Button>
        </>
      }
    >
      <Textarea
        aria-label="Text to import"
        rows={10}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'mitosis\tcell division producing two identical cells\nosmosis: diffusion of water across a membrane\nenzyme - a protein that speeds up reactions'}
        className="font-mono text-xs"
      />
      <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
        {entries.length > 0
          ? `${pluralize(entries.length, 'card')} detected${missing ? `, ${missing} without a definition (fill these in before saving)` : ''}.`
          : 'Nothing detected yet.'}
      </p>
    </Modal>
  );
}
