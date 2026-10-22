import { memo } from 'react';
import { Trash } from 'lucide-react';
import type { ExtractedEntry } from '../../types';
import { AutoTextarea } from '../../components/ui/AutoTextarea';
import { Badge, Checkbox, Input } from '../../components/ui/primitives';
import { FLAG_LABELS } from '../../lib/vocabulary-extractor';
import { cn } from '../../lib/utils';

const CONFIDENCE_BADGE = {
  high: null,
  medium: { tone: 'amber' as const, label: 'Check' },
  low: { tone: 'red' as const, label: 'Unsure' },
};

export const EntryRow = memo(function EntryRow({
  entry,
  index,
  onChange,
  onDelete,
}: {
  entry: ExtractedEntry;
  index: number;
  onChange: (id: string, patch: Partial<ExtractedEntry>) => void;
  onDelete: (id: string) => void;
}) {
  const missingDefinition = !entry.definition.trim();
  const flags = entry.flags.filter((f) => f !== 'no-definition');
  const confidence = CONFIDENCE_BADGE[entry.confidence];
  const label = entry.term || `entry ${index + 1}`;
  return (
    <div
      data-testid="entry-row"
      className={cn(
        'grid grid-cols-[auto_1fr_auto] gap-x-3 gap-y-2 px-4 py-3 md:grid-cols-[auto_minmax(0,1fr)_minmax(0,2fr)_minmax(0,1fr)_4.5rem_auto] md:items-start',
        !entry.selected && 'bg-slate-50/70 dark:bg-slate-950/30',
      )}
    >
      <div className="row-span-4 pt-2.5 md:row-span-1">
        <Checkbox
          checked={entry.selected}
          aria-label={`Import ${label}`}
          onChange={(e) => onChange(entry.id, { selected: e.target.checked })}
        />
      </div>
      <div className="min-w-0">
        <label className="sr-only" htmlFor={`term-${entry.id}`}>
          Term
        </label>
        <AutoTextarea
          id={`term-${entry.id}`}
          value={entry.term}
          placeholder="Term"
          onChange={(e) => onChange(entry.id, { term: e.target.value })}
          className="font-medium"
          data-testid="entry-term"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {missingDefinition && (
            <Badge tone="red" title={FLAG_LABELS['no-definition'].description}>
              {FLAG_LABELS['no-definition'].label}
            </Badge>
          )}
          {confidence && <Badge tone={confidence.tone}>{confidence.label}</Badge>}
          {flags.map((f) => (
            <Badge key={f} tone={f === 'duplicate' ? 'violet' : 'slate'} title={FLAG_LABELS[f].description}>
              {FLAG_LABELS[f].label}
            </Badge>
          ))}
        </div>
      </div>
      <div className="col-start-3 row-start-1 md:col-start-auto md:row-start-auto md:hidden">
        <DeleteButton label={label} onClick={() => onDelete(entry.id)} />
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <label className="sr-only" htmlFor={`def-${entry.id}`}>
          Definition
        </label>
        <AutoTextarea
          id={`def-${entry.id}`}
          value={entry.definition}
          placeholder="Definition (not found in the document)"
          onChange={(e) => onChange(entry.id, { definition: e.target.value })}
          className={cn(missingDefinition && 'border-rose-300 dark:border-rose-800')}
          data-testid="entry-definition"
        />
      </div>
      <div className="col-span-2 min-w-0 md:col-span-1">
        <label className="sr-only" htmlFor={`ex-${entry.id}`}>
          Example
        </label>
        <AutoTextarea
          id={`ex-${entry.id}`}
          value={entry.example}
          placeholder="Example (optional)"
          onChange={(e) => onChange(entry.id, { example: e.target.value })}
          className="text-slate-600 dark:text-slate-300"
        />
      </div>
      <div className="col-span-2 flex items-center gap-2 md:col-span-1 md:block">
        <label className="text-xs text-slate-500 md:sr-only" htmlFor={`page-${entry.id}`}>
          Source page
        </label>
        <Input
          id={`page-${entry.id}`}
          type="number"
          min={1}
          inputMode="numeric"
          value={entry.page ?? ''}
          placeholder="p."
          onChange={(e) => {
            const n = parseInt(e.target.value, 10);
            onChange(entry.id, { page: Number.isFinite(n) && n > 0 ? n : null });
          }}
          className="w-20 md:w-full"
        />
      </div>
      <div className="hidden md:block">
        <DeleteButton label={label} onClick={() => onDelete(entry.id)} />
      </div>
    </div>
  );
});

function DeleteButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Delete ${label}`}
      className="inline-flex size-9 items-center justify-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600 dark:hover:bg-rose-500/10"
    >
      <Trash className="size-4" />
    </button>
  );
}
